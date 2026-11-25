// Self-check for rowLayout.js: node src/ui/components/home/rowLayout.check.mjs
import assert from 'node:assert/strict'
import { rowBox, placeholderCard, skeletonBoxes, laneWindow, bandWindow } from './rowLayout.js'

const s = { homeRowsPosterSize: 'default', homeRowsStyle: 'carousel' }
const carousel = { style: 'carousel', modernItemsBottom: 24, spacing: 0 }

// A Carousel row (Continue Watching & Next Up): title 6px down, cards 50px down, the panel 18px
// under the lane and 70px under the panel.
const cw = rowBox({ id: 'continue-nextup', type: 'landscape', cards: [{ h: 360 }] }, carousel, s)
assert.equal(cw.titleY, 6)
assert.equal(cw.cardsY, 50)
assert.equal(cw.scrollerY + cw.laneH, 434)
assert.equal(cw.panelY, 452)
assert.equal(cw.h, 1078)
assert.ok(cw.carousel)

// A subtitle (Seasonal) pushes the cards 35px down.
const seasonal = rowBox({ id: 'seasonal', subtitle: 'Seasonal', cards: [{ h: 360 }] }, carousel, s)
assert.equal(seasonal.subtitleY, 42)
assert.equal(seasonal.cardsY, 85)

// My Media and music rows stay Modern under the Carousel look, keeping room for three caption lines.
const media = rowBox({ id: 'library-tiles', isLibraryRow: true, cards: [{ h: 360 }] }, carousel, s)
assert.ok(!media.carousel)
assert.equal(media.laneH, 10 + 360 + 89 + 24)
// The row spacing slider adds its margin under each row.
assert.equal(rowBox({ id: 'x', cards: [{ h: 360 }] }, { ...carousel, spacing: 34 }, s).h, 1078 + 34)

// Classic: 28px title on a 33px line, 16px under it, the cards 20px into the lane.
const classic = rowBox({ id: 'x', cards: [{ h: 360 }] }, { style: 'classic', spacing: 20 }, { ...s, homeRowsStyle: 'v1' })
assert.equal(classic.cardsY, 69)
assert.deepEqual(placeholderCard({ style: 'classic' }, { homeRowsPosterSize: 'large' }, 'portrait'), { w: 288, h: 432 })
assert.deepEqual(placeholderCard(carousel, { homeRowsPosterSize: 'small' }, 'square'), { w: 288, h: 288 })

// Four loading rows, only what's on screen kept.
const sk = skeletonBoxes({ style: 'carousel', top: 0, inset: 110, cardW: 240, cardH: 360, spacing: 0, carousel: true })
assert.equal(sk.boxes[0].y, 48)
assert.equal(sk.boxes[1].y, 90)
assert.equal(sk.panels[0].y, 40 + 40 + 10 + 360 + 61 + 24 + 18)
assert.ok(sk.boxes.every((b) => b.y < 1080))
// Off Home (Library's group rows): one 33px caption line padded 10px, 30px under the row.
const plain = rowBox({ id: 'x', cards: [{ h: 240, line2: '' }] }, { style: 'classic', plain: true, spacing: 30 }, { homeRowsPosterSize: 'default', homeRowsStyle: 'v1' })
assert.equal(plain.cardsY, 69)
assert.equal(plain.h, 33 + 16 + 20 + 240 + 10 + 33 + 10 + 20 + 30)
console.log('plain ok')

// A lane of forty 240px posters 24px apart keeps the ones on screen and one step either side.
const lane = Array.from({ length: 40 }, (_, i) => ({ x: i * 264, w: 240 }))
assert.deepEqual(laneWindow(lane, 0, 1870, 264), [0, 9])
assert.deepEqual(laneWindow(lane, 264 * 20 - 60, 264 * 20 - 60 + 1870, 264), [18, 28])
assert.deepEqual(laneWindow(lane, 264 * 39, 264 * 39 + 1870, 264), [38, 40])
assert.deepEqual(laneWindow([], 0, 1870, 264), [0, 0])

// Rows 400px tall in a 1038px band: the three that show, one either side, and the focused one.
const rows = Array.from({ length: 20 }, (_, i) => ({ y: i * 400, box: { h: 400 } }))
assert.deepEqual(bandWindow(rows, 0, 1038, 0), [0, 4])
assert.deepEqual(bandWindow(rows, 4000, 1038, 10), [9, 14])
assert.deepEqual(bandWindow(rows, 0, 1038, 15), [0, 16])
assert.deepEqual(bandWindow([], 0, 1038, 0), [0, 0])
console.log('windows ok')
