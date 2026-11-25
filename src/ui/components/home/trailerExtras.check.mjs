// Self-check for trailerExtras.js: node src/ui/components/home/trailerExtras.check.mjs
import assert from 'node:assert/strict'
import { followCaptions, getTrailerStartTime, parseCaptions, skipSegments, sponsorSkipTarget } from './trailerExtras.js'

assert.equal(getTrailerStartTime([]), 0, 'no segments starts at the top')
assert.equal(getTrailerStartTime(null), 0)
assert.equal(getTrailerStartTime([{ start: 0, end: 12 }]), 12, 'an intro at the top is skipped')
assert.equal(getTrailerStartTime([{ start: 12.5, end: 20 }, { start: 0, end: 12 }]), 20, 'and one that follows it within a second')
assert.equal(getTrailerStartTime([{ start: 0, end: 2 }]), 5, 'never before 5 s once there are segments')
assert.equal(getTrailerStartTime([{ start: 40, end: 50 }]), 5, 'a segment later on leaves the start alone')

const segs = [{ start: 10, end: 20 }, { start: 30, end: 31 }]
assert.equal(sponsorSkipTarget(segs, 9.9), -1)
assert.equal(sponsorSkipTarget(segs, 10), 20)
assert.equal(sponsorSkipTarget(segs, 19.4), 20)
assert.equal(sponsorSkipTarget(segs, 19.6), -1, 'the last half second plays')
assert.equal(sponsorSkipTarget(segs, 30.2), 31)
assert.equal(sponsorSkipTarget([], 10), -1)

const vtt = [
  'WEBVTT',
  'Kind: captions',
  'Language: en',
  '',
  '00:00:01.000 --> 00:00:03.000 align:start position:0%',
  ' ',
  'Tom &amp; Jerry<00:00:01.500><c> run</c>',
  '',
  '00:00:02.500 --> 00:00:04.000',
  'it&#39;s &lt;here&gt;',
  '',
].join('\n')
const cues = parseCaptions(vtt)
assert.deepEqual(
  cues.map((c) => [c.StartPositionTicks, c.EndPositionTicks, c.Text]),
  [
    [10000000, 30000000, 'Tom & Jerry run'],
    [25000000, 40000000, "it's <here>"],
  ],
  'tags, positions and the blank line go, and entities are read'
)

const listeners = {}
const video = {
  currentTime: 0,
  paused: false,
  addEventListener: (name, fn) => (listeners[name] = fn),
  removeEventListener: (name, fn) => {
    if (listeners[name] === fn) delete listeners[name]
  },
}
const seen = []
const stop = followCaptions(video, cues, (t) => seen.push(t))
assert.deepEqual(seen, [], 'nothing shows before the first cue')
video.currentTime = 1.2
listeners.timeupdate()
video.currentTime = 1.4
listeners.timeupdate()
video.currentTime = 2.6
listeners.timeupdate()
video.currentTime = 3.5
listeners.timeupdate()
assert.deepEqual(seen, ['Tom & Jerry run', "Tom & Jerry run\nit's <here>", "it's <here>"], 'only changes are handed on, overlaps a line each')
stop()
assert.equal(seen[seen.length - 1], '', 'stopping clears what showed')
assert.equal(listeners.timeupdate, undefined)

const realSet = globalThis.setInterval
const realClear = globalThis.clearInterval
let tick = null
globalThis.setInterval = (fn) => ((tick = fn), 1)
globalThis.clearInterval = () => (tick = null)
const v2 = { currentTime: 12, paused: true }
const stopSkip = skipSegments(v2, segs)
tick()
assert.equal(v2.currentTime, 12, 'a paused trailer stays put')
v2.paused = false
tick()
assert.equal(v2.currentTime, 20, 'a playing one jumps past the segment')
stopSkip()
assert.equal(tick, null)
skipSegments(v2, [])
assert.equal(tick, null, 'no segments, no timer')
globalThis.setInterval = realSet
globalThis.clearInterval = realClear

console.log('trailerExtras ok')
