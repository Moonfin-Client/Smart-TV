// Server items mapped once into what a card draws, so templates only read plain fields.
import { posterUrl, thumbUrl, backdropUrl } from './images.js'
import { fontFor } from './text.js'

const episodeLabel = (it) =>
  it.ParentIndexNumber != null && it.IndexNumber != null ? `S${it.ParentIndexNumber}:E${it.IndexNumber}` : ''

const cardTitle = (it) => (it.Type === 'Episode' && it.SeriesName ? it.SeriesName : it.Name || '')

const cardSubtitle = (it) => {
  if (it.Type === 'Episode') return [episodeLabel(it), it.Name].filter(Boolean).join(' ')
  if (it.Type === 'MusicAlbum') return it.AlbumArtist || (it.Artists && it.Artists[0]) || ''
  if (it.ProductionYear) return String(it.ProductionYear)
  return ''
}

const progressOf = (it) => {
  const ud = it.UserData || {}
  if (ud.PlayedPercentage) return Math.max(0, Math.min(1, ud.PlayedPercentage / 100))
  if (ud.PlaybackPositionTicks && it.RunTimeTicks) return Math.min(1, ud.PlaybackPositionTicks / it.RunTimeTicks)
  return 0
}

// type: poster (2:3), landscape (16:9), square (1:1), circle (people).
export const toCard = (it, type = 'poster', index = 0) => {
  const title = cardTitle(it)
  const subtitle = cardSubtitle(it)
  const image = type === 'landscape' ? thumbUrl(it) : type === 'circle' ? posterUrl(it, 300) : posterUrl(it, type === 'square' ? 300 : 360)
  return {
    key: `${it.Id || it.id || index}-${index}`,
    idx: index,
    id: it.Id,
    type,
    title,
    subtitle,
    titleFont: fontFor(title, 'medium'),
    subtitleFont: fontFor(subtitle),
    image: image || '',
    backdrop: backdropUrl(it) || '',
    progress: progressOf(it),
    played: !!(it.UserData && it.UserData.Played),
    raw: it,
  }
}

export const CARD_SIZES = {
  poster: { w: 200, h: 300, gap: 24 },
  landscape: { w: 400, h: 225, gap: 28 },
  square: { w: 260, h: 260, gap: 24 },
  circle: { w: 200, h: 200, gap: 28 },
}
