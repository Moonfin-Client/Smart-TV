// node --conditions=browser src/pages/Details/premiere/layout.check.mjs
import assert from 'node:assert/strict'
import { stubUnloadable } from '../../../../scripts/stubUnloadable.mjs'

stubUnloadable()
globalThis.window = globalThis.window || { innerWidth: 1920 }
const { fitLines, premiereLeft, premiereSkeleton, wrapSpaced } = await import('./layout.js')

// Only the classic sidebar moves the page in. Reel's and Mosaic's control sits inside its 154px.
assert.equal(premiereLeft('rail'), 200)
assert.equal(premiereLeft('control'), 154)
assert.equal(premiereLeft(null), 154)

// Letter spacing counts toward the wrap.
const w = wrapSpaced('aa bb cc', 10, 'regular', 1e6, 0)
assert.deepEqual(w.lines, ['aa bb cc'])
const narrow = wrapSpaced('aa bb cc', 10, 'regular', w.width('aa bb'), 0)
assert.deepEqual(narrow.lines, ['aa bb', 'cc'])
const spaced = wrapSpaced('aa bb cc', 10, 'regular', w.width('aa bb'), 1)
assert.deepEqual(spaced.lines, ['aa', 'bb', 'cc'])
// Lines also break after a hyphen, which stays on the line it ends.
const hy = wrapSpaced('xx life-or-death', 10, 'regular', w.width('xx life-or-'), 0)
assert.deepEqual(hy.lines, ['xx life-or-', 'death'])
assert.deepEqual(wrapSpaced('a - b', 10, 'regular', 1e6, 0).lines, ['a - b'])

// The overview keeps whole lines, the last one cut at a word, and none when one won't fit.
assert.deepEqual(fitLines(['one two', 'three four', 'five'], 70.2, 35.1), ['one two', 'three…'])
assert.deepEqual(fitLines(['one two'], 35.1, 35.1), ['one two'])
assert.deepEqual(fitLines(['one two'], 20, 35.1), [])

// The skeleton's button row sits centered over the hero, 90px off the foot.
const sk = premiereSkeleton(154, '#fff')
const b0 = sk.find((b) => b.k === 'b0')
assert.equal(b0.y, 1080 - 90 - 83.5)
assert.equal(Math.round(b0.x + (250 + 4 * 103.5) / 2), Math.round(154 + (1920 - 308) / 2))
console.log('premiere layout ok')
