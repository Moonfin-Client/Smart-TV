// Plex keeps no app settings for the user, so the hidden libraries and the library order are kept on the device, per
// server and user, and the library lists follow them.   node --conditions=browser src/services/plexApi.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// The device storage is a plain object here, and a save can be refused the way a full TV storage refuses it.
const stored = {}
let refuseSaves = false
globalThis.plexCheckStorage = {
  initStorage: async () => true,
  getFromStorage: async (key) => stored[key] ?? null,
  saveToStorage: async (key, value) => (refuseSaves ? false : ((stored[key] = value), true)),
  removeFromStorage: async (key) => delete stored[key],
  clearAllStorage: async () => true,
}
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
  load(url, ctx, next) {
    if (url.endsWith('/src/services/storage.js')) {
      return {
        format: 'module',
        shortCircuit: true,
        source: 'export const {initStorage, getFromStorage, saveToStorage, removeFromStorage, clearAllStorage} = globalThis.plexCheckStorage',
      }
    }
    return next(url, ctx)
  },
})

const answers = {
  '/': { machineIdentifier: 'machine-1' },
  '/identity': { machineIdentifier: 'machine-1' },
  '/library/sections': {
    Directory: [
      { key: '1', type: 'movie', title: 'Movies' },
      { key: '2', type: 'show', title: 'TV Shows' },
      { key: '3', type: 'movie', title: 'Docs' },
    ],
  },
}
globalThis.fetch = async (url) => {
  const body = { MediaContainer: answers[new URL(url).pathname] || {} }
  return new Response(JSON.stringify(body), { status: 200 })
}

const { createPlexApi } = await import('./plexApi.js')
const device = { appName: 'Moonfin', appVersion: '1', deviceName: 'TV', deviceId: 'dev-1' }
const apiFor = (userId) =>
  createPlexApi({ getBaseUrl: () => 'http://plex:32400', getToken: () => `tok-${userId}`, getUserId: () => userId, getDeviceInfo: () => device })
const names = (result) => result.Items.map((view) => view.Name)

const plex = apiFor('user-1')
assert.deepEqual((await plex.getUserConfiguration()).Configuration, {}, 'nothing kept yet')
assert.deepEqual(names(await plex.getLibraries()), ['Movies', 'TV Shows', 'Docs', 'Live TV'], "Plex's own order to start")

const config = { MyMediaExcludes: ['section-3'], OrderedViews: ['section-2', 'section-3'] }
await plex.updateUserConfiguration(config)
assert.deepEqual(Object.keys(stored), ['plexUserConfiguration_machine-1_user-1'])
assert.deepEqual((await plex.getUserConfiguration()).Configuration, config)
assert.deepEqual(names(await plex.getLibraries()), ['TV Shows', 'Movies', 'Live TV'], 'hidden left out, saved order, Live TV last')
assert.deepEqual(names(await plex.getAllLibraries()), ['TV Shows', 'Docs', 'Movies'], 'every library, in the saved order')

// The app opening again reads what was kept.
assert.deepEqual(names(await apiFor('user-1').getLibraries()), ['TV Shows', 'Movies', 'Live TV'])
// Another user on the same server keeps their own.
assert.deepEqual(names(await apiFor('user-2').getLibraries()), ['Movies', 'TV Shows', 'Docs', 'Live TV'])

refuseSaves = true
await assert.rejects(plex.updateUserConfiguration({ MyMediaExcludes: [] }), 'a refused save is reported, not taken as kept')
assert.deepEqual((await plex.getUserConfiguration()).Configuration, config)
console.log('plexApi ok')
