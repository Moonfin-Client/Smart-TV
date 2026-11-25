// Self-check for carouselModels.js: node src/ui/components/player/carouselModels.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.(m?js|json)$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
  load(url, ctx, next) {
    return next(url, url.endsWith('.json') ? { ...ctx, importAttributes: { type: 'json' } } : ctx)
  },
})
const M = await import('./carouselModels.js')

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, `${msg}: ${a} vs ${b}`)
// The strip at 1920: four cards across, the centered one in the middle.
near(M.PITCH, 455.3, 'pitch')
near(M.CARD_W, 440.8, 'card width')
near(M.CARD_H, 218.95, 'card height')
near(M.LEADING, 691.6, 'leading')
assert.equal(M.VISIBLE, 4)
assert.equal(M.SLOTS, 9)
near(M.OVERLAY_Y, 607.05, 'overlay top')

assert.equal(M.cardBackground(null, false), '#1c1c1cbd')
assert.equal(M.cardBackground({ rgb: '192, 73, 122' }, true), '#3f242fe0')

// A long lineup: nine slots, each holding the raw index that's its own modulo.
const plan = M.slotPlan(0, 50)
assert.equal(plan.length, 9)
assert.deepEqual(plan.map((p) => p.slot), [5, 6, 7, 8, 0, 1, 2, 3, 4])
assert.deepEqual(plan.map((p) => p.channel), [46, 47, 48, 49, 0, 1, 2, 3, 4], 'wraps at the start')
assert.equal(plan.find((p) => p.centered).slot, 0)
const next = M.slotPlan(1, 50)
const moved = next.filter((p) => { const was = plan.find((q) => q.slot === p.slot); return was.channel !== p.channel })
assert.equal(moved.length, 1, 'a move rewrites one slot')
assert.equal(moved[0].channel, 5)
// A lineup that fits is drawn at its real count around the selection, without moving.
const small = M.slotPlan(2, 3)
assert.deepEqual(small.map((p) => p.channel), [1, 2, 0])
assert.deepEqual(small.map((p) => p.centered), [false, true, false])
near(small[1].x, M.LEADING, 'the selection sits in the middle')

const program = { Name: 'Bluey', EpisodeTitle: 'Bluey', ParentIndexNumber: 3, IndexNumber: 7, StartDate: '2026-11-23T17:50:00Z', EndDate: '2026-11-23T18:10:00Z', IsKids: true, OfficialRating: 'TV-Y' }
const head = M.headerModel({ Name: 'USA Disney Junior' }, program, '12-hour')
assert.ok(/^Bluey \(S3:E7\)$/.test(head.title), 'an episode title repeating the name is left out')
assert.ok(/ · TV-Y · Kids$/.test(head.meta), head.meta)
assert.equal(M.headerModel({ Name: 'USA Disney Junior' }, null, '12-hour').title, 'USA Disney Junior')
assert.deepEqual(M.fittingItems(['aaaa', 'bbbb', 'cccc'], 60, 10, ' · '), ['aaaa'], 'items past the width are dropped')
assert.equal(M.lineCount('one two three four', 10, 60, 2), 2)
assert.equal(M.lineCount('', 10, 60, 2), 0)
console.log('carouselModels ok')
