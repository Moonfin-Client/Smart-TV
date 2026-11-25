// Self-check for hlsSetup.js against a stub of hls.js: node src/pages/Player/hlsSetup.check.mjs
import assert from 'node:assert/strict'
import { createHls, hlsConfig } from './hlsSetup.js'

// The default config, Fire TV's 10 s caps and a Silo copy's byte budget.
assert.deepEqual(hlsConfig({ vega: false }), {
  enableWorker: false,
  lowLatencyMode: false,
  maxBufferLength: 30,
  maxMaxBufferLength: 60,
  backBufferLength: Infinity,
  startFragPrefetch: true,
  maxBufferHole: 0.5,
  nudgeMaxRetry: 5,
})
const vega = hlsConfig({ vega: true })
assert.equal(vega.maxBufferLength, 10)
assert.equal(vega.backBufferLength, 10)
assert.equal(vega.maxMaxBufferLength, 60)
const copy = hlsConfig({ copyBuffer: { ahead: 12, behind: 4 }, startPosition: 95 })
assert.equal(copy.maxBufferLength, 12)
assert.equal(copy.maxMaxBufferLength, 12)
assert.equal(copy.backBufferLength, 4)
assert.equal(copy.startPosition, 95)
assert.equal('startPosition' in hlsConfig({ startPosition: 0 }), false)

class Hls {
  static Events = { FRAG_BUFFERED: 'frag', ERROR: 'error' }
  static ErrorTypes = { NETWORK_ERROR: 'net', MEDIA_ERROR: 'media', OTHER_ERROR: 'other' }
  constructor(config) {
    this.config = config
    this.handlers = {}
    this.calls = []
  }
  on(name, fn) {
    this.handlers[name] = fn
  }
  attachMedia(v) {
    this.calls.push(['attach', v])
  }
  loadSource(u) {
    this.calls.push(['load', u])
  }
  startLoad() {
    this.calls.push(['startLoad'])
  }
  recoverMediaError() {
    this.calls.push(['recover'])
  }
  fire(name, data) {
    this.handlers[name] && this.handlers[name](name, data)
  }
}
const newVideo = () => {
  const v = { currentTime: 0, autoplay: true, plays: 0 }
  v.play = () => {
    v.plays++
    return Promise.resolve()
  }
  return v
}

// The start waits for two fragments (one on live TV), and the element's own autoplay is off.
{
  const v = newVideo()
  const fails = []
  const { hls: h, started } = createHls(Hls, v, { url: 'u.m3u8', isLive: false }, (d) => fails.push(d))
  assert.equal(v.autoplay, false)
  assert.deepEqual(h.calls, [['attach', v], ['load', 'u.m3u8']])
  h.fire('frag')
  assert.equal(v.plays, 0)
  assert.equal(started(), false)
  h.fire('frag')
  assert.equal(v.plays, 1)
  h.fire('frag')
  assert.equal(v.plays, 1, 'one start only')
  assert.equal(started(), true)
}
{
  const v = newVideo()
  const { hls: h } = createHls(Hls, v, { url: 'live.m3u8', isLive: true }, () => {})
  h.fire('frag')
  assert.equal(v.plays, 1)
}

// A stall at the first frame gets a nudge to 0.5 s on the third report, a media recovery on the sixth.
{
  const v = newVideo()
  const { hls: h } = createHls(Hls, v, { url: 'u', isLive: false }, () => {})
  h.fire('error', { details: 'bufferStalledError', fatal: false })
  assert.equal(h.calls.length, 2, 'ignored before the start')
  h.fire('frag')
  h.fire('frag')
  for (let i = 0; i < 3; i++) h.fire('error', { details: 'bufferStalledError', fatal: false })
  assert.equal(v.currentTime, 0.5)
  for (let i = 0; i < 3; i++) h.fire('error', { details: 'bufferNudgeOnStall', fatal: false })
  assert.deepEqual(h.calls.at(-1), ['recover'])
}

// Fatal errors: network restarts loading, media recovers, anything else and a live network error go to the
// player. Recoveries are capped until a fragment buffers again.
{
  const v = newVideo()
  const fails = []
  const { hls: h } = createHls(Hls, v, { url: 'u', isLive: false }, (d) => fails.push(d))
  h.fire('error', { type: 'net', details: 'manifestLoadError', fatal: true })
  assert.deepEqual(h.calls.at(-1), ['startLoad'])
  h.fire('error', { type: 'media', details: 'bufferAppendError', fatal: true })
  assert.deepEqual(h.calls.at(-1), ['recover'])
  h.fire('error', { type: 'media', details: 'bufferAppendError', fatal: true })
  h.fire('error', { type: 'media', details: 'bufferAppendError', fatal: true })
  assert.deepEqual(fails, ['bufferAppendError'], 'fourth recovery in a row gives up')
  h.fire('frag')
  h.fire('error', { type: 'media', details: 'x', fatal: true })
  assert.deepEqual(h.calls.at(-1), ['recover'], 'a buffered fragment starts the count over')
  h.fire('error', { type: 'other', details: 'keySystemError', fatal: true })
  assert.deepEqual(fails, ['bufferAppendError', 'keySystemError'])
}
{
  const fails = []
  const { hls: h } = createHls(Hls, newVideo(), { url: 'u', isLive: true }, (d) => fails.push(d))
  h.fire('error', { type: 'net', details: 'fragLoadError', fatal: true })
  assert.deepEqual(fails, ['fragLoadError'], 'live goes to the live recovery')
  assert.equal(h.calls.some((c) => c[0] === 'startLoad'), false)
}
// A start held for the group buffers without playing.
{
  const v = newVideo()
  let holding = true
  const { hls: h, started } = createHls(Hls, v, { url: 'u', isLive: false, hold: () => holding }, () => {})
  h.fire('frag')
  h.fire('frag')
  assert.equal(v.plays, 0)
  assert.equal(started(), true)
}
console.log('hlsSetup ok')
