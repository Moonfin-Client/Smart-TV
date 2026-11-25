import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

const stub = (src) => `data:text/javascript,${encodeURIComponent(src)}`
const STUBS = {
  helpers: stub('export const getImageUrl = (srv, id, type, opts = {}) => `${srv}/Items/${id}/Images/${type}?maxWidth=${opts.maxWidth || 1920}&tag=${opts.tag || ""}`'),
}
registerHooks({
  resolve(spec, ctx, next) {
    const m = /\/(utils\/helpers)(\.js)?$/.exec(spec)
    if (m) return { url: STUBS.helpers, shortCircuit: true }
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})

const {
  DEFAULT_DETAILS_BACKDROP_INTERVAL_MS,
  buildBackdropCycleOrder,
  createBackdropCycler,
  getDetailBackdropUrls,
  normalizeBackdropIntervalMs,
  toGlassBackdropUrl,
} = await import('./detailsBackdropCycle.js')

assert.equal(normalizeBackdropIntervalMs(5000), 5000)
assert.equal(normalizeBackdropIntervalMs('30000'), 30000)
assert.equal(normalizeBackdropIntervalMs(999), DEFAULT_DETAILS_BACKDROP_INTERVAL_MS)

// Own backdrops & parent fallback
const ownUrls = getDetailBackdropUrls('http://jf', { Id: 'm1', BackdropImageTags: ['t0', 't1'] })
assert.deepEqual(ownUrls, [
  'http://jf/Items/m1/Images/Backdrop?maxWidth=1920&tag=t0',
  'http://jf/Items/m1/Images/Backdrop/1?maxWidth=1920&tag=t1',
])
const parentUrls = getDetailBackdropUrls('http://jf', { Id: 'e1', ParentBackdropItemId: 's1', ParentBackdropImageTags: ['p0', 'p1'] })
assert.deepEqual(parentUrls, [
  'http://jf/Items/s1/Images/Backdrop?maxWidth=1920&tag=p0',
  'http://jf/Items/s1/Images/Backdrop/1?maxWidth=1920&tag=p1',
])

// Glass URL preserves item ID, Backdrop/N index, and tag while resizing to 640px + blur=3
assert.equal(
  toGlassBackdropUrl('http://jf/Items/m1/Images/Backdrop/1?maxWidth=1920&quality=90&tag=t1'),
  'http://jf/Items/m1/Images/Backdrop/1?maxWidth=640&quality=90&tag=t1&blur=3',
)

// Server order vs Fisher-Yates with boundary non-repeat
const src = ['a', 'b', 'c']
assert.deepEqual(buildBackdropCycleOrder(src, false), ['a', 'b', 'c'])
const shuffled = buildBackdropCycleOrder(src, true, 'c', () => 0)
assert.notEqual(shuffled[0], 'c')
assert.deepEqual(shuffled.slice().sort(), ['a', 'b', 'c'])

// Cycler advances, pauses/resumes without resetting order, and stops cleanly
let tickFn = null
let starts = 0
let cleared = 0
const seen = []
const cycler = createBackdropCycler((url) => seen.push(url), {
  setIntervalFn: (fn) => { starts++; tickFn = fn; return starts },
  clearIntervalFn: () => { cleared++; tickFn = null },
})
const first = cycler.sync(['a', 'b', 'c'], { enabled: true, shuffle: false, intervalMs: 5000 })
assert.equal(first, 'a')
assert.equal(starts, 1)
tickFn()
assert.deepEqual(seen, ['b'])
cycler.pause()
assert.equal(cleared, 1)
assert.equal(tickFn, null)
cycler.resume()
assert.equal(starts, 2)
assert.ok(tickFn)
tickFn()
assert.deepEqual(seen, ['b', 'c'])
cycler.stop()
assert.equal(cleared, 2)
