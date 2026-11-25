// Self-check for osdLayout.js against measured positions: node src/ui/components/player/osdLayout.check.mjs
import assert from 'node:assert/strict'
import { bottomLayout, buttonXs, logoCrop, logoHeight, topLayout } from './osdLayout.js'

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.6, `${msg}: ${a} vs ${b}`)

// Castlevania S1E2, a series logo over the episode line, with "Ends at" above the bar and the times below.
const top = topLayout({ logo: true, logoH: 108, title: 'S1:E2 - Necropolis' })
near(top.titleY, 138.1, 'title under the logo')
near(top.height, 206.5, 'top gradient')
const bottom = bottomLayout({ live: false, above: true, below: true, buttons: true })
assert.equal(bottom.btnY, 984)
assert.equal(bottom.belowY, 945)
assert.equal(bottom.barY, 931)
assert.equal(bottom.aboveY, 892)
assert.equal(bottom.top, 868)
// With no rows the bar sits 8 above the buttons.
assert.equal(bottomLayout({ live: false, above: false, below: false, buttons: true }).barY, 970)

const xs = buttonXs(5, 8, 84)
assert.deepEqual(xs.slice(0, 6), [24, 120, 216, 312, 408, 498])
assert.equal(xs[12], 1170)

assert.equal(logoHeight(null), 108)
assert.equal(logoHeight(3.524), 108)
near(logoHeight(8), 81.6, 'a wide wordmark shrinks to 34vw')

const crop = logoCrop({ style: { backgroundSize: '125% 200%', backgroundPosition: '40% 50%' } })
near(crop.across, 0.8, 'across')
near(crop.left, 0.08, 'left')
near(crop.down, 0.5, 'down')
near(crop.top, 0.25, 'top')
// A logo inked top to bottom: its padded crop overhangs the image, so the image sits lower in the box.
const tall = logoCrop({ style: { backgroundSize: '110% 96%', backgroundPosition: '0% 50%' } })
near(tall.down * 100, 104.17, 'down past the image')
near(tall.top * 100, -2.08, 'top above the image')
console.log('osdLayout ok')
