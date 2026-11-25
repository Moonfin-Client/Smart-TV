// Self-check for makdLayout.js: node src/ui/components/home/makdLayout.check.mjs
import assert from 'node:assert/strict'
import { activeDotIndex, fitImage, flowWrap, makdOverlay } from './makdLayout.js'

assert.deepEqual([0, 1, 2, 3, 4].map((i) => activeDotIndex(i, 5)), [0, 1, 2, 3, 4])
assert.equal(activeDotIndex(2, 3), 2)
assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => activeDotIndex(i, 10)), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4])
assert.equal(activeDotIndex(11, 12), 4)

const near = (a, b) => assert.ok(Math.abs(a - b) < 0.05, `${a} is not ${b}`)

// The Glassworker's info line: the zoomed ratings span, a dot, the year, a dot and the end time, all
// on one 38.18px line starting 5px in from the row's -5px margin.
const z = 0.83
const line = flowWrap(
  [
    { k: 'r', w: 504, h: 33.2, ml: 5 * z, mr: 5 * z, mb: 6 * z },
    { k: 's1', w: 10, h: 10 },
    { k: 'y', w: 36, h: 27 },
    { k: 's2', w: 10, h: 10 },
    { k: 'e', w: 132, h: 27 },
  ],
  883.2,
  10,
  6
)
const at = Object.fromEntries(line.items.map((p) => [p.k, p]))
near(at.r.x, -0.85)
near(at.s1.x, 512.3)
near(at.y.x, 532.3)
near(at.e.x, 598.3)
near(at.r.y, 0)
near(at.y.y, 2.59)
near(at.s1.y, 11.09)
assert.equal(line.lines, 1)
near(line.h, 32.18)

// Past the width the next item starts a line of its own, and a dot can end a line.
const wrapped = flowWrap([{ w: 600, h: 27 }, { w: 10, h: 10 }, { w: 280, h: 27 }], 883.2, 10, 6)
assert.equal(wrapped.lines, 2)
near(wrapped.items[1].x, 610)
near(wrapped.items[2].x, 0)
near(wrapped.items[2].y, 33)
near(wrapped.h, 60)

// An item wider than the row still takes a line, and an empty row has no size.
assert.equal(flowWrap([{ w: 2000, h: 27 }], 883.2, 10, 6).lines, 1)
assert.deepEqual(flowWrap([], 883.2, 10, 6), { items: [], w: 0, h: 0, lines: 0 })

// A logo keeps its own size in the box, and shrinks to fit it otherwise.
assert.deepEqual(fitImage(600, 111, 883.2, 237.6), { w: 600, h: 111 })
const big = fitImage(523, 296, 883.2, 237.6)
near(big.w, 419.8)
near(big.h, 237.6)
assert.deepEqual(fitImage(0, 0, 883.2, 237.6), { w: 0, h: 0 })

console.log('makdLayout ok')

// The overlay at the default 50%: makd's charcoal near the wash's start (an eighth of the way along
// it the wash is .61, so with the shade's .2 the art keeps .31), the page color at the very bottom,
// and mostly the shade on the right, where the wash has faded to .14.
const tint = [52, 55, 59]
const page = [7, 9, 16]
const grid = makdOverlay(new Array(4 * 4 * 4), 4, 4, tint, 0.5, page)
const cell = (x, y) => grid.slice((y * 4 + x) * 4, (y * 4 + x) * 4 + 4)
assert.deepEqual(cell(0, 0), [52, 55, 59, 176])
assert.deepEqual(cell(3, 1), [52, 55, 59, 80])
const column = makdOverlay(new Array(1080 * 4), 1, 1080, tint, 0.5, page)
assert.deepEqual(column.slice(1079 * 4, 1080 * 4), [7, 9, 16, 255])
console.log('makdOverlay ok')
