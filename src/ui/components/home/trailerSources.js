// Where the media bar's trailer comes from: the server's own trailer file first, with a YouTube
// trailer behind it for when the TV can't decode that file. The detail page's trailer plays its
// YouTube stream through here too. Loaded only once something plays a trailer or a preview.
import { api, getApiKey, getServerType, getServerUrl } from '../../../services/jellyfinApi.js'
import {
  attachTrailerStream, extractYouTubeId, extractYouTubeIdFromUrl, fetchSponsorSegments, fetchVideoStream, isManifestUrl, nativeManifestSkipped,
  needsHlsJs, noteNativeManifest, searchedTrailers, searchesForTrailer, watchManifestPlayback,
} from '../../../services/youtubeTrailer.js'
import serverLogger from '../../../services/serverLogger.js'
import * as settings from '../../../state/settings.js'
import { followCaptions, getTrailerStartTime, loadCaptions, skipSegments } from './trailerExtras.js'
import { isPlexServer, withPlexToken } from '../../../utils/plexUrls.js'
import { getSharedVideoElement } from '@moonfin/platform-webos/video'

const itemsOf = (res) => (Array.isArray(res) ? res : (res && res.Items) || [])

// The original file, since a plain <video> on Tizen can't decode the server's transcode.
const localTrailerUrl = async (item) => {
  if (!item.Id || item._external) return null
  const trailer = itemsOf(await api.getLocalTrailers(item.Id).catch(() => null)).find((t) => t && t.Id)
  if (!trailer) return null
  const server = getServerUrl()
  const token = getApiKey()
  if (!server) return null
  if (isPlexServer(server)) {
    const part = trailer.MediaSources && trailer.MediaSources[0] && trailer.MediaSources[0].DirectStreamUrl
    return part ? withPlexToken(`${server}${part}`, token) : null
  }
  return `${server}/Videos/${encodeURIComponent(trailer.Id)}/stream?Static=true${token ? `&ApiKey=${token}` : ''}`
}

// A slide from an outside list isn't on the server, so the links it came with are all there are.
const remoteTrailers = async (item) => {
  const initial = Array.isArray(item.RemoteTrailers) ? item.RemoteTrailers : []
  if (initial.length || item._external || !item.Id) return initial
  if (searchesForTrailer(item, getServerType())) return searchedTrailers(item).catch(() => [])
  const detailed = await api.getItem(item.Id).catch(() => null)
  return detailed && Array.isArray(detailed.RemoteTrailers) ? detailed.RemoteTrailers : []
}

export const resolve = async (item) => {
  let url = await localTrailerUrl(item)
  let videoId = extractYouTubeId(item)
  if (!url && !videoId) {
    const remote = await remoteTrailers(item)
    for (let i = 0; i < remote.length; i++) {
      const link = (remote[i] && (remote[i].Url || remote[i].url)) || ''
      if (!link) continue
      videoId = extractYouTubeIdFromUrl(link)
      if (videoId) break
      if (!url) url = link
    }
  }
  const sources = []
  if (url) sources.push({ url })
  if (videoId) sources.push({ videoId })
  return sources
}

// What plays for a source. A YouTube trailer asks for the best stream, which is the manifest unless
// this TV's own player keeps failing those, and a manifest names the 360p file as its fallback. With
// withSegments it also asks SponsorBlock what to skip, and starts past what it marks at the top.
// label names the screen in the log.
export const stream = async (source, label = 'Trailer preview', withSegments = true) => {
  if (source.url) return { url: source.url, kind: 'local trailer', segments: [], startTime: 0 }
  const [segments, yt] = await Promise.all([
    withSegments ? fetchSponsorSegments(source.videoId) : [],
    fetchVideoStream(source.videoId, true, settings.get('uiLanguage') || '', !!source.muxedOnly || nativeManifestSkipped()),
  ])
  if (!yt || !yt.url) return null
  const manifest = isManifestUrl(yt.url)
  const Hls = needsHlsJs(yt.url) ? (await import('hls.js')).default : null
  const native = manifest && !needsHlsJs(yt.url)
  const kind = manifest ? `YouTube ${yt.videoOnly ? 'picture only ' : ''}manifest on ${native ? "the TV's player" : 'hls.js'}` : 'YouTube 360p file'
  serverLogger.playback(`${label}: ${kind}${yt.client ? ` from ${yt.client}` : ''}`)
  return {
    url: yt.url,
    audioLanguage: yt.audioLanguage || '',
    videoOnly: yt.videoOnly || null,
    Hls,
    manifest,
    native,
    kind,
    captionsUrl: yt.captionsUrl || '',
    segments,
    startTime: getTrailerStartTime(segments),
    fallback: manifest ? { videoId: source.videoId, muxedOnly: true } : null,
  }
}

export { followCaptions, skipSegments }

// The stream's captions when Trailer Captions is on, or null.
export const captions = (s) =>
  s.captionsUrl && settings.get('mediaBarTrailerCaptions') === true ? loadCaptions(s.captionsUrl) : Promise.resolve(null)

// Starts a stream on the element and returns what lets go of it. onError hears what hls.js or a
// separate soundtrack gives up on, which never reaches the element's own error event.
export const attach = (v, s, startTime, onError) =>
  attachTrailerStream(v, s.url, { Hls: s.Hls, audioLanguage: s.audioLanguage, videoOnly: s.videoOnly, startTime, onError })

// A manifest can stall without an error, so it's watched, and how the TV's own player copes with
// one is remembered. Returns what stops the watch.
export const watch = (v, s, onStall) =>
  s.manifest ? watchManifestPlayback(v, { onStall, onConfirmed: s.native ? () => noteNativeManifest(true) : null }) : () => {}

export const failed = (s, label, reason, movesOn) => {
  serverLogger.warn(serverLogger.LOG_CATEGORIES.PLAYBACK, `${label} ${reason} on the ${s.kind}${movesOn ? ', trying the next stream' : ''}`)
  if (s.native) noteNativeManifest(false)
}

// The element videoEngine plays into on webOS, placed the way its mountVideo places it: first in
// the page, under the canvas, which shows it wherever its own pixels are clear.
export const video = () => {
  const v = getSharedVideoElement()
  if (!v.parentNode) document.body.insertBefore(v, document.body.firstChild)
  v.style.zIndex = '0'
  const app = document.getElementById('app')
  if (app) {
    app.style.position = 'absolute'
    app.style.left = '0'
    app.style.top = '0'
    app.style.zIndex = '1'
  }
  return v
}
