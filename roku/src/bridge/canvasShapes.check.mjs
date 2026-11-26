// node src/bridge/canvasShapes.check.mjs
import assert from 'node:assert/strict'
import { arcSegments, gradientStrips } from './canvasShapes.js'

const ink = (a) => (0x10101000 | a) >>> 0
const FADE = [[0, 255], [0.12, 217], [0.3, 128], [0.48, 38], [0.6, 0], [1, 0]].map(([o, a]) => [o, ink(a)])

// Fading out to the right over a 240 by 135 canvas: strips start at the left edge, end by 60%, and
// get clearer as they go, a little at a time.
const right = gradientStrips([0, 0, 240, 135, { line: [0, 0, 240, 0], stops: FADE }])
assert.ok(right.length > 10 && right.length <= 60)
assert.equal(right[0][0], 0)
const last = right[right.length - 1]
assert.ok(last[0] + last[2] <= 240 * 0.6 + 1e-9)
for (const [, y, , h] of right) assert.deepEqual([y, h], [0, 135])
for (let i = 1; i < right.length; i++) {
  assert.ok(Math.abs(right[i][0] - (right[i - 1][0] + right[i - 1][2])) < 1e-9, 'strips touch')
  const step = (right[i - 1][4] & 0xff) - (right[i][4] & 0xff)
  assert.ok(step >= 0 && step <= 255 / 48 + 1, 'alpha falls in small steps')
}

// The top fade runs up from the bottom edge, so its opaque end is at the bottom.
const top = gradientStrips([0, 0, 240, 135, { line: [0, 135, 0, 0], stops: FADE }])
const bottomMost = top.reduce((m, r) => (r[1] + r[3] > m[1] + m[3] ? r : m))
assert.equal(bottomMost[1] + bottomMost[3], 135)
assert.ok((bottomMost[4] & 0xff) > 240)
// Nothing above the fade's clear end, 60% of the way up.
for (const [, y] of top) assert.ok(y >= 135 * 0.4 - 1e-9, `strip at ${y} is above the fade`)
assert.equal(top.reduce((sum, r) => sum + r[3], 0).toFixed(6), (135 * 0.6).toFixed(6))

// A diagonal line isn't drawn.
assert.deepEqual(gradientStrips([0, 0, 10, 10, { line: [0, 0, 10, 10], stops: FADE }]), [])

// A half ring from 12 to 6 o'clock: two 1 degree end pieces and 18 between, none reaching past the
// vertical line through the center at either end.
const half = arcSegments({ x: 26, y: 26, r: 24, from: -Math.PI / 2, to: Math.PI / 2, width: 4 })
assert.equal(half.length, 20)
for (const seg of [half[0], half[half.length - 1]]) {
  const cx = seg.x + seg.w / 2
  const cy = seg.y + seg.h / 2
  const th = -seg.rotation
  const xs = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => cx + ((a * seg.w) / 2) * Math.cos(th) - ((b * seg.h) / 2) * Math.sin(th))
  assert.ok(Math.min(...xs) > 26 - 0.05, `an end piece reaches past the center line to ${Math.min(...xs)}`)
}
// Every piece is centered on the circle, give or take its share of a joint's padding.
for (const seg of half) assert.ok(Math.abs(Math.hypot(seg.x + seg.w / 2 - 26, seg.y + seg.h / 2 - 26) - 24) < 0.25)
console.log('canvasShapes ok')
