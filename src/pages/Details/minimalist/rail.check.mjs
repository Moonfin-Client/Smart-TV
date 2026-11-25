// Self-check for the rail's scroll: node src/pages/Details/minimalist/rail.check.mjs
import assert from 'node:assert/strict'
import { railScroll, revealScroll } from './rail.js'

// An episode page: the second card of 266 + 20 opens 50px in, on a 1688 rail.
assert.equal(railScroll(1, 266, 20, 9, 1688), 236)
assert.equal(railScroll(0, 266, 20, 9, 1688), 0)
// A short rail never scrolls.
assert.equal(railScroll(2, 266, 20, 3, 1688), 0)
// Focus past the right edge scrolls the least that clears it by 50.
assert.equal(revealScroll(0, 6, 266, 20, 12, 1688, 1688), 6 * 286 + 266 - 1638)
// Back to the first card scrolls home.
assert.equal(revealScroll(236, 0, 266, 20, 9, 1688, 1688), 0)
// A card already in view leaves it alone.
assert.equal(revealScroll(236, 3, 266, 20, 9, 1688, 1688), 236)
// The margin on the right is room to show the last card in, 50px clear of the view's edge.
assert.equal(revealScroll(0, 9, 350, 34, 10, 1200, 1280), 9 * 384 + 350 - 1230)
// and the track never scrolls past the end of its cards.
assert.equal(revealScroll(5000, 9, 350, 34, 10, 1200, 1280), 10 * 384 - 34 - 1200)
console.log('rail ok')
