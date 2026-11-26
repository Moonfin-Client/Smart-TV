// Self-check for access.js's watch over the access schedule, with the server, clock and timers
// stubbed: node --conditions=browser src/state/shell/access.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const src = join(dirname(fileURLToPath(import.meta.url)), '../..')
const STUBS = {
  'services/i18n.js': `export default (s) => s`,
  'utils/dateFormat.js': `export const localeDate = (d) => d.toDateString()
    export const formatShortDate = (d) => d.toDateString()`,
  'state/settings.js': `export const get = (k) => (k === 'clockDisplay' ? '24-hour' : 0)`,
  'state/shell/shellState.js': `export const shell = (globalThis.__shell = { timesUp: false, nextAccess: '' })
    const app = { onTimesUp: () => globalThis.__timesUp++ }
    export const shellApp = () => app`,
  'services/jellyfinApi.js': `const s = globalThis.__server
    export const getServerType = () => 'jellyfin'
    export const onForbidden = () => () => {}
    export const clearAccessDenied = () => {}
    const answer = (v) => (typeof v === 'function' ? v() : v)
    export const api = {
      getAccessWindow: async () => { s.windowReads++; return answer(s.window) },
      getUserConfiguration: async () => { s.userReads++; return answer(s.user) },
      getCurrentUser: async () => { s.meReads++; return answer(s.me) },
    }`,
}
registerHooks({
  resolve(spec, ctx, next) {
    if ((spec.startsWith('.') || spec.startsWith('file:')) && !/\.(m?js|json)$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
  load(url, ctx, next) {
    const rel = url.startsWith('file:') ? fileURLToPath(url).slice(src.length + 1) : ''
    if (STUBS[rel]) return { format: 'module', shortCircuit: true, source: STUBS[rel] }
    return next(url, ctx)
  },
})

// A clock that only moves when told to, and timers that fire as it passes them.
const MONDAY_8PM = new Date(2026, 9, 19, 20, 0, 0).getTime()
let clock = MONDAY_8PM
let timers = []
let nextId = 1
Date.now = () => clock
globalThis.setTimeout = (fn, ms) => {
  const id = nextId++
  timers.push({ id, at: clock + ms, fn })
  return id
}
globalThis.clearTimeout = (id) => {
  timers = timers.filter((t) => t.id !== id)
}
globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} }
const settle = () => new Promise((r) => setImmediate(r))
const advance = async (ms) => {
  const end = clock + ms
  for (;;) {
    timers.sort((a, b) => a.at - b.at)
    const due = timers[0]
    if (!due || due.at > end) break
    timers.shift()
    clock = due.at
    due.fn()
    await settle()
  }
  clock = end
  await settle()
}
const nextTimer = () => Math.min(...timers.map((t) => t.at)) - clock

const httpError = (status) => () => {
  const e = new Error('API Error: ' + status)
  e.status = status
  throw e
}
const server = (globalThis.__server = {})
globalThis.__timesUp = 0
const shell = () => globalThis.__shell
const reset = (fields) => {
  Object.assign(server, { windowReads: 0, userReads: 0, meReads: 0, window: null, user: { Policy: {} }, me: {} }, fields)
  globalThis.__timesUp = 0
  clock = MONDAY_8PM
}

const { watchAccess, stopAccess, recheckAccess } = await import('./access.js')
const start = async () => {
  watchAccess('u1')
  await settle()
}

// Blocks on the plugin's answer alone, and names the opening from now.
reset({ window: { allowed: false, secondsUntilOpen: 3600 } })
await start()
assert.equal(shell().timesUp, true)
assert.equal(shell().nextAccess, 'You can use it again today at 21:00.')
assert.equal(globalThis.__timesUp, 1)
assert.equal(server.userReads, 0)
assert.equal(server.meReads, 0)
// Checks again when it opens, and lets the user back in.
assert.equal(nextTimer(), 60 * 1000)
server.window = { allowed: true, secondsUntilClose: 7200 }
await advance(60 * 1000)
assert.equal(shell().timesUp, false)
assert.equal(shell().nextAccess, '')
stopAccess()

// Names the opening to the nearest minute, so a clock a moment behind doesn't name the minute before.
reset({ window: { allowed: false, secondsUntilOpen: 59 * 60 + 58 } })
await start()
assert.equal(shell().nextAccess, 'You can use it again today at 21:00.')
stopAccess()

// Checks again when it closes, not a minute later, and blocks then.
reset({ window: { allowed: true, secondsUntilClose: 30 } })
await start()
assert.equal(shell().timesUp, false)
assert.equal(nextTimer(), 30 * 1000)
server.window = { allowed: false, secondsUntilOpen: 600 }
await advance(30 * 1000)
assert.equal(shell().timesUp, true)
assert.equal(globalThis.__timesUp, 1)
stopAccess()

// Checks every 15 minutes when nothing will close.
reset({ window: { allowed: true } })
await start()
assert.equal(nextTimer(), 15 * 60 * 1000)
stopAccess()

// A plugin that can't say (404 or 501) leaves it to the schedule and the server, and isn't asked again.
for (const status of [404, 501]) {
  reset({ window: httpError(status), me: httpError(403), user: { Policy: { AccessSchedules: [{ DayOfWeek: 'Everyday', StartHour: 0, EndHour: 24 }] } } })
  await start()
  assert.equal(server.windowReads, 1)
  assert.equal(server.userReads, 1)
  assert.equal(shell().timesUp, true, 'the server turning the user away decides')
  recheckAccess()
  await settle()
  assert.equal(server.windowReads, 1)
  assert.equal(server.userReads, 2)
  stopAccess()
}

// A failed read, or a 200 that isn't a window, falls back for that check and asks again next time.
for (const window of [httpError(500), '<html>', { secondsUntilOpen: 60 }]) {
  reset({ window, me: httpError(403), user: { Policy: { AccessSchedules: [{ DayOfWeek: 'Everyday', StartHour: 0, EndHour: 24 }] } } })
  await start()
  assert.equal(server.userReads, 1)
  assert.equal(shell().timesUp, true)
  server.window = { allowed: true, secondsUntilClose: 600 }
  recheckAccess()
  await settle()
  assert.equal(server.windowReads, 2)
  assert.equal(server.userReads, 1)
  assert.equal(shell().timesUp, false)
  stopAccess()
}

// Without the plugin, an administrator is never blocked.
reset({ window: httpError(404), user: { Policy: { IsAdministrator: true, AccessSchedules: [{ DayOfWeek: 'Monday', StartHour: 0, EndHour: 1 }] } } })
await start()
assert.equal(shell().timesUp, false)
assert.equal(server.meReads, 0)
stopAccess()

// An older check never replaces the answer of a newer one.
let releaseFirst
reset({ window: () => new Promise((r) => { releaseFirst = () => r({ allowed: false, secondsUntilOpen: 600 }) }) })
await start()
server.window = { allowed: true, secondsUntilClose: 600 }
recheckAccess()
await settle()
releaseFirst()
await settle()
assert.equal(shell().timesUp, false)
stopAccess()

// Stops checking once stopped.
reset({ window: { allowed: true, secondsUntilClose: 30 } })
await start()
stopAccess()
await advance(60 * 1000)
assert.equal(server.windowReads, 1)
assert.equal(timers.length, 0)

console.log('access ok')
