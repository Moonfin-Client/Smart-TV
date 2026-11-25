// When the series' next episode airs, for the end card of an episode the library has nothing after
// yet. Null when nothing is known to air next.
import { api as jellyfinApi, getApiKey, getServerUrl } from '../../services/jellyfinApi.js'
import { getApiForItem } from '../../services/connectionPool.js'
import { fetchUpcomingEpisode } from '../../utils/upcomingEpisode.js'
import { daysBetween, followsEpisode } from '../../utils/calendarEntries.js'

// Sonarr gives an instant, TMDB a bare day, which is that local day.
const airDateOf = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value)
  return isNaN(date.getTime()) ? null : date
}

export const findNextAirDate = async (item, s) => {
  if (s.showNextAirDate === false || s.nextUpBehavior === 'disabled') return null
  if (!item || item.Type !== 'Episode' || !item.SeriesId) return null
  try {
    // The lookup goes by the series' provider ids, which the episode doesn't carry.
    const series = await (getApiForItem(item) || jellyfinApi).getItem(item.SeriesId)
    const info = await fetchUpcomingEpisode({
      item: series,
      settings: s,
      serverUrl: item._serverUrl || getServerUrl(),
      serverToken: item._serverAccessToken || getApiKey(),
    })
    const date = info && airDateOf(info.airDate)
    if (!date || daysBetween(new Date(), date) < 0) return null
    if (!followsEpisode(info, item.ParentIndexNumber, item.IndexNumber)) return null
    return {
      itemId: item.Id,
      seasonNumber: info.seasonNumber,
      episodeNumber: info.episodeNumber,
      date,
      title: info.title && info.title !== 'TBA' ? info.title : item.SeriesName || (series && series.Name) || '',
    }
  } catch (err) {
    console.warn('[Player] Next air date lookup failed:', err)
    return null
  }
}
