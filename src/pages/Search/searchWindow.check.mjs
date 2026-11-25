import assert from 'node:assert/strict'
import { focusScroll } from './searchWindow.js'

// In view: no move.
assert.equal(focusScroll(0, 300, 600, 3000), 0)
// Partly below: bottom edge to the view's bottom.
assert.equal(focusScroll(0, 900, 1200, 3000), 120)
// Partly above: top edge to the view's top.
assert.equal(focusScroll(500, 400, 700, 3000), 400)
// Wholly below: centered.
assert.equal(focusScroll(0, 1200, 1500, 3000), 810)
// Wholly above, clamped at the top.
assert.equal(focusScroll(2000, 100, 300, 3000), 0)
// Clamped at the bottom of the content.
assert.equal(focusScroll(0, 2800, 2950, 3000), 1920)
console.log('searchWindow ok')
