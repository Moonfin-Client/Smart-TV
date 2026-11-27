// Self-check for Hide Libraries and Library Order with two servers: node src/pages/Settings/screens/libraryVisibility.check.mjs
import assert from 'node:assert/strict'
import { stubUnloadable } from '../../../../scripts/stubUnloadable.mjs'

stubUnloadable()
const store = {}
globalThis.localStorage = globalThis.localStorage || { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k] }
globalThis.window = globalThis.window || globalThis
const settings = await import('../../../state/settings.js')
const { default: connectionPool } = await import('../../../services/connectionPool.js')
const { SCREENS } = await import('./editors.js')

// Two Plex servers number their libraries the same way, and only A hides its Movies.
const A = 'http://a:32400'
const B = 'http://b:32400'
const library = (url, Id, Name) => ({ Id, Name, CollectionType: 'movies', _serverUrl: url, _serverName: url === A ? 'A' : 'B' })
const libraries = [library(A, 'section-1', 'Movies'), library(A, 'section-2', 'Shows'), library(B, 'section-1', 'Movies'), library(B, 'section-2', 'Shows')]
let stored = { [A]: ['section-1'], [B]: [] }
connectionPool.getAllLibrariesFromAllServers = async () => libraries
connectionPool.getUserConfigFromAllServers = async () =>
  [A, B].map((serverUrl) => ({ serverUrl, userId: 'u', accessToken: 't', serverType: 'plex', configuration: { MyMediaExcludes: stored[serverUrl] } }))
connectionPool.updateUserConfigOnServer = async (url, token, userId, config) => {
  stored[url] = config.MyMediaExcludes
}
settings.set('unifiedLibraryMode', true)
const page = { ctx: { hasMultipleServers: true }, refresh() {}, $setTimeout() {}, focusList() {}, pop() {}, showToast() {} }
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
const open = async (screen) => {
  const view = {}
  SCREENS[screen].entries(page, view)
  await settle()
  return view
}

const view = await open('libraries')
const cards = () => SCREENS.libraries.entries(page, view).filter((e) => e.type === 'card')
assert.deepEqual(cards().map((c) => c.sub), ['Hidden', 'Visible', 'Visible', 'Visible'])
assert.equal(new Set(cards().map((c) => c.sid)).size, 4)

// Showing A's Movies and hiding B's Shows saves each server's own list.
cards()[0].press(page)
cards()[3].press(page)
assert.deepEqual(cards().map((c) => c.sub), ['Visible', 'Visible', 'Visible', 'Hidden'])
const save = SCREENS.libraries.entries(page, view).find((e) => e.k === 'lib-btns')
await save.buttons.find((b) => b.sid === 'lib-save').press(page)
assert.deepEqual(stored, { [A]: [], [B]: ['section-2'] })

// Library Order marks only the library its own server hides, and every row keeps its own id.
const order = await open('libraryOrder')
const rows = SCREENS.libraryOrder.entries(page, order).filter((e) => e.sid && e.sid.startsWith('library-order-'))
assert.deepEqual(rows.map((r) => r.sub), ['', '', '', 'Hidden'])
assert.equal(new Set(rows.map((r) => r.sid)).size, 4)

console.log('libraryVisibility checks passed')
process.exit(0)
