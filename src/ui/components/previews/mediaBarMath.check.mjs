// node src/ui/components/previews/mediaBarMath.check.mjs
// Holds the media bar previews' layout to the measured values at 960x540.
import assert from 'node:assert/strict'
import { dotsLayout, containBox, rowPeekCover, withNewReleasePreview, fallbackShapes, toBottomRight } from './mediaBarMath.js'

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.02, `${msg}: ${a} vs ${b}`)

// Moonfin: 20 items, 10 then 8 wide marks 4px in from each side, 322 across.
const moon = dotsLayout(20, { active: 10, inactive: 8, gap: 4 })
near(moon.w, 322, 'moonfin dots width')
near(moon.marks[1].x, 22, 'second mark')
near(moon.marks[1].y, 1, 'small marks centered on the big one')

// MakD caps at five and scales the first 1.7 times in place.
const makd = dotsLayout(20, { max: 5, active: 5, inactive: 5, gap: 2.5, activeScale: 1.7 })
assert.equal(makd.marks.length, 5)
near(makd.w, 50, 'makd dots width')
assert.equal(makd.marks[0].scale, 1.7)

// Aya's pills are 2 tall, the first 16 wide.
const aya = dotsLayout(20, { active: 16, inactive: 10, gap: 2.5, pill: true, height: 2 })
near(aya.w, 306, 'aya dots width')
assert.equal(aya.marks[0].h, 2)
assert.equal(aya.marks[0].r, 3)

// Banner's pills keep the small marks' height for the first one.
const banner = dotsLayout(10, { max: 7, active: 16, inactive: 6, gap: 2, pill: true })
assert.equal(banner.marks.length, 7)
assert.equal(banner.marks[0].h, 6)

// A missing count reads as the default of 10.
assert.equal(dotsLayout(undefined, { active: 10, inactive: 8 }).marks.length, 10)

// object-fit: contain at the box's bottom left or top left.
const logo = containBox(800, 137, 280, 120)
near(logo.h, 47.95, 'logo height')
near(logo.y, 72.05, 'logo sits on the box foot')
const top = containBox(800, 535, 340, 100, 'topLeft')
near(top.w, 149.53, 'tall logo width')
assert.equal(top.y, 0)

// Peek Home Rows: modern rows show the title and half a poster, Banner and Off have no peek.
const s = { mediaBarRowPeek: true, homeRowsStyle: 'v2', homeRowsPosterSize: 'default' }
const row = { id: 'resume', shape: 'landscape' }
assert.ok(rowPeekCover(s, 'moonfin', row, true) > 31)
assert.equal(rowPeekCover(s, 'banner', row, true), 0)
assert.equal(rowPeekCover(s, 'off', row, true), 0)
assert.equal(rowPeekCover({ ...s, mediaBarRowPeek: false }, 'moonfin', row, true), 0)

// The first series moves to the front with a sample new season, and only while the banner is on.
const items = [{ type: 'Movie', title: 'a' }, { type: 'Series', title: 'b' }, { type: 'Series', title: 'c' }]
const lead = withNewReleasePreview(items, true)
assert.equal(lead[0].title, 'b')
assert.deepEqual(lead[0].newRelease, { kind: 'newSeason', season: 2 })
assert.deepEqual(lead.map((i) => i.title), ['b', 'a', 'c'])
assert.equal(withNewReleasePreview(items, false), items)

// The stand ins match the wizard's measured boxes.
const t = { onSurfaceA: (a) => `a${a}` }
const moonFall = fallbackShapes('moonfin', t)
assert.deepEqual([moonFall[1].x, moonFall[1].y, moonFall[2].y], [8, 137, 144])
const gallery = fallbackShapes('gallery', t)
assert.deepEqual(gallery.map((p) => p.x), [109, 129, 149, 177, 197])
near(toBottomRight(320, 140), 156.37, 'to bottom right on 320 by 140')

console.log('mediaBarMath ok')
