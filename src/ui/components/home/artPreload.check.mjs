// Self-check for artPreload.js: node src/ui/components/home/artPreload.check.mjs
import assert from 'node:assert/strict'
import { preloadUrls } from './artPreload.js'

const card = (n, extra = {}) => ({ rest: `p${n}`, wide: `w${n}`, raw: { Id: `i${n}` }, ...extra })
const cards = [0, 1, 2, 3, 4].map((n) => card(n))
const panel = (it) => `b${it.Id}`

// Moving right, the card ahead comes first, then the one behind.
assert.deepEqual(preloadUrls(cards, 2, 1), ['w3', 'w1'])
assert.deepEqual(preloadUrls(cards, 2, -1), ['w1', 'w3'])
// A Carousel row adds each one's panel backdrop, right after its card art.
assert.deepEqual(preloadUrls(cards, 2, 1, panel), ['w3', 'bi3', 'w1', 'bi1'])
// At either end there's only the one neighbor, and the row never wraps.
assert.deepEqual(preloadUrls(cards, 0, -1), ['w1'])
assert.deepEqual(preloadUrls(cards, 4, 1, panel), ['w3', 'bi3'])
// One card in the row, or focus on See All past the last card.
assert.deepEqual(preloadUrls([card(0)], 0, 1, panel), [])
assert.deepEqual(preloadUrls(cards, 5, 1), ['w4'])
// A card whose focused art is its poster has nothing to load, and missing art is skipped.
const plain = [card(0), card(1, { wide: 'p1' }), card(2), card(3, { wide: '' })]
assert.deepEqual(preloadUrls(plain, 2, 1), [])
assert.deepEqual(preloadUrls(plain, 0, 1), [])
// The focused card's own art, and art two neighbors share (a series backdrop), go once and never twice.
const shared = [card(0, { raw: { Id: 's' } }), card(1, { raw: { Id: 's' } }), card(2, { raw: { Id: 's' }, wide: 'w0' })]
assert.deepEqual(preloadUrls(shared, 1, 1, panel), ['w0'])
console.log('artPreload ok')
