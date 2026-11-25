// Self-check for Quick Look's season cards:
// node --conditions=browser src/pages/Details/quickLook/seasons.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// The app's modules lean on Vite for imports without an extension.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { seasonCards, SEASON_H } = await import('./seasons.js')

const near = (a, b, d = 0.6) => assert.ok(Math.abs(a - b) <= d, `${a} vs ${b}`)
const season = (id, name, total, unplayed) => ({ Id: id, Name: name, ChildCount: total, UserData: { UnplayedItemCount: unplayed } })
const bag = (seasons) => ({ item: { Id: 'x', Type: 'Series' }, settings: {}, seerr: {}, lists: { seasons } })

// Four seasons share 872.2px as 3.3 parts less two 13.4px gaps, and touch.
const cards = seasonCards(bag([season('a', 'Specials', 1, 1), season('b', 'Season 1', 8, 8), season('c', 'Season 2', 8, 4), season('d', 'Season 3', 8, 0)]), 872.2)
assert.equal(cards.length, 4)
near(cards[0].w, 256.2)
near(cards[1].x, 256.2)
near(cards[3].x, 768.5)
// The head line sits 13.6px down, the track 41.4px under it, 214.2 wide.
near(cards[0].trackY - 41.4, 13.6, 0.1)
near(cards[0].trackW, 214.2)
assert.equal(cards[0].count, '0 of 1')
assert.equal(cards[2].share, 0.5)
assert.equal(cards[3].share, 1)
// The count ends 21px inside the card's right edge, and the name stops 10px before it.
assert.ok(cards[0].countX > 150 && cards[0].countX < 210)
near(cards[0].nameW - 1 + 10 + (cards[0].w - 21 - cards[0].countX), 214.2)
// Three or fewer split the row evenly.
const three = seasonCards(bag([season('a', 'S1', 0, 0), season('b', 'S2', 0, 0), season('c', 'S3', 0, 0)]), 872.2)
near(three[0].w, (872.2 - 26.8) / 3)
// A season with no episodes has no count or track, and its head is centered alone.
assert.equal(three[0].count, '')
near(three[0].trackY - 41.4, 1 + (SEASON_H - 2 - 33) / 2, 0.1)
assert.deepEqual(seasonCards(bag([]), 872.2), [])
console.log('quickLook seasons ok')
