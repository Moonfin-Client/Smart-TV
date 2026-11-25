// Self-check for channelSwitch.js: node src/pages/Player/channelSwitch.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.(m?js|json)$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
  load(url, ctx, next) {
    return next(url, url.endsWith('.json') ? { ...ctx, importAttributes: { type: 'json' } } : ctx)
  },
})
const { createChannelSwitch } = await import('./channelSwitch.js')

const ch = (id, n) => ({ Id: id, Name: `Ch ${id}`, ChannelNumber: String(n) })
const all = [ch('c', 3), ch('a', 1), ch('b', 2)]
const api = { getLiveTvChannels: async () => ({ Items: all }) }
const log = []
let timers = []
const warm = []
const sw = createChannelSwitch({
  play: (c) => log.push(`play ${c.Id}`),
  onFailed: (c) => log.push(`failed ${c.Id}`),
  onSucceeded: () => log.push('ok'),
  onRestore: (c) => log.push(`restore ${c.Id}`),
  setTimer: (fn) => (timers.push(fn), timers.length),
  clearTimer: () => {},
  apiFor: () => api,
  prewarmFor: () => ({ tuned: (l) => warm.push(l.length), dispose() {}, refresh() {}, store: { setChannelFavorite() {} } }),
})

assert.equal(sw.step(1), false, 'nothing to zap through before a channel opened')
await sw.tuned(all[1], 'number')
assert.deepEqual(sw.lineup.map((c) => c.Id), ['a', 'b', 'c'], 'the lineup comes in the saved sort')
assert.deepEqual(warm, [3], 'a lineup of two or more warms the guide data')

assert.equal(sw.step(-1), true)
assert.deepEqual(log, ['play c'], 'down from the first channel wraps to the last')
assert.equal(sw.step(1), false, 'one switch at a time')
assert.equal(sw.failed('a'), true, 'the stream being left going down is the switch, not an error')
assert.deepEqual(log, ['play c'])
sw.playing('c')
assert.deepEqual(log, ['play c', 'ok'])
assert.equal(sw.switching(), false)

await sw.tuned(all[0], 'number')
log.length = 0
assert.equal(sw.select(all[0]), 'same', 'picking the channel playing only closes the carousel')
assert.equal(sw.select(all[2]), 'switching')
assert.equal(sw.failed('b'), true, 'a failed switch goes back on its own')
assert.deepEqual(log, ['play b', 'failed b', 'play c', 'restore c'])
assert.equal(sw.failed('c'), false, 'a restore that fails shows its error')
assert.deepEqual(log.slice(4), ['failed c'])

log.length = 0
timers = []
sw.step(1)
timers[0]()
assert.deepEqual(log, ['play a', 'failed a', 'play c', 'restore c'], 'a switch that never plays times out')
// A switch that played is the channel the next failure goes back to, before the player reports it.
sw.playing('c')
log.length = 0
timers = []
sw.select(all[1])
sw.playing('a')
sw.step(1)
sw.failed('b')
assert.deepEqual(log, ['play a', 'ok', 'play b', 'failed b', 'play a', 'restore a'])
sw.dispose()
console.log('channelSwitch ok')
