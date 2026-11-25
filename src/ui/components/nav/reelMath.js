// Where Reel's entries sit, with no imports so the check runs in node.

// How far entry `i` sits from the window, wrapping around a list of `count`, so a short list fills
// fewer slots instead of showing an entry twice.
export const reelDistance = (i, center, count) => {
  let d = (((i - center) % count) + count) % count
  if (d > count / 2) d -= count
  return d
}

// Slot 4 waits hidden so an entry turning into view fades in.
const SLOTS = {
  0: { x: 60, y: 0, s: 1, a: 1 },
  1: { x: 45, y: 111, s: 0.72, a: 0.62 },
  2: { x: 33, y: 201, s: 0.56, a: 0.36 },
  3: { x: 24, y: 273, s: 0.46, a: 0.16 },
  4: { x: 18, y: 330, s: 0.4, a: 0 },
}

export const reelSlot = (d) => {
  const s = SLOTS[Math.min(4, Math.abs(d))]
  return { x: s.x, y: d < 0 ? -s.y : s.y, s: s.s, a: s.a }
}
