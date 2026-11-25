// Self-check for the Row Options preview: node src/ui/components/previews/rowOptionsHome.check.mjs
import assert from 'node:assert/strict'
import { stubUnloadable } from '../../../../scripts/stubUnloadable.mjs'

stubUnloadable()
const store = {}
globalThis.localStorage = globalThis.localStorage || { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k] }
globalThis.window = globalThis.window || globalThis
const { homeOrder, rowOptionsHome } = await import('./rowOptionsHome.js')

const config = [
  { id: 'resume', order: 0, enabled: true },
  { id: 'nextup', order: 1, enabled: true },
  { id: 'genres', order: 2, enabled: true },
  { id: 'latest-media', order: 3, enabled: true },
  { id: 'favoriteMovies', order: 4, enabled: false },
]
const on = { displayGenresRows: true, displayFavoritesRows: true }
// A group row Home doesn't show yet goes where Rows orders it, after the merged Continue Watching.
assert.deepEqual(homeOrder({ order: ['continue-nextup', 'latest-media'] }, config, ['genres'], on), ['continue-nextup', 'genres', 'latest-media'])
// One Home already shows stays put, and a row whose Display switch is tried off leaves.
assert.deepEqual(homeOrder({ order: ['resume', 'genres', 'latest-media'] }, config, ['genres'], on), ['resume', 'genres', 'latest-media'])
assert.deepEqual(homeOrder({ order: ['resume', 'genres', 'latest-media'] }, config, [], { displayGenresRows: false }), ['resume', 'latest-media'])

// Settings the preview doesn't draw on Home's rows get nothing.
assert.equal(rowOptionsHome({ key: 'navbarColor', s: on }), null)
// A group switched off, or on with every row off in Rows, says what to turn on.
const off = rowOptionsHome({ key: 'favoritesRowSortBy', s: { homeRows: config, displayFavoritesRows: false } })
assert.match(off.notice, /first turn on Display Favorites Rows/)
assert.match(off.notice, /open Favorites under Disabled/)
const rowsOff = rowOptionsHome({ key: 'favoritesRowSortBy', s: { homeRows: config, displayFavoritesRows: true } })
assert.match(rowsOff.notice, /The Favorites rows are all turned off/)
// Kids Mode and Multi-Server Libraries keep the rows off whatever Rows says.
assert.match(rowOptionsHome({ key: 'genresRowSortBy', s: { ...on, homeRows: config, unifiedLibraryMode: true }, hasMultipleServers: true }).notice, /Multi-Server Libraries/)
// The Collections episodes switch only changes picked collections, so it says so under the frame.
const picked = rowOptionsHome({ key: 'collectionsRowShowEpisodes', s: { homeRows: [{ id: 'pluginDynamic:collections:x', source: 'collections', itemId: 'x', enabled: true, order: 0 }], displayCollectionsRows: true } })
assert.equal(picked.notice, null)
assert.match(picked.caption, /single collections added in Rows/)
// A Home look setting draws Home's rows (none loaded here) with no notice.
assert.deepEqual(rowOptionsHome({ key: 'watchedIndicatorBehavior', s: on }), { rows: null, notice: null, caption: null })
console.log('rowOptionsHome ok')
