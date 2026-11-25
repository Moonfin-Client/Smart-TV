import assert from 'node:assert/strict'
import { focusScroll } from './focusScroll.js'

// Atlas's tabs with every library listed: a tab partly past the edge shows just enough, and the
// next, starting right at the edge, comes to the middle.
const atlas = (x, w, s) => focusScroll(x, w, s, 1472, 3900 - 1472)
assert.equal(atlas(1241, 189, 0), 0)
assert.equal(atlas(1430, 201, 0), 159)
assert.equal(atlas(1631, 194, 159), 992)
assert.equal(atlas(2443, 241, 992), 1212)
assert.equal(atlas(2684, 183, 1212), 2040)
assert.equal(atlas(3443, 189, 2040), 2160)
assert.equal(atlas(3632, 268, 2160), 2428)
// Tabline's tabs, 45px apart, so the next one is often wholly out and comes to the middle.
const tabline = (x, w, s) => focusScroll(x, w, s, 1358, 2605 - 1358)
assert.equal(tabline(1374, 68, 0), 729)
assert.equal(tabline(1876, 274, 729), 792)
assert.equal(tabline(2195, 66, 792), 1247)
// The classic bar's pill, its buttons 2px apart.
assert.equal(focusScroll(1184, 339, 0, 1400, 345), 123)
// A dialog's scrollport inside its 1px border, as OverflowMenu and PanelDialog call it. Add to
// Collection has rows 68 tall every 72 from 86, in an 822 tall dialog. Walking down, the 11th row is
// cut by the bottom and scrolls just in, the 12th is out of view and is centered, and the next two
// are already in view.
const dialog = (s, i, viewH = 822, fullH = 3000) => focusScroll(86 + 72 * i - 1, 68, s, viewH - 2, fullH - viewH)
let s = 0
const seen = []
for (let i = 0; i <= 13; i++) {
  s = dialog(s, i)
  seen.push(s)
}
assert.deepEqual(seen.slice(9), [0, 53, 501, 501, 501])
// Back up: a row cut by the top scrolls just in.
assert.equal(dialog(501, 5), 445)
// A dialog with nothing to scroll stays put.
assert.equal(dialog(0, 3, 822, 500), 0)
console.log('focusScroll ok')
