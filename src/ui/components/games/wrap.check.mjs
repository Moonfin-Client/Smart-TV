import assert from 'node:assert'
import { lineCount } from './wrap.js'
// Every character 10px wide, so the wrap points are easy to see.
const m = (s) => s.length * 10
assert.strictEqual(lineCount('', 10, 'regular', 100, m), 0)
assert.strictEqual(lineCount('aaaa bbbb', 10, 'regular', 100, m), 1)
assert.strictEqual(lineCount('aaaa bbbb c', 10, 'regular', 100, m), 2)
assert.strictEqual(lineCount('aaaaaaaaaaaa', 10, 'regular', 100, m), 1)
assert.strictEqual(lineCount('aaaa bbbb cccc dddd eeee', 10, 'regular', 90, m), 3)
console.log('wrap ok')
