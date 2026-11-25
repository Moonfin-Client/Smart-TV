import assert from 'node:assert'
import { placeButtons } from './placeButtons.js'

// Labels 10px a character, so widths are easy to follow.
const m = (s) => s.length * 10
const one = placeButtons([{ label: 'Play' }], m)
assert.strictEqual(one[0].w, 270)
assert.strictEqual(one[0].x, 18)
// Two wide buttons fit the 820 column as they are.
const two = placeButtons([{ label: 'Continue' }, { label: 'Start fresh!!!!!!' }], m)
assert.strictEqual(two[1].w, 60 + 48.75 + 170)
assert.strictEqual(two[1].x, 18 + 270 + 36)
// Three overflow and every one settles at the 270 floor, with its label cut to fit.
const three = placeButtons([{ label: 'Continue' }, { label: 'Start fresh!!!!' }, { label: 'nes' }], m)
assert.deepStrictEqual(three.map((b) => b.w), [270, 270, 270])
assert.strictEqual(three[1].room, 270 - 60 - 48.75)
console.log('GameDetails buttons ok')
