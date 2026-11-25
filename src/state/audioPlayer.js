// The music player. One HTML5 audio element (both webOS and Tizen play it) walks a queue and
// sends start, progress and stop reports through services/playback.js. Screens read the reactive
// `audio` object, which is also set on the store's audio key once something plays.
import $L from '../services/i18n.js'
import { appState } from './reactive.js'
import { getStore, toast } from './store.js'
import * as settings from './settings.js'
import { posterUrl } from '../ui/images.js'
import { shuffled } from '../utils/shuffled.js'

const TICKS = 10000000
// Previous restarts a track that has played longer than this.
const RESTART_SECONDS = 3
const MAX_FAILURES = 3

export const audio = appState.plugin({
  active: false,
  playing: false,
  loading: false,
  itemId: '',
  title: '',
  artist: '',
  album: '',
  art: '',
  position: 0,
  duration: 0,
  cur: 0,
  count: 0,
  // Now Playing's shuffle and repeat ('off', 'all', 'one'), and a counter that moves whenever the
  // play order does, so Up Next redraws.
  shuffle: false,
  repeat: 'off',
  orderVersion: 0,
  buffered: 0,
  // The element is waiting for data, which Now Playing shows as a buffering animation.
  waiting: false,
})

let queue = []
let cur = -1
// The order the queue is walked in, as indexes into it. Shuffle builds a real order up front, anchored
// on the track playing, so every track plays once and Previous goes back to the one just heard.
let order = []
let el = null
// playback.js loads with the first track, so it stays out of the boot bundle.
let pb = null
let token = 0
let started = false
let refused = false
let failures = 0

const artistOf = (it) => (it && (it.AlbumArtist || (it.Artists && it.Artists[0]))) || ''
export const current = () => (cur >= 0 ? queue[cur] || null : null)
// Up Next lists the tracks in the order they play.
export const playOrder = () => order.map((i) => queue[i])

const buildOrder = () => {
  const all = queue.map((_, i) => i)
  if (!audio.shuffle) order = all
  else {
    const rest = all.filter((i) => i !== cur)
    order = cur >= 0 ? [cur].concat(shuffled(rest)) : shuffled(rest)
  }
  audio.orderVersion = audio.orderVersion + 1
}

// The step a skip or a track running out takes: the next index, a restart, or nothing.
const nextStep = () => {
  if (audio.repeat === 'one') return 'restart'
  const at = order.indexOf(cur)
  if (at < 0) return null
  if (at < order.length - 1) return order[at + 1]
  if (audio.repeat === 'all' && order.length) return order[0]
  return null
}
const prevStep = (seconds) => {
  if (seconds > RESTART_SECONDS) return 'restart'
  const at = order.indexOf(cur)
  if (at < 0) return null
  if (at > 0) return order[at - 1]
  if (audio.repeat === 'all' && order.length) return order[order.length - 1]
  return 'restart'
}
export const hasNext = () => {
  const at = order.indexOf(cur)
  return at >= 0 && (at < order.length - 1 || (audio.repeat !== 'off' && order.length > 0))
}
export const hasPrev = () => order.indexOf(cur) > 0 || (audio.repeat === 'all' && order.length > 0)

const ticks = () => Math.floor(((el && el.currentTime) || 0) * TICKS)

// The server session is ours only while playback.js still holds it for our track. The video
// player takes it over when it starts, and from then on nothing here reports.
const ours = () => {
  const session = pb && pb.getCurrentSession()
  return !!(session && queue[cur] && session.itemId === queue[cur].Id)
}

const attach = () => {
  const s = getStore()
  if (s && s.audio !== audio) s.audio = audio
}

const startPlay = () => {
  const p = el.play()
  if (p && p.catch) p.catch(() => {})
}

const onPlay = () => {
  audio.playing = true
  if (!ours()) return
  if (!started) {
    started = true
    pb.reportStart(ticks())
    pb.startProgressReporting(ticks, 10000, () => ({ isPaused: el.paused }))
  } else {
    pb.reportProgress(ticks(), { isPaused: false, eventName: 'unpause' })
  }
}

const onPause = () => {
  audio.playing = false
  audio.waiting = false
  if (started && !el.ended && ours()) pb.reportProgress(ticks(), { isPaused: true, eventName: 'pause' })
}

const onTime = () => {
  // Something else (a video) took the session, so the music goes quiet without a report.
  if (started && !ours()) return release()
  const s = Math.floor(el.currentTime || 0)
  if (s !== audio.position) audio.position = s
  if (!audio.duration && isFinite(el.duration)) audio.duration = Math.floor(el.duration)
  const b = el.buffered && el.buffered.length ? Math.floor(el.buffered.end(el.buffered.length - 1)) : 0
  if (b !== audio.buffered) audio.buffered = b
}

const onEnded = () => {
  if (ours()) pb.reportStop(ticks())
  started = false
  const step = nextStep()
  if (step === 'restart') load(cur)
  else if (step != null) load(step)
  else release()
}

const onError = () => {
  // Code 1 is an aborted load, which a track change causes.
  if (!audio.active || !el.getAttribute('src') || (el.error && el.error.code === 1)) return
  fail()
}

const element = () => {
  if (el) return el
  el = document.createElement('audio')
  el.style.display = 'none'
  document.body.appendChild(el)
  el.addEventListener('play', onPlay)
  el.addEventListener('playing', () => {
    audio.loading = false
    audio.waiting = false
    failures = 0
  })
  el.addEventListener('waiting', () => (audio.waiting = true))
  el.addEventListener('pause', onPause)
  el.addEventListener('timeupdate', onTime)
  el.addEventListener('ended', onEnded)
  el.addEventListener('error', onError)
  return el
}

const load = async (i, directRefused = false) => {
  const my = ++token
  const track = queue[i]
  cur = i
  started = false
  refused = directRefused
  audio.active = true
  audio.loading = true
  audio.waiting = false
  audio.playing = false
  audio.itemId = track.Id
  audio.title = track.Name || ''
  audio.artist = artistOf(track)
  audio.album = track.Album || ''
  audio.art = posterUrl(track, 600)
  audio.position = 0
  audio.duration = track.RunTimeTicks ? Math.floor(track.RunTimeTicks / TICKS) : 0
  audio.cur = i
  audio.count = queue.length
  try {
    if (!pb) pb = await import('../services/playback.js')
    const info = await pb.getPlaybackInfo(track.Id, {
      item: track,
      startPositionTicks: 0,
      maxBitrate: settings.get('maxBitrate'),
      directRefused,
    })
    if (my !== token) return
    element().src = info.url
    startPlay()
  } catch (e) {
    console.warn('[audio] could not start', track.Id, e)
    if (my === token) fail()
  }
}

// A track that won't direct play gets one transcoded try. After that the queue moves on, and
// a run of failures stops the music.
const fail = () => {
  if (!refused) return load(cur, true)
  failures++
  const step = nextStep()
  if (failures < MAX_FAILURES && step != null && step !== 'restart') return switchTo(step)
  toast($L('Audio playback failed for this track on this device.'))
  stop()
}

const switchTo = (i) => {
  if (ours()) pb.reportStop(ticks())
  load(i)
}

// Lets go of the element and the queue without telling the server anything.
const release = () => {
  token++
  started = false
  queue = []
  cur = -1
  if (el) {
    el.pause()
    el.removeAttribute('src')
    el.load()
  }
  audio.active = false
  audio.playing = false
  audio.loading = false
  audio.waiting = false
  audio.itemId = ''
  audio.position = 0
  audio.cur = 0
  audio.count = 0
  audio.buffered = 0
  order = []
  audio.orderVersion = audio.orderVersion + 1
}

export const play = (tracks, startIndex = 0) => {
  if (!tracks || !tracks.length) return
  attach()
  if (ours()) pb.reportStop(ticks())
  queue = tracks.slice()
  failures = 0
  audio.shuffle = false
  audio.repeat = 'off'
  cur = Math.max(0, Math.min(startIndex || 0, queue.length - 1))
  buildOrder()
  load(cur)
}

export const toggleShuffle = () => {
  audio.shuffle = !audio.shuffle
  buildOrder()
}

export const cycleRepeat = () => {
  audio.repeat = audio.repeat === 'off' ? 'all' : audio.repeat === 'all' ? 'one' : 'off'
}

// Up Next's Enter: plays that track, unless it's the one already playing.
export const jumpTo = (track) => {
  const i = queue.indexOf(track)
  if (i < 0 || i === cur) return
  switchTo(i)
}

export const toggle = () => {
  if (!el || !audio.active) return
  if (started && !ours()) return release()
  if (el.paused) startPlay()
  else el.pause()
}

export const next = () => {
  if (cur < 0) return
  const step = nextStep()
  if (step === 'restart') {
    if (ours()) pb.reportStop(ticks())
    load(cur)
  } else if (step != null) switchTo(step)
}

export const previous = () => {
  if (cur < 0) return
  const step = prevStep(el ? el.currentTime : 0)
  if (step === 'restart' || step == null) seek(0)
  else switchTo(step)
}

export const seek = (seconds) => {
  if (!el || !audio.active) return
  const end = audio.duration || (isFinite(el.duration) ? el.duration : 0)
  el.currentTime = Math.max(0, end ? Math.min(seconds, end - 1) : seconds)
  audio.position = Math.floor(el.currentTime)
}

export const stop = () => {
  if (ours()) pb.reportStop(ticks())
  release()
}

// The element's own position, finer than audio.position's whole seconds, for lyric timing.
export const currentTime = () => (el ? el.currentTime || 0 : 0)
