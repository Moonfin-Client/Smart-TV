// node src/ui/components/books/bookGrid.check.mjs
import assert from 'node:assert/strict'
import { columnsFor, countLabel, flatten, gridMove, gridRows, lineY, over, rowIndexOf, weightOf } from './bookGrid.js'

const rows = gridRows(11, 5)
assert.deepEqual(rows, [{ start: 0, end: 5 }, { start: 5, end: 10 }, { start: 10, end: 11 }])
assert.equal(rowIndexOf(rows, 7), 1)
assert.equal(rowIndexOf(rows, 11), -1)
assert.equal(gridMove(rows, 0, 3, 'down'), 8)
assert.equal(gridMove(rows, 1, 8, 'down'), 10, 'clamped to the shorter last row')
assert.equal(gridMove(rows, 0, 0, 'left'), null)
assert.equal(gridMove(rows, 0, 4, 'right'), null)
assert.equal(gridMove(rows, 0, 2, 'up'), null)
// The titles grid beside the 414px rail fits five 253px covers.
assert.deepEqual(columnsFor(230, 120, 30, 414), { columns: 5, width: 253 })
assert.equal(countLabel(1, 'one', '{count} many'), 'one')
assert.equal(countLabel(3, 'one', '{count} many'), '3 many')
assert.equal(weightOf(600), 'bold')
assert.equal(weightOf(500), 'medium')
assert.equal(over('#000000', '#ffffff', 0.5), '#808080')
assert.equal(flatten('#ffffff'), '#ffffff')
assert.ok(Math.abs(lineY(0, 33, 20) - (33 - 20 * 1.171875) / 2 - 1) < 1e-9)
console.log('bookGrid ok')
