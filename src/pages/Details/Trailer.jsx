import $L from '../../services/i18n.js'
import { createSignal, onCleanup, onMount } from 'solid-js'
import Spinner from '../../ui/components/Spinner.jsx'
import { fontFor, uiFont } from '../../ui/text.js'
import * as engine from '../../state/videoEngine.js'
import { stop as stopAudio } from '../../state/audioPlayer.js'
import * as settings from '../../state/settings.js'
import { getStore, toast } from '../../state/store.js'
import { router } from '../../app/router.js'
import { initVideo, keepScreenOn } from '../../services/video.js'
import { holdScreensaver } from '../../state/shell/idle.js'
import { claimSharedVideo, releaseSharedVideo } from '../../utils/sharedVideoOwner.js'
import { resetVideoBox } from '../../utils/videoCover.js'
import { volumeLevel } from '../../utils/volumeLevel.js'
import { TrailerCaption } from '../../ui/components/home/TrailerCaption.jsx'

// A YouTube trailer, full screen. The player only opens what the server holds, so this plays
// YouTube's stream on the shared <video> element, with the 360p file behind the manifest to carry
// on from where it stopped.
const FULL = { x: 0, y: 0, w: 1920, h: 1080 }

export default function Trailer(props) {
  const store = getStore()
  const [buffering, setBuffering] = createSignal(true)
  const [paused, setPaused] = createSignal(false)
  const [caption, setCaption] = createSignal('')
  let gone = false
  let left = false
  let v = null
  let release = null
  let stopWatch = null
  let stopSkip = null
  let stopCaptions = null
  let attempt = 0
  const leave = () => {
    if (left) return
    left = true
    router.back()
  }
  const fail = () => {
    if (gone || left) return
    toast($L('This item could not be played.'))
    leave()
  }
  // A playing trailer takes no key presses, so it holds the TV's screen and the app's screensaver off.
  const screenOn = (on) => {
    holdScreensaver('detailsTrailer', on)
    initVideo().then(() => keepScreenOn(on)).catch(() => {})
  }
  const detach = () => {
    attempt++
    if (stopWatch) stopWatch()
    stopWatch = null
    if (stopSkip) stopSkip()
    stopSkip = null
    if (stopCaptions) stopCaptions()
    stopCaptions = null
    if (v) v.onplaying = v.onpause = v.onwaiting = v.onended = v.onerror = null
    if (release) release()
    release = null
  }
  const toggle = () => {
    if (!v) return
    if (!v.paused) return v.pause()
    const p = v.play()
    if (p && p.catch) p.catch(() => {})
  }
  // The segments come with the first stream and stay for the one that takes over from it.
  const run = async (sources, source, resumeAt, kept) => {
    const s = await sources.stream(source, 'Trailer', !kept).catch(() => null)
    if (gone) return
    if (!s) return fail()
    const segments = kept || s.segments
    detach()
    const mine = attempt
    v = sources.video()
    resetVideoBox(v)
    v.muted = false
    v.volume = volumeLevel(settings.get('trailerVolume'))
    v.onplaying = () => {
      setBuffering(false)
      setPaused(false)
      screenOn(true)
    }
    v.onpause = () => {
      setPaused(true)
      screenOn(false)
    }
    v.onwaiting = () => setBuffering(true)
    v.onended = () => {
      screenOn(false)
      leave()
    }
    // The element, hls.js and the watch can all report one failure, which only counts once.
    let failed = false
    const failStream = (reason) => {
      if (failed || gone) return
      failed = true
      sources.failed(s, 'Trailer', reason, !!s.fallback)
      if (!s.fallback) return fail()
      run(sources, s.fallback, v.currentTime > 0 ? v.currentTime : 0, segments)
    }
    v.onerror = () => failStream('failed to play')
    release = sources.attach(v, s, resumeAt, () => failStream('failed to play'))
    const p = v.play()
    if (p && p.catch) p.catch(() => {})
    stopWatch = sources.watch(v, s, failStream)
    stopSkip = sources.skipSegments(v, segments)
    sources.captions(s).then(
      (cues) => {
        if (mine === attempt && !gone && cues && cues.length) stopCaptions = sources.followCaptions(v, cues, setCaption)
      },
      () => {}
    )
  }
  onMount(async () => {
    store.navVisible = false
    stopAudio()
    claimSharedVideo('trailer', detach)
    const [sources] = await Promise.all([import('../../ui/components/home/trailerSources.js'), engine.stop().catch(() => {})])
    if (gone) return
    run(sources, { videoId: props.videoId || props.id }, 0)
  })
  onCleanup(() => {
    gone = true
    store.navVisible = true
    detach()
    if (v) {
      try {
        v.pause()
      } catch (e) {
        // already gone
      }
      v.removeAttribute('src')
      v.load()
    }
    screenOn(false)
    releaseSharedVideo('trailer')
  })
  const heading = () => props.title || ''
  const loadingText = $L('Loading trailer...')
  return (
    <view
      width={1920}
      height={1080}
      onEnter={() => {
        toggle()
        return true
      }}
      onPlayPause={() => {
        toggle()
        return true
      }}
      onPlay={() => {
        if (v && v.paused) toggle()
        return true
      }}
      onPause={() => {
        if (v && !v.paused) toggle()
        return true
      }}
      onBack={() => {
        leave()
        return true
      }}
    >
      <text
        x={96}
        y={72}
        fontFamily={fontFor(heading(), 'bold')}
        fontSize={40}
        maxWidth={1500}
        maxLines={1}
        color="#ffffffff"
        alpha={paused() || buffering() ? 1 : 0}
      >
        {heading()}
      </text>
      <TrailerCaption text={caption} shown={() => true} rect={() => FULL} />
      <Spinner x={928} y={508} size={64} alpha={buffering() ? 1 : 0} />
      <text x={960} y={600} mountX={0.5} fontFamily={uiFont()} fontSize={28} color="#d0d0d8ff" alpha={buffering() ? 1 : 0}>
        {loadingText}
      </text>
    </view>
  )
}
