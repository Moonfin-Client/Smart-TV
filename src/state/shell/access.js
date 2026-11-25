// The hours Jellyfin lets the signed-in user use the server. Outside them the app says so instead
// of letting every request fail. The schedule is checked at each moment it could change, when the
// app comes back and when the server starts refusing requests. Administrators are exempt, as on
// the server.
import $L from '../../services/i18n.js'
import * as jellyfinApi from '../../services/jellyfinApi.js'
import { isAllowed, nextAccessStart, nextBoundary, readSchedules } from '../../utils/accessSchedule.js'
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

  async function run() {
    clearTimeout(timer)
    const look = ++started
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
