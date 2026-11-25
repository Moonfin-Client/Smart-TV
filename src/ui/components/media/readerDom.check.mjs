// node src/ui/components/media/readerDom.check.mjs
import assert from 'node:assert/strict'
import { fitPage, nextSpot } from './readerDom.js'

const box = (x, y, w, h) => ({ getBoundingClientRect: () => ({ left: x, top: y, right: x + w, bottom: y + h, width: w, height: h }) })
// The chrome's top row of three buttons and the scrubber across the bottom.
const contents = box(1300, 24, 160, 52)
const bookmark = box(1476, 24, 170, 52)
const display = box(1662, 24, 150, 52)
const scrubber = box(36, 980, 1848, 36)
const stops = [contents, bookmark, display, scrubber]
assert.equal(nextSpot(contents, stops, 'right'), bookmark)
assert.equal(nextSpot(bookmark, stops, 'right'), display)
assert.equal(nextSpot(display, stops, 'right'), null, 'the menu holds at its edge')
assert.equal(nextSpot(bookmark, stops, 'left'), contents)
assert.equal(nextSpot(bookmark, stops, 'down'), scrubber)
assert.equal(nextSpot(scrubber, stops, 'up'), contents, 'the nearest stop up from the bar, by sideways distance')
assert.equal(nextSpot(contents, stops, 'up'), null)
// A wrapped row of choices: down from the first goes to the one under it, not the far one.
const a = box(0, 0, 100, 50)
const b = box(120, 0, 100, 50)
const c = box(0, 70, 100, 50)
const d = box(400, 70, 100, 50)
assert.equal(nextSpot(b, [a, b, c, d], 'down'), c)
// A small comic page keeps its size, a tall one shrinks to the screen's height.
assert.deepEqual(fitPage(800, 1000), { w: 800, h: 1000 })
assert.deepEqual(fitPage(1988, 3056), { w: 703, h: 1080 })
assert.deepEqual(fitPage(4000, 1000), { w: 1920, h: 480 })
console.log('readerDom ok')
