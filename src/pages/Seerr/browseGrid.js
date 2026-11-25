import $L from '../../services/i18n.js'

// The grid is laid out on an 1150 point TV canvas and drawn at 1920. Its poster sizes are portrait
// heights, the gaps leave room for a focused card to grow 12 percent when focus expansion is on,
// and the cells stretch to fill the width between the 60 point margins.
const DP = 1920 / 1150
const CORE_PORTRAIT = { small: 120, medium: 150, large: 180, extraLarge: 210 }
const GRID_WIDTH = 1920 - 200
const FOCUS_SCALE = 1.12
const RING_OUTSET = 8

export const browseGridMetrics = (posterSize, expansion = true) => {
  const cardWidth = ((CORE_PORTRAIT[posterSize] || CORE_PORTRAIT.medium) * 2) / 3
  const coreSpacing = expansion ? 12 + (cardWidth * (FOCUS_SCALE - 1)) / 2 : 12
  const columns = Math.floor((1150 - 120 + coreSpacing) / (cardWidth + coreSpacing))
  const columnGap = Math.round(coreSpacing * DP)
  const ringRoom = Math.ceil(RING_OUTSET * FOCUS_SCALE)
  const spacing = Math.round(16 * DP) - ringRoom
  const inset = (columnGap - spacing) / 2
  const cellWidth = Math.floor((GRID_WIDTH - spacing * (columns - 1)) / columns)
  const artWidth = cellWidth - 2 * inset
  const imageHeight = Math.round(artWidth * 1.5)
  const headroom = (expansion ? Math.round(imageHeight * (FOCUS_SCALE - 1)) : 0) + ringRoom
  const growth = expansion ? Math.ceil((artWidth * (FOCUS_SCALE - 1)) / 2) : 0
  const room = Math.max(0, growth + ringRoom - inset)
  return {
    columns,
    spacing: spacing - 2 * room,
    inset: inset + room,
    edge: (1920 - GRID_WIDTH) / 2 - room,
    cellWidth: cellWidth + 2 * room,
    artWidth,
    imageHeight,
    headroom,
    gridTop: Math.round(20 * DP) - ringRoom,
    cellHeight: headroom + imageHeight + Math.round(42 * DP) + 2 * room,
  }
}

export const statusLabel = (status) => {
  if (status === 4 || status === 5) return $L('Available')
  if (status === 2 || status === 3) return $L('Requested')
  return null
}

export const yearOf = (entry) => (entry.releaseDate || entry.firstAirDate || '').substring(0, 4)

export const cardSubtitle = (entry) => {
  const parts = []
  const year = yearOf(entry)
  if (year.length === 4) parts.push(year)
  if (entry.voteAverage > 0) parts.push(`★ ${entry.voteAverage.toFixed(1)}`)
  const status = statusLabel(entry.mediaInfo && entry.mediaInfo.status)
  if (status) parts.push(status)
  return parts.join('  ')
}

// The All, Available and Requested chips and the A to Z bar only filter what has loaded.
export const matchesBrowseFilters = (entry, statusFilter, letter) => {
  const status = entry.mediaInfo && entry.mediaInfo.status
  if (status === 6) return false
  if (statusFilter === 'available' && status !== 4 && status !== 5) return false
  if (statusFilter === 'requested' && status !== 2 && status !== 3) return false
  if (!letter) return true
  const first = (entry.title || entry.name || '').trim().charAt(0).toUpperCase()
  if (!first) return false
  return letter === '#' ? !/[A-Z]/.test(first) : first === letter
}

// What the screen was showing, kept past the page for the next visit to the same browse.
const cache = new Map()
const MAX_ENTRIES = 12

export const browseStateKey = (browseType, item, mediaType) =>
  `${browseType || ''}|${item && item.id != null ? item.id : (item && item.name) || ''}|${mediaType || ''}`

export const readBrowseState = (key) => cache.get(key) || null

export const writeBrowseState = (key, patch) => {
  const existing = cache.get(key)
  if (!existing && cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value)
  cache.set(key, { ...existing, ...patch })
}

// Scrolls a grid row into view. Going down it parks the row 236px under the top of its 684px
// window (its 448px item box ends at the bottom), going up the row's top meets the window's top,
// and a row already in full view stays put.
export const gridScrollFor = (row, scrollTop, { pitch, view = 684, box = 448 }) => {
  const top = row * pitch
  if (top < scrollTop) return top
  if (top + box > scrollTop + view) return Math.max(0, top - (view - box))
  return scrollTop
}

// Scrolls a focused row into view inside a box, the way a browser does: a row already in view
// stays, one cut by an edge slides in by the least amount, and one wholly out of view comes to the
// middle.
export const focusScrollFor = (top, height, scrollTop, view, max) => {
  const bottom = top + height
  let next = scrollTop
  if (top >= scrollTop && bottom <= scrollTop + view) return scrollTop
  if (bottom <= scrollTop || top >= scrollTop + view) next = top + height / 2 - view / 2
  else if (top < scrollTop) next = top
  else next = bottom - view
  return Math.max(0, Math.min(max, next))
}
