// How Classic's page and lanes scroll. The page keeps a focused section 24px clear of the edges. A
// plain lane moves a card that runs past its edge back in with 50px to spare, and a media row's lane
// glides each focused card to its start.
import { scrollFor } from '../modern/scroll.js'

const PAGE_THRESHOLD = 24

export const pageScroll = (st, contentH, item, container) => scrollFor(st, contentH, item, container, PAGE_THRESHOLD)

const maxScroll = (row) => {
  const cells = row.cells || []
  if (!cells.length) return 0
  const last = cells[cells.length - 1]
  const first = cells[0]
  // The lane's content runs from its first card's left padding to the last card's right padding.
  return Math.max(0, last.x + last.w - first.x + 2 * (row.clipPad || 20) - row.clipW)
}

export const rowScroll = {
  clamp: (row, s) => Math.max(0, Math.min(maxScroll(row), s)),
  toShow: (row, s, c) => {
    if (row.mode === 'glide') return rowScroll.clamp(row, c.x - row.cells[0].x)
    if (row.mode !== 'scroll') return 0
    // The lane's visible box in content coordinates: clipX from the content edge, clipW wide.
    const left = s + row.clipX
    const right = left + row.clipW
    let next = s
    if (c.x < left) next = s - (left - c.x + 50)
    else if (c.x + c.w > right) next = s + (c.x + c.w - right + 50)
    return rowScroll.clamp(row, next)
  },
}

// For a press that lands on a line of pills or tiles: the one straddling the vertical line through
// `x`, else the one whose edge is nearest it, the first on a tie.
export const plumbIndex = (boxes, x) => {
  let best = -1
  let bestD = Infinity
  boxes.forEach((b, i) => {
    const d = x < b.x ? b.x - x : x > b.x + b.w ? x - (b.x + b.w) : 0
    if (d < bestD) {
      best = i
      bestD = d
    }
  })
  return best
}
