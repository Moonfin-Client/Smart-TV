// node src/pages/Details/modern/scroll.check.mjs
import assert from 'node:assert/strict'
import { scrollFor } from './scroll.js'

// A piece already 48px clear of both edges leaves the page where it is.
assert.equal(scrollFor(0, 2000, { y: 400, h: 75 }, null), 0)
// Past the bottom: the piece's foot goes 48px above the screen's edge.
assert.equal(scrollFor(0, 3000, { y: 1100, h: 200 }, null), 1100 + 200 - 1080 + 48)
// Near the page's end it rounds to the end, taking the whole grid along.
assert.equal(scrollFor(0, 1187, { y: 903, h: 226 }, { y: 614, h: 545 }), 107)
// The first row of that grid is already in view, so nothing moves.
assert.equal(scrollFor(0, 1187, { y: 614, h: 259 }, { y: 614, h: 545 }), 0)
// Above the top: the piece goes to the top of the screen, or the page to its top within 48px.
assert.equal(scrollFor(500, 3000, { y: 520, h: 63 }, null), 500)
assert.equal(scrollFor(500, 3000, { y: 450, h: 63 }, null), 450)
assert.equal(scrollFor(500, 3000, { y: 30, h: 63 }, null), 0)
// A container taller than the screen starts at its own top.
assert.equal(scrollFor(0, 4000, { y: 900, h: 300 }, { y: 700, h: 2000 }), 700)
console.log('scroll ok')
