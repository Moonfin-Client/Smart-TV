// Self-check for videoEngine.js with the hosts faked: Samsung's AVPlay object behind the real Tizen
// wrapper, and a <video> element with webOS's audioTracks. The services it calls are stubs that
// record what they were asked.
//   node --conditions=browser src/state/videoEngine.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const src = join(dirname(fileURLToPath(import.meta.url)), '..')
const STUBS = {
  'platform.js': `export const getPlatform = () => globalThis.__platform
    export const isVega = () => !!globalThis.__vega`,
  'services/video.js': `const log = (globalThis.__svc = [])
    export const initVideo = async () => {}
    export const initPlayerPlatform = async () => false
    export const getSharedVideoElement = () => globalThis.__video
    export const cleanupVideoElement = async (v) => { log.push(['cleanup']) }
    export const keepScreenOn = (on) => log.push(['screen', on])
    export const chooseHostReader = () => {}
    export const setDisplayWindow = (rect) => log.push(['window', rect])
    export const waitForDecoderRelease = async () => log.push(['decoder'])
    export const resumesAfterFirstFrame = () => !!globalThis.__afterFrame
    export const showHostSubtitle = (video, index) => (log.push(['host', index]), true)
    export const isAudioStreamPlayable = () => true`,
  'services/playback.js': `export const getCurrentSession = () => ({ capabilities: { screenWidth: 3840, screenHeight: 2160 } })`,
  'services/systemVolume.js': `export const getVolumeState = async () => null
    export const setMuted = async () => true`,
  'platform/tizen/deviceProfile.js': `export const detectTizenVersion = () => globalThis.__tizenVersion || 8`,
}
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('@moonfin/app/src/')) spec = pathToFileURL(join(src, spec.slice('@moonfin/app/src/'.length))).href
    if ((spec.startsWith('.') || spec.startsWith('file:')) && !/\.(m?js|json)$/.test(spec)) spec += '.js'
    if (spec === 'hls.js') return { url: 'stub:hls', shortCircuit: true }
    return next(spec, ctx)
  },
  load(url, ctx, next) {
    if (url === 'stub:hls') return { format: 'module', shortCircuit: true, source: 'export default { isSupported: () => false }' }
    const rel = url.startsWith('file:') ? fileURLToPath(url).slice(src.length + 1) : ''
    if (STUBS[rel]) return { format: 'module', shortCircuit: true, source: STUBS[rel] }
    return next(url, ctx)
  },
})

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// A page with no DOM to speak of: the engine only places nodes and sets styles.
const node = () => ({ style: {}, parentNode: null, firstChild: null })
globalThis.window = globalThis
globalThis.innerWidth = 1920
globalThis.innerHeight = 1080
globalThis.devicePixelRatio = 2
globalThis.screen = { width: 3840, height: 2160 }
globalThis.addEventListener = () => {}
globalThis.removeEventListener = () => {}
globalThis.document = {
  getElementById: () => null,
  createElement: () => node(),
  body: { firstChild: null, insertBefore: (n) => (n.parentNode = globalThis.document.body) },
}
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 8.0)' }, configurable: true })
globalThis.tizen = {}
globalThis.fetch = async () => ({ ok: true, text: async () => '#EXTM3U\n' })

// Samsung's AVPlay as the wrapper drives it: a state machine and a log of calls.
const makeAvplay = ({ failPrepare = false, tracks, current } = {}) => {
  const calls = []
  let state = 'NONE'
  let listener = null
  const av = {
    calls,
    get listener() {
      return listener
    },
    setState: (s) => (state = s),
    open: (u) => {
      calls.push(['open', u])
      state = 'IDLE'
    },
    getState: () => state,
    setDisplayMethod: (m) => calls.push(['method', m]),
    setDisplayRect: (x, y, w, h) => calls.push(['rect', x, y, w, h]),
    setBufferingParam: () => {},
    setTimeoutForBuffering: () => {},
    setStreamingProperty: (k, v) => calls.push(['prop', k, v]),
    seekTo: (ms, ok) => {
      calls.push(['seek', ms, state])
      ok && setTimeout(ok, 0)
    },
    setListener: (l) => (listener = l),
    prepareAsync: (ok, fail) => {
      calls.push(['prepare'])
      setTimeout(() => {
        if (failPrepare) return fail(new Error('PLAYER_ERROR_NOT_SUPPORTED_FILE'))
        state = 'READY'
        ok()
      }, 0)
    },
    play: () => {
      calls.push(['play'])
      state = 'PLAYING'
    },
    pause: () => {
      calls.push(['pause'])
      state = 'PAUSED'
    },
    stop: () => {
      calls.push(['stop'])
      state = 'IDLE'
    },
    close: () => {
      calls.push(['close'])
      state = 'NONE'
    },
    suspend: () => calls.push(['suspend']),
    getDuration: () => 5400000,
    getCurrentTime: () => 0,
    getTotalTrackInfo: () => tracks || [],
    getCurrentStreamInfo: () => current || [],
    setSelectTrack: (type, i) => calls.push(['select', type, i]),
    setSilentSubtitle: (on) => calls.push(['silent', on]),
  }
  return av
}

const engine = await import('./videoEngine.js')
const events = []
for (const name of ['playing', 'paused', 'time', 'error', 'cue', 'subFallback', 'audioMismatch', 'serverSeek', 'duration', 'held']) {
  engine.on(name, (d) => events.push([name, d]))
}
const named = (n) => events.filter((e) => e[0] === n)

// Tizen: direct play with a picked audio track and an embedded text subtitle.
globalThis.__platform = 'tizen'
{
  const tracks = [
    { type: 'VIDEO', index: 0 },
    { type: 'AUDIO', index: 1 },
    { type: 'AUDIO', index: 2 },
    { type: 'TEXT', index: 3 },
    { type: 'TEXT', index: 4 },
  ]
  const av = makeAvplay({ tracks, current: [{ type: 'AUDIO', index: 1 }] })
  globalThis.webapis = { avplay: av }
  const audioStreams = [
    { index: 1, codec: 'aac' },
    { index: 2, codec: 'ac3' },
  ]
  const subs = [
    { index: 3, isEmbeddedNative: true, isTextBased: true },
    { index: 4, isEmbeddedNative: true, isTextBased: true },
  ]
  engine.setZoom('fit', 2.4)
  await engine.open({
    url: 'http://s/v.mkv',
    playMethod: 'DirectPlay',
    mediaSource: { Bitrate: 8000000, MediaStreams: [{ Type: 'Video', Width: 1920, Height: 1080 }] },
    startSeconds: 60,
    audio: { streamIndex: 2, audioStreams },
    nativeSub: { stream: subs[1], streams: subs },
  })
  const kinds = av.calls.map((c) => c[0])
  assert.deepEqual(kinds.slice(0, 4), ['open', 'method', 'rect', 'prop'], 'open, display, then the user agent')
  assert.deepEqual(av.calls[1], ['method', 'PLAYER_DISPLAY_MODE_FULL_SCREEN'], 'fit with a declared aspect gets a shaped box')
  assert.deepEqual(av.calls[2], ['rect', 0, 140, 1920, 800])
  assert.deepEqual(av.calls[3], ['prop', 'USER_AGENT', 'JellyfinTizenClient'])
  assert.equal(av.calls.some((c) => c[0] === 'prop' && c[1] === 'ADAPTIVE_INFO'), false, 'no adaptive info for a file')
  assert.equal(av.calls.filter((c) => c[0] === 'method').length, 2, 'the display goes on again after prepare')
  assert.ok(kinds.indexOf('prepare') < kinds.indexOf('play'))
  // A pending native subtitle starts from zero, so the resume goes after play rather than in IDLE.
  const seek = av.calls.find((c) => c[0] === 'seek')
  assert.deepEqual(seek, ['seek', 60000, 'PLAYING'])
  // The tracks go on once it plays: audio by AVPlay's own index, then the text track with the silent flag flipped.
  assert.deepEqual(
    av.calls.filter((c) => c[0] === 'select' || c[0] === 'silent'),
    [
      ['select', 'AUDIO', 2],
      ['select', 'TEXT', 4],
      ['silent', true],
      ['silent', false],
    ]
  )
  assert.equal(engine.nativeSubtitleOn(), true)
  assert.equal(named('playing').length, 0, 'playing waits for the time to move')
  // AVPlay's lines come through onsubtitlechange, cleaned, and go when their duration is up.
  av.listener.onsubtitlechange(30, 'Hello<br>there\r\u0000', 0)
  assert.deepEqual(named('cue').at(-1), ['cue', 'Hello\nthere'])
  av.listener.onsubtitlechange(0, 'ignored', 1)
  assert.equal(named('cue').length, 1, 'type 1 is not text')
  await wait(50)
  assert.deepEqual(named('cue').at(-1), ['cue', ''])
  // Time moving is what says it plays.
  av.listener.oncurrentplaytime(60000)
  av.listener.oncurrentplaytime(60500)
  assert.equal(named('playing').length, 1)
  assert.equal(engine.hasMoved(), true)
  assert.equal(engine.currentTime(), 60.5)
  // A seek's flush drops the native selection, and the post-seek hook puts it back.
  av.calls.length = 0
  await engine.seek(120)
  await wait(10)
  assert.deepEqual(av.calls.filter((c) => c[0] === 'select'), [['select', 'TEXT', 4]])
  // Audio switches in AVPlay, by its own index.
  av.calls.length = 0
  assert.equal(engine.switchAudio(1, audioStreams), true)
  assert.deepEqual(av.calls, [['select', 'AUDIO', 1]])
  // Errors while paused wait for the resume.
  engine.pause()
  av.listener.onerror('PLAYER_ERROR_CONNECTION_FAILED')
  assert.equal(named('error').length, 0)
  // The app going away suspends AVPlay.
  engine.play()
  const sus = engine.suspend()
  assert.equal(sus.wasPlaying, true)
  assert.equal(sus.suspended, true)
  assert.ok(av.calls.some((c) => c[0] === 'suspend'))
  // Nothing drawn natively: the firmware is kept from turning a track on by itself.
  engine.silenceNativeSubtitles()
  assert.deepEqual(av.calls.at(-1), ['silent', true])
  await engine.stop()
}

// Tizen: a 4K HLS transcode on Tizen 4, resumed.
{
  globalThis.__tizenVersion = 4
  const av = makeAvplay()
  globalThis.webapis = { avplay: av }
  events.length = 0
  engine.setZoom('fill', null)
  const opening = engine.open({
    url: 'http://s/master.m3u8',
    playMethod: 'Transcode',
    mediaSource: { Bitrate: 40000000, MediaStreams: [{ Type: 'Video', Width: 3840, Height: 2160 }] },
    startSeconds: 30,
  })
  await wait(20)
  // Play waits for the first buffer fill (3 s at most).
  assert.equal(av.calls.some((c) => c[0] === 'play'), false)
  av.listener.onbufferingcomplete()
  await opening
  assert.deepEqual(av.calls[1], ['method', 'PLAYER_DISPLAY_MODE_CROPPED_FULL'])
  assert.deepEqual(av.calls[2], ['rect', 0, 0, 1920, 1080])
  assert.ok(av.calls.some((c) => c[0] === 'prop' && c[1] === 'SET_MODE_4K' && c[2] === 'TRUE'))
  assert.ok(av.calls.some((c) => c[0] === 'prop' && c[1] === 'ADAPTIVE_INFO' && c[2] === 'FIXED_MAX_RESOLUTION=3840x2160|STARTBITRATE=HIGHEST|SKIPBITRATE=LOWEST'))
  // A fresh HLS transcode refuses seeks before it moves, so the resume waits 1.5 s after play.
  assert.equal(av.calls.some((c) => c[0] === 'seek'), false)
  await wait(1600)
  assert.deepEqual(av.calls.find((c) => c[0] === 'seek'), ['seek', 30000, 'PLAYING'])
  // Nothing native: silenced.
  assert.ok(av.calls.some((c) => c[0] === 'silent' && c[1] === true))
  await engine.stop()
  globalThis.__tizenVersion = 8
}

// Tizen: a stream AVPlay refuses at prepare rejects the open.
{
  globalThis.webapis = { avplay: makeAvplay({ failPrepare: true }) }
  await assert.rejects(engine.open({ url: 'http://s/v.avi', playMethod: 'DirectPlay', mediaSource: {} }))
  await engine.stop()
}

// Tizen: a Silo remux opened mid-title is on the title's timeline, and its seeks go back to Silo.
{
  const av = makeAvplay()
  globalThis.webapis = { avplay: av }
  events.length = 0
  await engine.open({
    url: 'http://silo/s.mp4',
    playMethod: 'DirectStream',
    mediaSource: { SiloTimelineOffsetTicks: 6000000000, SiloSeeksThroughServer: true, MediaStreams: [] },
    startSeconds: 700,
    runTimeSeconds: 5000,
  })
  assert.equal(engine.duration(), 5000, 'the title runtime stands')
  av.listener.oncurrentplaytime(100000)
  assert.equal(engine.currentTime(), 700)
  await engine.seek(900)
  assert.deepEqual(named('serverSeek').at(-1), ['serverSeek', 900])
  await engine.stop()
}

// Tizen: a start held for the group loads, says so, and plays only when told.
{
  const av = makeAvplay()
  globalThis.webapis = { avplay: av }
  events.length = 0
  await engine.open({ url: 'http://s/v.mkv', playMethod: 'DirectPlay', mediaSource: {}, startSeconds: 30, hold: true })
  assert.equal(av.calls.some((c) => c[0] === 'play'), false, 'held')
  assert.equal(named('held').length, 1)
  assert.equal(engine.isPaused(), true)
  engine.play()
  assert.deepEqual(av.calls.filter((c) => c[0] === 'play'), [['play']])
  // Live HLS reports its rewindable range.
  av.getStreamingProperty = (k) => (k === 'GET_LIVE_DURATION' ? '1000|601000' : '')
  assert.deepEqual(engine.liveRange(), { start: 1, end: 601 })
  await engine.stop()
}

// webOS: the <video> path.
globalThis.__platform = 'webos'
const makeVideo = (audioTracks) => {
  const listeners = {}
  const v = {
    style: {},
    parentNode: null,
    firstChild: null,
    currentTime: 0,
    duration: 3600,
    readyState: 4,
    paused: false,
    videoWidth: 1920,
    videoHeight: 1080,
    audioTracks,
    attrs: {},
    canPlayType: () => 'maybe',
    addEventListener: (n, fn) => (listeners[n] = (listeners[n] || []).concat(fn)),
    removeEventListener: (n, fn) => (listeners[n] = (listeners[n] || []).filter((f) => f !== fn)),
    removeAttribute: () => {},
    load: () => {},
    play: () => Promise.resolve(),
    pause: () => {},
    fire: (n) => (listeners[n] || []).slice().forEach((fn) => fn({ currentTarget: v })),
  }
  return v
}
{
  // The TV lists its tracks, and the picked Japanese one goes on at the first time update.
  const tracks = [
    { language: 'eng', enabled: true },
    { language: 'jpn', enabled: false },
  ]
  const v = makeVideo(tracks)
  globalThis.__video = v
  events.length = 0
  globalThis.__svc.length = 0
  await engine.open({
    url: 'http://s/v.mkv',
    playMethod: 'DirectPlay',
    mimeType: 'video/x-matroska',
    startSeconds: 100,
    audio: {
      streamIndex: 2,
      audioStreams: [
        { index: 1, language: 'eng', codec: 'aac' },
        { index: 2, language: 'jpn', codec: 'aac' },
      ],
    },
  })
  assert.equal(v.src, 'http://s/v.mkv#t=100')
  assert.ok(globalThis.__svc.some((c) => c[0] === 'decoder'), 'waits for the last decoder')
  // A set that ignored #t= is put there on the first time update, which isn't reported as the position.
  v.fire('timeupdate')
  assert.equal(v.currentTime, 100)
  assert.equal(named('time').length, 0)
  assert.deepEqual(
    tracks.map((t) => t.enabled),
    [false, true]
  )
  v.fire('timeupdate')
  v.currentTime = 100.5
  v.fire('timeupdate')
  assert.deepEqual(named('time').at(-1), ['time', 100.5])
  assert.equal(engine.hasMoved(), true)
  // Audio switches through audioTracks.
  assert.equal(
    engine.switchAudio(1, [
      { index: 1, language: 'eng', codec: 'aac' },
      { index: 2, language: 'jpn', codec: 'aac' },
    ]),
    true
  )
  assert.deepEqual(
    tracks.map((t) => t.enabled),
    [true, false]
  )
  // Stretch tells the TV the window, in the panel's pixels.
  globalThis.__svc.length = 0
  engine.setZoom('stretch', 16 / 9)
  const win = globalThis.__svc.find((c) => c[0] === 'window')[1]
  assert.equal(win.mode, 'stretch')
  assert.deepEqual([win.destX, win.destY, win.destWidth, win.destHeight], [0, 0, 3840, 2160])
  assert.equal(win.video, v)
  assert.deepEqual([v.style.width, v.style.height], ['1920px', '1080px'])
  // The Xbox console player's own subtitle.
  assert.equal(engine.showHostSubtitle(5), true)
  assert.deepEqual(globalThis.__svc.at(-1), ['host', 5])
  // A media error carries its code.
  v.error = { code: 3, message: 'DECODER_ERROR_NOT_SUPPORTED' }
  v.fire('error')
  assert.deepEqual(named('error').at(-1), ['error', { code: 3, message: 'DECODER_ERROR_NOT_SUPPORTED', kind: 'media' }])
  await engine.stop()
}
{
  // A list that can't be matched has the server send the track instead.
  const v = makeVideo([{ language: 'eng' }, { language: 'eng' }, { language: 'eng' }])
  globalThis.__video = v
  events.length = 0
  await engine.open({ url: 'http://s/v.mkv', playMethod: 'DirectPlay', audio: { streamIndex: 2, audioStreams: [{ index: 1, codec: 'aac' }, { index: 2, codec: 'aac' }] } })
  v.fire('timeupdate')
  assert.deepEqual(named('audioMismatch'), [['audioMismatch', 2]])
  await engine.stop()
}
{
  // Where a seek before the first frame never lands, the file opens at its start and the resume waits for the frame.
  globalThis.__afterFrame = true
  const v = makeVideo()
  globalThis.__video = v
  await engine.open({ url: 'http://s/hevc.mp4', playMethod: 'DirectPlay', startSeconds: 50 })
  assert.equal(v.src, 'http://s/hevc.mp4')
  v.fire('loadeddata')
  assert.equal(v.currentTime, 50)
  globalThis.__afterFrame = false
  await engine.stop()
}
{
  // A held start loads without playing, draws its frame by seeking in place, and says so.
  const v = makeVideo()
  let plays = 0
  v.play = () => {
    plays++
    return Promise.resolve()
  }
  globalThis.__video = v
  events.length = 0
  await engine.open({ url: 'http://s/v.mkv', playMethod: 'DirectPlay', hold: true })
  assert.equal(plays, 0)
  assert.equal(v.autoplay, false)
  v.fire('loadedmetadata')
  assert.equal(plays, 0, 'loadedmetadata leaves a held start alone')
  v.currentTime = 12
  v.fire('loadeddata')
  assert.equal(named('held').length, 1)
  engine.play()
  assert.equal(plays, 1)
  // A seek resolves once it lands.
  let landed = false
  const seeking = engine.seek(40).then(() => (landed = true))
  await wait(5)
  assert.equal(v.currentTime, 40)
  assert.equal(landed, false)
  v.fire('seeked')
  await seeking
  assert.equal(landed, true)
  // The seekable range, and the dropped frame count.
  v.seekable = { length: 1, start: () => 5, end: () => 905 }
  assert.deepEqual(engine.liveRange(), { start: 5, end: 905 })
  v.getVideoPlaybackQuality = () => ({ droppedVideoFrames: 7 })
  assert.equal(engine.droppedFrames(), 7)
  await engine.stop()
}
{
  // Play during a seek waits for it to land (webOS's own player jumps a transcode to its end
  // otherwise), a pause meanwhile drops it, and the wait counts as playing.
  const v = makeVideo()
  let plays = 0
  v.play = () => {
    plays++
    return Promise.resolve()
  }
  globalThis.__video = v
  await engine.open({ url: 'http://s/master.m3u8', playMethod: 'Transcode', startSeconds: 4496 })
  plays = 0
  v.paused = true
  v.seeking = true
  engine.seek(4470)
  engine.play()
  assert.equal(plays, 0, 'no play mid-seek')
  assert.equal(engine.isPaused(), false)
  v.seeking = false
  v.fire('seeked')
  assert.equal(plays, 1, 'plays once the seek lands')
  v.seeking = true
  engine.play()
  engine.pause()
  v.seeking = false
  v.fire('seeked')
  assert.equal(plays, 1, 'a pause drops the waiting play')
  assert.equal(engine.isPaused(), true)
  await engine.stop()
}
{
  // A seek the element answers by jumping to its end opens the stream again at the target, and a
  // seek near the end that ends is left alone.
  const v = makeVideo()
  v.duration = 10709
  globalThis.__video = v
  await engine.open({ url: 'http://s/master.m3u8', mimeType: 'application/x-mpegURL', playMethod: 'Transcode', startSeconds: 4496 })
  assert.equal(v.src, 'http://s/master.m3u8#t=4496')
  v.fire('timeupdate')
  events.length = 0
  engine.seek(4470)
  v.currentTime = 10709
  v.fire('timeupdate')
  await wait(5)
  assert.equal(v.src, 'http://s/master.m3u8#t=4470', 'opened again at the target')
  assert.equal(named('time').length, 0, 'the end never goes out as the position')
  v.currentTime = 4470
  v.fire('timeupdate')
  // The stalled element may send no time update at all, so the end is looked for on a timer too.
  engine.seek(4440)
  v.currentTime = 10709
  await wait(700)
  assert.equal(v.src, 'http://s/master.m3u8#t=4440', 'found on the timer')
  v.currentTime = 4440
  v.fire('timeupdate')
  engine.seek(10705)
  v.currentTime = 10709
  v.fire('ended')
  assert.equal(engine.hasEnded(), true)
  await engine.stop()
}
console.log('videoEngine ok')
process.exit(0)
