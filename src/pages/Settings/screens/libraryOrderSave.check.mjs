// Self-check for the library order saves in editors.js: node --conditions=browser src/pages/Settings/screens/libraryOrderSave.check.mjs
// A save goes to the account the order was loaded for, or nowhere.
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'

// Everything editors.js imports is a stub except the library order helpers. The stubs below
// stand in for the account and its server; any other import gets a value that does nothing.
const editors = new URL('./editors.js', import.meta.url).href
const STUBS = {
  'services/jellyfinApi.js': `const a = globalThis.__account
    export const getServerUrl = () => a.server
    export const getUserId = () => a.user
    export const getServerType = () => 'jellyfin'
    export const createApiForServer = () => ({})
    export const api = {
      getAllLibraries: async () => ({ Items: [{ Id: 'a', Name: 'A' }, { Id: 'b', Name: 'B' }] }),
      getUserConfiguration: () => a.read(),
      updateUserConfiguration: async (c) => { a.writes.push({ user: a.user, order: c.OrderedViews }) },
    }`,
  'state/settings.js': `export const get = () => undefined`,
  'state/homeRows.js': `export const loadLibraries = async () => []`,
}
const anything = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : anything()), apply: () => anything() })
globalThis.__anything = anything
const stubFor = (spec) => {
  const line = readFileSync(new URL(editors), 'utf8').split('\n').find((l) => l.startsWith('import ') && l.endsWith(`'${spec}'`))
  const named = (line.match(/\{([^}]*)\}/) || ['', ''])[1].split(',').map((n) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean)
  return named.map((n) => `export const ${n} = globalThis.__anything()`).join('\n') + '\nexport default globalThis.__anything()'
}
registerHooks({
  resolve(spec, ctx, next) {
    if (ctx.parentURL === editors && !spec.endsWith('/libraryOrder.js')) {
      const key = Object.keys(STUBS).find((k) => spec.endsWith(k))
      return { url: 'data:text/javascript,' + encodeURIComponent(key ? STUBS[key] : stubFor(spec)), shortCircuit: true }
    }
    if (spec.endsWith('/gamesApi')) return { url: 'data:text/javascript,export {}', shortCircuit: true }
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})

const account = (globalThis.__account = { server: 'http://one', user: 'u1', writes: [], read: async () => ({ Configuration: {} }) })
const { SCREENS } = await import('./editors.js')
const screen = SCREENS.libraryOrder
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const page = { ctx: {}, refresh() {}, $setTimeout() {}, focusList() {}, showToast() {} }

// Opens the screen as account u1 on http://one and waits for its libraries.
const open = async () => {
  Object.assign(account, { server: 'http://one', user: 'u1', writes: [], read: async () => ({ Configuration: {} }) })
  const view = {}
  screen.entries(page, view)
  await wait(0)
  return view
}
// Presses right on the first library.
const move = (view) => screen.entries(page, view).find((e) => e.side).side(page, 'right')
const settle = (view) => view.queue.then(() => wait(0))

// The order lands on the account it was loaded for.
let view = await open()
move(view)
screen.leave(page, view)
await settle(view)
assert.deepEqual(account.writes, [{ user: 'u1', order: ['b', 'a'] }], 'a save with no switch reaches the account')

// A switch before the save timer fires drops the save.
view = await open()
move(view)
account.user = 'u2'
await wait(700)
await settle(view)
assert.deepEqual(account.writes, [], 'a switch before the timer fires keeps the order off the new account')

// A switch while the save reads the configuration drops it.
view = await open()
let release
account.read = () => new Promise((r) => (release = () => r({ Configuration: {} })))
move(view)
screen.leave(page, view)
await wait(0)
account.user = 'u2'
release()
await settle(view)
assert.deepEqual(account.writes, [], 'a switch during the read keeps the order off the new account')

// A save still queued behind a slow one when the account changes is dropped too.
view = await open()
const reads = []
account.read = () => new Promise((r) => reads.push(() => r({ Configuration: {} })))
move(view)
await wait(700)
move(view)
screen.leave(page, view)
await wait(0)
account.server = 'http://two'
reads.shift()()
await wait(0)
reads.forEach((r) => r())
await settle(view)
assert.deepEqual(account.writes, [], 'a queued save keeps the order off the new account')

console.log('library order save checks passed')
