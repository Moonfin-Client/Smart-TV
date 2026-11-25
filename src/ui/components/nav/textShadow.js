// A CSS text-shadow drawn as copies of the text under it, since the renderer has no blurred text:
// one copy at the shadow's offset and a ring of copies `blur` / 2 around it, faint enough that
// where they all overlap they add up to the shadow's own alpha. `color` is '#rrggbbaa'.
const RING = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]

export const textShadowCopies = ({ x = 0, y = 0, blur = 0, color }) => {
  const r = blur / 2
  const ring = r >= 3 ? RING : RING.slice(4)
  const alpha = parseInt(color.slice(7, 9) || 'ff', 16) / 255
  // Glyph strokes sit under about half the copies.
  const each = 1 - Math.pow(1 - alpha, 2 / (ring.length + 1))
  const ink = color.slice(0, 7) + Math.round(each * 255).toString(16).padStart(2, '0')
  return [[0, 0]].concat(ring).map(([dx, dy], i) => ({ k: 's' + i, x: x + dx * r, y: y + dy * r, color: ink }))
}
