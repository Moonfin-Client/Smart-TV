// node src/ui/components/account/gradient.check.mjs
import assert from 'node:assert/strict'
import { cssStops } from './gradient.js'

const { colors, stops } = cssStops([0x000000ff, 0xff0000ff, 0xffffff00], [0, 0.5, 1], 5)
assert.deepEqual(stops, [0, 0.25, 0.5, 0.75, 1])
assert.equal(colors[0], 0x000000ff)
assert.equal(colors[2], 0xff0000ff)
assert.equal(colors[4], 0xffffff00)
// A quarter of the way along the first half is halfway from black to red, still opaque.
assert.equal(colors[1], 0x800000ff)
// Halfway between red and transparent white is red at half alpha, as CSS blends premultiplied.
assert.equal(colors[3], 0xff000080)
console.log('gradient ok')

import { cssShadow } from './gradient.js'
// 0 10px 26.7px on a 66.8 tile with 20 corners: the tile itself carries the CSS values.
const s = cssShadow(66.8, 66.8, 20, { y: 10, blur: 26.7, color: '#00a4dc59' })
assert.deepEqual([s.x, s.y, s.w, s.h, s.r], [0, 0, 66.8, 66.8, 20])
assert.deepEqual(s.shadow, { color: '#00a4dc59', x: 0, y: 10, blur: 26.7, spread: 0 })
// A radius past half the box clamps to a pill, as CSS does.
const t = cssShadow(100, 50, 40, { blur: 8, spread: 8, color: '#000000' })
assert.equal(t.r, 25)
console.log('shadow ok')
