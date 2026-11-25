import assert from 'node:assert/strict'
import { shownColor } from './pageColor.js'

assert.equal(shownColor('#07090fcc'), '#111319ff')
assert.equal(shownColor('#101010ff'), '#101010ff')
assert.equal(shownColor('#101010'), '#101010ff')
assert.equal(shownColor('#00000000'), '#ffffffff')
console.log('pageColor ok')
