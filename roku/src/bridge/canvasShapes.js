// The shapes a canvas drawing records that SceneGraph has no node for, as plain Rectangles.

// A canvas gradient fill as flat strips across its line. The Effect's gradient takes its alpha from
// the Rectangle's own color, so it can't fade to clear, and strips can. Each strip changes alpha by
// at most STRIP_STEP, too little to see. Only lines along an axis, the only ones SolidTV bakes.
const STRIP_STEP = 1 / 48
const channel = (c, shift) => (c >>> shift) & 0xff
const mix = (a, b, t) => {
  let out = 0
  for (const shift of [24, 16, 8, 0]) out = out * 256 + Math.round(channel(a, shift) + (channel(b, shift) - channel(a, shift)) * t)
  return out >>> 0
}
export const gradientStrips = ([x, y, w, h, fill]) => {
  const [x0, y0, x1, y1] = fill.line
  const across = y0 === y1
  if (!across && x0 !== x1) return []
  const from = across ? x0 : y0
  const span = (across ? x1 : y1) - from
  const lo = across ? x : y
  const hi = lo + (across ? w : h)
  const stops = fill.stops.slice().sort((p, q) => p[0] - q[0])
  // The ends hold their colors out to the rect's edges.
  const pieces = [[-Infinity, stops[0][0], stops[0][1], stops[0][1]]]
  for (let i = 1; i < stops.length; i++) pieces.push([stops[i - 1][0], stops[i][0], stops[i - 1][1], stops[i][1]])
  pieces.push([stops[stops.length - 1][0], Infinity, stops[stops.length - 1][1], stops[stops.length - 1][1]])
  const out = []
  for (const [t0, t1, c0, c1] of pieces) {
    const n = Math.max(1, Math.ceil(Math.abs(channel(c1, 0) - channel(c0, 0)) / 255 / STRIP_STEP))
    // The open pieces at the ends are one strip, so their infinite end is never interpolated.
    const at = (k) => (k === 0 ? t0 : k === n ? t1 : t0 + ((t1 - t0) * k) / n)
    for (let k = 0; k < n; k++) {
      const color = mix(c0, c1, (k + 0.5) / n)
      if (!channel(color, 0)) continue
      const ends = [from + span * at(k), from + span * at(k + 1)].map((v) => (isNaN(v) ? lo : v))
      const a = Math.max(lo, Math.min(...ends))
      const b = Math.min(hi, Math.max(...ends))
      if (b <= a) continue
      out.push(across ? [a, y, b - a, h, color] : [x, a, w, b - a, color])
    }
  }
  return out
}

// A stroked arc as Rectangles, each centered on the arc and turned along it. The ends are 1 degree
// pieces, so their square ends sit on the arc's ends instead of poking past them, and the rest are
// 10 degrees or less, a touch longer than their chords where two meet. Canvas angles turn clockwise
// on screen and a SceneGraph rotation counterclockwise, hence the minus.
const END_PIECE = Math.PI / 180
const JOINT = 0.375
export const arcSegments = ({ x, y, r, from, to, width }) => {
  const dir = to > from ? 1 : -1
  const span = Math.abs(to - from)
  const cuts = [from]
  if (span > 3 * END_PIECE) {
    const n = Math.max(1, Math.ceil((span - 2 * END_PIECE) / (Math.PI / 18)))
    const step = (span - 2 * END_PIECE) / n
    cuts.push(from + dir * END_PIECE)
    for (let i = 1; i <= n; i++) cuts.push(from + dir * (END_PIECE + i * step))
  }
  cuts.push(to)
  const out = []
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a0 = cuts[i]
    const a1 = cuts[i + 1]
    const padStart = i > 0 ? JOINT : 0
    const padEnd = i + 2 < cuts.length ? JOINT : 0
    const w = 2 * r * Math.sin(Math.abs(a1 - a0) / 2) + padStart + padEnd
    const a = (a0 + a1) / 2
    // Off center along the arc by half the difference in padding, so the unpadded end stays put.
    const shift = (dir * (padEnd - padStart)) / 2
    const cx = x + r * Math.cos(a) - shift * Math.sin(a)
    const cy = y + r * Math.sin(a) + shift * Math.cos(a)
    out.push({ x: cx - w / 2, y: cy - width / 2, w, h: width, rotation: -(a + Math.PI / 2) })
  }
  return out
}
