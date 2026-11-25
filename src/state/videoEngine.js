// One playback interface over the platforms' video paths. webOS, Fire TV and Xbox play through the
// shared <video> element under the transparent canvas, natively or through hls.js. Tizen plays
// through AVPlay, which draws on a hardware plane under the page. Both report time in seconds, on
// the title's timeline: a Silo remux opened mid-title counts from where it starts.
import { getPlatform, isVega } from '../platform.js'
import {
  initVideo,
  getSharedVideoElement,
  cleanupVideoElement,
  initPlayerPlatform,
  keepScreenOn,
  chooseHostReader,
  setDisplayWindow,
  waitForDecoderRelease,
  resumesAfterFirstFrame,
  showHostSubtitle as hostSubtitle,
  isAudioStreamPlayable,
} from '../services/video.js'
import { getCurrentSession } from '../services/playback.js'
import { getVolumeState, setMuted as setSystemMuted } from '../services/systemVolume.js'
import { getZoomDisplayRect, matchDecodedOrientation } from '../pages/Player/aspectRatioUtils.js'
import { createHls } from '../pages/Player/hlsSetup.js'
import { copyBufferSeconds } from '../pages/Player/copyBuffer.js'
import { copyReaches } from '../pages/Player/copySeek.js'
import { bufferedAheadSeconds } from '../utils/syncStarve.js'
import { matchAudioTrack } from '../pages/Player/webosTrackUtils.js'
import { panelRect, zoomWindow } from '../pages/Player/zoomWindow.js'
import { avplaySubtitleText } from '../utils/subtitleText.js'
import { isPlexUrl } from '../utils/plexUrls.js'

const listeners = {}
const emit = (name, data) => (listeners[name] || []).forEach((fn) => fn(data))

export const on = (name, fn) => {
  ;(listeners[name] = listeners[name] || []).push(fn)
  return () => {
    listeners[name] = (listeners[name] || []).filter((f) => f !== fn)
  }
}

// A start that shows nothing for this long is an error, and the fallbacks take it from there.
const START_TIMEOUT_MS = 120000
// AVPlay says PLAYING as soon as play is issued, so a position that moved is the proof, with this
// as the backstop for a stream whose position sits still.
const SETTLE_MS = 2000
const RESUME_CHECK_MS = 5000
const AVPLAY_SCREEN = { width: 1920, height: 1080 }

let mode = null
let video = null
let hls = null
let hlsStarted = () => true
let tz = null
let tzTracks = null
let avPaused = false
let avTime = 0
let avDuration = 0
let ended = false
// Each open counts up, so a listener or timer left from the last stream does nothing.
let gen = 0
// The open stream: where it starts in the title, whether its seeks go back to Silo, the title's length.
let line = { offset: 0, viaServer: false, runTime: 0, isLive: false, url: '' }
let moved = false
let lastTick = null
let resumeAt = 0
let timedOut = false
let lastError = null
let pendingAudio = null
let screenOn = false
let zoom = { mode: 'fit', aspect: null }
let timers = []
// A stream opened for a group that hasn't started yet: it loads and stops on its first frame until
// play(). Tizen keeps what play has to do once it comes.
let holding = false
let heldPlay = null
let serverSeekFn = null
let lastOpts = null
// webOS's own player sometimes answers a seek in a transcode by putting its clock on the stream's
// end and stopping there, more often right after a pause. A seek's target is kept for a while, and
// a stream that lands on its end instead opens again at the target, as a resume opens it. It's
// looked for on a timer too, since the stalled element can go on without a time update until the
// next key.
const SEEK_WATCH_MS = 15000
let seekWatch = null
const landedOnEnd = (t) => {
  const d = video.duration
  return !!seekWatch && Date.now() < seekWatch.until && d > 0 && isFinite(d) && t >= d - 1 && seekWatch.to - line.offset < d - 10
}
const reopenAtTarget = () => {
  const to = seekWatch.to
  seekWatch = null
  open({ ...lastOpts, startSeconds: to, startDelayMs: 0, hold: false }).catch(() => {})
}
const watchEnd = () => {
  if (!seekWatch || mode !== 'video' || !video) return
  if (landedOnEnd(video.currentTime)) return reopenAtTarget()
  if (Date.now() < seekWatch.until) later(watchEnd, 500)
  else seekWatch = null
}

const isTizen = () => getPlatform() === 'tizen'
const later = (fn, ms) => {
  const id = setTimeout(fn, ms)
  timers.push(id)
  return id
}
const clearTimers = () => {
  timers.forEach((id) => clearTimeout(id))
  timers = []
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const screen = (onNow) => {
  if (onNow === screenOn) return
  screenOn = onNow
  keepScreenOn(onNow)
}
const playing = () => {
  screen(true)
  emit('playing')
}
const paused = () => {
  screen(false)
  emit('paused')
}

const layerApp = () => {
  const app = document.getElementById('app')
  if (app) {
    app.style.position = 'absolute'
    app.style.left = '0'
    app.style.top = '0'
    app.style.zIndex = '1'
  }
}

// The video element sits under the canvas, which only shows it where its pixels are clear.
const mountVideo = () => {
  video = getSharedVideoElement()
  if (!video.parentNode) document.body.insertBefore(video, document.body.firstChild)
  video.style.zIndex = '0'
  layerApp()
  return video
}

let subCanvas = null

// The canvas ASS and PGS tracks draw on. It shares the video's layer and comes after it in the
// page, so it paints over the video and under the app. AVPlay draws below the whole page.
export const subtitleCanvas = () => {
  if (!subCanvas) {
    subCanvas = document.createElement('canvas')
    const st = subCanvas.style
    st.position = 'absolute'
    st.left = '0'
    st.top = '0'
    st.width = '100%'
    st.height = '100%'
    st.zIndex = '0'
    st.pointerEvents = 'none'
  }
  if (!subCanvas.parentNode) {
    const after = video && video.parentNode === document.body ? video.nextSibling : document.body.firstChild
    document.body.insertBefore(subCanvas, after)
  }
  layerApp()
  placeSubtitleCanvas()
  return subCanvas
}

const removeSubtitleCanvas = () => {
  if (subCanvas && subCanvas.parentNode) subCanvas.parentNode.removeChild(subCanvas)
}

// The picture's box on the page for each zoom mode, from the declared aspect when the stream has one.
let contentRect = null
const videoRects = () => {
  const sw = window.innerWidth || 1920
  const sh = window.innerHeight || 1080
  const decoded = video && video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : null
  const target = (zoom.aspect > 0 ? matchDecodedOrientation(zoom.aspect, decoded) : decoded) || sw / sh
  const wFull = Math.round(sh * target)
  const hFull = Math.round(sw / target)
  const wide = target >= sw / sh
  const fit = wide ? { x: 0, y: Math.round((sh - hFull) / 2), w: sw, h: hFull } : { x: Math.round((sw - wFull) / 2), y: 0, w: wFull, h: sh }
  const fill = wide ? { x: -Math.round((wFull - sw) / 2), y: 0, w: wFull, h: sh } : { x: 0, y: -Math.round((hFull - sh) / 2), w: sw, h: hFull }
  return { sw, sh, fit, fill, decoded }
}

// ASS and PGS lines belong to the picture, so their canvas covers it in every zoom mode (#235).
const placeSubtitleCanvas = () => {
  if (!subCanvas || mode !== 'video' || !contentRect) return
  const st = subCanvas.style
  st.left = `${contentRect.x}px`
  st.top = `${contentRect.y}px`
  st.width = `${contentRect.w}px`
  st.height = `${contentRect.h}px`
}

const applyVideoGeometry = () => {
  if (mode !== 'video' || !video) return
  const r = videoRects()
  const box = zoom.mode === 'stretch' ? { x: 0, y: 0, w: r.sw, h: r.sh } : zoom.mode === 'fill' ? r.fill : r.fit
  const st = video.style
  st.position = 'absolute'
  st.objectFit = 'fill'
  st.transform = 'none'
  st.width = `${box.w}px`
  st.height = `${box.h}px`
  st.left = `${box.x}px`
  st.top = `${box.y}px`
  contentRect = zoom.mode === 'fill' ? r.fill : r.fit
  placeSubtitleCanvas()
  emit('geometry', contentRect)
  // webOS 3 to 5 draw Stretch only when the TV is told the window, and the Xbox console player
  // takes its box from the element. Every other host ignores this.
  setDisplayWindow({
    ...zoomWindow({
      screen: panelRect(window),
      zoom: zoom.mode,
      declared: zoom.aspect,
      decoded: r.decoded,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
    }),
    video,
  })
}

const onResize = () => (mode === 'video' ? applyVideoGeometry() : null)

const videoTime = () => (video ? video.currentTime + line.offset : 0)
const videoDuration = () => {
  if (line.viaServer && line.runTime > 0) return line.runTime
  const d = video && video.duration
  return d && isFinite(d) ? d + line.offset : 0
}

const playsNatively = (stream) => {
  const session = getCurrentSession()
  return isAudioStreamPlayable({ Codec: stream.codec }, (session && session.capabilities) || {})
}

const enableAudioTrack = (index, streams) => {
  const list = video && video.audioTracks
  if (!list || list.length < 2) return -1
  const at = matchAudioTrack(list, streams, index, playsNatively)
  if (at >= 0) for (let i = 0; i < list.length; i++) list[i].enabled = i === at
  return at
}

// The first time updates of a stream: the resume lands if #t= didn't take it there, and the picked
// audio track goes on once the TV lists its tracks, or the server is asked for a stream with only
// that track in it.
const firstTimes = () => {
  if (startTimer) {
    clearTimeout(startTimer)
    startTimer = null
    timedOut = false
  }
  if (resumeAt > 0) {
    const at = Math.max(0, resumeAt - line.offset)
    if (video.currentTime < at * 0.5) video.currentTime = at
    resumeAt = 0
  }
  const p = pendingAudio
  if (!p) return
  const list = video.audioTracks
  if (list && list.length > 1) {
    if (enableAudioTrack(p.streamIndex, p.audioStreams) < 0 && !p.afterReload) emit('audioMismatch', p.streamIndex)
    pendingAudio = null
  } else if (!list || list.length > 0) pendingAudio = null
}

let startTimer = null
const videoEvents = {
  timeupdate: () => {
    const holding = resumeAt > 0
    firstTimes()
    // Until a resume lands the element reads the file's start, which mustn't go out as the position.
    if (holding) return
    const t = video.currentTime
    if (landedOnEnd(t)) return reopenAtTarget()
    if (lastTick != null && t !== lastTick) moved = true
    lastTick = t
    emit('time', t + line.offset)
  },
  playing: () => playing(),
  pause: () => paused(),
  waiting: () => emit('buffering', true),
  canplay: () => emit('buffering', false),
  ended: () => {
    if (landedOnEnd(video.currentTime)) return reopenAtTarget()
    ended = true
    emit('ended')
  },
  error: () => {
    const e = video.error
    lastError = { code: e ? e.code : null, message: (e && e.message) || '' }
    emit('error', { ...lastError, kind: 'media' })
  },
  loadedmetadata: () => {
    emit('duration', videoDuration())
    applyVideoGeometry()
    // hls.js holds the start until its fragments are in, and a group holds it until it plays.
    if (holding || (hls && !hlsStarted())) return
    const p = video.play()
    if (p && p.catch) p.catch(() => {})
  },
}

const bindVideo = () => Object.keys(videoEvents).forEach((n) => video.addEventListener(n, videoEvents[n]))
const unbindVideo = () => video && Object.keys(videoEvents).forEach((n) => video.removeEventListener(n, videoEvents[n]))

const destroyHls = () => {
  if (hls) {
    hls.destroy()
    hls = null
  }
}

const openVideo = async (o) => {
  const mine = gen
  destroyHls()
  if (o.startDelayMs > 0) {
    await wait(o.startDelayMs)
    if (mine !== gen) return
  }
  mountVideo()
  unbindVideo()
  bindVideo()
  video.autoplay = !o.hold
  video.muted = false
  video.defaultMuted = false
  video.volume = 1
  video.removeAttribute('muted')
  video.playbackRate = 1
  const url = o.url
  const source = o.mediaSource || {}
  const isHls = o.mimeType === 'application/x-mpegURL' || url.indexOf('.m3u8') >= 0
  const startAt = !o.isLive && o.startSeconds > 0 ? o.startSeconds : 0
  const streamStart = Math.max(0, startAt - line.offset)
  resumeAt = startAt
  // Where a seek made before the first frame never lands, the file opens at its start and the
  // resume waits for that frame.
  const afterFrame = startAt > 0 && !isHls && resumesAfterFirstFrame(source)
  const src = startAt > 0 && !afterFrame ? `${url}#t=${streamStart}` : url
  // The Fire TV WebView's own HLS player keeps what it has played, so a high bitrate remux runs the
  // stick out of memory. hls.js can't read a Plex stream there though. A Silo copy grows as it's
  // copied, and webOS's own player takes it for live and can't start or seek it.
  const nativeHlsOk = !o.forceHlsJs && !(isVega() && !o.isLive && !isPlexUrl(url)) && !!video.canPlayType('application/x-mpegURL').replace(/no/, '')
  const growingCopy = isHls && !!source.SiloDelivery && line.viaServer
  while (video.firstChild) video.removeChild(video.firstChild)
  video.removeAttribute('src')
  video.load()
  const Hls = isHls && (!nativeHlsOk || growingCopy) ? (await import('hls.js')).default : null
  if (mine !== gen) return
  if (Hls && Hls.isSupported()) {
    const made = createHls(
      Hls,
      video,
      {
        url,
        isLive: !!o.isLive,
        vega: isVega(),
        copyBuffer: growingCopy ? copyBufferSeconds(source.Bitrate) : null,
        // hls.js takes its start from here, not a #t= in the address.
        startPosition: streamStart,
        hold: () => holding,
      },
      (details) => {
        if (mine !== gen) return
        lastError = { code: null, message: details }
        emit('error', { ...lastError, kind: 'hls' })
      }
    )
    hls = made.hls
    hlsStarted = made.started
  } else {
    // The Xbox console player opens the stream as the src is set, in Dolby Vision or with
    // passthrough when the session calls for it. Every other element ignores this.
    chooseHostReader(video, getCurrentSession())
    video.src = src
    if (o.mimeType) video.type = o.mimeType
    video.load()
  }
  if (afterFrame) {
    video.addEventListener(
      'loadeddata',
      () => {
        if (mine === gen && resumeAt > 0) video.currentTime = streamStart
      },
      { once: true }
    )
  }
  startTimer = later(() => {
    startTimer = null
    if (mine !== gen) return
    const expected = startAt > 0 ? streamStart : 0
    const stuck = expected > 0 ? video.currentTime < expected * 0.5 && (video.readyState < 3 || video.paused) : video.currentTime === 0 && (video.readyState < 3 || video.paused)
    if (!stuck) return
    timedOut = true
    lastError = { code: video.error ? video.error.code : null, message: 'timeout' }
    emit('error', { ...lastError, kind: 'timeout' })
  }, START_TIMEOUT_MS)
  if (o.hold) {
    // A set joining a paused group would sit on a black screen until play, and a seek to where it
    // already is makes it draw the frame. Not on a transcode, where a seek restarts the stream.
    video.addEventListener(
      'loadeddata',
      () => {
        if (mine !== gen || !holding) return
        if (o.playMethod !== 'Transcode') video.currentTime = video.currentTime
        emit('held')
      },
      { once: true }
    )
  } else if (!hls) {
    const p = video.play()
    if (p && p.catch) p.catch(() => {})
  }
}

let avReady = false
let avPlayIssuedAt = 0
let avLastMs = null
let pausedError = null
let nativeCues = false
let nativeSub = null
let pendingTracks = null
let cueTimer = null

const avStreamMs = (titleMs) => Math.max(0, titleMs - line.offset * 1000)

// AVPlay shapes its letterbox from the decoded frame, so anamorphic rips come out squeezed. Fit
// hands it a box of the shape the stream declares instead. The rect goes after the method, which
// is what makes the scaler pick up a change mid playback.
const applyAvDisplay = () => {
  if (!tz) return
  if (zoom.mode === 'fit' && zoom.aspect) {
    tz.avplaySetDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN')
    tz.setDisplayWindow(getZoomDisplayRect(AVPLAY_SCREEN, zoom.aspect, 'fit'))
    return
  }
  tz.avplaySetDisplayMethod(zoom.mode === 'stretch' ? 'PLAYER_DISPLAY_MODE_FULL_SCREEN' : zoom.mode === 'fill' ? 'PLAYER_DISPLAY_MODE_CROPPED_FULL' : 'PLAYER_DISPLAY_MODE_LETTER_BOX')
  tz.setDisplayWindow({ x: 0, y: 0, width: 1920, height: 1080 })
}

// An embedded track picked by its stream index. Text arrives through onsubtitlechange and draws
// on the page, PGS draws on AVPlay's own plane. The silent flag is flipped once so the cue engine
// starts delivering, and has to end unsilenced or no cue arrives at all.
const applyNativeSubtitle = (stream, streams, trackInfo) => {
  const embedded = (streams || []).filter((s) => s.isEmbeddedNative)
  const at = tzTracks.mapJellyfinTrackToTizen(trackInfo || tz.avplayGetTracks(), embedded, 'TEXT', stream.index)
  if (at == null) return false
  tz.avplaySelectTrack('TEXT', at)
  tz.avplaySetSilentSubtitle(true)
  tz.avplaySetSilentSubtitle(false)
  nativeCues = !stream.isImageBased
  nativeSub = { stream, streams }
  return true
}

// Firmware drops the selection after a buffer flush and ignores ones made early, and both recover
// by putting it on again.
const reassertNativeSubtitle = () => {
  if (!nativeSub) return
  try {
    applyNativeSubtitle(nativeSub.stream, nativeSub.streams)
  } catch (e) {
    // the next seek or pass tries again
  }
}

// The picked audio and subtitle tracks, which only take while playing (text also paused) and
// against a track list that can be short right after play, so this retries from several events
// until they land or 5 s after play.
const applyPendingTracks = () => {
  const p = pendingTracks
  if (!p || (p.audioApplied && p.subApplied)) return
  const state = tz.avplayGetState()
  if (state !== 'PLAYING' && state !== 'PAUSED') return
  const expired = p.deadline != null && Date.now() > p.deadline
  const info = tz.avplayGetTracks()
  if (!p.audioApplied && state === 'PLAYING') {
    try {
      const at = tzTracks.mapJellyfinTrackToTizen(info, p.audioStreams, 'AUDIO', p.audioIndex)
      if (at != null) {
        const now = (tz.avplayGetCurrentTracks().find((t) => t.type === 'AUDIO') || {}).index
        if (now !== at) tz.avplaySelectTrack('AUDIO', at)
        p.audioApplied = true
      } else if (expired) {
        // AVPlay's own pick is silence when the set can't decode it, so the stream index is tried,
        // but only when AVPlay listed that index itself.
        if ((info || []).some((t) => t.type === 'AUDIO' && t.index === p.audioIndex)) {
          try {
            tz.avplaySelectTrack('AUDIO', p.audioIndex)
          } catch (e) {
            // nothing more to try
          }
        }
        p.audioApplied = true
      }
    } catch (e) {
      if (expired) p.audioApplied = true
    }
  }
  if (!p.subApplied && p.subStream) {
    let ok = false
    try {
      ok = applyNativeSubtitle(p.subStream, p.subtitleStreams, info)
    } catch (e) {
      ok = false
    }
    if (ok) p.subApplied = true
    else if (expired) {
      p.subApplied = true
      emit('subFallback', p.subStream)
    }
  }
}

const avError = (type) => {
  lastError = { code: null, message: String(type || ''), type: String(type || '') }
  emit('error', { ...lastError, kind: 'avplay' })
}

const openAvplay = async (o) => {
  const mine = gen
  tz = tz || (await import('../platform/tizen/video.js'))
  tzTracks = tzTracks || (await import('../pages/Player/tizenTrackUtils.js'))
  await tz.initTizenAPI()
  tz.cleanupAVPlay()
  avReady = false
  const url = o.url
  const source = o.mediaSource || {}
  const isHls = url.indexOf('.m3u8') >= 0
  const isTranscode = o.playMethod === 'Transcode'
  // Opening against a playlist the server hasn't written yet errors out the whole pipeline.
  if (isTranscode && isHls) {
    await tz.waitForHlsManifest(url)
    if (mine !== gen) return
  }
  tz.avplayOpen(url)
  applyAvDisplay()
  tz.avplaySetBufferingParams({ bitrate: source.Bitrate })
  // AVPlay turns some transcode endpoints away with the system User-Agent.
  // shortcut: the wrapper swallows its own errors, so a USERAGENT retry for old firmware can't run
  // here. Give the wrapper a return value if an old set turns out to need it.
  tz.avplaySetStreamingProperty('USER_AGENT', 'JellyfinTizenClient')
  const vs = (source.MediaStreams || []).find((s) => s.Type === 'Video') || {}
  const srcW = vs.Width || 0
  const srcH = vs.Height || 0
  // Deprecated from Tizen 5, where FIXED_MAX_RESOLUTION carries the cap instead.
  if (isTranscode && (srcW > 1920 || (source.Bitrate || 0) > 20000000) && tz.getTizenVersion() < 5) {
    tz.avplaySetStreamingProperty('SET_MODE_4K', 'TRUE')
  }
  if (o.isLive || isHls) {
    // ADAPTIVE_INFO takes only these keys, and unknown ones break playback on older firmware.
    const caps = (getCurrentSession() || {}).capabilities || {}
    const pw = caps.screenWidth || 3840
    const ph = caps.screenHeight || 2160
    tz.avplaySetStreamingProperty(
      'ADAPTIVE_INFO',
      `FIXED_MAX_RESOLUTION=${srcW > 0 ? Math.min(srcW, pw) : pw}x${srcH > 0 ? Math.min(srcH, ph) : ph}|STARTBITRATE=HIGHEST|SKIPBITRATE=LOWEST`
    )
  }
  // The start goes in while IDLE, where it's taken reliably. A fresh HLS transcode refuses seeks
  // until playback moves, and a pending native subtitle needs play from zero or its cue parser stays
  // stuck at the start, so those seek after play instead.
  let deferredMs = null
  let postPlayMs = 0
  if (!o.isLive && o.startSeconds > 0) {
    const ms = Math.floor(o.startSeconds * 1000)
    if (isTranscode && isHls) deferredMs = ms
    else if (o.nativeSub || !tz.avplaySeekIdle(avStreamMs(ms))) postPlayMs = ms
  }
  let playIssued = false
  let latch
  const filled = new Promise((resolve) => (latch = resolve))
  const runDeferred = () => {
    if (!playIssued || deferredMs == null || mine !== gen) return
    const ms = deferredMs
    deferredMs = null
    tz.avplaySeek(avStreamMs(ms)).catch(() => {})
  }
  let lastTrackTry = 0
  tz.avplaySetListener({
    onbufferingstart: () => {
      if (mine === gen) emit('buffering', true)
    },
    onbufferingcomplete: () => {
      if (mine !== gen) return
      emit('buffering', false)
      latch()
      runDeferred()
      applyPendingTracks()
    },
    oncurrentplaytime: (ms) => {
      if (mine !== gen) return
      pausedError = null
      const streamMs = Number(ms) || 0
      avTime = streamMs / 1000 + line.offset
      if (!moved && tz.avplayGetState() === 'PLAYING') {
        const advanced = avLastMs != null && streamMs > avLastMs
        avLastMs = streamMs
        if (advanced || Date.now() - avPlayIssuedAt > SETTLE_MS) settle()
      }
      emit('time', avTime)
      const now = Date.now()
      if (now - lastTrackTry >= 500) {
        lastTrackTry = now
        applyPendingTracks()
      }
    },
    onstreamcompleted: () => {
      if (mine !== gen) return
      ended = true
      emit('ended')
    },
    onerror: (type) => {
      if (mine !== gen) return
      // The platform throws spurious errors after sitting in pause, so those wait for the resume.
      if (avPaused || tz.avplayGetState() === 'PAUSED') {
        pausedError = type
        return
      }
      avError(type)
    },
    onevent: () => {},
    onsubtitlechange: (dur, text, type) => {
      if (mine !== gen || !nativeCues || type === 1 || type === '1') return
      clearTimeout(cueTimer)
      emit('cue', avplaySubtitleText(text))
      if (text && dur > 0) cueTimer = setTimeout(() => emit('cue', ''), parseInt(dur, 10))
    },
    ondrmevent: () => {},
  })
  let prepTimer
  try {
    await Promise.race([tz.avplayPrepare(), new Promise((_, reject) => (prepTimer = setTimeout(() => reject(new Error('Stream preparation timed out')), START_TIMEOUT_MS)))])
  } finally {
    clearTimeout(prepTimer)
  }
  if (mine !== gen) return
  avReady = true
  // Some firmware resets the display during prepare.
  applyAvDisplay()
  const durMs = tz.avplayGetDuration() || 0
  // A Silo copy's playlist lists only what Silo has made so far, so the title's runtime stands.
  avDuration = line.viaServer && line.runTime > 1 ? line.runTime : durMs > 0 ? durMs / 1000 + line.offset : 0
  emit('duration', avDuration)
  // A network stream opens on a moving picture when play waits for the first buffer fill, capped
  // since the event isn't guaranteed.
  if (isTranscode || isHls) await Promise.race([filled, wait(3000)])
  if (o.startDelayMs > 0) await wait(o.startDelayMs)
  if (mine !== gen) return
  const start = () => {
    playIssued = true
    moved = false
    avLastMs = null
    avPlayIssuedAt = Date.now()
    tz.avplayPlay()
    avPaused = false
    screen(true)
    later(() => {
      if (mine === gen && !moved && tz.avplayGetState() === 'PLAYING') settle()
    }, SETTLE_MS + 500)
    if (pendingTracks) pendingTracks.deadline = Date.now() + 5000
    if (deferredMs != null) later(runDeferred, 1500)
    if (postPlayMs > 0 && !o.hold) tz.avplaySeek(avStreamMs(postPlayMs)).catch(() => {})
    applyPendingTracks()
    // One more pass, since some firmware drops selections made this early.
    later(() => {
      if (mine !== gen) return
      reassertNativeSubtitle()
      applyPendingTracks()
    }, 4000)
  }
  if (postPlayMs > 0 && o.hold) tz.avplaySeek(avStreamMs(postPlayMs)).catch(() => {})
  if (o.hold) {
    // The group's position is the group's call, so the resume that would race its seek is dropped.
    deferredMs = null
    avPaused = true
    heldPlay = start
    emit('held')
    return
  }
  start()
}

const settle = () => {
  if (moved) return
  moved = true
  playing()
}

// opts: url, mimeType, playMethod, mediaSource, startSeconds, isLive, runTimeSeconds, startDelayMs,
// forceHlsJs (the H.264 fallback), audio ({ streamIndex, audioStreams, afterReload }: a pick to put
// on in the player), nativeSub ({ stream, streams }: Tizen's embedded track), hold (load and wait on
// the first frame for play(), with 'held' once it's there).
export const open = async (opts) => {
  const mine = ++gen
  clearTimers()
  dropPlayOnSeeked()
  lastOpts = opts
  seekWatch = null
  holding = !!opts.hold
  heldPlay = null
  ended = false
  moved = false
  lastTick = null
  timedOut = false
  lastError = null
  pausedError = null
  resumeAt = 0
  nativeCues = false
  nativeSub = null
  clearTimeout(cueTimer)
  const source = opts.mediaSource || {}
  line = {
    offset: (source.SiloTimelineOffsetTicks || 0) / 10000000,
    viaServer: source.SiloSeeksThroughServer === true,
    runTime: opts.runTimeSeconds || 0,
    isLive: !!opts.isLive,
    url: opts.url,
  }
  await initVideo()
  try {
    await initPlayerPlatform()
  } catch (e) {
    // Luna setup is best effort
  }
  if (mine !== gen) return
  screen(true)
  window.removeEventListener('resize', onResize)
  if (isTizen()) {
    mode = 'avplay'
    // The caller only passes audio for direct play, the one stream with every track in it.
    const a = opts.audio
    const sub = opts.nativeSub
    pendingTracks =
      a || sub
        ? {
            audioIndex: a ? a.streamIndex : null,
            audioApplied: !a,
            audioStreams: (a && a.audioStreams) || [],
            subStream: sub ? sub.stream : null,
            subApplied: !sub,
            subtitleStreams: (sub && sub.streams) || [],
            deadline: null,
          }
        : null
    await openAvplay(opts)
    if (mine !== gen) return
    tz.avplaySetPostSeekHook(reassertNativeSubtitle)
    // Nothing drawn natively, so the firmware mustn't turn the first embedded track on by itself.
    if (!opts.nativeSub) silenceNativeSubtitles()
  } else {
    mode = 'video'
    pendingAudio = opts.audio || null
    // webOS 4's decoder pool is small and a just closed stream may still hold one.
    await waitForDecoderRelease()
    if (mine !== gen) return
    window.addEventListener('resize', onResize)
    await openVideo(opts)
  }
}

// A play asked for while the element is still seeking waits for the seek to land. webOS's own
// player told to play mid-seek jumps a transcode to its end, and a held scrub's commit and Unpause
// Rewind both seek and then play.
let playOnSeeked = null
const dropPlayOnSeeked = () => {
  if (!playOnSeeked) return
  playOnSeeked.v.removeEventListener('seeked', playOnSeeked.go)
  clearTimeout(playOnSeeked.timer)
  playOnSeeked = null
}
const playVideo = () => {
  dropPlayOnSeeked()
  const v = video
  const mine = gen
  const go = () => {
    dropPlayOnSeeked()
    if (mine !== gen || v !== video) return
    const p = v.play()
    if (p && p.catch) p.catch(() => {})
  }
  if (!v.seeking) return go()
  playOnSeeked = { v, go, timer: setTimeout(go, SEEK_LAND_TIMEOUT_MS) }
  v.addEventListener('seeked', go)
}

export const play = () => {
  holding = false
  if (mode === 'avplay' && heldPlay) {
    const start = heldPlay
    heldPlay = null
    start()
    return
  }
  if (mode === 'avplay') {
    tz.avplayPlay()
    avPaused = false
    playing()
    // An error swallowed during the pause can mean a dead pipeline, so it surfaces if this doesn't move.
    if (pausedError) {
      const mine = gen
      later(() => {
        if (mine === gen && pausedError && tz.avplayGetState() !== 'PLAYING') {
          const type = pausedError
          pausedError = null
          avError(type)
        }
      }, RESUME_CHECK_MS)
    }
  } else if (video) playVideo()
}

export const pause = () => {
  if (mode === 'avplay') {
    // AVPlay throws PLAYER_ERROR_INVALID_STATE on a pause before it plays, so OK while it's still
    // loading does nothing.
    if (tz.avplayGetState() !== 'PLAYING') return
    tz.avplayPause()
    avPaused = true
    paused()
  } else if (video) {
    dropPlayOnSeeked()
    video.pause()
  }
}

export const isPaused = () => (mode === 'avplay' ? avPaused : !video || (video.paused && !playOnSeeked))

export const toggle = () => (isPaused() ? play() : pause())

export const currentTime = () => (mode === 'avplay' ? avTime : videoTime())

export const duration = () => (mode === 'avplay' ? avDuration : videoDuration())

// Whether the open stream's time has moved, which is what makes a later failure a lost stream
// rather than one the set can't play.
export const hasMoved = () => moved

export const startTimedOut = () => timedOut

export const readyState = () => (mode === 'video' && video ? video.readyState : 0)
export const elementPaused = () => (mode === 'video' && video ? video.paused : false)
export const usesAvplay = () => mode === 'avplay'

// Whether the open stream's seeks go back to Silo, and whether its copy already lists a title
// position, which a seek there reaches without a reload.
export const seeksThroughServer = () => !!line.viaServer
export const copyHolds = (seconds) => {
  if (!line.viaServer || mode !== 'video' || !hls) return false
  const level = hls.levels && hls.levels[Math.max(0, hls.currentLevel)]
  return copyReaches(level && level.details, seconds - line.offset)
}
// Seconds the <video> element has buffered past the playhead.
export const bufferedAhead = () => (mode === 'video' && video ? bufferedAheadSeconds(video.buffered, video.currentTime) : 0)

// A live stream's rewindable range in seconds on the player's clock, or null: the element's
// seekable range, or AVPlay's GET_LIVE_DURATION for live HLS.
export const liveRange = () => {
  if (mode === 'avplay') {
    const r = tz && tz.avplayGetLiveRange()
    return r ? { start: r.start / 1000 + line.offset, end: r.end / 1000 + line.offset } : null
  }
  if (!video || !video.seekable || !video.seekable.length) return null
  try {
    return { start: video.seekable.start(0) + line.offset, end: video.seekable.end(video.seekable.length - 1) + line.offset }
  } catch (e) {
    return null
  }
}

// The web player's dropped frame count, null where there is none.
export const droppedFrames = () =>
  mode === 'video' && video && typeof video.getVideoPlaybackQuality === 'function' ? video.getVideoPlaybackQuality().droppedVideoFrames : null
// The picture's box on the page, which the ASS renderer sizes itself to. Null on Tizen.
export const subtitleRect = () => (mode === 'video' ? contentRect : null)

// Seeks in title time. A Silo stream that can't reach the spot itself asks the player to have Silo
// reopen it there ('serverSeek').
// Resolves once the seek has landed, which a group waits on before it reports Ready.
const SEEK_LAND_TIMEOUT_MS = 10000
const viaServer = (to) => {
  emit('serverSeek', to)
  return serverSeekFn ? serverSeekFn(to) : undefined
}
export const seek = async (seconds) => {
  const to = Math.max(0, seconds)
  if (mode === 'avplay') {
    avTime = to
    if (line.viaServer) return viaServer(to)
    await tz.avplaySeek(avStreamMs(to * 1000))
  } else if (video) {
    if (line.viaServer && !copyHolds(to)) return viaServer(to)
    const v = video
    const mine = gen
    if (!hls && !line.isLive) {
      if (!seekWatch) later(watchEnd, 500)
      seekWatch = { to, until: Date.now() + SEEK_WATCH_MS }
    }
    await new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer)
        v.removeEventListener('seeked', done)
        resolve()
      }
      const timer = setTimeout(done, SEEK_LAND_TIMEOUT_MS)
      v.addEventListener('seeked', done)
      v.currentTime = Math.max(0, to - line.offset)
      if (mine !== gen) done()
    })
  }
}

// Who reopens a Silo stream at a title position, resolving once it plays there. 'serverSeek' is
// heard too.
export const setServerSeek = (fn) => {
  serverSeekFn = fn
}

export const hasEnded = () => ended

// How far the <video> element has buffered past a position, in seconds, for the seek bar's buffered
// part. AVPlay reports no ranges.
export const bufferedEnd = (at) => {
  if (mode !== 'video' || !video || !video.buffered) return 0
  const local = at - line.offset
  let end = local
  try {
    for (let i = 0; i < video.buffered.length; i++) {
      const s = video.buffered.start(i)
      const e = video.buffered.end(i)
      end = Math.max(end, e)
      if (local >= s && local <= e + 0.1) break
    }
  } catch (e) {
    return 0
  }
  return end + line.offset
}

// The Zoom setting's fit, fill and stretch from the stream's declared aspect: the element's box on
// the <video> path, and AVPlay's display method. Kept for every stream that opens after.
export const setZoom = (mode0, aspect) => {
  zoom = { mode: mode0 || 'fit', aspect: aspect || null }
  if (mode === 'avplay') applyAvDisplay()
  else applyVideoGeometry()
}

// Switches the audio to a stream index in the player itself, without the server. True when it took.
// The caller checks the play method and whether the set decodes the track.
export const switchAudio = (index, streams) => {
  if (mode === 'avplay') {
    if (!avReady) return false
    const at = tzTracks.mapJellyfinTrackToTizen(tz.avplayGetTracks(), streams, 'AUDIO', index)
    if (at == null) return false
    tz.avplaySelectTrack('AUDIO', at)
    return true
  }
  return enableAudioTrack(index, streams) >= 0
}

// Tizen: an embedded track AVPlay reads out of the file itself. False when it can't be matched.
export const selectNativeSubtitle = (stream, streams) => {
  if (mode !== 'avplay' || !avReady) return false
  clearTimeout(cueTimer)
  emit('cue', '')
  return applyNativeSubtitle(stream, streams)
}

// Tizen: no track drawn by AVPlay.
export const silenceNativeSubtitles = () => {
  nativeCues = false
  nativeSub = null
  clearTimeout(cueTimer)
  if (mode === 'avplay' && tz) tz.avplaySetSilentSubtitle(true)
}

export const nativeSubtitleOn = () => !!nativeSub

// Xbox: a DVD or DVB track the console player draws itself, by stream index, -1 for none.
export const showHostSubtitle = (index) => mode === 'video' && !!video && hostSubtitle(video, index)

// Tizen pauses and lets go of the decoder while the app is away. What comes back says how to pick it
// up again: whether it was playing, and whether AVPlay suspended.
export const suspend = () => {
  if (mode !== 'avplay' || !tz) return null
  const wasPlaying = tz.avplayGetState() === 'PLAYING'
  if (wasPlaying) {
    tz.avplayPause()
    avPaused = true
    paused()
  }
  const positionMs = avStreamMs(avTime * 1000)
  const suspended = avReady && !!line.url && tz.avplaySuspend()
  return { url: line.url, positionMs, wasPlaying, suspended }
}

export const restore = async (s) => {
  if (mode !== 'avplay' || !tz || !s || !s.suspended) return false
  const ok = await tz.avplayRestore(s.url, s.positionMs)
  if (ok && s.wasPlaying) play()
  return ok
}

// The system's own transport controls, which on Fire TV is how Alexa and the shell's media keys
// reach the player. handlers holds play, pause, seekforward, seekbackward and stop. Gives back the
// undo.
const MEDIA_ACTIONS = ['play', 'pause', 'seekforward', 'seekbackward', 'stop']
const mediaSession = () => (typeof navigator !== 'undefined' && navigator.mediaSession) || null
const setAction = (session, action, fn) => {
  try {
    session.setActionHandler(action, fn || null)
  } catch (e) {
    // an action this browser doesn't know
  }
}
export const setMediaSession = (meta, handlers) => {
  const session = mediaSession()
  if (!session) return () => {}
  if (meta && meta.title && typeof window.MediaMetadata === 'function') {
    session.metadata = new window.MediaMetadata({ title: meta.title, artist: meta.artist || '', artwork: meta.artwork ? [{ src: meta.artwork }] : [] })
  }
  MEDIA_ACTIONS.forEach((a) => setAction(session, a, handlers[a]))
  return () => {
    session.metadata = null
    session.playbackState = 'none'
    MEDIA_ACTIONS.forEach((a) => setAction(session, a, null))
  }
}
export const setMediaPlaybackState = (pausedNow) => {
  const session = mediaSession()
  if (session) session.playbackState = pausedNow ? 'paused' : 'playing'
}

// A slideshow video that starts without sound. AVPlay has no mute of its own, so there the TV is
// muted until the video is done, unless it was muted already.
let mutedTv = false
const unmuteTv = () => {
  if (!mutedTv) return
  mutedTv = false
  setSystemMuted(false)
}
export const setMuted = (onNow) => {
  if (mode === 'video' && video) {
    video.muted = !!onNow
    return
  }
  if (mode !== 'avplay') return
  if (!onNow) return unmuteTv()
  getVolumeState()
    .then((st) => {
      if (!st || st.muted || mode !== 'avplay') return
      return setSystemMuted(true).then((ok) => {
        mutedTv = !!ok
        if (mutedTv) window.addEventListener('pagehide', unmuteTv)
      })
    })
    .catch(() => {})
}

// Lets go of the stream at once, as an app exit needs.
export const release = () => {
  gen++
  clearTimers()
  if (mode === 'avplay' && tz) tz.cleanupAVPlay()
}

export const stop = async () => {
  gen++
  clearTimers()
  dropPlayOnSeeked()
  seekWatch = null
  clearTimeout(cueTimer)
  startTimer = null
  pendingAudio = null
  pendingTracks = null
  nativeCues = false
  nativeSub = null
  unmuteTv()
  screen(false)
  removeSubtitleCanvas()
  window.removeEventListener('resize', onResize)
  if (mode === 'avplay' && tz) {
    tz.avplaySetPostSeekHook(null)
    tz.cleanupAVPlay()
    avReady = false
  } else if (video) {
    unbindVideo()
    destroyHls()
    await cleanupVideoElement(video)
  }
  mode = null
}
