// The marks a details page adds under its facts: Live TV's Incomplete line and the anime marker
// pills, as plain values and draw lists for the layouts.
import $L from '../../services/i18n.js'
import { incompleteRecordingFor } from '../../services/incompleteRecordings.js'
import { areAnimeMarkersEnabled, audioForItem, fetchItemMarkers, fetchSeriesMarkers, markerForEpisode } from '../../services/animeMarkersApi.js'
import { formatShowingTime } from '../../utils/clock.js'
import { parseServerDate } from '../../utils/serverDate.js'
import { markerPills } from '../../ui/components/player/animePills.js'
import { cssShift, fontFor } from '../../ui/text.js'

// A malformed count reads as zero rather than hiding the line.
const wholeMinutes = (value) => Math.round(Number(value)) || 0

// Reads like: Incomplete · 23 of 37 min · Complete showing scheduled Thu 8:00 PM.
export const incompleteText = (entry, clockDisplay) => {
  if (!entry) return ''
  const scheduledStart = parseServerDate(entry.scheduledStart)
  const recordedAt = parseServerDate(entry.recordedAt)
  let found = null
  if (entry.state === 'scheduled' && scheduledStart) {
    found = $L('Complete showing scheduled {dateTime}').replace('{dateTime}', formatShowingTime(scheduledStart, clockDisplay))
  } else if (entry.state === 'recorded' && recordedAt) {
    found = $L('Complete copy recorded {dateTime}').replace('{dateTime}', formatShowingTime(recordedAt, clockDisplay))
  } else if (entry.state === 'notFound') {
    found = $L('No complete showing found')
  }
  const minutes = $L('{recorded} of {expected} min')
    .replace('{recorded}', wholeMinutes(entry.recordedMinutes))
    .replace('{expected}', wholeMinutes(entry.expectedMinutes))
  return [$L('Incomplete'), minutes, found].filter(Boolean).join(' · ')
}

export const incompleteLineFor = (item, clockDisplay) => incompleteText(item && incompleteRecordingFor(item.Id), clockDisplay)

// What the pills read for an item: an episode's marker from its series, a movie's subbed or dubbed
// verdict. Resolves to { marker, audio, series } where `series` holds every episode's marker.
export const loadAnimeMarks = async (item, s) => {
  const none = { marker: null, audio: null, series: null }
  if (!item || !areAnimeMarkersEnabled(s)) return none
  const serverUrl = item._serverUrl
  const seriesId = item.Type === 'Episode' || item.Type === 'Season' ? item.SeriesId : item.Type === 'Series' ? item.Id : null
  const series = seriesId ? await fetchSeriesMarkers(seriesId, { serverUrl }).catch(() => null) : null
  let audio = null
  if (item.Type === 'Movie') {
    await fetchItemMarkers([item.Id], { serverUrl }).catch(() => null)
    audio = audioForItem(item.Id)
  }
  return { marker: item.Type === 'Episode' ? markerForEpisode(series, item.Id) : null, audio, series }
}

// The pills as boxes and text at x, y: `large` (19px, 3 by 14) or `compact` (13px, 1 by 9) or the
// default (15px, 2 by 11), 8px apart. Returns the row's width and height.
const SIZES = {
  large: { font: 19, padX: 14, padY: 3, r: 11 },
  compact: { font: 13, padX: 9, padY: 1, r: 8 },
  normal: { font: 15, padX: 11, padY: 2, r: 9 },
}
export const drawAnimePills = (out, k, marker, audio, x, y, size = 'normal') => {
  const z = SIZES[size]
  const pills = markerPills(marker, audio, size === 'compact', size === 'large')
  const h = z.font * 1.5 + z.padY * 2 + 2
  let px = x
  pills.forEach((p, i) => {
    out.rects.push({ k: `${k}r${i}`, x: px, y, w: p.w, h, r: z.r, color: p.fill, bw: 1, bc: p.border, shadow: null })
    out.texts.push({
      k: `${k}t${i}`, x: px + 1 + z.padX, y: y + 1 + z.padY + (z.font * 1.5 - 33) / 2 + cssShift(z.font), text: p.label, size: z.font,
      font: fontFor(p.label, 'bold'), color: p.text, lh: 33, maxw: 0, maxlines: 1, ls: 0.2, ellipsis: false, align: 'left',
    })
    px += p.w + 8
  })
  return { w: pills.length ? px - 8 - x : 0, h: pills.length ? h : 0 }
}
