// The focused Home card's preview: a short clip of the title (its next episode for a series), or
// its trailer, played into the shared <video> under the canvas and sized to cover the card's art.
// The card hears the phase it should draw through onPhase(key, phase, rect): idle, attached
// (stream opening, art still showing) or playing (Home clears the art's rect so the video shows
// through).
//
// A preview goes idle, pending (the dwell), resolving (next up or the trailer, media info and the
// URL), attached and playing. Every step after an await checks the request it belongs to is still
// the current one, so a stop can never be overtaken by the start it interrupted.
// shortcut: it doesn't hold theme music, since Home doesn't play any yet.
import { getDeviceId } from '../../../services/jellyfinApi.js'
import { getDeviceCapabilities } from '../../../services/deviceProfile.js'
import { volumeLevel } from '../../../utils/volumeLevel.js'
import {
  PREVIEW_OPEN_TIMEOUT_MS, PREVIEW_PLAY_CAP_MS, buildMediaPreviewUrl, newPlaySessionId, pickPreviewAudioIndex, previewApiFor,
  previewDwellMs, previewSegmentContainer, previewServerOf, previewStartSeconds, isOutsideTitle, resolvePreviewTarget,
  resolveTrailerSource, supportsMediaPreview,
} from '../../../services/mediaPreviewSource.js'
import { mediaPreviewMode } from '../../../utils/mediaPreviewMode.js'
import { claimSharedVideo, releaseSharedVideo } from '../../../utils/sharedVideoOwner.js'
import { audio } from '../../../state/audioPlayer.js'
import { resetVideoBox } from '../../../utils/videoCover.js'
import { isStreamlessStaticSource } from '../../../utils/placeholderSource.js'
import { coverRect } from './trailerPreview.js'

const noop = () => {}

export const createCardPreview = ({ getSettings, api, platform, onPhase, onActive }) => {
  const timers = { dwell: null, open: null, cap: null }
  let enabled = false
  let audioEnabled = true
  let requestId = 0
  let current = null
  // The card under focus, kept while previews are off so it starts once they come back on.
  let focused = null
  let videoModule = null
  let trailerModule = null

  const clearTimer = (name) => {
    if (timers[name]) {
      clearTimeout(timers[name])
      timers[name] = null
    }
  }
  const clearTimers = () => ['dwell', 'open', 'cap'].forEach(clearTimer)
  const isActive = (id) => !!current && current.requestId === id
  const notify = (entry, phase) => onPhase(entry.key, phase, entry.rect)

  const applyAudio = (video) => {
    video.muted = !audioEnabled
    video.volume = audioEnabled ? volumeLevel((getSettings() || {}).previewVolume) : 0
  }

  // The element keeps the clip's own shape and is sized to cover the card's art. Until the clip's
  // shape is known it takes 16:9, so hls.js caps the level to the card's size from the first load.
  const place = (entry) => {
    const v = entry.video
    const r = v && coverRect(v.videoWidth || 16, v.videoHeight || 9, entry.rect(), 1)
    if (!r) return
    v.style.left = `${r.x}px`
    v.style.top = `${r.y}px`
    v.style.width = `${r.w}px`
    v.style.height = `${r.h}px`
  }

  // Everything a preview took is handed back in an order that frees the decoder first and tells
  // the server last.
  const stop = (reason, { release = true } = {}) => {
    const was = current
    clearTimers()
    requestId += 1
    current = null
    if (!was) return
    const video = was.video
    if (video) {
      video.onloadedmetadata = video.onresize = video.onplaying = video.ontimeupdate = video.onended = video.onerror = null
      if (was.releaseStream) {
        try {
          was.releaseStream()
        } catch (e) {
          // already gone
        }
      }
      try {
        video.pause()
      } catch (e) {
        // already gone
      }
      video.removeAttribute('src')
      try {
        video.load()
      } catch (e) {
        // already gone
      }
      resetVideoBox(video)
    }
    if (release && was.claimed) releaseSharedVideo('preview')
    if (was.streamAttached && was.playSessionId && was.serverApi && was.serverApi.stopActiveEncodings) {
      try {
        Promise.resolve(was.serverApi.stopActiveEncodings(was.playSessionId)).catch(noop)
      } catch (e) {
        // the server hears nothing more
      }
    }
    if (was.announced && onActive) onActive(false)
    notify(was, 'idle')
  }

  const mount = async (entry) => {
    const id = entry.requestId
    let Hls = null
    if (trailerModule.needsHlsJs(entry.url)) {
      Hls = (await import('hls.js')).default
      if (!isActive(id)) return
    }
    entry.claimed = true
    claimSharedVideo('preview', () => stop('evicted', { release: false }))
    const video = (entry.video = videoModule.video())
    video.playsInline = true
    video.controls = false
    video.autoplay = true
    video.loop = false
    applyAudio(video)
    resetVideoBox(video)
    place(entry)
    video.onloadedmetadata = () => place(entry)
    video.onresize = video.onloadedmetadata
    // The element can say playing a moment before its picture moves, so the card waits for the
    // position to advance first.
    let playingFrom = null
    video.onplaying = () => {
      if (isActive(id) && entry.phase === 'attached') playingFrom = video.currentTime
    }
    video.ontimeupdate = () => {
      if (!isActive(id) || entry.phase !== 'attached' || playingFrom === null || video.currentTime === playingFrom) return
      entry.phase = 'playing'
      clearTimer('open')
      // A trailer plays to its end, only a clip is cut short.
      if (!entry.trailer) {
        timers.cap = setTimeout(() => {
          timers.cap = null
          if (isActive(id)) stop('cap')
        }, PREVIEW_PLAY_CAP_MS)
      }
      place(entry)
      entry.announced = true
      if (onActive) onActive(true)
      notify(entry, 'playing')
    }
    video.onended = () => {
      if (isActive(id)) stop('ended')
    }
    const fail = () => {
      if (isActive(id)) stop('error')
    }
    video.onerror = fail
    entry.releaseStream = trailerModule.attachTrailerStream(video, entry.url, {
      Hls,
      startTime: entry.startTime,
      audioLanguage: entry.audioLanguage,
      videoOnly: entry.videoOnly,
      onError: fail,
    })
    entry.streamAttached = true
    let playPromise = null
    try {
      playPromise = video.play()
    } catch (e) {
      // the error event reports it
    }
    if (playPromise && playPromise.catch) {
      playPromise.catch(() => {
        // A stop rejects this too, and autoplay with sound can be refused, so the retry is muted.
        if (!isActive(id) || video.muted) return
        video.muted = true
        video.volume = 0
        let retry = null
        try {
          retry = video.play()
        } catch (e) {
          // the error event reports it
        }
        if (retry && retry.catch) retry.catch(noop)
      })
    }
  }

  const resolve = async (entry) => {
    const id = entry.requestId
    entry.phase = 'resolving'
    try {
      const serverApi = previewApiFor(entry.item, api)
      entry.serverApi = serverApi
      const loadTrailerModule = trailerModule ? Promise.resolve(trailerModule) : import('../../../services/youtubeTrailer.js')
      const [picked, loadedVideoModule, loadedTrailerModule, caps] = await Promise.all([
        entry.trailer
          ? loadTrailerModule.then((youtube) => resolveTrailerSource(serverApi, entry.item, youtube))
          : resolvePreviewTarget(serverApi, entry.item).then((target) => target && { target }),
        videoModule || import('./trailerSources.js'),
        loadTrailerModule,
        platform === 'webos' ? getDeviceCapabilities().catch(() => null) : null,
      ])
      if (!isActive(id)) return
      videoModule = loadedVideoModule
      trailerModule = loadedTrailerModule
      const server = previewServerOf(entry.item)
      if (picked && picked.youTubeId) {
        // A small card takes the balanced pick, and a TV whose player keeps failing YouTube's
        // manifest goes straight to the file.
        const stream = await trailerModule.fetchVideoStream(picked.youTubeId, false, '', trailerModule.nativeManifestSkipped())
        if (!isActive(id)) return
        if (!stream || !stream.url) return stop('unavailable')
        entry.url = stream.url
        entry.videoOnly = stream.videoOnly || null
        entry.audioLanguage = stream.audioLanguage || ''
      } else {
        const target = picked && picked.target
        if (!target || !server.serverUrl || !server.token) return stop('unavailable')
        const source = target.MediaSources[0]
        entry.playSessionId = newPlaySessionId()
        entry.startTime = entry.trailer ? 0 : previewStartSeconds(target)
        entry.url =
          server.serverType === 'plex'
            ? await serverApi.getPreviewStreamUrl({ itemId: target.Id, mediaSourceId: source.Id, playSessionId: entry.playSessionId })
            : buildMediaPreviewUrl({
                serverUrl: server.serverUrl,
                serverType: server.serverType,
                token: server.token,
                deviceId: getDeviceId(),
                playSessionId: entry.playSessionId,
                itemId: target.Id,
                mediaSourceId: isStreamlessStaticSource(target, source.Id) ? undefined : source.Id,
                audioStreamIndex: pickPreviewAudioIndex(source, getSettings() || {}),
                segmentContainer: previewSegmentContainer(platform, caps),
              })
        if (!isActive(id)) return
      }
      entry.phase = 'attached'
      timers.open = setTimeout(() => {
        timers.open = null
        if (isActive(id)) stop('timeout')
      }, PREVIEW_OPEN_TIMEOUT_MS)
      notify(entry, 'attached')
      await mount(entry)
    } catch (e) {
      if (isActive(id)) stop('error')
    }
  }

  // Focus on a card. The card already pending or playing is left alone, so a re-focus doesn't
  // restart the dwell. rect() gives the card art's place on screen once the row has settled.
  const schedule = (key, item, rect) => {
    if (key) focused = { key, item, rect }
    if (current && current.key === key) return
    const trailer = isOutsideTitle(item) || mediaPreviewMode(getSettings()) === 'trailer'
    const qualifies = enabled && !!key && supportsMediaPreview(item, trailer ? 'trailer' : 'media') && !audio.playing
    if (current) stop(qualifies ? 'replaced' : 'blur')
    if (!qualifies) return
    requestId += 1
    const entry = (current = { key, item, rect, trailer, requestId, phase: 'pending', startTime: 0, url: null, videoOnly: null, audioLanguage: '' })
    timers.dwell = setTimeout(() => {
      timers.dwell = null
      if (isActive(entry.requestId)) resolve(entry)
    }, previewDwellMs())
  }

  const cancel = (key) => {
    if (focused && focused.key === key) focused = null
    if (current && current.key === key) stop('blur')
  }

  return {
    schedule,
    cancel,
    stop,
    setEnabled(value) {
      const was = enabled
      enabled = !!value
      if (!enabled && current) stop('disabled')
      if (enabled && !was && !current && focused) schedule(focused.key, focused.item, focused.rect)
    },
    setAudioEnabled(value) {
      audioEnabled = value !== false
      if (current && current.video) applyAudio(current.video)
    },
    dispose() {
      stop('unmount')
      focused = null
    },
  }
}
