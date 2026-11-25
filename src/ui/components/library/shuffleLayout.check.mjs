import assert from 'node:assert/strict'
import { CARD, FOCUS, actionX, cardXs, nearest, panelLayout, pickerLayout, pickerScroll } from './shuffleLayout.js'

// The posters fill the row left by the tallest panel, and five of them with the three 532 wide actions.
// A focused card, its scaled halo included, stays 12 under the badge and inside the row.
assert.deepEqual([CARD.w, CARD.h, CARD.gap, CARD.y], [243, 365, 38, 184])
const grow = (FOCUS.scale - 1) / 2
const halo = FOCUS.halo * FOCUS.scale
assert.ok(CARD.y - FOCUS.lift - grow * CARD.h - halo >= 129 + 12)
assert.ok(CARD.y - FOCUS.lift + (1 + grow) * CARD.h + halo <= panelLayout(33, 113).y - 18)
assert.deepEqual(cardXs(5), [277, 558, 839, 1120, 1401])
assert.deepEqual([0, 1, 2].map(actionX), [150, 694, 1238])
// Up from each action lands on the first, middle and last card.
assert.deepEqual([0, 1, 2].map((i) => nearest(actionX(i) + 266, cardXs(5), CARD.w)), [0, 2, 4])
// 21 Jump Street's panel: a meta line and one line of labeled compact ratings.
const p = panelLayout(33, 58.5)
assert.equal(p.y, 644.5)
assert.equal(p.overviewY, 804)
assert.equal(p.rowH, 479.5)
// The library picker with six libraries, and the genre one that scrolls.
assert.deepEqual(pickerLayout(6, ''), { listH: 336, h: 461, y: 309.5 })
assert.equal(pickerLayout(29, '').h, 820)
assert.equal(pickerLayout(0, 'Loading...').h, 194)
assert.equal(pickerScroll(12, 0, 695), 12 * 56 + 56 - 695)
assert.equal(pickerScroll(3, 200, 695), 168)
assert.equal(pickerScroll(5, 0, 695), 0)
console.log('shuffleLayout ok')
