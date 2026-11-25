// Self-check for watchParty.js's group playback with SyncPlay and the engine stubbed:
//   node --conditions=browser src/state/watchParty.check.mjs
// No group is created or joined anywhere: the stubs stand in for the server's answers.
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const src = join(dirname(fileURLToPath(import.meta.url)), '..')
const STUBS = {
  'services/syncPlay.js': `export const calls = (globalThis.__sp = [])
    export const room = (globalThis.__room = { driven: false, selfCorrecting: false, state: 'Paused', owed: true })
    let listener = null
    export const addListener = (fn) => (listener = fn)
    export const fire = (e, d) => listener && listener(e, d)
    globalThis.__fire = fire
    export const isRoomDriven = () => room.driven
    export const isSelfCorrectingRoom = () => room.selfCorrecting
    export const getGroupState = () => room.state
    export const isReadyOwed = () => room.owed
    export const setNewQueue = (q) => calls.push(['queue', q])
    export const playerSessionOpened = () => calls.push(['sessionOpened'])
    export const attachPlayer = () => (calls.push(['attachPlayer']), () => {})
    export const getDelayToWhen = () => 0
    export const whenToServerMs = () => Date.now()
    export const setSyncReference = () => {}
    export const clearSyncReference = () => {}
    export const getExpectedPositionTicks = () => null
    export const getAdjustedPosition = (p) => p
    export const getGroupPositionTicks = () => 0
    export const sendReadyRequest = () => calls.push(['ready'])
    export const sendBufferingRequest = () => calls.push(['buffering'])
    export const sendPlayRequest = () => calls.push(['playReq'])
    export const sendPauseRequest = () => calls.push(['pauseReq'])
    export const sendSeekRequest = () => {}
    export const BUFFERING_SUPPRESS_MS = 0
    export const QUEUE_START_REASONS = ['NewPlaylist']
    export const listGroups = async () => []
    export const joinGroup = async () => {}
    export const leaveGroup = async () => {}
    export const createGroup = async () => true
    export const start = () => {}
    export const stop = () => {}`,
  'services/serverSocket.js': `export const onConnectionChange = () => () => {}`,
  'services/siloWatchParty.js': `export const watchParty = { state: () => ({}), subscribe: () => () => {}, onSessionChanged: () => () => {}, backend: () => null, available: () => false }
    export const isRoomPlaying = (room) => !!room && room.phase === 'playing'`,
  'state/shell/shellState.js': `export const shellApp = () => null`,
  'services/jellyfinApi.js': `export const api = { getItem: async (id) => ({ Id: id }) }`,
  'services/playback.js': `export const getCurrentSession = () => ({ playSessionId: 'ps' })`,
  'state/videoEngine.js': `const l = {}
    export const on = (n, fn) => ((l[n] = (l[n] || []).concat(fn)), () => {})
    export const usesAvplay = () => !!globalThis.__avplay
    export const seeksThroughServer = () => !!globalThis.__viaServer
    export const copyHolds = () => false
    export const bufferedAhead = () => globalThis.__ahead || 0
    globalThis.__engineFire = (n, d) => (l[n] || []).forEach((fn) => fn(d))`,
  'state/settings.js': `export const get = (k) => (k === 'syncplayEnabled' ? true : undefined)
    export const all = () => ({})
    export const onChange = () => () => {}`,
  'state/store.js': `export const getStore = () => ({})`,
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
globalThis.localStorage = { store: {}, getItem(k) { return this.store[k] || null }, setItem(k, v) { this.store[k] = String(v) } }
const party = await import('./watchParty.js')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
party.start()
const sp = globalThis.__sp
const room = globalThis.__room
globalThis.__fire('groupJoined', { GroupId: 'g1', State: 'Paused' })

// A player whose seeks land when the test says so.
const makePlayer = (extra) => {
  const log = []
  let paused = true
  let t = 100
  let land = null
  return {
    log,
    land: () => land && land(),
    controls: {
      itemId: 'item-1',
      play: () => {
        paused = false
        log.push('play')
      },
      pause: () => {
        paused = true
        log.push('pause')
      },
      seek: (sec) => {
        log.push(`seek ${sec}`)
        t = sec
        return new Promise((r) => (land = r))
      },
      currentTime: () => t,
      duration: () => 1000,
      isPaused: () => paused,
      stop: () => log.push('stop'),
      ...extra,
    },
  }
}

// A fresh play in a Jellyfin group queues it for everyone, the session ping comes after the room can tick, and a
// group that isn't playing has the stream held.
{
  sp.length = 0
  const p = makePlayer({ fresh: true })
  party.attach(p.controls)
  assert.deepEqual(sp.map((c) => c[0]), ['queue', 'attachPlayer', 'sessionOpened'])
  assert.equal(party.holdsStart(), true)
  // The engine's held stream is the set's Ready.
  globalThis.__engineFire('held')
  // Ready goes out once the position has held still past the gate's debounce (syncReady.js).
  await wait(1600)
  assert.ok(sp.some((c) => c[0] === 'ready'))
  party.detach()
}
// The player moving on to its next item doesn't queue it for the group.
{
  sp.length = 0
  party.attach(makePlayer({ itemId: 'item-2', fresh: false }).controls)
  assert.equal(sp.some((c) => c[0] === 'queue'), false)
  party.detach()
}
// webOS: the group's Seek runs playing, then pauses on landing and reports Ready only then.
{
  sp.length = 0
  const p = makePlayer()
  party.attach(p.controls)
  globalThis.__engineFire('held')
  await wait(5)
  sp.length = 0
  globalThis.__fire('playbackCommand', { Command: 'Seek', PositionTicks: 500 * 10000000, When: new Date().toISOString() })
  assert.deepEqual(p.log, ['play', 'seek 500'])
  await wait(1600)
  assert.equal(sp.some((c) => c[0] === 'ready'), false, 'nothing reported before it lands')
  p.land()
  await wait(5)
  assert.deepEqual(p.log, ['play', 'seek 500', 'pause'])
  await wait(1600)
  assert.ok(sp.some((c) => c[0] === 'ready'))
  party.detach()
}
// Tizen seeks paused, as AVPlay loads either way.
{
  globalThis.__avplay = true
  const p = makePlayer()
  party.attach(p.controls)
  globalThis.__engineFire('held')
  globalThis.__fire('playbackCommand', { Command: 'Seek', PositionTicks: 600 * 10000000, When: new Date(Date.now() + 1).toISOString() })
  assert.deepEqual(p.log, ['seek 600'])
  p.land()
  party.detach()
  globalThis.__avplay = false
}
// A Moonbase room on webOS keeps a Pause where it is, with no seek.
{
  room.selfCorrecting = true
  const p = makePlayer()
  party.attach(p.controls)
  globalThis.__engineFire('held')
  globalThis.__fire('playbackCommand', { Command: 'Pause', PositionTicks: 900 * 10000000, When: new Date(Date.now() + 2).toISOString() })
  assert.equal(p.log.some((x) => x.startsWith('seek')), false)
  party.detach()
  room.selfCorrecting = false
}
// A Silo room: a start from paused is timed, and the first lead learned over 250 ms has the room start over.
{
  room.driven = true
  const p = makePlayer()
  party.attach(p.controls)
  globalThis.__engineFire('held')
  sp.length = 0
  globalThis.__fire('playbackCommand', { Command: 'Unpause', PositionTicks: 100 * 10000000, When: new Date().toISOString() })
  assert.equal(p.log.at(-1), 'play', 'no seek: the set is where the room starts')
  await wait(600)
  p.controls.currentTime = () => 100.1
  globalThis.__engineFire('time')
  assert.ok(sp.some((c) => c[0] === 'pauseReq'), 'first lead resyncs the room')
  assert.ok(Number(localStorage.getItem('moonfin_sync_start_lead_ms')) >= 400)
  await wait(1600)
  assert.ok(sp.some((c) => c[0] === 'playReq'))
  party.detach()
}
// A Silo stream that stalls twice waits paused for 6 s of it, reports Buffering once, then plays on.
{
  globalThis.__viaServer = true
  const p = makePlayer()
  party.attach(p.controls)
  globalThis.__engineFire('held')
  globalThis.__fire('playbackCommand', { Command: 'Unpause', PositionTicks: 100 * 10000000, When: new Date(Date.now() - 5000).toISOString() })
  sp.length = 0
  p.log.length = 0
  globalThis.__engineFire('buffering', true)
  globalThis.__engineFire('buffering', false)
  await wait(10)
  globalThis.__engineFire('buffering', true)
  assert.deepEqual(p.log, ['pause'])
  assert.deepEqual(sp.filter((c) => c[0] === 'buffering').length, 1)
  globalThis.__ahead = 7
  await wait(300)
  assert.deepEqual(p.log, ['pause', 'play'])
  party.detach()
  globalThis.__viaServer = false
  room.driven = false
}
// Joining a group with the player up holds it unless the group plays.
{
  const p = makePlayer()
  party.attach(p.controls)
  room.state = 'Paused'
  globalThis.__fire('groupJoined', { GroupId: 'g2', State: 'Paused' })
  assert.equal(party.holdsStart(), true)
  party.detach()
}
// A group created over the player starts on what's playing.
{
  sp.length = 0
  await party.createGroup('Movie night', ['item-9'])
  assert.deepEqual(sp.find((c) => c[0] === 'queue'), ['queue', ['item-9']])
}
console.log('watchParty ok')
process.exit(0)
