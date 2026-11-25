// Self-check for Classic's layout and scrolling: node src/pages/Details/classic/classic.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// The app's modules lean on Vite for imports without an extension. Stubs stand in for the pieces
// this check doesn't reach (ui/text.js, Modern's hero and the rest below).
const stub = (src) => `data:text/javascript,${encodeURIComponent(src)}`
const STUBS = {
  text: stub("export const cssShift = (s) => Math.round(0.0918 * s * 2) / 2; export const fontFor = () => 'roboto'; export const uiFont = () => 'roboto'"),
  hero: stub('export const ratingsRow = () => 0'),
  meta: stub('export const SEERR_PILL = {}'),
  detailMarks: stub('export const drawAnimePills = () => ({ w: 0, h: 0 })'),
  animePills: stub('export const PILL_H = 28.5'),
}
registerHooks({
  resolve(spec, ctx, next) {
    const m = /\/(ui\/text|modern\/hero|modern\/meta|detailMarks|player\/animePills)(\.js)?$/.exec(spec)
    if (m) return { url: STUBS[m[1].split('/').pop()], shortCircuit: true }
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { breakLong, collapse, layoutButtons, classicLeft } = await import('./layout.js')
const { textWidth } = await import('../../../ui/components/details/measure.js')
const { pageScroll, plumbIndex, rowScroll } = await import('./scroll.js')

// Margins that meet: the larger positive, less the most negative.
assert.equal(collapse(12, 9), 12)
assert.equal(collapse(-6, 9), 3)
assert.equal(collapse(-6, 12), 6)

// Beside the classic sidebar the page starts at 174, and tiles center 169px apart, nine to a line.
assert.equal(classicLeft('rail'), 174)
assert.equal(classicLeft(null), 70)
const tiles = Array.from({ length: 12 }, (_, i) => ({ id: `b${i}`, label: 'Play' }))
const laid = layoutButtons(tiles, 174, 1676, 499, false)
assert.equal(Math.round(laid.placed[0].x), 258)
assert.equal(laid.placed[0].y, 508)
assert.equal(laid.placed[9].line, 1)
assert.equal(laid.placed[9].x, 174 + (1676 - 3 * 169) / 2 + 6)
// One line of 119px tiles and one more, each with 9px above and below.
assert.equal(Math.round(laid.h), 2 * (119 + 18))

// Bourne's cast row (992 to 1297 on a 4554px page) comes up with its foot 24px clear.
assert.equal(pageScroll(0, 4554, { y: 1061, h: 216 }, { y: 992, h: 305 }), 241)
// Going back up puts the row's top at the screen's top.
assert.equal(pageScroll(1316, 4554, { y: 1061, h: 216 }, { y: 992, h: 305 }), 992)

// A plain lane: a card past the right edge comes back in with 50px to spare, clamped to the end.
const cells = Array.from({ length: 14 }, (_, i) => ({ x: i * 168, w: 145 }))
const lane = { mode: 'scroll', clipX: -20, clipW: 1716, clipPad: 20, cells }
assert.equal(rowScroll.toShow(lane, 0, cells[10]), 1680 + 145 - 1696 + 50)
assert.equal(rowScroll.toShow(lane, 0, cells[13]), 13 * 168 + 145 - 1676)
assert.equal(rowScroll.toShow(lane, 0, cells[3]), 0)
assert.equal(rowScroll.toShow(lane, 653, cells[2]), 653 - (653 - 20 - 336 + 50))
// A media row glides the focused card to the start of its lane.
const media = { mode: 'glide', clipX: 40, clipW: 1596, clipPad: 20, cells: Array.from({ length: 12 }, (_, i) => ({ x: 60 + i * 264, w: 240 })) }
assert.equal(rowScroll.toShow(media, 0, media.cells[2]), 528)
assert.equal(rowScroll.toShow(media, 0, media.cells[11]), 11 * 264 + 240 + 40 - 1596)
// Down from the person's biography lands on the pill nearest the box's middle, and a line of tiles
// takes the one straddling it.
const pills = [{ x: 434, w: 152 }, { x: 602, w: 144 }]
assert.equal(plumbIndex(pills, 1142), 1)
assert.equal(plumbIndex(pills, 500), 0)
assert.equal(plumbIndex([{ x: 258, w: 157 }, { x: 427, w: 157 }, { x: 596, w: 157 }, { x: 765, w: 157 }], 869.5), 3)
// The box blur spreads a bright pixel evenly to both sides.
const { boxBlur } = await import('../../../services/softBackdrop.js')
const px = new Uint8ClampedArray(9 * 4)
px[4 * 4] = 255
boxBlur(px, 9, 1, 1)
assert.ok(px[4 * 4] < 255 && px[4 * 4] > 0)
assert.equal(px[3 * 4], px[5 * 4])
assert.ok(px[2 * 4] > 0 && px[0] < px[2 * 4])
// A tile label's word wider than the line breaks where it runs out, as overflow-wrap does.
const w = textWidth('Collectio', 16, 'bold')
assert.deepEqual(breakLong(['Add to', 'Collection'], 16, 'bold', w), ['Add to', 'Collectio', 'n'])
assert.deepEqual(breakLong(['Play'], 16, 'bold', w), ['Play'])
console.log('classic ok')
