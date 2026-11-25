// Self-check for modalLayouts.js: node src/ui/components/player/modalLayouts.check.mjs
// Expected numbers were measured at 1080p for Hunter x Hunter's info, chapters and cast.
import assert from 'node:assert/strict'
import { INFO, infoLayout, infoThumb, chapterCards, castCards, rowScroll, rowWidth, CHAPTER, CAST } from './modalLayouts.js'

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.1, `${msg}: ${a} vs ${b}`)

near(INFO.LIST_MAX, 856.39, 'list max height')
near(INFO.LIST_TOP, 106.61, 'list top inside the panel')
near(INFO.CHROME + INFO.LIST_MAX, 997, 'panel height at the cap')

const sections = [
  { id: 'playback', title: 'Playback', rows: [{ label: 'Play Method', value: 'Direct Play', bold: true }, { note: 'Playing the original file as is.' }, { label: 'Bitrate', value: '2.7 Mbps' }] },
  { id: 'video', title: 'Video', rows: [{ label: 'Resolution', value: '1080p' }] },
]
const info = infoLayout(sections)
near(info.left[1].y, 58.59 + 5, 'first label sits under the heading and its row padding')
near(info.left[2].y, 94.29, 'the note follows its row')
near(info.left[3].y, 124.7 + 5, 'the next row follows the note')
near(info.left[4].y, 160.4 + 20, 'the next heading')
near(info.h, 160.4 + 58.59 + 35.7 + 27, 'content height with its bottom padding')
assert.equal(info.right.length, 3)
assert.equal(info.right[0].x + info.right[0].w, INFO.INNER_W - INFO.PAD_X, 'values end at the right padding')
assert.equal(info.right[0].bold, true)
const two = infoLayout([{ id: 's', title: 'S', rows: [{ label: 'L', value: 'a\nb' }] }])
near(two.h, 58.59 + 10 + 2 * 25.7 + 27, 'a value with a line break takes two lines')

assert.deepEqual(infoThumb(0, 500, 400), { h: 0, y: 0 }, 'no thumb when it all fits')
const th = infoThumb(195, 856.4, 1051.4)
near(th.h, (856.4 * 856.4) / 1051.4, 'thumb height')
near(th.y, 856.4 - th.h, 'scrolled to the end, the thumb sits at the bottom')
assert.equal(infoThumb(0, 100, 10000).h, INFO.THUMB_MIN, 'never under 40')

const T = 10000000
const chapters = [0, 109, 449, 736].map((s, i) => ({ index: i, name: `Chapter 0${i + 1}`, startPositionTicks: s * T }))
const cards = chapterCards(chapters, 120, () => '')
assert.deepEqual(cards.map((c) => c.current), [false, true, false, false], 'the chapter playing is current')
assert.equal(cards[1].x, CHAPTER.PAD_X + CHAPTER.W + CHAPTER.GAP)
assert.equal(chapterCards(chapters, 800, () => '')[3].current, true, 'the last chapter runs to the end')
assert.equal(rowWidth(5, CHAPTER.PAD_X, CHAPTER.W, CHAPTER.GAP), 1536, 'five chapters overflow the 1500 row by 36')
assert.equal(rowWidth(0, 1, 1, 1), 0)

const cast = castCards([{ Id: 'a', Name: 'Megumi Han', Role: 'Gon (voice)' }, { Name: '', Type: 'Director' }], {
  image: (p) => (p.Id ? 'x' : ''),
  unknown: 'Unknown',
  cast: 'Cast',
})
near(cast.h, 194.4, 'a one line name makes a 194.4 card')
assert.equal(cast.cards[1].name, 'Unknown')
assert.equal(cast.cards[1].role, 'Director', 'the type stands in for a missing role')
assert.equal(cast.cards[1].letter, '?')
assert.equal(cast.cards[1].x, CAST.PAD_X + CAST.W + CAST.GAP)
// The scroll after each Right and then each Left (JJK's six chapters and its 34 people).
const walk = (n, pad, w, gap, viewW, path) => {
  const contentW = rowWidth(n, pad, w, gap)
  let scroll = 0
  return path.map((i) => (scroll = rowScroll(scroll, pad + i * (w + gap), w, viewW, contentW)))
}
assert.deepEqual(
  walk(6, CHAPTER.PAD_X, CHAPTER.W, CHAPTER.GAP, CHAPTER.BOX_W, [1, 2, 3, 4, 5, 4, 3, 2, 1, 0]),
  [0, 0, 0, 0, 332, 332, 332, 332, 332, 0],
  'a chapter wholly out of view is centered, as far as the row goes'
)
assert.deepEqual(
  walk(34, CAST.PAD_X, CAST.W, CAST.GAP, 660, [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 0]),
  [0, 0, 0, 56, 232, 408, 584, 760, 760, 760, 684, 508, 332, 156, 0],
  'a partly shown person comes in by the least and 24 more'
)
console.log('modalLayouts ok')
