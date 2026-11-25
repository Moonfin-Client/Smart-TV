// Self-check for RequestsModels.js: node src/ui/components/seerr/RequestsModels.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// The app's modules lean on Vite for imports without an extension.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.(m?js|json)$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
  load(url, ctx, next) {
    return next(url, url.endsWith('.json') ? { ...ctx, importAttributes: { type: 'json' } } : ctx)
  },
})
const { GRID, tileHeight, requestTile, downloadBar, statusChip } = await import('./RequestsModels.js')
const { theme } = await import('../../theme.js')

// The grid over the 1692px list: six 262px tiles, 544px tall, or 569 with split names.
assert.equal(GRID.cols, 6)
assert.equal(GRID.w, 262)
assert.equal(GRID.poster, 246)
assert.equal(GRID.posterH, 369)
assert.equal(tileHeight(false), 544)
assert.equal(tileHeight(true), 569)

const admin = { canManage: true, me: 1 }
const req = (over) => ({ id: 7, type: 'movie', status: 2, createdAt: '2026-11-18T10:00:00Z', requestedBy: { id: 2, displayName: 'moonfin' }, media: { tmdbId: 155, status: 5, title: 'X' }, ...over })

// A waiting request gives a moderator Approve at the left and Decline at the right of the poster.
const pending = requestTile(req({ status: 1, media: { tmdbId: 155, status: 2 } }), 0, { viewer: admin, split: false })
assert.deepEqual(pending.actions.map((a) => [a.id, a.x]), [['approve', 20], ['decline', 186]])
assert.equal(pending.status, 'chip')
assert.equal(pending.stripe, theme().status.pending)
assert.deepEqual(pending.lines.map((l) => [l.k, l.y]), [['by', 469], ['date', 493]])

// Split names go under their own label and push the date down a line.
const split = requestTile(req({}), 0, { viewer: admin, split: true })
assert.deepEqual(split.lines.map((l) => [l.k, l.y]), [['by', 469], ['name', 491], ['date', 515]])
assert.equal(split.lines[1].text, 'moonfin')

// Seerr's copy of the queue gives a bar, and a stalled one says so in place of the sizes.
const downloading = requestTile(req({ media: { tmdbId: 155, status: 3, downloadStatus: [{ downloadId: 'a', size: 100, sizeLeft: 60, status: 'warning' }] } }), 0, { viewer: admin, split: false })
assert.equal(downloading.status, 'bar')
assert.equal(downloading.bar.lead, 'Stalled')
assert.equal(downloading.bar.pct, '40%')
assert.equal(downloading.bar.fillW, Math.round(0.4 * 234))
assert.ok(downloading.bar.pctX > downloading.bar.sepX, 'the percentage sits right of the dot')

// A bar with no sizes and no verb on a tile is just its percentage, hard right.
const bare = downloadBar({ fraction: 0.5, state: 'downloading', totalBytes: 0, downloadedBytes: 0 }, { compact: true, width: 234 })
assert.equal(bare.lead, '')
assert.equal(bare.sep, '')
assert.equal(bare.pct, '50%')
assert.ok(bare.pctX > 180 && bare.pctX < 234, 'the percentage ends at the bar\'s right edge')

const chip = statusChip('Available', 'available')
assert.equal(chip.text, 'AVAILABLE')
assert.equal(chip.border, theme().status.available)
assert.equal(statusChip('Approved', 'approved').border, theme().accent)

console.log('RequestsModels ok')
