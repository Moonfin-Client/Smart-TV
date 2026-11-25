import assert from 'node:assert/strict'
import { holdSeekSeconds, holdStep } from './heldSeek.js'

assert.equal(holdSeekSeconds(10, 1), 10)
assert.equal(holdSeekSeconds(10, 4), 30)
assert.equal(holdSeekSeconds(45, 4), 45)
assert.equal(holdSeekSeconds(10, 9), 60)
assert.equal(holdSeekSeconds(10, 17), 180)

let h = null
const moves = []
for (let i = 0; i < 9; i++) {
  const r = holdStep(h, 1, 10, 1000 + i * 100)
  h = r.hold
  moves.push(r.delta)
}
assert.deepEqual(moves, [10, 10, 10, 30, 30, 30, 30, 30, 60])
// A turn the other way, or a gap past a repeat, starts over.
assert.equal(holdStep(h, -1, 10, 2000).delta, -10)
assert.equal(holdStep(h, 1, 10, 1800 + 1000).delta, 10)
// A key up clears the count.
assert.equal(holdStep({ ...h, count: 0 }, 1, 10, 1900).delta, 10)
console.log('heldSeek ok')
