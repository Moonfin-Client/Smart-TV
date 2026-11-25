// Self-check for layoutRows.js and focusStops.js: node src/ui/components/settings/layoutRows.check.mjs
// The heights are the settings rows' measured heights at 1920x1080 (Account and General).
import assert from 'node:assert/strict'
import { layoutRows, setColumnWidth, COLUMN_W, CARD_W } from './layoutRows.js'
import { stopsOf, nextStop } from './focusStops.js'

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.6, `${msg}: ${a} vs ${b}`)

near(COLUMN_W, 734.6, 'column')
near(CARD_W, 694.5, 'card')

const { rows, height } = layoutRows([
  { type: 'section', text: 'Sign-in' },
  { type: 'card', sid: 'a', tight: true, title: 'Auto Login', icon: 'person', trail: 'bubble', bubble: 'Last User' },
  { type: 'card', sid: 'b', tight: true, title: 'Always Authenticate', sub: 'Require password', subTone: 'desc', icon: 'lock', trail: 'toggle' },
  { type: 'card', sid: 'c', title: 'PIN Code', sub: 'Require a PIN to access your account', icon: 'pin', trail: 'chevron' },
  { type: 'section', text: '' },
  { type: 'card', sid: 'd', shape: 'slider', title: 'Clock Offset', sub: 'Correct the clock', icon: 'more_time', trail: 'none', min: -12, max: 12, step: 1, value: 0 },
])
const [sec, a, b, c, gap, d] = rows
near(sec.h, 72.1, 'section title')
near(a.y, 72.1 + 6.68, 'first card sits under the title with its margin')
near(a.h, 110.2, 'a tight picker with one line')
near(b.h, 136.9, 'a switch with a line under it')
near(c.h, 150.2, 'a link with a line under it')
assert.deepEqual([a.rk, b.rk, c.rk, d.rk], ['a', 'b', 'c', 'd'], 'cards are keyed by setting')
assert.deepEqual(layoutRows([{ type: 'section', text: 'x' }, { type: 'card', sid: 'p', title: 'P' }, { type: 'card', sid: 'q', title: 'Q' }], true).rows.filter((r) => r.rk).map((r) => r.rk), ['c0', 'c1'], 'or by place')
near(b.y - (a.y + a.h), 13.36, 'cards keep both margins between them')
near(gap.h, 33.39, 'an empty section keeps its gap')
near(d.h, 211.2, 'a slider')
assert.equal(d.ticks.length, 25, 'a slider of 24 steps draws 25 ticks')
assert.ok(height > d.y + d.h, 'the list keeps its bottom padding')

// A pixel theme sets the text at 60 percent in the same rows, its two-line body 25 units down.
const pixel = layoutRows([{ type: 'card', sid: 'c', title: 'PIN Code', sub: 'Require a PIN to access your account', icon: 'pin', trail: 'chevron' }], false, { px: 0.6 }).rows[0]
near(pixel.h, c.h, 'a pixel row keeps its height')
near(pixel.titleSize, 23.37 * 0.6, 'its title shrinks')
near(pixel.titleY - c.titleY, (25 - 19) * 1.66957, 'and sits lower')
near(layoutRows([{ type: 'card', sid: 'a', tight: true, title: 'Auto Login', trail: 'bubble', bubble: 'Last User' }], false, { px: 0.6, bubble: { width: () => 100 } }).rows[0].bubbleW, 100 + 2 * (10 * 1.66957 + 0.66957) + 2, 'a bubble measures in the theme face')

// Focus moves to the nearest stop in a direction, and a near tie goes to the earlier one.
const grid = [
  { sid: 'top', x: 0, y: 0, w: 700, h: 100 },
  { sid: 'l1', x: 0, y: 120, w: 340, h: 100 },
  { sid: 'r1', x: 360, y: 120, w: 340, h: 100 },
  { sid: 'l2', x: 0, y: 240, w: 340, h: 100 },
  { sid: 'r2', x: 360, y: 240, w: 340, h: 100 },
]
assert.equal(nextStop(grid, grid[0], 'down').sid, 'l1', 'down from a wide card picks the first of a tie')
assert.equal(nextStop(grid, grid[2], 'down').sid, 'r2', 'down stays in its column')
assert.equal(nextStop(grid, grid[1], 'right').sid, 'r1', 'right stays in its row')
assert.equal(nextStop(grid, grid[1], 'left'), null, 'nothing to the left')
assert.equal(nextStop(grid, grid[0], 'up'), null, 'nothing above the top')

const stops = stopsOf([
  { type: 'section', y: 0, h: 72 },
  { type: 'card', sid: 'x', x: 20, y: 80, w: 694, h: 110 },
  { type: 'block', y: 200, h: 100, stops: [{ sid: 'y', x: 10, y: 5, w: 50, h: 40 }] },
])
assert.deepEqual(stops.map((s) => s.sid), ['x', 'y'], 'cards and block stops focus, sections do not')
assert.equal(stops[1].y, 205, 'a block stop sits at its block')

// The Friends drawer's column is 420dp: the cards and their trailing parts follow it, and it goes back.
const wide = layoutRows([{ type: 'card', sid: 'w', title: 'Auto Login', icon: 'person', trail: 'chevron' }]).rows[0]
setColumnWidth(701.2)
near(COLUMN_W, 701.2, 'drawer column')
near(CARD_W, 701.2 - (734.6 - 694.5), 'drawer card')
const narrow = layoutRows([{ type: 'card', sid: 'w', title: 'Auto Login', icon: 'person', trail: 'chevron' }]).rows[0]
near(narrow.w, wide.w - 33.4, 'the card narrows with the column')
setColumnWidth(734.6)
near(CARD_W, 694.5, 'card again')

// A centered body stacks its two lines in a one-line row, and a bare heading has no body.
{
  const { rows } = layoutRows([
    { type: 'card', sid: 'lib', title: 'Movies', sub: 'Visible', subTone: 'caption', body: 'center', trail: 'toggle' },
    { type: 'card', sid: 'add', title: 'Add Row', body: 'bare', trail: 'none' },
  ])
  near(rows[0].h, 123.6, 'a centered body is a one-line row tall')
  near(rows[0].subY - rows[0].titleY, 27.39, 'its line sits right under the title')
  near(rows[1].h, 57.45, 'a bare heading')
}
console.log('layoutRows checks passed')
