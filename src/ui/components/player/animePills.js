// The Filler, Canon, Recap and Subbed/Dubbed pills the Moonfin plugin's anime markers give an episode.
import $L from '../../../services/i18n.js'
import { animeLabelStyle, areAnimeMarkersEnabled, fetchSeriesMarkers, markerForEpisode } from '../../../services/animeMarkersApi.js'
import { textWidth } from './look.js'

// Each tone's text, fill and border.
const TONES = {
  filler: ['#ffc48a', '#ff8a002e', '#ff8a008c'],
  mixed: ['#ffe08a', '#ffc10729', '#ffc10780'],
  mangaCanon: ['#9ce8b4', '#2ecc7129', '#2ecc7180'],
  animeCanon: ['#9ecbff', '#3498db2e', '#3498db8c'],
  recap: ['#d3b4ff', '#9b59e82e', '#9b59e88c'],
  subbed: ['#a9d8ff', '#00a4dc2e', '#00a4dc8c'],
  dubbed: ['#ffb3b3', '#e74c3c2e', '#e74c3c8c'],
  dual: ['#c4c9ff', '#7878ff2e', '#7878ff8c'],
}
const KIND = {
  Filler: ['Filler', 'filler'],
  Mixed: ['Mixed Canon/Filler', 'mixed'],
  MangaCanon: ['Manga Canon', 'mangaCanon'],
  AnimeCanon: ['Anime Canon', 'animeCanon'],
}
const AUDIO = {
  Subbed: ['Subbed', 'Sub', 'subbed'],
  Dubbed: ['Dubbed', 'Dub', 'dubbed'],
  SubbedAndDubbed: ['Subbed/Dubbed', 'Sub/Dub', 'dual'],
}
// The default size: 15px at 600 with 0.2 letter spacing, 2 by 11 padding and a 1px border, 28.5 tall.
export const PILL_H = 28.5

// The pills for a marker, as { key, label, w, text, fill, border }.
export const markerPills = (marker, audio, compact, large) => {
  const list = []
  const kind = marker && marker.kind ? KIND[marker.kind] : null
  if (kind) list.push({ key: 'kind', label: $L(kind[0]), tone: kind[1] })
  if (marker && marker.recap === true) list.push({ key: 'recap', label: $L('Recap'), tone: 'recap' })
  const a = AUDIO[audio || (marker && marker.audio)]
  if (a) list.push({ key: 'audio', label: $L(animeLabelStyle() === 'short' ? a[1] : a[0]), tone: a[2] })
  return list.map((p) => {
    const [text, fill, border] = TONES[p.tone]
    const w = compact ? textWidth(p.label, 13, 'bold') + 0.2 * p.label.length + 20
      : large ? textWidth(p.label, 19, 'bold') + 0.2 * p.label.length + 30
        : textWidth(p.label, 15, 'bold') + 0.2 * p.label.length + 24
    return { key: p.key, label: p.label, w, text, fill, border }
  })
}

// The episode's marker when the Moonfin plugin is on, else null.
export const episodeMarker = async (episode, s) => {
  if (!areAnimeMarkersEnabled(s) || !episode || !episode.SeriesId) return null
  const markers = await fetchSeriesMarkers(episode.SeriesId, { serverUrl: episode._serverUrl })
  return markerForEpisode(markers, episode.Id)
}
