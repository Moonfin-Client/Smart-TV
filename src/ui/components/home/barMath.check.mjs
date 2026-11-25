// node src/ui/components/home/barMath.check.mjs
import assert from 'node:assert/strict'
import { galleryPanels, glowOf, over, padIndex, rgbA, toNum, wrapPills, breakable, coverRegion } from './barMath.js'

assert.equal(padIndex(0), '01')
assert.equal(padIndex(9), '10')
assert.equal(rgbA('74, 90, 120', 0.7), '#4a5a78b3')
assert.equal(toNum('#ffffff'), 0xffffffff)
assert.equal(toNum('#00000080'), 0x00000080)
// Half of 74, 90, 120 over black.
assert.equal(over('#000000', '#4a5a78', 0.5), '#252d3cff')

// A glow at its CSS alpha, premultiplied: rgba(74, 90, 120, 0.55) goes in as 0.55 of each.
const g = glowOf({ color: '#4a5a788c', x: 0, y: 0, blur: 26, spread: 0 })
assert.equal(g.on, true)
assert.equal(g.shadow.color, toNum('#2931428c'))
assert.equal(glowOf(null).on, false)

// The Gallery beside the sidebar: 1794 wide, the first of five active.
const p = galleryPanels(1794, 5, 0)
assert.equal(p[0].w, 1416)
assert.equal(p[1].w, 88.5)
assert.equal(p[1].x, 1422)
assert.equal(p[4].x + p[4].w, 1794)

// Five pills that fit one line, then a narrow column that wraps the last two.
const pills = [80, 73, 60, 87, 96].map((w, i) => ({ k: i, w, h: i === 1 ? 45 : 43 }))
const one = wrapPills(pills, 756.4)
assert.deepEqual(one.list.map((x) => x.x), [0, 88, 169, 237, 332])
assert.equal(one.h, 53)
const two = wrapPills(pills, 320)
assert.deepEqual(two.list.map((x) => x.y), [0, 0, 0, 53, 53])
assert.equal(two.list[3].h, 43)
assert.equal(two.h, 104)
console.log('barMath ok')

// A zero width space goes in after a hyphen inside a word, never before a number.
assert.equal(breakable('Choi Woo-shik'), 'Choi Woo-​shik')
assert.equal(breakable('Spider-Man 2-3 - x'), 'Spider-​Man 2-3 - x')

// A 480 by 270 copy covers the screen at 4x, so a box maps straight down by 4.
assert.deepEqual(coverRegion(480, 270, 104, 800, 1712, 240), { x: 26, y: 200, w: 428, h: 60 })
// A taller picture is cropped top and bottom: 300 by 300 at 6.4x hangs 420px over each edge.
assert.deepEqual(coverRegion(300, 300, 0, 0, 1920, 1080), { x: 0, y: 420 / 6.4, w: 300, h: 1080 / 6.4 })
