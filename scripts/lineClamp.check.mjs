// node scripts/lineClamp.check.mjs: the patched renderer clamps several lines the way Chrome's
// -webkit-line-clamp does (scripts/patch-renderer.mjs, line clamp ends at a break) and still cuts one
// line at a character, as text-overflow does. Every glyph is 10 wide here.
import assert from 'node:assert/strict'
import { wrapText } from '../node_modules/@solidtv/renderer/dist/src/core/text-rendering/TextLayoutEngine.js'

const measure = (text) => text.replace(/​/g, '').length * 10
const wrap = (text, maxWidth, maxLines) =>
  wrapText(measure, text, 'test', maxWidth, 0, '…', 'break-word', maxLines)[0].map((l) => l[0].replace(/​/g, ''))

// Nothing past the last line: no ellipsis.
assert.deepEqual(wrap('aaa bbb ccc ddd eee fff', 115, 2), ['aaa bbb ccc', 'ddd eee fff'])
// The last line keeps the words it wraps to, and loses characters only to make room for the ellipsis.
assert.deepEqual(wrap('aaa bbb ccc ddd eee fff ggg', 115, 2), ['aaa bbb ccc', 'ddd eee ff…'])
assert.deepEqual(wrap('aaa bbb cc dddddd eeee', 105, 2), ['aaa bbb cc', 'dddddd…'])
// Room after the last word: a clamp leaves it, one line fills it with the next word's first letters.
assert.deepEqual(wrap('xxxxxxxxx aaa bb cccccc', 105, 2), ['xxxxxxxxx', 'aaa bb…'])
assert.deepEqual(wrap('aaa bb cccccc', 105, 1), ['aaa bb cc…'])
// Chrome breaks after a hyphen between letters, but not before a digit.
assert.deepEqual(wrap('out-of-this-world', 75, 3), ['out-of-', 'this-', 'world'])
assert.deepEqual(wrap('in 2019-2020 x', 95, 3), ['in', '2019-2020', 'x'])
console.log('lineClamp ok')
