// Self-check for rowOptionsBlocked.js: node src/pages/Settings/rowOptionsBlocked.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'

// The app's modules lean on Vite for imports without an extension. The
// preview's key lists come straight from previewRows.js, without the schema it imports.
const keyLists = readFileSync(new URL('./previewRows.js', import.meta.url), 'utf8').match(/^export const \w+_ROW_OPTION_KEYS = \[.*\];$/gm).join('\n')
const keys = 'data:text/javascript,' + encodeURIComponent(keyLists)
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === './previewRows.js') spec = keys
    else if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { rowOptionsBlockedReason: why } = await import('./rowOptionsBlocked.js')

const rows = (ids) => ids.map((id, order) => ({ id, enabled: true, order }))
const base = { homeRows: rows(['resume', 'nextup']), displayGenresRows: false, displayCollectionsRows: true }

assert.equal(why('homeRowsImageType', base, false), null, 'a key outside the Row Options groups has no reason')
assert.equal(why('genresRowSortBy', base, false), 'Turn on Display Genres Rows, then turn on a row in Rows', 'the Display switch comes first')
assert.equal(why('collectionsRowSortBy', base, false), 'Turn on a row in Rows, under Disabled', 'with the switch on, the row is next')
assert.equal(why('genresRowSortBy', { ...base, homeRows: rows(['genres']) }, false), null, 'a group with a row on Home is not blocked')
const picked = { ...base, homeRows: [{ id: 'pick', source: 'collections', itemId: '1', serverUrl: 'http://a', enabled: true, order: 0 }] }
assert.equal(why('collectionsRowSortBy', picked, false), null, 'a picked collection counts for the Collections sort')
assert.equal(why('genresRowSortBy', { ...base, unifiedLibraryMode: true }, true), 'Multi-Server Libraries keeps this off Home')
assert.equal(why('genresRowSortBy', { ...base, unifiedLibraryMode: true }, false), 'Turn on Display Genres Rows, then turn on a row in Rows', 'one server is not multi-server')
assert.equal(why('genresRowSortBy', { ...base, kidsModeEnabled: true }, false), 'Kids Mode keeps this off Home')
console.log('rowOptionsBlocked checks passed')
