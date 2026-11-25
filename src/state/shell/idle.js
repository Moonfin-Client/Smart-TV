// The in-app screensaver and Let TV Sleep After. Each key press only stamps the time. The timers
// fire once per timeout and check how long it's been, so nothing runs per key and nothing draws
// while the app is idle.
import * as settings from '../settings.js'
import { getStore } from '../store.js'
import { audio, stop as stopAudio } from '../audioPlayer.js'
import { releasePlayer } from '../../services/remoteControl.js'
import { exitApp } from '../../utils/appLifecycle.js'
import { isVega, isXbox } from '../../platform.js'
import { shell, shellApp } from './shellState.js'

// The longest the app waits on the player's stop report before it closes anyway.
const STOP_REPORT_WAIT = 5000
// How often a sleep timer held off by playing media looks again.
const SLEEP_RECHECK = 60000
// The screensaver timer looks at least this often, so a shorter timeout chosen in Settings applies
// without a key press. It sets nothing unless the screensaver is due.
const SAVER_RECHECK = 30000

const holds = {}
let last = Date.now()
let sleepFrom = last
let saverTimer = null
let sleepTimer = null

// Pages that run without key presses (a photo slideshow, a book read aloud) hold the screensaver
// and the sleep timer off while they do.
export const holdScreensaver = (key, on) => {
  if (on) holds[key] = true
  else delete holds[key]
}

const held = () => Object.keys(holds).length > 0

// Video plays on the player and in the photo viewer, whose engine is loaded by the time either shows.
const videoPlaying = async () => {
  const app = shellApp()
  const path = (app && app.$router.state.path) || ''
  if (path.indexOf('/player') !== 0 && path.indexOf('/photos') !== 0) return false
  try {
    const engine = await import('../videoEngine.js')
    return !engine.isPaused()
  } catch (e) {
    return false
  }
}

const saverMs = () => (Number(settings.get('screensaverTimeout')) || 90) * 1000
// Xbox and Vega have no TV sleep timer to hand the screen to.
const sleepMs = () => (isXbox() || isVega() ? 0 : Number(settings.get('sleepAfterIdle')) || 0) * 60000

// The screensaver is off before Home (sign in, PIN, setup), in Settings, in a game (its input never
// reaches the timer) and in a book, and under these App overlays only. It does start over the
// others, an update notice or the Watch Parties dialog among them.
const SAVER_OFF = /^\/((login|pin|setup|settings|games\/play|read)(\/|$)|$)/
const SAVER_BLOCKERS = { exit: 1, shuffle: 1, account: 1, messages: 1 }

// Music keeps the screensaver away unless the viewer lets it start over audio. A playing video
// keeps it away, a paused one doesn't.
const saverAllowed = async () => {
  const store = getStore()
  const app = shellApp()
  if (!settings.get('screensaverEnabled') || !store || !store.authenticated || !app || held()) return false
  if (shell.timesUp || SAVER_BLOCKERS[app.overlay] || SAVER_OFF.test((app.$router.state && app.$router.state.path) || '/')) return false
  if (audio.playing) return settings.get('screensaverDuringAudio') === true
  return !(await videoPlaying())
}

const armSaver = (ms) => {
  clearTimeout(saverTimer)
  saverTimer = setTimeout(checkSaver, Math.min(ms, SAVER_RECHECK))
}

const checkSaver = async () => {
  const wait = saverMs() - (Date.now() - last)
  if (wait > 50) return armSaver(wait)
  const ok = await saverAllowed()
  // A key pressed during the check wins.
  if (ok && Date.now() - last >= saverMs() - 50) shell.saver = true
  else armSaver(saverMs())
}

const armSleep = (ms) => {
  clearTimeout(sleepTimer)
  sleepTimer = setTimeout(checkSleep, ms)
}

const checkSleep = async () => {
  const limit = sleepMs()
  if (!limit) return armSleep(SLEEP_RECHECK)
  const wait = limit - (Date.now() - Math.max(last, sleepFrom))
  if (wait > 50) return armSleep(wait)
  // Playing media and slideshows go on without key presses, so the wait starts once they stop.
  if (audio.playing || held() || (await videoPlaying())) {
    sleepFrom = Date.now()
    return armSleep(SLEEP_RECHECK)
  }
  // Behind another app or input, the app isn't what keeps the screen on.
  if (document.hidden || document.webkitHidden) {
    sleepFrom = Date.now()
    return armSleep(limit)
  }
  // Whatever sits paused reports its stop first, which keeps its resume point.
  if (audio.active) stopAudio()
  await Promise.race([
    Promise.resolve(releasePlayer()).catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, STOP_REPORT_WAIT)),
  ])
  exitApp()
}

const noteActivity = () => {
  last = Date.now()
}

// Any key wakes the screensaver without acting. True when the key did only that.
export const wake = () => {
  noteActivity()
  if (!shell.saver) return false
  shell.saver = false
  armSaver(saverMs())
  return true
}

export const startIdle = () => {
  noteActivity()
  armSaver(saverMs())
  armSleep(sleepMs() || SLEEP_RECHECK)
}
