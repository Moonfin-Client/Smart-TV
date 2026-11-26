// node src/platform/rokuVideo.check.mjs
import assert from 'node:assert/strict'
import { createVideoElement, splitStart, streamFormat } from './rokuVideo.js'

// A Video node stand-in: it records field writes and lets the test fire the node's observers.
const fake = () => {
  const nodes = []
  const sg = {
    create: (tag) => {
      const n = { tag, fields: {}, writes: [] }
      nodes.push(n)
      return n
    },
    set: (n, k, v) => {
      n.fields[k] = v
      n.writes.push([k, v])
    },
    insert: () => {},
    remove: () => {},
  }
  return { sg, nodes, video: () => nodes.find((n) => n.tag === 'video') }
}
const changed = (node, field, value) => node.fields['on' + field[0].toUpperCase() + field.slice(1)](value)
const controls = (node) => node.writes.filter(([k]) => k === 'control').map(([, v]) => v)

assert.equal(streamFormat('http://s/videos/1/master.m3u8?x=1', ''), 'hls')
assert.equal(streamFormat('http://s/videos/1/stream.mkv?static=true', ''), 'mkv')
assert.equal(streamFormat('http://s/videos/1/stream?container=mp4&static=true', ''), 'mp4')
assert.equal(streamFormat('http://s/silo/abc', 'application/x-mpegURL'), 'hls')
assert.deepEqual(splitStart('http://s/a.mp4?x=1#t=42.5'), { url: 'http://s/a.mp4?x=1', start: 42.5 })
assert.deepEqual(splitStart('http://s/a.mp4'), { url: 'http://s/a.mp4', start: 0 })

const f = fake()
const el = createVideoElement(f.sg, () => ({}))
const events = []
for (const name of ['loadedmetadata', 'loadeddata', 'playing', 'pause', 'waiting', 'canplay', 'timeupdate', 'seeking', 'seeked', 'ended', 'error']) {
  el.addEventListener(name, () => events.push(name))
}

let fromProperty = 0
el.onplaying = () => fromProperty++
// Opening a stream with a resume point.
el.src = 'http://s/a.mkv?static=true#t=30'
el.load()
const v = f.video()
const content = f.nodes.find((n) => n.tag === 'contentNode')
assert.equal(content.fields.url, 'http://s/a.mkv?static=true')
assert.equal(content.fields.streamFormat, 'mkv')
assert.equal(content.fields.playStart, 30)
assert.equal(v.fields.content, content)
assert.equal(v.fields.enableUI, false)
assert.deepEqual(controls(v), ['play'])
assert.equal(el.paused, false)
assert.equal(el.currentTime, 30)

// The engine's play after loadedmetadata doesn't send a second play.
el.play()
assert.deepEqual(controls(v), ['play'])

changed(v, 'state', 'buffering')
changed(v, 'duration', 600000)
changed(v, 'state', 'playing')
changed(v, 'position', 31000)
assert.deepEqual(events, ['waiting', 'loadedmetadata', 'loadeddata', 'canplay', 'playing', 'timeupdate'])
assert.equal(fromProperty, 1, 'onplaying runs too')
assert.equal(el.duration, 600)
assert.equal(el.readyState, 4)
assert.equal(el.currentTime, 31)

// HLS segments give the buffered range, in milliseconds.
changed(v, 'downloadedSegment', { segStartTime: 30000, segDuration: 3003 })
changed(v, 'downloadedSegment', { segStartTime: 33003, segDuration: 3003 })
assert.equal(el.buffered.length, 1)
assert.deepEqual([el.buffered.start(0), el.buffered.end(0)], [30, 36.006])

// Pause, then a seek while paused, which lands paused.
events.length = 0
el.pause()
changed(v, 'state', 'paused')
el.currentTime = 120
assert.equal(v.fields.autoplayAfterSeek, false)
assert.equal(el.buffered.length, 0, 'a seek drops the old range')
assert.equal(v.fields.seek, 120)
assert.equal(el.seeking, true)
assert.equal(el.currentTime, 120)
changed(v, 'state', 'buffering')
changed(v, 'state', 'paused')
assert.deepEqual(events, ['pause', 'seeking', 'waiting', 'seeked', 'canplay'])
assert.equal(el.seeking, false)
assert.equal(el.paused, true)

// Resume after the pause.
el.play()
assert.equal(controls(v).at(-1), 'resume')
changed(v, 'state', 'playing')
assert.equal(el.paused, false)

// A seek while playing goes on playing.
el.currentTime = 200
assert.equal(v.fields.autoplayAfterSeek, true)
changed(v, 'state', 'buffering')
changed(v, 'state', 'playing')
assert.equal(el.seeking, false)

// The node playing while the element is paused gets paused again.
el.pause()
changed(v, 'state', 'playing')
assert.equal(controls(v).at(-1), 'pause')

// Ending, and an error with the node's own code and message.
events.length = 0
changed(v, 'state', 'finished')
assert.deepEqual(events, ['ended'])
assert.equal(el.ended, true)
changed(v, 'errorCode', -5)
changed(v, 'errorMsg', 'unsupported')
changed(v, 'state', 'error')
assert.deepEqual(el.error, { code: -5, message: 'unsupported' })

// Audio tracks pick by the node's Track id.
changed(v, 'availableAudioTracks', [
  { Language: 'eng', Name: 'English', Track: 'eac3_1' },
  { Language: 'fra', Name: 'French', Track: 'aac_2' },
])
changed(v, 'currentAudioTrack', 'eac3_1')
const tracks = el.audioTracks
assert.equal(tracks.length, 2)
assert.equal(tracks[0].enabled, true)
tracks[1].enabled = true
assert.equal(v.fields.audioTrack, 'aac_2')
assert.equal(el.audioTracks[1].enabled, true)

// The engine's geometry lands on the node.
el.style.left = '0px'
el.style.top = '140px'
el.style.width = '1920px'
el.style.height = '800px'
assert.deepEqual(v.fields.translation, [0, 140])
assert.equal(v.fields.height, 800)

// Cleanup stops and drops the content.
el.release()
assert.equal(controls(v).at(-1), 'stop')
assert.equal(v.fields.content, null)
assert.equal(el.src, '')
console.log('rokuVideo ok')

// A src set on its own starts loading, as a browser's does, at a currentTime set before it starts.
{
  const f2 = fake()
  const el2 = createVideoElement(f2.sg, () => ({}))
  el2.src = 'https://r1.googlevideo.com/videoplayback?mime=video%2Fmp4'
  el2.currentTime = 12
  await Promise.resolve()
  const v2 = f2.video()
  const c2 = f2.nodes.find((n) => n.tag === 'contentNode')
  assert.ok(v2, 'loading started')
  assert.equal(c2.fields.playStart, 12)
  assert.equal(c2.fields.HttpCertificatesFile, 'common:/certs/ca-bundle.crt')
  assert.deepEqual(controls(v2), ['play'])
  // A new src and time while that stream plays start the new one at the time.
  changed(v2, 'state', 'playing')
  el2.src = 'https://r1.googlevideo.com/videoplayback?itag=22'
  el2.currentTime = 40
  await Promise.resolve()
  const c2b = f2.nodes.filter((n) => n.tag === 'contentNode').at(-1)
  assert.notEqual(c2b, c2)
  assert.equal(c2b.fields.playStart, 40)
  // load() in the same turn as src runs once.
  const f3 = fake()
  const el3 = createVideoElement(f3.sg, () => ({}))
  el3.src = 'http://s/a.mp4'
  el3.load()
  await Promise.resolve()
  assert.equal(f3.nodes.filter((n) => n.tag === 'contentNode').length, 1)
  console.log('rokuVideo autoload ok')
}

// A held stream prebuffers, says it's ready once the node settles paused, and starts with play.
{
  const f4 = fake()
  const el4 = createVideoElement(f4.sg, () => ({}))
  const seen = []
  el4.addEventListener('loadeddata', () => seen.push('loadeddata'))
  el4.autoplay = false
  el4.src = 'http://s/a.mkv'
  el4.load()
  const v4 = f4.video()
  assert.deepEqual(controls(v4), ['prebuffer'])
  changed(v4, 'state', 'buffering')
  changed(v4, 'state', 'paused')
  assert.deepEqual(seen, ['loadeddata'])
  el4.play()
  assert.equal(controls(v4).at(-1), 'play')
  console.log('rokuVideo hold ok')
}

// A failed stream's finish isn't an end, and its late events after a reload are dropped.
{
  const f5 = fake()
  const el5 = createVideoElement(f5.sg, () => ({}))
  const seen = []
  for (const n of ['ended', 'error', 'playing']) el5.addEventListener(n, () => seen.push(n))
  el5.src = 'http://s/a.mov'
  el5.load()
  const v5 = f5.video()
  changed(v5, 'state', 'buffering')
  changed(v5, 'errorCode', -5)
  changed(v5, 'state', 'error')
  changed(v5, 'state', 'finished')
  assert.deepEqual(seen, ['error'])
  // The player reloads through the server, and the old stream's last error and finish arrive late.
  el5.src = 'http://s/master.m3u8'
  el5.load()
  changed(v5, 'state', 'error')
  changed(v5, 'state', 'finished')
  changed(v5, 'state', 'stopped')
  changed(v5, 'state', 'buffering')
  changed(v5, 'state', 'playing')
  assert.deepEqual(seen, ['error', 'playing'])
  assert.equal(el5.error, null)
  console.log('rokuVideo failover ok')
}
