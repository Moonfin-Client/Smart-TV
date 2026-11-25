// Self-check for carrying another server's items to Details: node src/state/libraryRoutes.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

const stub = (src) => `data:text/javascript,${encodeURIComponent(src)}`
registerHooks({
  resolve(spec, ctx, next) {
    if (/utils\/gameLibrary(\.js)?$/.test(spec)) return { url: stub('export const isGameLibrary = () => false; export const resolveGameLibraryId = (l) => l.Id'), shortCircuit: true }
    if (/Games\/gameModels(\.js)?$/.test(spec)) return { url: stub("export const gamePath = (l, g) => `/games/item/${l}/${g}`"), shortCircuit: true }
    return next(spec, ctx)
  },
})
const { serverOf, detailsData, withServer, routeForItem, playRoute } = await import('./libraryRoutes.js')

const tags = { _serverId: 's2', _serverName: 'Den', _serverUrl: 'http://den:8096', _serverUserId: 'u2', _serverAccessToken: 't2', _serverType: 'jellyfin' }

// Only an item that can reach its own server carries one.
assert.equal(serverOf(null), null)
assert.equal(serverOf({ Id: 'a', _serverUrl: 'http://x' }), null)
assert.deepEqual(serverOf({ Id: 'a', Name: 'A', ...tags }), tags)
assert.deepEqual(detailsData({ Id: 'a' }), {})
assert.deepEqual(detailsData({ Id: 'a', ...tags }), { server: tags })

// Details gets the server for a remote title, and nothing for a local one.
assert.deepEqual(routeForItem({ Id: 'm1', Type: 'Movie', ...tags }), ['/details/m1', { server: tags }])
assert.deepEqual(routeForItem({ Id: 'm1', Type: 'Movie' }), ['/details/m1', {}])
assert.deepEqual(routeForItem({ Id: 'p1', Type: 'Playlist', MediaType: 'Video', ...tags }), ['/details/p1', { server: tags }])

// Playing opens the title's page with autoPlay, a song goes straight to the player, and what has no
// page of its own opens as a pick would.
assert.deepEqual(playRoute({ Id: 'e1', Type: 'Episode' }), ['/details/e1', { autoPlay: true }])
assert.deepEqual(playRoute({ Id: 's1', Type: 'Series', ...tags }), ['/details/s1', { server: tags, autoPlay: true }])
assert.deepEqual(playRoute({ Id: 'a1', Type: 'MusicAlbum' }), ['/album/a1', { autoPlay: true }])
assert.deepEqual(playRoute({ Id: 't1', Type: 'Audio' }), ['/player/t1', {}])
assert.deepEqual(playRoute({ Id: 'c1', Type: 'TvChannel' }), ['/player/c1', { live: true }])
assert.deepEqual(playRoute({ Id: 'b1', Type: 'Book' }), ['/read/b1', {}])

// Lists are tagged one level down, entries holding items too, and anything else is left alone.
const out = withServer(tags, [{ Id: 'e1' }, { id: 'col', items: [{ Id: 'm2' }] }, 'x', null])
assert.equal(out[0]._serverUrl, 'http://den:8096')
assert.equal(out[1].items[0]._serverAccessToken, 't2')
assert.equal(out[1]._serverUrl, undefined)
assert.equal(out[2], 'x')
assert.equal(out[3], null)
assert.deepEqual(withServer(tags, { a: 1 }), { a: 1 })
const local = [{ Id: 'e1' }]
assert.equal(withServer(null, local), local)
console.log('libraryRoutes.check ok')
