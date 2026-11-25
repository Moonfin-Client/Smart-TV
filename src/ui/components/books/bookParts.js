import $L from '../../../services/i18n.js'
import { getServerUrl } from '../../../services/jellyfinApi.js'
import { bookImageUrl, genreHue } from '../../../utils/bookLibrary.js'
import { fontFor, uiFont } from '../../text.js'
import { hex2 } from '../../themeColor.js'
import { ellipsize, textWidth } from './bookText.js'
import { STATION_COLORS } from './bookScreens.js'

export const RAIL_WIDTH = 414
export const STRIP_H = 81
export const CHIPS_H = 89

const RAIL_ROW_W = 346
export const RAIL_ROW_H = 64
const RAIL_TOP = 40
const RAIL_BOTTOM = 40

// The overview's glyph is a core icon and the rest are the book library's own.
export const navIcon = (entry) => (entry.key === 'overview' ? 'core_' : 'book_') + entry.icon

// Bookstore's rail top to bottom: the name (one or two lines), the size, then a header per section
// and a row per entry.
export const railLayout = (name, entries) => {
  const titleLines = textWidth(name, 40, 'bold') > RAIL_ROW_W - 20 ? 2 : 1
  let y = RAIL_TOP + 48 * titleLines + 7 + 33
  let section = null
  const headers = []
  const rows = entries.map((entry, i) => {
    if (entry.section !== section) {
      section = entry.section
      const label = section === 'titles' ? $L('Titles') : section === 'browse' ? $L('Browse') : ''
      y += 37
      if (label) headers.push({ k: section, label: label.toUpperCase(), y })
      y += (label ? 33 : 0) + 10
    }
    const count = entry.count != null ? String(entry.count) + (entry.floor ? '+' : '') : ''
    const countW = count ? textWidth(count, 22) + 12 : 0
    const out = {
      k: entry.key,
      i,
      entry,
      y,
      label: ellipsize(entry.label, 23, 'regular', 256 - countW),
      boldLabel: ellipsize(entry.label, 23, 'bold', 256 - countW),
      count,
      countW,
      icon: navIcon(entry),
      labelFont: fontFor(entry.label),
      boldFont: fontFor(entry.label, 'bold'),
    }
    y += RAIL_ROW_H
    return out
  })
  return { titleLines, rows, headers, height: y + RAIL_BOTTOM }
}

export const pillWidth = (label, icon) => Math.ceil(textWidth(label, 19, 'bold')) + 54 + (icon ? 34 : 0)

export const heroButtons = (list) => {
  let x = 0
  return list.map((b, i) => {
    const w = b.w || (b.round ? 52 : Math.ceil(textWidth(b.label, 16, 'bold')) + 48 + (b.icon ? 30 : 0))
    const out = Object.assign({}, b, { i, x, w, font: uiFont('bold') })
    x += w + 12
    return out
  })
}

// A shelf's height: its padding and its tallest card with the two lines under it.
export const shelfHeight = (cards, pad) => pad[0] + pad[2] + cards.reduce((h, c) => Math.max(h, c.h + 78), 0)

export const initialsOf = (name) =>
  String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')

// A portrait, or the name's initials on a tile from the station palette when there's no image.
export const faceOf = (author, i) => {
  const url = author.ImageTags && author.ImageTags.Primary ? bookImageUrl(author._serverUrl || getServerUrl(), author) : ''
  return { image: url || '', initials: url ? '' : initialsOf(author.Name), color: STATION_COLORS[i % STATION_COLORS.length] }
}

// hsl(h, 32%, 20%) as hex, Reading Room's genre tile tint.
export const genreColor = (name) => {
  const h = genreHue(name || '') / 360
  const s = 0.32
  const l = 0.2
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue = (t) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return '#' + hex2(hue(h + 1 / 3) * 255) + hex2(hue(h) * 255) + hex2(hue(h - 1 / 3) * 255)
}
