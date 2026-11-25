// Where an episode rail's track sits, in pixels scrolled from its start. `w` is the rail's own width and
// `view` that plus the margin it runs on into on the right, which is padding at the track's end, so
// the track can scroll until its last card meets the edge of `w`.
const CLEARANCE = 50

const clamp = (s, n, cw, gap, w) => Math.max(0, Math.min(s, n * (cw + gap) - gap - w))

// A rail that opens on a later card is scrolled to show it 50px in from the left.
export const railScroll = (start, cw, gap, n, w) => (start > 0 ? clamp(start * (cw + gap) - CLEARANCE, n, cw, gap, w) : 0)

// The least scroll that keeps the focused card 50px clear of either edge of the view.
export const revealScroll = (scroll, i, cw, gap, n, w, view) => {
  const left = i * (cw + gap) - scroll
  let s = scroll
  if (left < CLEARANCE) s -= CLEARANCE - left
  else if (left + cw > view - CLEARANCE) s += left + cw - (view - CLEARANCE)
  return clamp(s, n, cw, gap, w)
}
