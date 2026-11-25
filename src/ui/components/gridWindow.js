// Grid's window and scroll math, kept plain so its check runs in node.

// How far a `gap` grid scrolls to show the line at `top`: a line past the far edge comes in until it
// sits `affordance` short of it, and one before the near edge lines up with it. `step` includes the
// gap, the card doesn't.
export const edgeOffset = ({ px, top, step, gap, room, lines, affordance }) => {
  const toEnd = Math.max(0, room - (step - gap) - affordance)
  let next = px
  if (top > next + toEnd) next = top - toEnd
  else if (top < next) next = top
  return Math.max(0, Math.min(next, lines * step - gap - room))
}

// The items drawn, from `from` up to `to`, each with its slot. A tile grid reuses `pool` slots, so a
// scrolled line re-fills the tiles that left.
export const windowOf = ({ count, lanes, from, to, pool, tile }) => {
  const out = []
  for (let i = from; i < Math.min(count, to); i++) {
    out.push({ i, slot: tile ? 's' + (i % pool) : null, lane: i % lanes, line: Math.floor(i / lanes) })
  }
  return out
}
