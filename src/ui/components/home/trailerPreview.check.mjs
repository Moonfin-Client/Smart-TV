// Self-check for trailerPreview.js: node src/ui/components/home/trailerPreview.check.mjs
import assert from 'node:assert/strict'
import { coverRect, createTrailerPreview, mayPlay } from './trailerPreview.js'

const open = { enabled: true, homeReady: true, focused: true, item: {}, saver: false, music: false, hidden: false }
assert.equal(mayPlay(open), true)
for (const [key, value] of [['enabled', false], ['homeReady', false], ['focused', false], ['item', null], ['saver', true], ['music', true], ['hidden', true]]) {
  assert.equal(mayPlay({ ...open, [key]: value }), false, `${key} ${value} keeps it off`)
}

const tick = () => new Promise((r) => setTimeout(r, 5))
const fakeVideo = () => ({
  src: '',
  currentTime: 0,
  muted: false,
  volume: 1,
  style: {},
  paused: true,
  refuseSound: false,
  play() {
    if (this.refuseSound && !this.muted) return Promise.reject(new Error('NotAllowedError'))
    this.paused = false
    return Promise.resolve()
  },
  pause() {
    this.paused = true
  },
  removeAttribute(name) {
    if (name === 'src') this.src = ''
  },
  load() {},
})

const setup = (sources, opts = {}) => {
  const video = fakeVideo()
  const log = []
  const t = createTrailerPreview({
    load: async () => ({
      resolve: opts.resolve || (async () => sources),
      stream: opts.stream || (async (s) => (s.url ? { url: s.url } : s.videoId ? { url: `yt:${s.videoId}` } : null)),
      attach: (v, s, startTime) => {
        v.src = s.url
        v.startTime = startTime
        return () => log.push(`released ${s.url}`)
      },
      watch: (v, s, onStall) => {
        if (!s.manifest) return () => {}
        video.stall = onStall
        return () => (video.stall = null)
      },
      failed: (s, label, reason, movesOn) => log.push(`failed ${s.url} ${reason}${movesOn ? ' next' : ''}`),
      ...(opts.extras || {}),
      video: () => video,
    }),
    onCaption: (t) => log.push(`caption ${t}`),
    rect: null,
    revealMs: 20,
    onChange: (s) => log.push(`${s.holding ? 'hold' : '-'}/${s.active ? 'show' : '-'}`),
    onEnded: () => log.push('ended'),
  })
  return { t, video, log }
}

{
  const { t, video, log } = setup([{ url: 'local' }])
  t.want({ Id: 'a' }, { muted: false, volume: 50 })
  await tick()
  assert.equal(video.src, 'local')
  assert.equal(video.muted, false)
  assert.equal(video.volume, 0.5)
  video.onplaying()
  assert.deepEqual(log, ['hold/-'], 'holds the carousel from the first frame')
  await new Promise((r) => setTimeout(r, 40))
  assert.deepEqual(log, ['hold/-', 'hold/show'], 'shows after the reveal delay')
  video.onplaying()
  assert.equal(log.length, 2, 'a second playing event changes nothing')
  t.want(null)
  assert.equal(video.src, '', 'losing focus clears the element')
  assert.equal(video.paused, true)
  assert.equal(video.onplaying, null)
  assert.deepEqual(log.slice(-2), ['released local', '-/-'])
}

{
  const item = { Id: 'a' }
  const { t, video, log } = setup([{ url: 'local' }])
  t.want(item, { muted: true, volume: 80 })
  await tick()
  assert.equal(video.muted, true)
  assert.equal(video.volume, 0)
  video.onplaying()
  video.onended()
  assert.deepEqual(log, ['hold/-', 'released local', '-/-', 'ended'], 'the end lets go and moves the bar on')
  t.want(item, {})
  await tick()
  assert.equal(video.src, '', 'the same slide does not play again')
}

{
  const { t, video, log } = setup([{ url: 'local' }, { videoId: 'yt1' }])
  t.want({ Id: 'a' }, {})
  await tick()
  video.onerror()
  await tick()
  assert.equal(video.src, 'yt:yt1', 'a file that fails before playing gives way to YouTube')
  assert.deepEqual(log, ['failed local failed to play next', 'released local'])
  video.onplaying()
  video.onerror()
  assert.equal(video.src, '', 'a failure once playing gives up')
  assert.deepEqual(log.slice(2), ['hold/-', 'failed yt:yt1 failed to play', 'released yt:yt1', '-/-'])
}

{
  const { t, video, log } = setup([{ url: 'local' }])
  t.want({ Id: 'a' }, {})
  await tick()
  video.onerror()
  await tick()
  assert.equal(video.src, '')
  assert.deepEqual(log, ['failed local failed to play', 'released local'], 'nothing playable leaves the bar as it was')
}

{
  const { t, video, log } = setup([])
  t.want({ Id: 'a' }, {})
  await tick()
  assert.equal(video.src, '')
  assert.deepEqual(log, [])
}

{
  let release
  const slow = new Promise((r) => (release = r))
  const { t, video } = setup(null, { resolve: async (item) => (item.Id === 'a' ? slow : [{ url: 'b-file' }]) })
  t.want({ Id: 'a' }, {})
  await tick()
  t.want({ Id: 'b' }, {})
  await tick()
  assert.equal(video.src, 'b-file')
  release([{ url: 'a-file' }])
  await tick()
  assert.equal(video.src, 'b-file', 'a slide left behind never takes the element')
}

{
  const { t, video } = setup([{ url: 'local' }])
  t.want({ Id: 'a' }, {})
  await tick()
  video.onplaying()
  video.src = 'player-stream'
  t.stop()
  assert.equal(video.src, 'player-stream', 'a stream the player put in stays')
  assert.equal(video.onplaying, null)
}

{
  const { t, video } = setup([{ url: 'local' }])
  video.refuseSound = true
  t.want({ Id: 'a' }, { muted: false, volume: 100 })
  await tick()
  assert.equal(video.muted, true, 'refused autoplay with sound retries muted')
  assert.equal(video.paused, false)
}

{
  const { t, video } = setup([{ url: 'local' }])
  const item = { Id: 'a' }
  t.want(item, {})
  await tick()
  video.onplaying()
  t.dismiss()
  assert.equal(video.src, '', 'dismiss ends the trailer')
  t.want(item, {})
  await tick()
  assert.equal(video.src, '', 'and keeps it off for the same slide')
  t.want(null)
  t.want(item, {})
  await tick()
  assert.equal(video.src, 'local', 'until focus leaves and comes back')
}

// A YouTube manifest with the 360p file behind it.
const manifestStream = async (s) =>
  s.muxedOnly ? { url: `file:${s.videoId}` } : { url: `hls:${s.videoId}`, manifest: true, fallback: { videoId: s.videoId, muxedOnly: true } }

{
  const { t, video, log } = setup([{ videoId: 'yt1' }], { stream: manifestStream })
  t.want({ Id: 'a' }, {})
  await tick()
  assert.equal(video.src, 'hls:yt1')
  video.onplaying()
  await new Promise((r) => setTimeout(r, 40))
  video.currentTime = 42
  video.stall('stalled')
  assert.equal(video.onplaying, null, 'a stalled manifest that comes back does not take over again')
  await tick()
  assert.equal(video.src, 'file:yt1', 'a manifest that stalls partway gives way to the file')
  assert.equal(video.startTime, 42, 'which carries on from the same spot')
  assert.deepEqual(log, ['hold/-', 'hold/show', 'failed hls:yt1 stalled next', 'released hls:yt1'], 'the trailer stays shown meanwhile')
  video.onplaying()
  await new Promise((r) => setTimeout(r, 40))
  assert.equal(log.length, 4, 'and the file playing changes nothing that shows')
  t.want(null)
  assert.deepEqual(log.slice(4), ['released file:yt1', '-/-'])
}

{
  const { t, video, log } = setup([{ videoId: 'yt1' }], { stream: manifestStream })
  t.want({ Id: 'a' }, {})
  await tick()
  video.stall('did not start')
  await tick()
  assert.equal(video.src, 'file:yt1', 'a manifest that never starts gives way to the file')
  assert.equal(video.startTime, 0)
  assert.deepEqual(log, ['failed hls:yt1 did not start next', 'released hls:yt1'])
}

{
  const { t, video, log } = setup([{ videoId: 'yt1' }], { stream: manifestStream })
  t.want({ Id: 'a' }, {})
  await tick()
  video.onplaying()
  await new Promise((r) => setTimeout(r, 40))
  video.stall('stalled')
  await tick()
  video.onerror()
  await tick()
  assert.equal(video.src, '', 'the file failing as well gives up')
  assert.deepEqual(log.slice(-2), ['released file:yt1', '-/-'], 'and the bar comes back')
}

{
  const { t, video, log } = setup([{ videoId: 'yt1' }], { stream: async (s) => (s.muxedOnly ? null : manifestStream(s)) })
  t.want({ Id: 'a' }, {})
  await tick()
  video.onplaying()
  await new Promise((r) => setTimeout(r, 40))
  video.stall('stalled')
  await tick()
  assert.equal(video.src, '', 'no file to go to lets go of the manifest')
  assert.deepEqual(log.slice(-2), ['released hls:yt1', '-/-'])
}

{
  // SponsorBlock's start and skips, and the captions, follow each stream.
  const skipping = []
  let pendingCues = null
  const extras = {
    skipSegments: (v, segments) => {
      skipping.push(segments.length)
      return () => skipping.push('off')
    },
    captions: (s) => new Promise((r) => (pendingCues = () => r(s.manifest ? [{ id: 'cue' }] : []))),
    followCaptions: (v, cues, onText) => {
      onText(`from ${v.src}`)
      return () => onText('')
    },
  }
  const stream = async (s) =>
    s.muxedOnly
      ? { url: `file:${s.videoId}`, segments: [], startTime: 0 }
      : { url: `hls:${s.videoId}`, manifest: true, segments: [{ start: 0, end: 8 }], startTime: 8, fallback: { videoId: s.videoId, muxedOnly: true } }
  const { t, video, log } = setup([{ videoId: 'yt1' }], { stream, extras })
  t.want({ Id: 'a' }, {})
  await tick()
  assert.equal(video.startTime, 8, 'a trailer starts past what SponsorBlock marks at the top')
  assert.deepEqual(skipping, [1])
  pendingCues()
  await tick()
  assert.deepEqual(log, ['caption from hls:yt1'])
  video.onplaying()
  video.currentTime = 30
  video.stall('stalled')
  assert.deepEqual(skipping, [1, 'off'], 'the skips stop with the stream')
  assert.deepEqual(log.slice(-2), ['hold/-', 'failed hls:yt1 stalled next'], 'its captions stay up until the next one starts')
  await tick()
  assert.equal(video.startTime, 30, 'a resume beats the start past the segments')
  assert.deepEqual(log.slice(-2), ['released hls:yt1', 'caption '], 'the manifest and its captions go once the file takes over')
  pendingCues()
  await tick()
  t.want(null)
  assert.deepEqual(log.slice(-2), ['released file:yt1', '-/-'], 'a file without captions shows none')
}

{
  // Captions that land after the trailer stopped don't show.
  let land = null
  const extras = {
    captions: () => new Promise((r) => (land = () => r([{ id: 'cue' }]))),
    followCaptions: () => {
      throw new Error('should not follow')
    },
  }
  const { t } = setup([{ url: 'local' }], { extras })
  t.want({ Id: 'a' }, {})
  await tick()
  t.want(null)
  land()
  await tick()
}

assert.deepEqual(coverRect(1920, 1080, { x: 0, y: 0, w: 1920, h: 1080 }, 1), { x: 0, y: 0, w: 1920, h: 1080 })
assert.deepEqual(coverRect(640, 360, { x: 0, y: 0, w: 1920, h: 1080 }), { x: -144, y: -81, w: 2208, h: 1242 }, 'cropped by the 1.15 zoom')
assert.deepEqual(coverRect(1920, 800, { x: 100, y: 100, w: 400, h: 600 }, 1), { x: -420, y: 100, w: 1440, h: 600 }, 'a wide film fills a tall frame by height')
assert.equal(coverRect(0, 0, { x: 0, y: 0, w: 10, h: 10 }), null)

console.log('trailerPreview ok')
