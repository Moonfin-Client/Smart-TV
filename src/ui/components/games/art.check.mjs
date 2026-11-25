import assert from 'node:assert'
import { hslToHex } from './art.js'
// What a browser computes for the same hsl() colors.
assert.strictEqual(hslToHex(0, 0.45, 0.26), '#602424')
assert.strictEqual(hslToHex(120, 0.45, 0.26), '#246024')
assert.strictEqual(hslToHex(290, 0.45, 0.26), '#562460')
console.log('art ok')
