// The player service for Roku. The video engine plays through a <video> element stand-in over
// SceneGraph's Video node (rokuVideo.js), which sits in the layer under the app's drawing.
import { sg } from '../bridge/renderer.js'
import { createVideoElement } from './rokuVideo.js'

const CONTAINER_KEY = { mp4: 'mp4', m4v: 'mp4', mov: 'mp4', mkv: 'mkv', webm: 'mkv', ts: 'ts', mpegts: 'ts', m2ts: 'ts' }
const VIDEO_NAME = { h265: 'hevc', hev1: 'hevc', hvc1: 'hevc', avc: 'h264', mpeg2video: 'mpeg2', av01: 'av1' }

const rokuOf = (capabilities) => (capabilities && capabilities.roku) || { video: {}, audio: {}, audioAlone: [] }

export const isAudioStreamPlayable = (stream, capabilities, _passthrough, container) => {
  const c = rokuOf(capabilities)
  const codec = String((stream && stream.Codec) || '').toLowerCase()
  if (!codec) return true
  const key = CONTAINER_KEY[container]
  const codecs = key ? c.audio[key] || [] : c.audioAlone || []
  return codecs.indexOf(codec) >= 0
}

export const getPlayMethod = (mediaSource, capabilities) => {
  if (!mediaSource) return 'Transcode'
  const c = rokuOf(capabilities)
  const streams = mediaSource.MediaStreams || []
  const video = streams.find((s) => s.Type === 'Video')
  const audio = streams.filter((s) => s.Type === 'Audio')
  const containers = String(mediaSource.Container || '').toLowerCase().split(',')
  const key = containers.map((name) => CONTAINER_KEY[name.trim()]).find(Boolean)
  if (!video) {
    const alone = c.audioAlone || []
    return audio.every((s) => alone.indexOf(String(s.Codec || '').toLowerCase()) >= 0) ? 'DirectPlay' : 'Transcode'
  }
  if (!key) return 'Transcode'
  const codec = String(video.Codec || '').toLowerCase()
  const videoOk = (c.video[key] || []).indexOf(VIDEO_NAME[codec] || codec) >= 0
  const audioOk = audio.length === 0 || audio.some((s) => isAudioStreamPlayable(s, capabilities, null, key))
  return videoOk && audioOk ? 'DirectPlay' : 'Transcode'
}

const MIME = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska', webm: 'video/webm', ts: 'video/mp2t', m3u8: 'application/x-mpegURL' }
export const getMimeType = (container) => MIME[String(container || '').toLowerCase()] || 'video/mp4'

export const canRenderEmbeddedPgsInBand = () => false
export const setDisplayWindow = async () => {}
export const registerAppStateObserver = () => () => {}
export const keepScreenOn = async () => {}
export const waitForDecoderRelease = async () => {}

let layer = null
let element = null
export const setVideoLayer = (node) => {
  layer = node
}
export const getSharedVideoElement = () => element || (element = createVideoElement(sg, () => layer))
export const cleanupVideoElement = async (video) => {
  if (video && video.release) video.release()
}
export const setupVisibilityHandler = () => () => {}
export const readTrailerManifest = async () => null
export const getHostAudioOutput = async () => null
