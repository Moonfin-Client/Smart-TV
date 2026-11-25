// node --conditions=browser src/pages/Details/frost/frost.check.mjs
import assert from 'node:assert/strict'
import { stubUnloadable } from '../../../../scripts/stubUnloadable.mjs'

stubUnloadable()
globalThis.window = globalThis.window || { innerWidth: 1920 }
const { BTN, TAG_H, tagFor, toolbarLayout } = await import('./toolbar.js')
const { tmdbSoft } = await import('./softArt.js')

// Play runs 6px over the pane's 12px padding at its 312px floor, and every icon after it sits 9px
// from the one before, Play included.
const laid = toolbarLayout([{ id: 'play', label: 'Play' }, { id: 'a', label: 'A' }, { id: 'b', label: 'B' }])
assert.deepEqual(laid.placed.map((p) => [p.x, p.y, p.w, p.h]), [[6, 6, 312, 102], [321, 12, BTN, BTN], [420, 12, BTN, BTN]])
assert.equal(laid.w, 522)
assert.equal(laid.h, 114)
// The label chip floats 24px over a focused icon, and Play has none.
assert.equal(tagFor(laid.placed[1]).y, 12 - 24 - TAG_H)
assert.equal(tagFor(laid.placed[0]), null)
// TMDB art of any size comes back at its 45px copy, and anything else isn't TMDB's to shrink.
assert.equal(tmdbSoft('https://image.tmdb.org/t/p/w1280/abc.jpg'), 'https://image.tmdb.org/t/p/w45/abc.jpg')
assert.equal(tmdbSoft('https://image.tmdb.org/t/p/original/abc.jpg'), 'https://image.tmdb.org/t/p/w45/abc.jpg')
assert.equal(tmdbSoft('http://server/Items/1/Images/Backdrop'), '')
console.log('frost ok')
