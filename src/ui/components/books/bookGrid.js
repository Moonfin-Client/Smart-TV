import { hex2 } from '../../themeColor.js'

export const countLabel = (count, one, many) => (count === 1 ? one : many.replace('{count}', String(count)))

export const gridRows = (count, columns) => {
  const rows = []
  for (let start = 0; start < count; start += columns) rows.push({ start, end: Math.min(count, start + columns) })
  return rows
}

export const rowIndexOf = (rows, index) => {
  for (let i = 0; i < rows.length; i++) if (index >= rows[i].start && index < rows[i].end) return i
  return -1
}

// Where an arrow goes from `index` in `row`: along the row, or to the same column of the row
// above or below, clamped to a shorter row. Null at the edges.
export const gridMove = (rows, row, index, direction) => {
  const current = rows[row]
  if (!current) return null
  if (direction === 'left') return index > current.start ? index - 1 : null
  if (direction === 'right') return index < current.end - 1 ? index + 1 : null
  const next = rows[row + (direction === 'up' ? -1 : 1)]
  if (!next) return null
  return next.start + Math.min(index - current.start, next.end - next.start - 1)
}

// How many cards of about `target` px fit beside the rail inside `insets`, and how wide each is.
export const columnsFor = (target, insets, gap, railWidth) => {
  const room = 1920 - railWidth - insets
  const columns = Math.max(2, Math.floor((room + gap) / (target + gap)))
  return { columns, width: Math.floor((room - gap * (columns - 1)) / columns) }
}

// Roboto's ascent plus descent per pixel of font size. CSS centers that box in the line, while the
// renderer puts the ascent at the node's y, so a line box's top maps to this y.
const CONTENT = 1.171875
// The renderer draws Roboto a pixel or two higher than the browser does, more at display sizes.
export const lineY = (top, lineHeight, size) => top + (lineHeight - size * CONTENT) / 2 + (size >= 30 ? 2 : 1)

// The app's Roboto ships 400, 500 and 700, so 600 and 800 draw as bold.
export const weightOf = (cssWeight) => (cssWeight >= 600 ? 'bold' : cssWeight >= 500 ? 'medium' : 'regular')

const parse = (c) => {
  const v = String(c).replace('#', '')
  return { r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16), a: v.length > 6 ? parseInt(v.slice(6, 8), 16) / 255 : 1 }
}
// `color` at alpha `a` laid over an opaque `base`, as one opaque color.
export const over = (base, color, a) => {
  const b = parse(base)
  const c = parse(color)
  const mix = (x, y) => x * (1 - a) + y * a
  return '#' + hex2(mix(b.r, c.r)) + hex2(mix(b.g, c.g)) + hex2(mix(b.b, c.b))
}

export const withAlpha = (color, a) => String(color).slice(0, 7) + hex2(a * 255)

// A see-through page color laid twice over black, the way the page and app backgrounds stack, as
// one opaque color.
export const flatten = (color) => {
  const c = parse(color)
  const once = (x) => x * c.a
  const twice = (x) => x * c.a + once(x) * (1 - c.a)
  return '#' + hex2(twice(c.r)) + hex2(twice(c.g)) + hex2(twice(c.b))
}
