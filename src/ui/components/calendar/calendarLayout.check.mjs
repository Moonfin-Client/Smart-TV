// Self-check for calendarLayout.js: node src/ui/components/calendar/calendarLayout.check.mjs
import assert from 'node:assert/strict'
import { argb, dp, fitLine, fitLines, flowPills, flowTags, lineCount, over, pillBox, stackColumn, textWidth } from './calendarLayout.js'

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.05, `${msg}: ${a} vs ${b}`)

// Colors: #AARRGGBB to the renderer's #rrggbbaa, with the alpha scaled.
assert.equal(argb('#FF0A84FF'), '#0a84ffff')
assert.equal(argb('#CC07090F', 0.5), '#07090f66')
assert.equal(argb('#5bc46a'), '#5bc46aff')
assert.equal(over('#ffffff80', '#000000'), '#808080')

// A pill: border, padding, icon and label, and an icon only one's uneven padding.
const big = pillBox({ label: 'Play', icon: 'play' })
near(big.h, 2 * (1 + dp(11)) + dp(15) * 1.43, 'button height follows the label line, 74.5')
near(big.textX, 1 + dp(20) + dp(20) + dp(8), 'label after the icon and its gap')
const arrow = pillBox({ icon: 'chevron', compact: true })
near(arrow.w, 2 + dp(14) + dp(22) + dp(18), 'icon only: 14 left, 22 right')
near(arrow.h, 2 * (1 + dp(8)) + dp(18), 'icon only height is the icon')

// Pills wrap onto a new row past the width, a gap apart both ways.
const one = pillBox({ label: 'A' }).w
const row = flowPills([{ label: 'A' }, { label: 'B' }, { label: 'C' }], { maxW: one * 2 + dp(12) + 1 })
assert.equal(row[0].x, 0)
near(row[1].x, row[0].w + dp(12), 'second pill one gap along')
assert.equal(row[2].x, 0, 'third pill wraps')
near(row[2].y, row[0].h + dp(12), 'wrapped row one gap down')

// Tags wrap 6 dp apart across and 4 dp down, and report their block height.
const tags = flowTags([{ label: 'aaaa', color: '#FFFFFFFF' }, { label: 'bbbb', color: '#FFFFFFFF' }], 10)
assert.equal(tags.tags[1].x, 0)
near(tags.h, tags.tags[0].h * 2 + dp(4), 'two tag rows')
assert.equal(flowTags([], 100).h, 0)

// Text wraps between words and stops at the line cap.
assert.equal(lineCount('', 20, 'regular', 100), 0)
assert.equal(lineCount('word', 20, 'regular', 100), 1)
assert.equal(lineCount('one two three four five six', 20, 'regular', 60, 2), 2)

// A column that fits is centered. One that runs over shrinks only its clipping blocks, by their share.
const fits = stackColumn([{ h: 100, mt: 0 }, { h: 50, mt: 10 }], 260)
assert.equal(fits[0].top, 50)
assert.equal(fits[1].top, 160)
const tight = stackColumn([{ h: 100, mt: 0, shrink: true }, { h: 100, mt: 0 }, { h: 300, mt: 0, shrink: true }], 400)
assert.equal(tight[0].top, 0)
assert.equal(tight[0].h, 75)
assert.equal(tight[1].h, 100)
assert.equal(tight[2].h, 225)
assert.equal(tight[2].top, 175)

// Cut like Chrome: one line ends mid word in a single ellipsis, a clamp ends its last line in one.
assert.equal(fitLine('short', 20, 'regular', 500), 'short')
const cut = fitLine('a rather long title for a card', 20, 'regular', 120)
assert.ok(cut.endsWith('\u2026') && textWidth(cut, 20, 'regular') <= 120, cut)
assert.equal(fitLines('one two', 20, 'regular', 500, 2), 'one two')
const clamp = fitLines('one two three four five six seven eight', 20, 'regular', 70, 2)
assert.equal(clamp.split('\n').length, 2)
assert.ok(clamp.endsWith('\u2026'), clamp)

console.log('calendarLayout ok')
