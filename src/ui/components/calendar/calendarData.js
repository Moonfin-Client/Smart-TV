import * as settings from '../../../state/settings.js'
import { checkSeerr, seerrState } from '../../../state/seerr.js'
import { api, getServerUrl, getApiKey } from '../../../services/jellyfinApi.js'
import { loadCalendar, seriesProgress } from '../../../services/calendarApi.js'
import { shiftedNow } from '../../../utils/clock.js'
import { addDays, behindOnSeries, calendarAllows, followsSeries, isEpisode, startOfDay } from '../../../utils/calendarEntries.js'

// The whole calendar window loaded once and filtered with the calendar settings. loadCalendar
// caches the fetch, so each screen asks on its own.

const count = (value, fallback) => (typeof value === 'number' && value >= 0 ? Math.trunc(value) : fallback)

// Watch state per series, fetched once and kept between screens.
let progress = {}

export const calendarNow = () => shiftedNow(settings.get('timeOffsetHours'))

/** Loads the window around today, as {loading, problem, all, now, today, windowStart, windowEnd}. */
export const loadCalendarData = async (refresh = false, s = settings.all()) => {
  await checkSeerr().catch(() => null)
  const info = seerrState().pluginInfo
  const now = calendarNow()
  const today = startOfDay(now)
  const windowStart = addDays(today, -count(info && info.calendarDaysBack, 14))
  const windowEnd = addDays(today, count(info && info.calendarDaysAhead, 90) + 1)
  const result = await loadCalendar({
    serverUrl: getServerUrl(),
    token: getApiKey(),
    start: windowStart,
    end: windowEnd,
    unmonitored: s.calendarIncludeUnmonitored === true,
    refresh,
  })
  // My shows and spoiler safe read watch state, fetched once per series.
  if (s.calendarScope === 'myShows' || s.calendarSpoilerSafe === true) {
    const ids = []
    result.entries.forEach((e) => {
      if (isEpisode(e) && e.itemId && !progress[e.itemId] && ids.indexOf(e.itemId) < 0) ids.push(e.itemId)
    })
    if (ids.length) progress = { ...progress, ...(await seriesProgress(api, ids)) }
  }
  const at = calendarNow()
  return { loading: false, problem: result.problem, all: result.entries, now: at, today: startOfDay(at), windowStart, windowEnd }
}

/** The entries the calendar settings keep, and whether an entry hides its spoilers. */
export const filterCalendar = (all, s = settings.all()) => {
  const followed = new Set()
  Object.keys(progress).forEach((id) => {
    if (followsSeries(progress[id])) followed.add(id)
  })
  const spoilerSafe = s.calendarSpoilerSafe === true
  return {
    entries: all.filter((e) => calendarAllows(e, s, followed)),
    hidesSpoilers: (e) => spoilerSafe && isEpisode(e) && behindOnSeries(progress[e.itemId]),
  }
}

// The settings the views draw with, so a change from Settings redraws them.
const LOOK_KEYS = [
  'calendarStyle', 'calendarScope', 'calendarShowEpisodes', 'calendarShowMovies', 'calendarLibraryIds', 'calendarShowSpecials',
  'calendarShowBadges', 'calendarColorBy', 'calendarImageType', 'calendarSpoilerSafe', 'calendarSelectAction',
  'calendarRequestButton', 'calendarIncludeUnmonitored', 'radarrCalendarShowCinema', 'radarrCalendarShowDigital',
  'radarrCalendarShowPhysical', 'navbarPosition', 'visualTheme', 'customThemeId', 'oledMode', 'focusBorderColor',
  'clockDisplay', 'dateFormat', 'timeOffsetHours', 'calendarWeekStart',
]
export const lookKey = () => LOOK_KEYS.map((k) => JSON.stringify(settings.get(k))).join('|')
