// The pure geometry of Nouveau's page: where it starts beside the nav, how tall the overview box
// is, where the page scrolls for a stop, how far a rail slides and how the footer's pieces link up.
import { SECTION_INSET, TOP_BAR_CLEARANCE } from './nouveauMetrics.js'

export const OVERVIEW_W = 590
export const OVERVIEW_LH = 24.48

// The padding beside the nav: the docked sidebar's rail, or just enough to clear Reel's and
// Mosaic's control.
const sideOffset = (sideRoom) => (sideRoom === 'rail' ? 120 : sideRoom === 'control' ? 64 : 0)

export const pageGeometry = (sideRoom, navbarPosition) => {
  const offset = sideOffset(sideRoom)
  const topBar = navbarPosition !== 'left'
  return {
    left: offset + SECTION_INSET,
    viewport: 1920 - SECTION_INSET * 2 - offset,
    heroTop: topBar ? TOP_BAR_CLEARANCE : SECTION_INSET,
    inset: topBar ? TOP_BAR_CLEARANCE : SECTION_INSET,
  }
}

export const overviewHeight = (box, expanded, focused) => {
  if (!box.canToggle) return box.lines * OVERVIEW_LH
  const frame = focused ? 34 : 36
  const shown = expanded ? box.lines : 3
  const h = frame + shown * OVERVIEW_LH + 12 + 33
  return expanded ? Math.min(319, h) : h
}

// Where the page scrolls to bring a stop into view: the hero sits at the top, a rail's
// section top lands `inset` below the screen's top, unless the rail would then run off the bottom,
// in which case its own top does.
export const pinFor = (stop, inset, maxScroll) => {
  if (!stop) return 0
  let top = stop.sectionTop - inset
  if (stop.y !== stop.sectionTop && stop.y + stop.h - top > 1080) top = stop.y - inset
  return Math.max(0, Math.min(maxScroll, top))
}

// Flex items in a row `room` wide, `gap` apart, each {base, min}: past the room every one shrinks
// in proportion to its base, but none below its min (CSS flex-shrink with min-width: auto).
export const shrinkRow = (items, room, gap) => {
  const size = items.map((x) => x.base)
  const frozen = items.map((x) => x.base <= x.min)
  const avail = room - gap * Math.max(0, items.length - 1)
  for (let pass = 0; pass < items.length; pass++) {
    const fixed = items.reduce((sum, x, i) => sum + (frozen[i] ? size[i] : 0), 0)
    const flex = items.reduce((sum, x, i) => sum + (frozen[i] ? 0 : x.base), 0)
    const free = avail - fixed - flex
    if (free >= 0 || !flex) break
    let clamped = false
    items.forEach((x, i) => {
      if (frozen[i]) return
      size[i] = x.base + (free * x.base) / flex
      if (size[i] < x.min) {
        size[i] = x.min
        frozen[i] = true
        clamped = true
      }
    })
    if (!clamped) break
  }
  return size
}

// How far a rail's track slides to keep the focused card 50px clear of either edge.
export const railShift = (shift, card, view, total) => {
  let next = shift
  if (card.x - next < 50) next = card.x - 50
  else if (card.x + card.w - next > view - 50) next = card.x + card.w - view + 50
  return Math.max(0, Math.min(Math.max(0, total - view), next))
}

// The footer stop's own arrow key moves: along a row, or to the nearest piece of the row above or below.
export const footerStep = (focusables, cur, dRow, dCol) => {
  const f = focusables[cur]
  if (!f) return -1
  if (dCol) {
    const row = focusables.filter((x) => x.row === f.row)
    const at = row.indexOf(f) + dCol
    return at >= 0 && at < row.length ? focusables.indexOf(row[at]) : -1
  }
  const rows = focusables.map((x) => x.row).filter((r, i, a) => a.indexOf(r) === i).sort((a, b) => a - b)
  const target = rows[rows.indexOf(f.row) + dRow]
  if (target == null) return -1
  let best = -1
  focusables.forEach((x, i) => {
    if (x.row === target && (best < 0 || Math.abs(x.x - f.x) < Math.abs(focusables[best].x - f.x))) best = i
  })
  return best
}
