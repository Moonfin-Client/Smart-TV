// node src/ui/components/shell/seasonal/seasonal.check.mjs
// Checks the keyframe sampler against the keyframe stops.
import assert from 'node:assert/strict'
import { KEYFRAMES, progress, sample } from './keyframes.js'

const closeTo = (a, b, digits = 2) => Math.abs(a - b) < Math.pow(10, -digits) / 2

// The sampler lands on each stop and moves linearly between them.
const snow = KEYFRAMES.snow1
assert.equal(sample(snow.y, 0), -12)
assert.equal(sample(snow.y, 1), 112)
assert.ok(closeTo(sample(snow.y, 0.5), 50, 1))
assert.ok(closeTo(sample(snow.r, 0), 0, 1))
// Step-end movers hold each spot for a fifth of their cycle.
assert.equal(sample(KEYFRAMES.moveA.x, 0.19), 22)
assert.equal(sample(KEYFRAMES.moveA.x, 0.2), 66)
// The rocket stays dark until 8 percent, and the ring's sparks fade out by the end.
assert.equal(sample(KEYFRAMES.rocketRise.o, 0.05), 0)
assert.equal(sample(KEYFRAMES.rocketRise.y, 0.05), 72)
assert.equal(sample(KEYFRAMES.burstRing.o, 1), 0)
// Negative delays start part way, alternate runs every other pass backwards, one-shots end.
assert.ok(closeTo(progress(0, 10, -2.5), 0.25))
assert.ok(closeTo(progress(1.25, 1, 0, true), 0.75))
assert.equal(progress(3, 2.6, 0, false, true), null)

console.log('seasonal: the keyframe checks pass')
