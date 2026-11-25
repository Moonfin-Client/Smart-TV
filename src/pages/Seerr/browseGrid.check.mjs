// Self-check for browseGrid.js: node src/pages/Seerr/browseGrid.check.mjs
import assert from 'node:assert/strict'
const { browseGridMetrics, cardSubtitle, matchesBrowseFilters, gridScrollFor, focusScrollFor } = await import('./browseGrid.js')

// The Medium grid at 1920: 8 columns of 229px cells 217px apart, the art 187 by 281 with 43px
// over it, rows 412px apart starting 24px down.
const m = browseGridMetrics('medium', true)
assert.equal(m.columns, 8)
assert.equal(m.cellWidth, 229)
assert.equal(m.cellWidth + m.spacing, 217)
assert.equal(m.artWidth, 187)
assert.equal(m.imageHeight, 281)
assert.equal(m.headroom, 43)
assert.equal(m.inset, 21)
assert.equal(m.edge, 85)
assert.equal(m.gridTop, 24)
assert.equal(m.cellHeight + m.spacing, 412)

assert.equal(cardSubtitle({ releaseDate: '2026-01-02', voteAverage: 8, mediaInfo: { status: 5 } }), '2026  ★ 8.0  Available')
assert.equal(matchesBrowseFilters({ title: '8 Mile' }, 'all', '#'), true)
assert.equal(matchesBrowseFilters({ title: 'Alien', mediaInfo: { status: 6 } }, 'all', ''), false, 'blocklisted titles never show')
assert.equal(matchesBrowseFilters({ title: 'Alien', mediaInfo: { status: 3 } }, 'available', ''), false)

// Rows scrolled going down and back up a Medium grid.
const pitch = 412
assert.equal(gridScrollFor(0, 0, { pitch }), 0)
assert.equal(gridScrollFor(1, 0, { pitch }), 176)
assert.equal(gridScrollFor(2, 176, { pitch }), 588)
assert.equal(gridScrollFor(4, 1824, { pitch }), 1648)
assert.equal(gridScrollFor(0, 176, { pitch }), 0)

// The sort dialog's list, 996px of window over 3062px: a cut row slides in, a hidden one centers.
assert.equal(focusScrollFor(100, 76, 0, 996, 2066), 0)
assert.equal(focusScrollFor(960, 76, 0, 996, 2066), 40)
assert.equal(focusScrollFor(1100, 76, 0, 996, 2066), 640)
assert.equal(focusScrollFor(3000, 76, 0, 996, 2066), 2066)

console.log('browseGrid ok')
