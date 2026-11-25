// What Seerr cards draw on a poster corner, worked out once per title so the card templates only
// bind fields. Colors come from the active theme.
import $L from '../../../services/i18n.js'
import { theme } from '../../theme.js'
import { textWidth } from '../../text.js'
import { MEDIA_STATUS } from '../../../utils/seerrStatus.js'
import { mediaStatusLabel } from '../../../utils/seerrBadges.js'
import * as settings from '../../../state/settings.js'

export { textWidth }

// A single line's width with CSS letter-spacing, which adds after every glyph.
export const spacedWidth = (str, size, weight, spacing) => textWidth(str, size, weight) + spacing * String(str || '').length

// How posters show a Seerr status, or null when turned off.
export const seerrBadgeStyle = (s = settings.all()) => {
  if (s.showSeerrAvailabilityBadges === false) return null
  return s.seerrBadgeStyle === 'banner' ? 'banner' : 'badge'
}

// The statuses worth a dot, and the only ones a banner shows.
export const hasSeerrDot = (status) => status >= MEDIA_STATUS.PENDING && status <= MEDIA_STATUS.AVAILABLE

const DOT_ICONS = {
  [MEDIA_STATUS.AVAILABLE]: ['available', 'checkRounded'],
  [MEDIA_STATUS.PARTIALLY_AVAILABLE]: ['partial', 'removeRounded'],
  [MEDIA_STATUS.PROCESSING]: ['processing', 'scheduleRounded'],
  [MEDIA_STATUS.PENDING]: ['pending', 'scheduleRounded'],
}

// A status dot: an outlined check when available, a filled dash when partly there, and an
// outlined clock in its own color while on its way. size is the dot's side, 33 on posters.
export const statusDot = (status, size = 33) => {
  const variant = DOT_ICONS[status]
  if (!variant) return null
  const t = theme()
  const tone = variant[0] === 'available' || variant[0] === 'partial' ? t.status.available
    : variant[0] === 'processing' ? t.status.requested : t.status.pending
  const partial = variant[0] === 'partial'
  // The icon fills about seven tenths of the ring's inside, the dash a little more.
  const inner = size - 5
  const icon = Math.round(inner * (partial ? 0.78 : 0.72))
  return {
    size,
    fill: partial ? tone : t.onBadge,
    ring: tone,
    icon: variant[1],
    iconColor: partial ? t.onBadge : tone,
    iconSize: icon,
    iconAt: (size - icon) / 2,
  }
}

const BANNER_FILL = {
  [MEDIA_STATUS.PENDING]: 'pending',
  [MEDIA_STATUS.PROCESSING]: 'requested',
  [MEDIA_STATUS.PARTIALLY_AVAILABLE]: 'available',
  [MEDIA_STATUS.AVAILABLE]: 'available',
}

// Rough relative luminance of a '#rrggbbaa' fill, for the banner's ink.
const luminance = (hex) => {
  const v = hex.replace('#', '')
  const ch = (i) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4)
}

// The status across the top of a poster in its color, 33px tall.
export const statusBanner = (status, width) => {
  if (!hasSeerrDot(status)) return null
  const fill = theme().status[BANNER_FILL[status]]
  const label = mediaStatusLabel(status).toUpperCase()
  const natural = spacedWidth(label, 17, 'bold', 1.7) + 12
  return {
    fill,
    ink: luminance(fill) > 0.45 ? '#000000ff' : theme().onBadge,
    label,
    // A label too long for a narrow poster shrinks to fit.
    scale: natural > width ? width / natural : 1,
  }
}

const typeBadge = (mediaType) => {
  const isMovie = String(mediaType || '').toLowerCase() === 'movie'
  const label = (isMovie ? $L('Movie') : $L('Series')).toUpperCase()
  return {
    label,
    w: Math.round(spacedWidth(label, 17, 'bold', 1) + 20),
    color: isMovie ? '#3b82f6d9' : '#8b5cf6d9',
  }
}

// Everything a Seerr poster draws on its art for a title's media status.
export const posterMarks = (mediaType, status, artWidth, s = settings.all()) => {
  const style = seerrBadgeStyle(s)
  const banner = style === 'banner' ? statusBanner(status, artWidth) : null
  return {
    type: mediaType ? typeBadge(mediaType) : null,
    typeY: banner ? 43 : 10,
    dot: style === 'badge' ? statusDot(status) : null,
    banner,
  }
}
