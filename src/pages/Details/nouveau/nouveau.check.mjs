// Self-check for Nouveau's layout rules: node src/pages/Details/nouveau/nouveau.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// The app's modules lean on Vite for imports without an extension.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { footerStep, overviewHeight, pageGeometry, pinFor, railShift, shrinkRow } = await import('./geometry.js')

// Beside the docked sidebar the content starts 176px in and a rail gets 1688px, and along the top it's 56 and 1808.
assert.deepEqual(pageGeometry('rail', 'left'), { left: 176, viewport: 1688, heroTop: 56, inset: 56 })
assert.deepEqual(pageGeometry(null, 'top'), { left: 56, viewport: 1808, heroTop: 135, inset: 135 })
assert.equal(pageGeometry('control', 'left').left, 120)

// A rail pins its section's top 56px down, a lower rail of a tall section its own top, and never past the end.
assert.equal(pinFor({ sectionTop: 605.6, y: 605.6, h: 587.7 }, 56, 5000), 549.6)
assert.equal(pinFor({ sectionTop: 1257, y: 1781, h: 524 }, 56, 5000), 1725)
assert.equal(pinFor({ sectionTop: 1257, y: 1257, h: 524 }, 56, 5000), 1201)
assert.equal(pinFor({ sectionTop: 4000, y: 4000, h: 300 }, 56, 3500), 3500)

// A rail slides only as far as keeps the card 50px clear, and never past either end.
assert.equal(railShift(0, { x: 0, w: 280 }, 1688, 3000), 0)
assert.equal(railShift(0, { x: 1560, w: 280 }, 1688, 3000), 1560 + 280 - 1688 + 50)
assert.equal(railShift(500, { x: 400, w: 280 }, 1688, 3000), 350)
assert.equal(railShift(0, { x: 2800, w: 200 }, 1688, 3000), 3000 - 1688)

// A badge row past the column squeezes only what can wrap: Continuing and Seerr's pill keep their
// width and the next episode's badge takes the rest.
assert.deepEqual(shrinkRow([{ base: 152, min: 152 }, { base: 256, min: 113 }, { base: 393, min: 393 }], 680, 9), [152, 117, 393])
assert.deepEqual(shrinkRow([{ base: 100, min: 50 }, { base: 100, min: 50 }], 680, 9), [100, 100])
assert.deepEqual(shrinkRow([{ base: 300, min: 50 }, { base: 100, min: 50 }], 209, 9), [150, 50])

// The footer walks along its studio row, then down to the nearest piece of the next row.
const pieces = [{ row: 0, x: 0 }, { row: 0, x: 160 }, { row: 1, x: 0 }, { row: 2, x: 0 }]
assert.equal(footerStep(pieces, 0, 0, 1), 1)
assert.equal(footerStep(pieces, 1, 0, 1), -1)
assert.equal(footerStep(pieces, 1, 1, 0), 2)
assert.equal(footerStep(pieces, 2, -1, 0), 0)
assert.equal(footerStep(pieces, 3, 1, 0), -1)

// The overview: three plain lines, or the box with Read More, 2px shorter while focused, open up to 319px.
assert.equal(overviewHeight({ canToggle: false, lines: 2 }, false, false), 2 * 24.48)
assert.ok(Math.abs(overviewHeight({ canToggle: true, lines: 4 }, false, false) - 154.44) < 0.01)
assert.ok(Math.abs(overviewHeight({ canToggle: true, lines: 4 }, false, true) - 152.44) < 0.01)
assert.ok(Math.abs(overviewHeight({ canToggle: true, lines: 4 }, true, true) - 176.92) < 0.01)
assert.equal(overviewHeight({ canToggle: true, lines: 20 }, true, false), 319)
console.log('nouveau ok')
