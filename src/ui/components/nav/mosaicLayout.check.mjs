import assert from 'node:assert/strict'
import { AVATAR_RECT, mosaicPlaces, mosaicMove, mosaicScroll } from './mosaicLayout.js'

const lib = (k) => ({ key: k, library: { Id: k } })
const entries = [{ key: 'home' }, { key: 'search' }, lib('a'), lib('b'), lib('c'), { key: 'livetv' }, { key: 'discover' }, { key: 'settings' }]
const tiles = mosaicPlaces(entries)
const at = (k) => tiles.find((t) => t.key === k)

assert.deepEqual([at('home').x, at('home').y, at('home').w], [42, 111, 756])
// Libraries first, then Live TV and Seerr, two to a row of 369 wide tiles 18 apart.
assert.deepEqual([at('a').x, at('a').y, at('b').x, at('c').y], [42, 273, 429, 435])
assert.equal(at('livetv').kind, 'live')
assert.deepEqual([at('discover').x, at('discover').y], [42, 597])
// The small tiles start under the big ones, six to a row.
assert.deepEqual([at('search').x, at('search').y, at('settings').x], [42, 759, 170])

const rects = [AVATAR_RECT].concat(tiles)
assert.equal(mosaicMove(rects, 'home', 'down'), 'a')
assert.equal(mosaicMove(rects, 'a', 'right'), 'b')
assert.equal(mosaicMove(rects, 'b', 'right'), null)
assert.equal(mosaicMove(rects, 'b', 'down'), 'livetv')
assert.equal(mosaicMove(rects, 'home', 'up'), 'avatar')
assert.equal(mosaicMove(rects, 'search', 'right'), 'settings')

// With a 1530px panel, down past the fold centers (held to the end), back up
// shows a partly hidden tile just enough, and one wholly hidden comes to the middle.
assert.equal(mosaicScroll(at('home'), 0, 1530), 0)
assert.equal(mosaicScroll({ y: 1083, h: 144 }, 0, 1530), 450)
assert.equal(mosaicScroll({ y: 435, h: 144 }, 450, 1530), 435)
assert.equal(mosaicScroll({ y: 273, h: 144 }, 435, 1530), 0)
assert.equal(mosaicScroll(AVATAR_RECT, 0, 1530), 0)
console.log('mosaicLayout ok')
