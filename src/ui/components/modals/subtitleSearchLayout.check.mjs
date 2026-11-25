// node src/ui/components/modals/subtitleSearchLayout.check.mjs
import assert from 'node:assert/strict'
import { layoutSubtitleSearch, revealScroll, wrap } from './subtitleSearchLayout.js'

const measure = (t, size) => String(t).length * size * 0.5
const labels = { cancel: 'Cancel', footer: 'Press BACK to close' }

// The Details look: the first row starts 107 below the panel's top, a plain result is 82
// tall and a result with a flag line 114.9.
const d = layoutSubtitleSearch('details', [
  { kind: 'result', name: '720p.BluRay.x264-SPARKS', info: 'ENG · Open Subtitles · SRT' },
  { kind: 'result', name: '720p.BluRay.x264-SPARKS', info: 'ENG', flags: ['SDH'] },
], labels, measure)
assert.equal(d.rows[0].y, 107)
assert.equal(d.rows[0].h, 82)
assert.equal(Math.round(d.rows[1].h * 10) / 10, 114.9)
assert.equal(d.rows[1].flags[0].text, 'SDH')
assert.equal(d.rows[0].infoX, 33)
assert.equal(d.cancel.idx, 2)
assert.equal(d.focusables.length, 3)

// A status line is 59 tall, and with Cancel under it the panel is 318.
const busy = layoutSubtitleSearch('details', [{ kind: 'status', name: 'Searching...' }], labels, measure)
assert.equal(busy.rows[0].h, 59)
assert.equal(busy.h, 318)

// The player's rows are flat, 98 tall, and the list ends in a footer instead of Cancel.
const p = layoutSubtitleSearch('player', [{ kind: 'result', name: 'a', info: 'b' }], labels, measure)
assert.equal(p.rows[0].h, 98)
assert.equal(p.cancel, undefined)
assert.ok(p.footer.y > p.rows[0].y + 98)

// A long list stops at the 80% max height and centers.
const many = layoutSubtitleSearch('details', Array.from({ length: 20 }, () => ({ kind: 'result', name: 'x', info: 'y' })), labels, measure)
assert.equal(many.h, 926)
assert.equal(many.y, 77)

// Flags wrap onto a second line once they run out of room.
const wide = layoutSubtitleSearch('details', [{ kind: 'result', name: 'x', flags: ['a'.repeat(40), 'b'.repeat(40)] }], labels, measure)
assert.ok(wide.rows[0].flags[1].y > wide.rows[0].flags[0].y)

assert.deepEqual(wrap('aa bb cc', 30, 10, 'regular', measure), ['aa bb', 'cc'])
assert.equal(revealScroll(0, { y: 900, h: 82 }, 926, 3000), 56)
assert.equal(revealScroll(500, { y: 100, h: 82 }, 926, 3000), 100)
assert.equal(revealScroll(40, { y: 100, h: 82 }, 926, 800), 0)
console.log('subtitleSearchLayout ok')
