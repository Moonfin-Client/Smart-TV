import assert from 'node:assert/strict'
import { chipRowLayout } from './chipRow.js'

// Chips that fit end at the column's right edge.
const fit = chipRowLayout([{ w: 100 }, { w: 50 }], 1000, 10)
assert.equal(fit.boxW, 170)
assert.equal(fit.boxX, 830)
assert.equal(fit.boxX + fit.items[1].off + fit.items[1].w, 1000)
assert.equal(fit.max, 0)
// Chips that don't fit start at the left and scroll by what's left over.
const over = chipRowLayout([{ w: 600 }, { w: 600 }], 1000, 10)
assert.equal(over.boxX, 0)
assert.equal(over.items[0].off, 10)
assert.equal(over.max, 220)
console.log('chipRow ok')
