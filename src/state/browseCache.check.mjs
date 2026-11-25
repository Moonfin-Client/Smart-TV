// Self-check for browseCache.js: node --conditions=browser src/state/browseCache.check.mjs
import assert from 'node:assert/strict'
import {
  CACHE_TTL_LIBRARIES,
  CACHE_TTL_VOLATILE,
  clearBrowseCache,
  clearMemoryCache,
  featuredConfigKey,
  hasDynamicRowConfig,
  rowConfigKey,
  isCacheValid,
  isEmptySection,
  loadBrowseCache,
  memoryCache,
  resetEmptySections,
  saveBrowseCache,
  seedEmptySections,
  setCacheStorage,
  settleSections,
} from './browseCache.js'

const store = {}
const writes = []
setCacheStorage({
  getFromStorage: async (k) => store[k] || null,
  saveToStorage: async (k, v) => {
    writes.push(k)
    store[k] = JSON.parse(JSON.stringify(v))
  },
  removeFromStorage: async (k) => {
    delete store[k]
  },
})

const fill = () => {
  memoryCache.rowData = [{ id: 'resume', items: [] }]
  memoryCache.libraries = [{ Id: 'lib1' }]
  memoryCache.timestamp = 1
  memoryCache.rowConfigKey = 'per-library'
  memoryCache.featuredItems = [{ Id: 'item1' }]
  memoryCache.featuredConfigKey = 'key'
  memoryCache.recentAt = 1
}

// A refresh throws the rows away and keeps the bar when asked, an account change takes both.
fill()
clearMemoryCache({ keepFeatured: true })
assert.equal(memoryCache.rowData, null)
assert.equal(memoryCache.libraries, null)
assert.equal(memoryCache.timestamp, null)
assert.equal(memoryCache.rowConfigKey, null)
assert.equal(memoryCache.recentAt, null)
assert.deepEqual(memoryCache.featuredItems, [{ Id: 'item1' }])
assert.equal(memoryCache.featuredConfigKey, 'key')
clearMemoryCache()
assert.equal(memoryCache.featuredItems, null)
assert.equal(memoryCache.featuredConfigKey, null)

assert.equal(CACHE_TTL_VOLATILE, 300000)
assert.equal(CACHE_TTL_LIBRARIES, 1800000)
assert.ok(isCacheValid(Date.now() - 1000, CACHE_TTL_VOLATILE))
assert.ok(!isCacheValid(Date.now() - CACHE_TTL_VOLATILE - 1, CACHE_TTL_VOLATILE))
assert.ok(!isCacheValid(null, CACHE_TTL_VOLATILE))

// Empty sections: a load that went through settles them, Latest counts any per-library row.
resetEmptySections()
settleSections(['resume', 'latest-media', 'nextup'], [{ id: 'resume', items: [{ Id: 'a' }] }, { id: 'latest-x', isLatestRow: true, items: [{ Id: 'b' }] }, { id: 'nextup', items: [] }])
assert.ok(!isEmptySection('resume'))
assert.ok(!isEmptySection('latest-media'))
assert.ok(isEmptySection('nextup'))
// Seeding happens once per account, from stored rows no older than three days, never for On Now.
resetEmptySections()
seedEmptySections(['resume', 'genres', 'onnow'], { timestamp: Date.now(), rowData: [{ id: 'resume', items: [{ Id: 'a' }] }] })
assert.ok(!isEmptySection('resume'))
assert.ok(isEmptySection('genres'))
assert.ok(!isEmptySection('onnow'))
seedEmptySections(['resume'], { timestamp: Date.now(), rowData: [{ id: 'x', items: [{ Id: 'a' }] }] })
assert.ok(!isEmptySection('resume'))
resetEmptySections()
seedEmptySections(['genres'], { timestamp: Date.now() - 4 * 24 * 3600 * 1000, rowData: [{ id: 'resume', items: [{ Id: 'a' }] }] })
assert.ok(!isEmptySection('genres'))

// Saving waits out the burst, keeps the keys the items were drawn for, strips the items, and
// skips a write that would store the same rows again.
const realSet = globalThis.setTimeout
const timers = []
globalThis.setTimeout = (fn) => timers.push(fn)
fill()
memoryCache.featuredConfigKey = 'bar-key'
memoryCache.rowConfigKey = 'merged-recent'
memoryCache.recentAt = 1234
const rows = [{ id: 'resume', readHead: () => {}, hasMore: true, items: [{ Id: 'a', Name: 'A', UserData: { PlayedPercentage: 40, Rating: 9 }, MediaSources: [1] }] }]
saveBrowseCache(rows, [{ Id: 'lib1' }], [{ Id: 'f' }], { serverUrl: 'http://s', userId: 'u' })
memoryCache.featuredConfigKey = 'later'
await timers.shift()()
const saved = store.browse_cache_v5
assert.equal(saved.featuredConfigKey, 'bar-key')
assert.equal(saved.rowConfigKey, 'merged-recent')
assert.equal(saved.recentAt, 1234)
assert.equal(saved.rowData[0].hasMore, false)
assert.equal(saved.rowData[0].items[0].MediaSources, undefined)
assert.deepEqual(saved.rowData[0].items[0].UserData, { PlayedPercentage: 40 })
saveBrowseCache(rows, [{ Id: 'lib1' }], [], { serverUrl: 'http://s', userId: 'u' })
assert.equal(timers.length, 0)
globalThis.setTimeout = realSet

// Another server's or user's copy is no answer, and clearing drops it.
assert.equal(await loadBrowseCache('http://s', 'other'), null)
assert.equal((await loadBrowseCache('http://s', 'u')).userId, 'u')
await clearBrowseCache()
assert.equal(await loadBrowseCache('http://s', 'u'), null)
// The keys and the rows that skip the caches.
assert.equal(rowConfigKey({}), 'per-library')
assert.equal(rowConfigKey({ mergeRecentRowsByType: true, recentlyReleasedSeriesType: 'episodes', hideWatchedInRecentRows: true }), 'merged-recent:episodes:hide-watched')
assert.equal(rowConfigKey({ recentlyReleasedSeriesType: 'series' }), 'per-library')
assert.equal(featuredConfigKey({ featuredItemCount: 20 }), JSON.stringify([false, false, 'random', null, 20, null, null, null, false, [], [], [], [], false]))
assert.ok(!hasDynamicRowConfig({ homeRows: [{ id: 'resume', enabled: true }] }))
assert.ok(hasDynamicRowConfig({ displayGenresRows: true }))
assert.ok(hasDynamicRowConfig({ homeRows: [{ id: 'sinceyouwatched1', enabled: true }] }))
assert.ok(!hasDynamicRowConfig({ homeRows: [{ id: 'onnow', enabled: false }] }))
console.log('browseCache ok')
