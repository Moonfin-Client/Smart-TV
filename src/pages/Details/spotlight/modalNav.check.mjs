// node src/pages/Details/spotlight/modalNav.check.mjs
import assert from 'node:assert/strict'
import { nextCell } from './modalNav.js'

// Two rows of three, then a centered row of one, the way a people grid wraps.
const cells = [
  { x: 0, w: 198, row: 0 }, { x: 228, w: 198, row: 0 }, { x: 456, w: 198, row: 0 },
  { x: 0, w: 198, row: 1 }, { x: 228, w: 198, row: 1 }, { x: 456, w: 198, row: 1 },
  { x: 228, w: 198, row: 2 },
].map((c, i) => ({ ...c, i }))

assert.equal(nextCell(cells, 0, 'right'), 1)
assert.equal(nextCell(cells, 2, 'right'), -1)
assert.equal(nextCell(cells, 3, 'left'), -1)
assert.equal(nextCell(cells, 5, 'down'), 6)
assert.equal(nextCell(cells, 6, 'up'), 4)
assert.equal(nextCell(cells, 1, 'up'), -1)
assert.equal(nextCell([], -1, 'down'), -1)
console.log('modalNav ok')
