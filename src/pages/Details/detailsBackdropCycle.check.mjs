import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

const stub = (src) => `data:text/javascript,${encodeURIComponent(src)}`
const STUBS = {
  helpers: stub('export const getImageUrl = (srv, id, type, opts = {}) => `${srv}/Items/${id}/Images/${type}?tag=${opts.tag || ""}`'),
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
} = await import('./detailsBackdropCycle.js')

assert.equal(normalizeBackdropIntervalMs(5000), 5000)
assert.equal(normalizeBackdropIntervalMs('30000'), 30000)
assert.equal(normalizeBackdropIntervalMs(999), DEFAULT_DETAILS_BACKDROP_INTERVAL_MS)

// Own backdrops & parent fallback
const ownUrls = getDetailBackdropUrls('http://jf', { Id: 'm1', BackdropImageTags: ['t0', 't1'] })
assert.deepEqual(ownUrls, [
  'http://jf/Items/m1/Images/Backdrop?tag=t0',
  'http://jf/Items/m1/Images/Backdrop/1?tag=t1',
])
const parentUrls = getDetailBackdropUrls('http://jf', { Id: 'e1', ParentBackdropItemId: 's1', ParentBackdropImageTags: ['p0', 'p1'] })
assert.deepEqual(parentUrls, [
  'http://jf/Items/s1/Images/Backdrop?tag=p0',
  'http://jf/Items/s1/Images/Backdrop/1?tag=p1',
])

// Server order vs Fisher-Yates with boundary non-repeat
const src = ['a', 'b', 'c']
assert.deepEqual(buildBackdropCycleOrder(src, false), ['a', 'b', 'c'])
const shuffled = buildBackdropCycleOrder(src, true, 'c', () => 0)
assert.notEqual(shuffled[0], 'c')
assert.deepEqual(shuffled.slice().sort(), ['a', 'b', 'c'])

// Cycler advances and wraps without repeating across boundary
let tickFn = null
let cleared = 0
const seen = []
const cycler = createBackdropCycler((url) => seen.push(url), {
  setIntervalFn: (fn) => { tickFn = fn; return 42 },
  clearIntervalFn: () => { cleared++ },
})
const first = cycler.sync(['a', 'b'], { enabled: true, shuffle: false, intervalMs: 5000 })
assert.equal(first, 'a')
tickFn()
tickFn()
assert.deepEqual(seen, ['b', 'a'])
cycler.stop()
assert.equal(cleared, 1)
