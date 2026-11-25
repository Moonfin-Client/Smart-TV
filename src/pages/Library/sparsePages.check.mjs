import assert from 'node:assert/strict'
import { createSparse, missingBatches, placePage, unloadDistant } from './sparsePages.js'

const s = createSparse(250)
assert.deepEqual(missingBatches(s, 0, 40), [0])
assert.deepEqual(missingBatches(s, 90, 230), [0, 100, 200])
placePage(s, 0, Array.from({ length: 100 }, (_, i) => ({ i })))
s.pending[200] = true
assert.deepEqual(missingBatches(s, 0, 250), [100])
delete s.pending[200]
placePage(s, 200, Array.from({ length: 50 }, (_, i) => ({ i })))
// A short last page is never asked for again, since none of its slots are empty.
assert.deepEqual(missingBatches(s, 200, 250), [])

const big = createSparse(2000)
for (let b = 0; b < 1000; b += 100) placePage(big, b, Array.from({ length: 100 }, () => ({})))
assert.equal(unloadDistant(big, 900), 600)
assert.equal(big.slots[599], null)
assert.ok(big.slots[600])
assert.deepEqual(big.ranges[0], { start: 600, end: 699 })
assert.deepEqual(missingBatches(big, 500, 700), [500])
console.log('sparsePages ok')
