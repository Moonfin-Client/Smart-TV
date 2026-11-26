// The hours Jellyfin lets the signed-in user use the server. Outside them the app says so instead
// of letting every request fail. The server enforces the schedule itself, so this is a notice. With
// a Moonfin plugin that answers Moonfin/AccessWindow, the plugin works the schedule out on the
// server's clock and says how long until it closes or opens, and that alone decides and times the
// checks. Without one, the schedule is checked at each moment it could change, when the app comes
// back and when the server starts refusing requests. Administrators are exempt, as on the server.
import $L from '../../services/i18n.js'
import * as jellyfinApi from '../../services/jellyfinApi.js'
import { isAllowed, nextAccessStart, nextBoundary, readSchedules, readWindow } from '../../utils/accessSchedule.js'
import { formatClockTime, formatDayLabel, shiftedNow } from '../../utils/clock.js'
import { sameDay } from '../../utils/calendarEntries.js'
import * as settings from '../settings.js'
import { shell, shellApp } from './shellState.js'

const MAX_WAIT_MS = 60 * 1000
const IDLE_WAIT_MS = 15 * 60 * 1000
const BLOCKED_RECHECK_MS = 60 * 1000
const RETRY_MS = 15 * 1000

let check = null
let stopWatching = null

const now = () => shiftedNow(settings.get('timeOffsetHours'))

// When the user can use the server again, in words, or '' when no entry opens soon.
const describeNextAccess = (next, at, clockDisplay) => {
  if (!next) return ''
  const time = formatClockTime(next, clockDisplay)
  if (sameDay(next, at)) return $L('You can use it again today at {time}.').replace('{time}', time)
  const tomorrow = new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1)
  if (sameDay(next, tomorrow)) return $L('You can use it again tomorrow at {time}.').replace('{time}', time)
  return $L('You can use it again on {day} at {time}.').replace('{day}', formatDayLabel(next)).replace('{time}', time)
}

export const stopAccess = () => {
  if (stopWatching) stopWatching()
  stopWatching = null
  check = null
  shell.timesUp = false
  shell.nextAccess = ''
}

export const recheckAccess = () => {
  if (check) check()
}

// Emby has no schedules, so only Jellyfin (and the servers that answer like it) are watched.
export const watchAccess = (userId) => {
  stopAccess()
  if (!userId || jellyfinApi.getServerType() === 'emby') return
  let cancelled = false
  let timer = null
  let schedules = []
  let exempt = false
  let blocked = false
  // Set when the server says it can't answer the access window, so this user's checks stop asking.
  let windowUnsupported = false
  // Checks can overlap, so each is numbered and none replaces the answer of one started after it.
  let started = 0
  let applied = 0

  const schedule = (ms) => {
    clearTimeout(timer)
    timer = setTimeout(run, ms)
  }

  const apply = (at, refused) => {
    const allowed = exempt || (refused === null ? isAllowed(schedules, at) : !refused)
    const was = blocked
    blocked = !allowed
    if (!blocked && !was) return
    shell.nextAccess = blocked ? describeNextAccess(nextAccessStart(schedules, at), at, settings.get('clockDisplay')) : ''
    shell.timesUp = blocked
    if (!blocked) jellyfinApi.clearAccessDenied()
    if (blocked && !was && shellApp()) shellApp().onTimesUp()
  }

  // The plugin's answer alone decides and times the next check.
  const applyWindow = (answer) => {
    const at = now()
    const was = blocked
    blocked = !answer.allowed
    if (blocked || was) {
      // Named on this device's clock, as the moment it comes on it, to the nearest minute: a
      // schedule opens on a minute, and a clock a moment behind the server's would otherwise name
      // the minute before.
      const next = blocked && answer.untilOpenMs !== null
        ? new Date(Math.round((at.getTime() + answer.untilOpenMs) / 60000) * 60000)
        : null
      shell.nextAccess = describeNextAccess(next, at, settings.get('clockDisplay'))
      shell.timesUp = blocked
      if (!blocked) jellyfinApi.clearAccessDenied()
      if (blocked && !was && shellApp()) shellApp().onTimesUp()
    }
    // Allowed with nothing to close is a user with no schedule, or one open all week.
    let wait = !blocked && answer.untilCloseMs === null ? IDLE_WAIT_MS : MAX_WAIT_MS
    const remaining = blocked ? answer.untilOpenMs : answer.untilCloseMs
    if (remaining !== null) wait = Math.min(wait, remaining)
    schedule(Math.max(wait, 1000))
  }

  // The plugin's window, or null when it can't say. Without the plugin, with one from before the
  // endpoint (404), or one that can't read the schedule on this server (501), the schedule is
  // judged here instead for the rest of the session. Any other failure, or a 200 that isn't a
  // window (a proxy's HTML page, say), falls back for this check only.
  const loadWindow = () => jellyfinApi.api.getAccessWindow().then(readWindow, (err) => {
    if (err && (err.status === 404 || err.status === 501)) windowUnsupported = true
    return null
  })

  async function run() {
    clearTimeout(timer)
    const look = ++started
    if (!windowUnsupported) {
      const answer = await loadWindow()
      if (cancelled || look < applied) return
      if (answer) {
        applied = look
        applyWindow(answer)
        return
      }
    }
    let user
    try {
      user = await jellyfinApi.api.getUserConfiguration()
    } catch (e) {
      if (!cancelled && look >= applied) schedule(RETRY_MS)
      return
    }
    if (cancelled || look < applied) return
    const isExempt = Boolean(user && user.Policy && user.Policy.IsAdministrator)
    const fresh = readSchedules(user && user.Policy)
    let refused = null
    // The server checks on its own clock, which can be in another time zone, so it decides.
    if (!isExempt && fresh.length > 0) {
      refused = await jellyfinApi.api.getCurrentUser().then(() => false, (err) => (err && err.status === 403 ? true : null))
      if (cancelled || look < applied) return
    }
    applied = look
    exempt = isExempt
    schedules = fresh
    const at = now()
    apply(at, refused)
    if (exempt) return
    const boundary = nextBoundary(schedules, at)
    let wait = blocked ? BLOCKED_RECHECK_MS : schedules.length > 0 ? MAX_WAIT_MS : IDLE_WAIT_MS
    if (boundary && !blocked) wait = Math.min(wait, boundary.getTime() - at.getTime())
    schedule(Math.max(wait, 1000))
  }

  // A refusal is the cue to look, not more than every few seconds, and never while blocked.
  let lastRefusal = 0
  const offForbidden = jellyfinApi.onForbidden(() => {
    if (shell.timesUp) return
    const t = Date.now()
    if (t - lastRefusal < 5000) return
    lastRefusal = t
    run()
  })
  const onVisible = () => {
    if (!document.hidden) run()
  }
  document.addEventListener('visibilitychange', onVisible)

  check = run
  stopWatching = () => {
    cancelled = true
    clearTimeout(timer)
    if (offForbidden) offForbidden()
    document.removeEventListener('visibilitychange', onVisible)
  }
  run()
}
