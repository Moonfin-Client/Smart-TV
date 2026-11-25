// node src/ui/components/shell/loading/loading.check.mjs
// The loading animation's layout tables, placement and bounce, the screensaver keyframes and the
// logo crop math.
import assert from 'node:assert/strict'
import { POSITION_LAYOUT, SIZE_LAYOUT, SPEED_MULTIPLIER, anchoredAt, bounceAt, bounceStart, bounceStep, facesLeft } from './layout.js'
import { gradientFrame, sample } from '../saver/gradient.js'
import { logoCrop } from '../saver/logo.js'
import { trimmedLogo } from '../../../../utils/logoAutocrop.js'

assert.deepEqual(SIZE_LAYOUT.thumbnail, { pixelSize: 36, labelSpacing: 8, labelFontSize: 10, labelLetterSpacing: 1.5 })
assert.deepEqual(SIZE_LAYOUT.small, { pixelSize: 64, labelSpacing: 14, labelFontSize: 12, labelLetterSpacing: 2.5 })
assert.deepEqual(SIZE_LAYOUT.medium, { pixelSize: 110, labelSpacing: 24, labelFontSize: 14, labelLetterSpacing: 3.5 })
assert.deepEqual(SIZE_LAYOUT.large, { pixelSize: 170, labelSpacing: 40, labelFontSize: 16, labelLetterSpacing: 4 })
assert.deepEqual(SPEED_MULTIPLIER, { slow: 0.45, moderate: 0.7, fast: 1.0, ultra: 1.6 })
assert.deepEqual(
  Object.keys(POSITION_LAYOUT).map((k) => [k, POSITION_LAYOUT[k].x, POSITION_LAYOUT[k].y]),
  [
    ['topLeft', -1, -1], ['topCenter', 0, -1], ['topRight', 1, -1],
    ['middleLeft', -1, 0], ['middle', 0, 0], ['middleRight', 1, 0],
    ['bottomLeft', -1, 1], ['bottomCenter', 0, 1], ['bottomRight', 1, 1],
    ['bouncing', 0, 0],
  ]
)
assert.deepEqual(Object.keys(POSITION_LAYOUT).filter(facesLeft), ['topRight', 'middleRight', 'bottomRight'])
// topCenter's padding is the CSS shorthand '40px 24px 0' written out.
assert.deepEqual(POSITION_LAYOUT.topCenter.padding, [40, 24, 0, 24])

// A 190.5 by 150 overlay (the medium logo and its label) laid out in the middle.
assert.deepEqual(anchoredAt('middle', 190.5, 150), { x: 864.75, y: 465 })
assert.deepEqual(anchoredAt('topLeft', 100, 50), { x: 40, y: 40 })
assert.deepEqual(anchoredAt('bottomRight', 100, 50), { x: 1780, y: 990 })
assert.deepEqual(anchoredAt('middleLeft', 100, 50), { x: 40, y: 515 })
assert.deepEqual(anchoredAt('bottomCenter', 100, 50), { x: 910, y: 990 })

// The bounce turns off the walls and stays in the area 40px in.
const m = bounceStart()
for (let i = 0; i < 20000; i++) {
  bounceStep(m, 16, 1.6)
  const at = bounceAt(m, 110, 150)
  assert.ok(at.x >= 40 && at.x <= 1920 - 40 - 110 && at.y >= 40 && at.y <= 1080 - 40 - 150)
}
// A long gap moves it no further than 50ms would.
const g = bounceStart()
bounceStep(g, 5000, 1)
assert.ok(Math.abs(g.x - (-0.5 + 0.42 * 0.05)) < 1e-9)

// Screensaver keyframes run straight between the listed steps.
assert.equal(sample([0, 10], 0, 1000), 0)
assert.equal(sample([0, 10], 500, 1000), 5)
assert.equal(sample([0, 10, 0], 750, 1000), 5)
const f = gradientFrame('moonfin', 4500)
assert.ok(Math.abs(f.rotation - Math.PI / 2) < 1e-9)
assert.ok(Math.abs(f.orbitScale - 1.12) < 1e-9)
const d = gradientFrame('moonfin', 6750)
assert.ok(Math.abs(d.driftX - 0.1848 * 1920) < 1e-6 && Math.abs(d.driftY + 0.1131 * 1080) < 1e-6 && Math.abs(d.driftScale - 1.49) < 1e-9)
assert.ok(Math.abs(gradientFrame('neonPulse', 3375).flash) < 1e-9)

// The crop read back from autocrop's style is the one it was built from, including a trim padded
// taller than the image.
const back = (left, across, top, down) => {
  const r = trimmedLogo('u', { minX: 0, minY: 0, maxX: 0, maxY: 0 }, 1, 1, 100, 100)
  const at = (offset, size) => (size === 1 ? 0 : (offset / (1 - size)) * 100)
  r.style.backgroundSize = `${100 / across}% ${100 / down}%`
  r.style.backgroundPosition = `${at(left, across)}% ${at(top, down)}%`
  return logoCrop(r)
}
for (const c of [[0, 1, -0.06, 1.12], [0.1, 0.7, 0.05, 0.8], [0.2, 0.5, -0.02, 0.9]]) {
  const r = back(...c)
  assert.ok(Math.abs(r.left - c[0]) < 1e-9 && Math.abs(r.across - c[1]) < 1e-9 && Math.abs(r.top - c[2]) < 1e-9 && Math.abs(r.down - c[3]) < 1e-9, JSON.stringify([c, r]))
}

console.log('loading and screensaver checks pass')
