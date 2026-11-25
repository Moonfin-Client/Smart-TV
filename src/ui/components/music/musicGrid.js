// Kept free of the renderer so musicGrid.check.mjs can run it.
import { focusScroll } from '../nav/focusScroll.js'

export { gridMove } from '../books/bookGrid.js'

// How wide the category screens lay out: the whole canvas, or what Quick Access's 248px rail leaves.
// The category screen sets it before it mounts a screen.
let contentW = 1920
export const setContentWidth = (w) => {
  contentW = w
}
export const contentWidth = () => contentW

export const cardSide = (columns, insets, gap) => Math.floor((contentW - insets - gap * (columns - 1)) / columns)

// Lays `count` items out in rows of up to `columns`. With `sectionAt`, every change of section
// starts a new row whose `heading` is set.
export const gridRows = (count, columns, sectionAt) => {
  const rows = []
  for (let index = 0; index < count; index++) {
    const section = sectionAt ? sectionAt(index) : null
    const last = rows[rows.length - 1]
    if (last && last.section === section && index - last.start < columns) last.end = index + 1
    else rows.push({ start: index, end: index + 1, section, heading: !!sectionAt && (!last || last.section !== section) })
  }
  return rows
}

export const rowIndexOf = (rows, index) => {
  let low = 0
  let high = rows.length - 1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (index < rows[mid].start) high = mid - 1
    else if (index >= rows[mid].end) low = mid + 1
    else return mid
  }
  return -1
}

// A browser style focus scroll goes first (centered when the item was wholly out of view, just far
// enough when it was partly out), then 24px more only for an item still past an edge, which one
// taller than the view is.
export const keepInView = (scroll, top, bottom, viewH, maxScroll) => {
  const max = Math.max(0, maxScroll)
  let s = focusScroll(top, bottom - top, scroll, viewH, max)
  if (top - s < 0) s -= s - top + 24
  else if (bottom - s > viewH) s += bottom - s - viewH + 24
  return Math.max(0, Math.min(s, max))
}

// Cuts the wrapped `lines` to `n`, keeping the words of the last one that fit with an ellipsis
// after them, cut back a character at a time when even that won't fit. It matches the patched
// renderer's maxLines (scripts/patch-renderer.mjs). `fits(str)` says whether a line fits the width.
export const clampLines = (lines, n, fits) => {
  if (lines.length <= n) return lines.join('\n')
  let last = lines[n - 1]
  while (last && !fits(last + '…')) last = last.slice(0, -1)
  return lines.slice(0, n - 1).concat(last.replace(/\s+$/, '') + '…').join('\n')
}
