import assert from 'node:assert/strict'
import { reelDistance, reelSlot } from './reelMath.js'

// Ten entries around Home (0): the last two sit above it, the next two below.
assert.deepEqual([8, 9, 0, 1, 2].map((i) => reelDistance(i, 0, 10)), [-2, -1, 0, 1, 2])
// Halfway round a list of ten lands below, never twice.
assert.equal(reelDistance(5, 0, 10), 5)
assert.equal(reelDistance(4, 9, 10), 5)
// Three entries fill three slots.
assert.deepEqual([0, 1, 2].map((i) => reelDistance(i, 1, 3)), [-1, 0, 1])
assert.deepEqual(reelSlot(-1), { x: 45, y: -111, s: 0.72, a: 0.62 })
assert.deepEqual(reelSlot(6), { x: 18, y: 330, s: 0.4, a: 0 })
console.log('reelMath ok')
