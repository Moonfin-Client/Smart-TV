import assert from 'node:assert/strict'
import { cardSide, gridRows, rowIndexOf, gridMove, keepInView, setContentWidth, clampLines } from './musicGrid.js'

// Albums: six 275px covers across the 1920 canvas inside 120 of insets with 30 gaps.
assert.equal(cardSide(6, 120, 30), 275)
assert.equal(cardSide(7, 190, 30), 221)
// Beside Quick Access's rail the same six columns share 1672.
setContentWidth(1672)
assert.equal(cardSide(6, 120, 30), 233)
setContentWidth(1920)

// Plain rows of three, and a lettered grid that starts a row at every new letter.
const plain = gridRows(7, 3)
assert.deepEqual(plain.map((r) => [r.start, r.end]), [[0, 3], [3, 6], [6, 7]])
const names = ['Abba', 'Air', 'Beck', 'Bjork', 'Blur', 'Cher']
const lettered = gridRows(names.length, 2, (i) => names[i][0])
assert.deepEqual(lettered.map((r) => [r.start, r.end, r.section, r.heading]), [
  [0, 2, 'A', true], [2, 4, 'B', true], [4, 5, 'B', false], [5, 6, 'C', true],
])
assert.equal(rowIndexOf(lettered, 4), 2)
assert.equal(rowIndexOf(lettered, 9), -1)

// Down from the second column clamps to a shorter row, and the edges give null.
assert.equal(gridMove(plain, 1, 4, 'down'), 6)
assert.equal(gridMove(plain, 0, 0, 'left'), null)
assert.equal(gridMove(plain, 2, 6, 'down'), null)
assert.equal(gridMove(plain, 1, 5, 'up'), 2)

// In view stays, partly out comes just far enough, wholly out comes to the middle, an item taller
// than the view shows its top 24 down, all held inside the scroll range.
assert.equal(keepInView(0, 100, 200, 500, 1000), 0)
assert.equal(keepInView(0, 450, 600, 500, 1000), 100)
assert.equal(keepInView(0, 700, 800, 500, 1000), 500)
assert.equal(keepInView(300, 250, 350, 500, 1000), 250)
assert.equal(keepInView(0, 1400, 1600, 500, 1000), 1000)
assert.equal(keepInView(0, 600, 1300, 500, 2000), 576)

// Line clamp: short text stays, a third line goes with the ellipsis after the second line's words,
// and a second line too long for the ellipsis loses characters.
const fits = (s) => s.length <= 8
assert.equal(clampLines(['Random', 'Access'], 2, fits), 'Random\nAccess')
assert.equal(clampLines(['Random', 'Access', 'Memories'], 2, fits), 'Random\nAccess\u2026')
assert.equal(clampLines(['Random', 'Accessory', 'Memories'], 2, fits), 'Random\nAccesso\u2026')

console.log('musicGrid ok')
