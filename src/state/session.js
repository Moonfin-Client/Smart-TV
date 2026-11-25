// What runs once a user is signed in, from a restored session or a fresh sign-in: the
// libraries for the nav, the settings pull from the server profile, the Seerr check, the
// account's blocked ratings, its access hours and its server messages.
import { loadLibraries } from './homeRows.js'
import { refreshGameLibraries } from '../utils/gameLibrary.js'
import { syncOnLogin } from './settingsSync.js'
import { checkSeerr, seerrState } from './seerr.js'
import { getStore } from './store.js'
import * as settings from './settings.js'
import { adoptLegacyBlockedRatings, loadParentalControls, parentalScopeKey, setParentalScope } from '../services/parentalControls.js'
import { watchAccess } from './shell/access.js'
import { loadMessages } from './shell/messages.js'

let loginSync = Promise.resolve()

// The libraries are read again whenever Multi-Server Libraries or Merge Libraries by Type changes.
const libraryMode = () => `${!!settings.get('unifiedLibraryMode')}|${!!settings.get('mergeLibrariesByType')}`
const reloadLibraries = () =>
  loadLibraries()
    .then((libs) => {
      const store = getStore()
      if (store) store.libraries = libs
    })
    .catch(() => {})
settings.onChange((keys) => {
  if (keys.indexOf('unifiedLibraryMode') >= 0 || keys.indexOf('mergeLibrariesByType') >= 0) reloadLibraries()
})

// Settles once this sign-in's pull from the server profile is done, whichever way it went.
export const settingsRead = () => loginSync

export const afterSignIn = async () => {
  const store = getStore()
  // Blocked ratings belong to whoever is signed in on this server.
  setParentalScope(parentalScopeKey(store.serverUrl, store.userId))
  loadParentalControls().then(() => {
    // The list used to be kept once for the whole TV. Whoever signs in takes it.
    const legacy = settings.get('blockedRatings')
    if (Array.isArray(legacy) && adoptLegacyBlockedRatings(legacy)) settings.update({ blockedRatings: undefined })
  })
  // The nav works out each library's route once, so the plugin's game libraries are known before
  // the libraries land. Both are read at once. Best effort, since a server without the plugin
  // still signs in.
  const [, libraries] = await Promise.all([refreshGameLibraries().catch(() => {}), loadLibraries().catch(() => [])])
  store.libraries = libraries
  store.navSection = 'home'
  // The profile pull is silent, so a library mode it brings in is caught here.
  const mode = libraryMode()
  loginSync = syncOnLogin()
    .catch((e) => console.warn('[session] settings sync', e))
    .then(() => {
      if (libraryMode() !== mode) reloadLibraries()
    })
  watchAccess(store.userId)
  checkSeerr(true)
    .then(() => {
      const state = seerrState()
      store.seerrAvailable = !!(state && state.available)
      store.seerrName = (state && state.displayName) || 'Seerr'
    })
    .catch(() => {
      store.seerrAvailable = false
    })
  loadMessages().catch((e) => console.warn('[session] server messages', e))
}
