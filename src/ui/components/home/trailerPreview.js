// The media bar's trailer preview. It plays the focused slide's trailer into the shared <video>
// element under the canvas on both webOS and Tizen, so it never touches AVPlay and can be muted.
// onChange({ holding, active }) says when it holds the carousel (from the first frame) and when
// the bar should clear the way for it (three seconds later). A source that fails before playing
// gives way to the next one, and when none plays the bar just carries on. A YouTube manifest that
// stops partway gives way to the 360p file, which carries on from the same spot. A YouTube trailer
// skips what SponsorBlock marks, and onCaption(text) hears its captions when they're on.
import { resetVideoBox } from '../../../utils/videoCover.js'
import { volumeLevel } from '../../../utils/volumeLevel.js'

const REVEAL_MS = 3000
// The element keeps the trailer's own shape and overhangs its frame, which crops it.
const ZOOM = 1.15

// The element's box that covers a frame given in screen pixels, since there's no DOM box to read.
// TVs size the video plane from the element's box and ignore object-fit and transforms.
export const coverRect = (videoW, videoH, rect, zoom = ZOOM) => {
  if (!videoW || !videoH || !rect.w || !rect.h) return null
  const scale = Math.max(rect.w / videoW, rect.h / videoH) * zoom
  const w = Math.round(videoW * scale)
  const h = Math.round(videoH * scale)
  return { x: rect.x + Math.round((rect.w - w) / 2), y: rect.y + Math.round((rect.h - h) / 2), w, h }
}

// Nothing plays until Home has settled, while the screensaver or music is on, while the app is in
// the background, or unless the bar itself has focus.
export const mayPlay = (g) => !!(g.enabled && g.homeReady && g.focused && g.item && !g.saver && !g.music && !g.hidden)

// load() resolves to the sources module: resolve(item) gives the sources to try in order and
// stream(source) what plays for one, { url, manifest, fallback, ... } or null. attach(video, stream,
// startTime, onError) starts it and returns what lets go of it, watch(video, stream, onStall) keeps
// an eye on a manifest and returns what stops that, failed(stream, label, reason, movesOn) hears a
// stream that gave up, skipSegments(video, segments) jumps past SponsorBlock's segments,
// captions(stream) resolves to its cues or null, followCaptions(video, cues, onText) shows them,
// and video() is the mounted element.
export const createTrailerPreview = ({ load, rect, onChange, onEnded, onCaption, revealMs = REVEAL_MS }) => {
  let gen = 0
  let wanted = null
  let video = null
  let src = ''
  let timer = null
  let releaseStream = null
  let stopWatch = null
  let stopSkip = null
  let stopCaptions = null
  let attempt = 0
  let shown = { holding: false, active: false }

  const report = (holding, active) => {
    if (shown.holding === holding && shown.active === active) return
    shown = { holding, active }
    onChange(shown)
  }

  // Stops listening to the element, which keeps its stream for now.
  const detach = () => {
    clearTimeout(timer)
    timer = null
    if (stopWatch) stopWatch()
    stopWatch = null
    if (stopSkip) stopSkip()
    stopSkip = null
    if (video) video.onplaying = video.onended = video.onerror = video.onloadedmetadata = video.onresize = null
  }

  // Clears the captions, and drops any still on their way.
  const dropCaptions = () => {
    attempt++
    if (stopCaptions) stopCaptions()
    stopCaptions = null
  }

  // Leaves the element alone once something else has given it a stream of its own.
  const release = () => {
    detach()
    dropCaptions()
    if (!video) return
    const mine = video.src === src
    if (releaseStream) releaseStream()
    releaseStream = null
    if (mine) {
      try {
        video.pause()
      } catch (e) {
        // already gone
      }
      video.removeAttribute('src')
      video.load()
    }
    resetVideoBox(video)
    video = null
    src = ''
  }

  const stop = () => {
    gen++
    release()
    report(false, false)
  }

  // Resolves false when the stream fails before it plays, or with the time to carry on from when a
  // manifest stops partway, which leaves the element and what shows to the next source.
  const attach = (deps, s, prefs, id, resumeAt, hasNext) =>
    new Promise((done) => {
      const resuming = !!video
      if (resuming) {
        if (releaseStream) releaseStream()
        releaseStream = null
      }
      dropCaptions()
      const mine = attempt
      const v = (video = deps.video())
      if (!resuming) {
        v.muted = !!prefs.muted
        v.volume = prefs.muted ? 0 : volumeLevel(prefs.volume)
      }
      v.onloadedmetadata = () => {
        const r = rect && coverRect(v.videoWidth, v.videoHeight, rect())
        if (!r) return
        v.style.left = `${r.x}px`
        v.style.top = `${r.y}px`
        v.style.width = `${r.w}px`
        v.style.height = `${r.h}px`
      }
      v.onresize = v.onloadedmetadata
      let playing = false
      v.onplaying = () => {
        // A seek or a stall fires it again.
        if (playing || id !== gen) return
        playing = true
        report(true, shown.active)
        timer = setTimeout(() => {
          if (id === gen) report(true, true)
        }, revealMs)
      }
      v.onended = () => {
        if (id !== gen) return
        stop()
        if (onEnded) onEnded()
      }
      // The element, hls.js and the watch can all report one failure, which only counts once.
      let failed = false
      const fail = (reason) => {
        if (failed || id !== gen) return
        failed = true
        const movesOn = hasNext && (!playing || !!s.manifest)
        if (deps.failed) deps.failed(s, 'Trailer preview', reason, movesOn)
        if (!movesOn) return stop()
        if (playing) {
          const at = v.currentTime
          detach()
          return done(at)
        }
        release()
        done(false)
      }
      v.onerror = () => fail('failed to play')
      releaseStream = deps.attach(v, s, resumeAt > 0 ? resumeAt : s.startTime || 0, () => fail('failed to play'))
      src = v.src
      const p = v.play()
      if (p && p.catch) {
        p.catch(() => {
          // Autoplay with sound can be refused, so it tries again muted. A stop rejects this too.
          if (id !== gen || v.muted) return
          v.muted = true
          v.volume = 0
          const again = v.play()
          if (again && again.catch) again.catch(() => {})
        })
      }
      if (deps.watch) stopWatch = deps.watch(v, s, fail)
      if (deps.skipSegments) stopSkip = deps.skipSegments(v, s.segments)
      if (deps.captions && onCaption) {
        deps.captions(s).then(
          (cues) => {
            if (mine === attempt && id === gen && cues && cues.length) stopCaptions = deps.followCaptions(v, cues, onCaption)
          },
          () => {}
        )
      }
    })

  const play = async (item, prefs) => {
    const id = gen
    const stale = () => id !== gen
    const deps = await load()
    if (stale()) return
    const sources = ((await deps.resolve(item).catch(() => [])) || []).slice()
    let resumeAt = 0
    for (let i = 0; i < sources.length; i++) {
      if (stale()) return
      const s = await deps.stream(sources[i]).catch(() => null)
      if (stale()) return
      if (!s) continue
      if (s.fallback) sources.splice(i + 1, 0, s.fallback)
      resumeAt = (await attach(deps, s, prefs, id, resumeAt, i + 1 < sources.length)) || 0
      if (stale()) return
    }
    // Nothing more to try, which a manifest that stopped partway can leave showing.
    stop()
  }

  return {
    // The item that should be playing, or null. The same item again keeps what plays, so a trailer
    // that ended or found no source doesn't start over until the slide changes.
    want(item, prefs) {
      if (item === wanted) return
      wanted = item
      stop()
      if (item) play(item, prefs || {}).catch(() => {})
    },
    // Ends what plays but keeps the slide as wanted, so it doesn't start again for the same slide.
    dismiss() {
      stop()
    },
    stop() {
      wanted = null
      stop()
    },
  }
}
