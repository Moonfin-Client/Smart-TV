// Self-check for the Seerr dialogs' state and focus moves: node src/ui/components/seerr/SeerrDialogModels.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// The app's modules lean on Vite for imports without an extension.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { matchState, needsSeriesMatch, resolveAdvanced, requestSheet, requestedByLabel } = await import('./SeerrDialogModels.js')
const { moveFocus, wrapText } = await import('./SeerrDialogLayout.js')
const { textWidth } = await import('../../text.js')

const server = (id, is4k, isDefault, extra = {}) => ({
  server: { id, name: `S${id}`, is4k, isDefault, activeProfileId: 10 + id, activeDirectory: `/m${id}`, ...extra },
  profiles: [{ id: 10 + id, name: 'HD' }, { id: 20 + id, name: '4K' }],
  rootFolders: [{ id: 1, path: `/m${id}` }, { id: 2, path: '/other' }],
})
const servers = [server(1, false, false), server(2, false, true), server(3, true, true, { activeAnimeProfileId: 99, activeAnimeDirectory: '/other' })]
const none = { serverId: null, profileId: null, rootFolderId: null }

let r = resolveAdvanced(servers, none, { is4k: false })
assert.equal(r.serverId, 2, 'the default HD server')
assert.equal(r.profileId, 12)
assert.equal(r.rootFolder, '/m2')
r = resolveAdvanced(servers, none, { is4k: true, isAnime: true })
assert.equal(r.serverId, 3, 'the default 4K server')
assert.equal(r.profileId, 99, 'an anime series takes the anime profile')
assert.equal(r.rootFolder, '/other')
r = resolveAdvanced(servers, { serverId: 1, profileId: 21, rootFolderId: 2 }, {})
assert.deepEqual([r.serverId, r.profileId, r.rootFolder], [1, 21, '/other'], 'picks win')
assert.equal(resolveAdvanced(null, none).server, null, "no servers sends Seerr's defaults")

const g = (over = {}) => ({ is4k: false, startIs4k: false, toggle: false, allSeasons: true, seasons: [], advanced: null, expanded: false, ...over })
const base = { isTv: true, numbers: [1, 2, 3], taken: new Set([1]), available: [1], resolved: r, quota: null, limited: false, continuing: false }
let s = requestSheet({ ...base, g: g() })
assert.equal(s.title, 'Request Series')
assert.equal(s.canSubmit, true)
assert.deepEqual(s.chips.map((c) => [c.id, c.disabled, c.available]), [['season:1', true, true], ['season:2', false, false], ['season:3', false, false]])
s = requestSheet({ ...base, isTv: false, g: g({ is4k: true, startIs4k: true }) })
assert.equal(s.title, 'Request 4K Movie', 'a 4K track button says so')
s = requestSheet({ ...base, isTv: false, g: g({ is4k: true, startIs4k: true, toggle: true }) })
assert.equal(s.title, 'Request Movie', 'the switch sheet keeps the plain title')
s = requestSheet({ ...base, g: g(), quota: { limit: 5, remaining: 1 }, limited: true })
assert.equal(s.canSubmit, false, 'all seasons needs two of one remaining')
assert.equal(s.quota.blocked, true)
s = requestSheet({ ...base, g: g({ allSeasons: false, seasons: [2] }), quota: { limit: 5, remaining: 1 }, limited: true })
assert.equal(s.canSubmit, true)
assert.equal(s.quota.label, '1 of 5 season requests remaining')

assert.equal(needsSeriesMatch({ externalIds: {}, mediaInfo: null }), true, 'no TVDB id anywhere')
assert.equal(needsSeriesMatch({ externalIds: { tvdbId: 5 } }), false)
assert.equal(needsSeriesMatch({ externalIds: {}, mediaInfo: { tvdbId: 7 } }), false, "Seerr's own copy counts")
assert.equal(matchState(g({ matches: null })).state, 'loading')
assert.equal(matchState(g({ matches: null, lookupFailed: true })).state, 'failed')
assert.equal(matchState(g({ matches: [] })).state, 'none')
assert.equal(matchState(g({ matches: [{ tvdbId: 1 }], tvdbId: 1 })).state, 'list')
assert.equal(matchState(g({ matches: null, is4k: true, startIs4k: true })).title, 'Request 4K Series')
s = requestSheet({ ...base, g: g(), match: { tvdbId: 1, title: 'X' } })
assert.equal(s.match.tvdbId, 1, 'the picked match rides along')

const lines = wrapText('Radarr will remove Some.Movie.2024.1080p.WEB-DL.DDP5.1.H.264-GROUPNAME from the client', 20, 'regular', 200)
assert.ok(lines.length > 2, 'a long message wraps')
assert.ok(lines.every((ln) => ln.length > 0), 'no empty lines')
assert.deepEqual(wrapText('aa cross-border', 20, 'regular', textWidth('aa cross-', 20) + 1), ['aa cross-', 'border'], 'a hyphen breaks')
assert.equal(lines.join('').replace(/ /g, ''), 'Radarr will remove Some.Movie.2024.1080p.WEB-DL.DDP5.1.H.264-GROUPNAME from the client'.replace(/ /g, ''), 'nothing lost')

assert.equal(requestedByLabel({ requestedBy: { displayName: 'Ann' } }), 'Requested by Ann')
assert.equal(requestedByLabel({ requestedBy: {}, is4k: true }), 'Requested by Unknown · 4K')

const f = [
  { id: 'a', row: 0, x: 0, y: 0, w: 600, h: 50 },
  { id: 'c1', row: 1, x: 0, y: 60, w: 80, h: 40 },
  { id: 'c2', row: 1, x: 100, y: 60, w: 80, h: 40 },
  { id: 'cancel', row: 2, x: 0, y: 120, w: 290, h: 80 },
  { id: 'submit', row: 2, x: 310, y: 120, w: 290, h: 80 },
]
assert.equal(moveFocus(f, 'a', 'down'), 'c1')
assert.equal(moveFocus(f, 'c1', 'right'), 'c2')
assert.equal(moveFocus(f, 'c2', 'right'), null, 'the row ends')
assert.equal(moveFocus(f, 'c2', 'down'), 'cancel', 'nearest by center')
assert.equal(moveFocus(f, 'submit', 'up'), 'c2')
assert.equal(moveFocus(f, 'a', 'up'), null)
assert.equal(moveFocus(f, 'gone', 'down'), 'a', 'a lost focus starts over')

console.log('SeerrDialogModels ok')
