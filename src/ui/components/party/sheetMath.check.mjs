// Self-check for sheetMath.js: node src/ui/components/party/sheetMath.check.mjs
import assert from 'node:assert/strict'
import { flowText, scrollFor } from './sheetMath.js'

// Two styles wrapping in one box, like "Long Test (2020) · 1 vote" in the vote list.
const width = (w) => w.length * 10
const lines = flowText([{ text: 'Long Test (2020)', style: 'a' }, { text: ' · 1 vote', style: 'b' }], 110, width)
assert.deepEqual(lines.map((l) => l.map((s) => `${s.style}:${s.text}@${s.x}`)), [
  ['a:Long Test@0'],
  ['a:(2020)@0', 'b: · 1@60'],
  ['b:vote@0'],
])
assert.deepEqual(flowText([{ text: 'Short', style: 'a' }], 500, width), [[{ text: 'Short', style: 'a', x: 0 }]])
assert.equal(flowText([{ text: 'Averyveryverylongword', style: 'a' }], 50, width).length, 1, 'a long word stays whole')

// Scrolling the least that shows a control
assert.equal(scrollFor(0, { y: 100, h: 50 }, 400, 1000), 0, 'already in view')
assert.equal(scrollFor(0, { y: 500, h: 50 }, 400, 1000), 150, 'below scrolls down to its bottom')
assert.equal(scrollFor(300, { y: 200, h: 50 }, 400, 1000), 200, 'above scrolls up to its top')
assert.equal(scrollFor(0, { y: 990, h: 50 }, 400, 1000), 600, 'never past the end')

console.log('sheetMath.check ok')
