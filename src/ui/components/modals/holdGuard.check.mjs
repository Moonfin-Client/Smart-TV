// node src/ui/components/modals/holdGuard.check.mjs
import assert from 'node:assert/strict'
import { holdGuard } from './holdGuard.js'

let t = 0
const clock = () => t

// Opened by a hold: the repeats are dropped, the release is dropped, then OK works.
let g = holdGuard(true, clock)
t = 80
assert.equal(g.down(), true)
t = 130
assert.equal(g.down(), true)
assert.equal(g.up(), true)
t = 900
assert.equal(g.down(), false)
assert.equal(g.up(), false)

// The key-up never came: a press after a pause no repeat leaves is a new one.
g = holdGuard(true, clock)
t = 950
assert.equal(g.down(), true)
t = 1400
assert.equal(g.down(), false)

// Not opened by a hold: nothing is dropped.
g = holdGuard(false, clock)
assert.equal(g.down(), false)
assert.equal(g.up(), false)
console.log('holdGuard ok')
