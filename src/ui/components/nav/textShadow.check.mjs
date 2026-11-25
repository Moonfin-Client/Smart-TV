import assert from 'node:assert/strict'
import { textShadowCopies } from './textShadow.js'
const drop = textShadowCopies({ x: 0, y: 2, blur: 4, color: '#00000080' })
assert.equal(drop.length, 5)
assert.deepEqual([drop[0].x, drop[0].y], [0, 2])
const each = parseInt(drop[0].color.slice(7), 16) / 255
// Half the copies stacked come back to the shadow's alpha.
assert.ok(Math.abs(1 - Math.pow(1 - each, drop.length / 2) - 0.5) < 0.02)
const glow = textShadowCopies({ blur: 8, color: '#ff2e9259' })
assert.equal(glow.length, 9)
assert.ok(glow.every((c) => Math.hypot(c.x, c.y) <= 4.01))
console.log('textShadow ok')
