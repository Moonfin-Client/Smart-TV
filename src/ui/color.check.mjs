import assert from 'node:assert/strict'
import { hex } from './themeColor.js'

assert.equal(hex('#ff000080'), 0xff000080)
assert.equal(hex('#00a4dc'), 0x00a4dcff)
assert.equal(hex('#ffffffff'), 0xffffffff, 'stays unsigned')
assert.equal(hex(0x11223344), 0x11223344)
assert.equal(hex(''), 0)
assert.equal(hex(null), 0)
console.log('color ok')
