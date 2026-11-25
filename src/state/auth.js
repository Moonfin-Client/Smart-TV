// Sign-in state: restoring a saved session, signing in and out, and switching accounts.
import $L from '../services/i18n.js'
import * as jellyfinApi from '../services/jellyfinApi.js'
import * as multiServerManager from '../services/multiServerManager.js'
import { initStorage, getFromStorage, saveToStorage, removeFromStorage } from '../services/storage.js'
import { clearAnimeMarkerCache } from '../services/animeMarkersApi.js'
import { clearPosterBadges } from '../services/posterBadgesApi.js'
import { resetLibraryScope } from '../services/libraryScope.js'
import { resetBlockedContentGate } from '../services/blockedContentGate.js'
import { clearMergedTitleReads } from '../services/mergedTitleReads.js'
import { clearMembershipCache } from '../services/itemMembershipService.js'
import * as serverSocket from '../services/serverSocket.js'
import * as userDataSync from '../services/userDataSync.js'
import * as remoteControl from '../services/remoteControl.js'
import { bestPlexAddress } from '../services/plexTv.js'
import { onSiloSessionEnded, onSiloTokensRotated, siloServerKey } from '../services/siloSession.js'
import { syncNotificationPrefs } from '../services/notificationPrefs.js'
import { parseUrl } from '../utils/urlCompat.js'
import { noteProvedSignIn } from '../utils/signInPin.js'
import { getStore } from './store.js'
import { audio, stop as stopAudio } from './audioPlayer.js'
import { stopAccess } from './shell/access.js'
import { router } from '../app/router.js'

let stopSession = null

// Set when Silo ended the signed-in profile's login, so sign-in opens for that server with the
// profile's name filled in: { server, username }.
let siloSignInAgain = null
export const takeSiloSignInAgain = () => {
  const again = siloSignInAgain
  siloSignInAgain = null
  return again
}

const store = () => getStore()

const serverNameFor = (url, name) => {
  if (name) return name
  try {
    return parseUrl(url).hostname
  } catch (e) {
    return $L('Media Server')
  }
}

export const loadServers = async () => {
  try {
    const [all, unique, active] = await Promise.all([
      multiServerManager.getAllServersArray(),
      multiServerManager.getUniqueServers(),
      multiServerManager.getActiveServer(),
    ])
    if (store()) store().servers = all
    return { all, unique, active }
  } catch (e) {
    console.error('[auth] loading servers failed', e)
    return { all: [], unique: [], active: null }
  }
}

const addressFor = (entry) =>
  entry && entry.serverType === 'plex'
    ? bestPlexAddress(entry, (best) => multiServerManager.updateServer(entry.serverId, { url: best }).then(loadServers))
    : Promise.resolve(entry && entry.url)

// The session socket, watched-state sync and remote control belong to whoever is signed in.
const startSession = () => {
  if (stopSession) stopSession()
  serverSocket.connect()
  userDataSync.bindTo(serverSocket.onMessage, jellyfinApi.getUserId())
  remoteControl.bindTo(serverSocket.onMessage)
  const stopReporting = serverSocket.onConnectionChange((open) => {
    if (open) jellyfinApi.reportCapabilities({ unlessRecent: true })
  })
  stopSession = () => {
    stopReporting()
    remoteControl.reset()
    userDataSync.reset()
    serverSocket.disconnect()
    stopSession = null
  }
}

// These hold one account's answers, and some are keyed by bare item id, so they'd follow the
// user onto the next server or account.
const clearSessionCaches = () => {
  clearAnimeMarkerCache()
  clearPosterBadges()
  resetLibraryScope()
  resetBlockedContentGate()
  clearMergedTitleReads()
  clearMembershipCache()
}

const setSignedIn = ({ url, name, type, user }) => {
  clearSessionCaches()
  const s = store()
  s.serverUrl = url
  s.serverName = name || ''
  s.serverType = type || 'jellyfin'
  s.user = user
  s.userId = user ? user.Id : ''
  s.authenticated = !!user
  if (!user) return
  startSession()
  // Plex keeps no Seerr notification choices.
  if (s.serverType !== 'plex') {
    syncNotificationPrefs(jellyfinApi.getServerUrl(), jellyfinApi.getApiKey(), user.Id).catch((e) =>
      console.warn('[auth] Seerr notification choices not synced', e)
    )
  }
}

const setSignedOut = () => {
  clearSessionCaches()
  if (stopSession) stopSession()
  stopAccess()
  const s = store()
  s.authenticated = false
  s.user = null
  s.userId = ''
}

// Restores the saved session, the active account or a pinned one, unless auto login is off.
export const restore = async () => {
  await initStorage()
  await jellyfinApi.initDeviceId()
  const { all, active } = await loadServers()
  const settings = (await getFromStorage('settings')) || {}
  const behavior = settings.autoLoginBehavior || (settings.autoLogin === false ? 'disabled' : 'lastUser')
  const autoLogin = behavior !== 'disabled' && settings.alwaysAuthenticate !== true

  let target = active
  if (behavior === 'currentUser' && settings.autoLoginUserId) {
    const pinned = all.find((s) => s.serverId === settings.autoLoginServerId && s.userId === settings.autoLoginUserId)
    if (pinned) target = pinned
  }
  if (!target || !autoLogin) return false
  if (target !== active) await multiServerManager.setActiveServer(target.serverId, target.userId)
  target = { ...target, url: await addressFor(target) }
  target.serverType = await multiServerManager.checkServerType(target.serverId, target.url, target.serverType || 'jellyfin')
  jellyfinApi.setServer(target.url)
  jellyfinApi.setServerType(target.serverType || 'jellyfin')
  jellyfinApi.setAuth(target.userId, target.accessToken)
  try {
    const user = await jellyfinApi.api.getUserConfiguration()
    setSignedIn({ url: target.url, name: target.name, type: target.serverType, user })
    return true
  } catch (e) {
    console.warn('[auth] saved token no longer works, sign-in needed')
    jellyfinApi.setAuth(null, null)
    return false
  }
}

// Set when a Silo sign-in brought a household of several profiles, so the app asks who's watching
// once Home is up.
let householdToPick = false
export const takeHouseholdPick = () => {
  const pick = householdToPick
  householdToPick = false
  return pick
}

// A Silo household: every profile is saved as a user of the server, sharing the account's token, so
// the profile picker is the Who's watching list.
const saveSiloHousehold = async (server, name, serverId, result, serverType, serverVersion) => {
  if (!result.SiloAccountId) return
  const profiles = result.SiloUsers || [result.User]
  householdToPick = profiles.length > 1
  for (const profile of profiles) {
    if (profile.Id !== result.User.Id) {
      await multiServerManager.addServer(server, name, profile.Id, profile.Name, result.AccessToken, profile.PrimaryImageTag, serverType, serverVersion)
    }
    await multiServerManager.updateServer(serverId, null, profile.Id, { siloAccountId: result.SiloAccountId, siloHasPin: profile.SiloHasPin === true })
  }
}

const finishSignIn = async (server, result, options = {}) => {
  const { serverName, serverType = 'jellyfin', serverVersion = null } = options
  jellyfinApi.setAuth(result.User.Id, result.AccessToken)
  const name = serverNameFor(server, serverName)
  const saved = await multiServerManager.addServer(
    server, name, result.User.Id, result.User.Name, result.AccessToken, result.User.PrimaryImageTag, serverType, serverVersion
  )
  await saveSiloHousehold(server, name, saved.serverId, result, serverType, serverVersion)
  await multiServerManager.setActiveServer(saved.serverId, result.User.Id)
  await saveToStorage('auth', { serverUrl: server, userId: result.User.Id, token: result.AccessToken, user: result.User })
  loadServers()
  setSignedIn({ url: server, name, type: serverType, user: result.User })
  return result
}

export const login = async (server, username, password, options = {}) => {
  jellyfinApi.setServer(server)
  jellyfinApi.setServerType(options.serverType || 'jellyfin')
  const result = await jellyfinApi.api.authenticateByName(username, password)
  if (password) noteProvedSignIn(server, result.User.Id)
  return finishSignIn(server, result, options)
}

// Signs in once the Quick Connect code is approved on another device.
export const pollQuickConnect = async (server, secret, options = {}) => {
  jellyfinApi.setServer(server)
  const state = await jellyfinApi.api.getQuickConnectState(secret)
  if (!state || !state.Authenticated) return null
  const result = await jellyfinApi.api.authenticateQuickConnect(secret)
  noteProvedSignIn(server, result.User.Id)
  return finishSignIn(server, result, options)
}

// Music belongs to whoever started it, so a change of account stops it.
const stopMusic = () => {
  if (audio.active) stopAudio()
}

export const switchUser = async (serverId, userId) => {
  await remoteControl.runPlayerCommand('stop')
  stopMusic()
  const ok = await multiServerManager.setActiveServer(serverId, userId)
  if (!ok) return false
  const saved = await multiServerManager.getActiveServer()
  if (!saved) return false
  const active = { ...saved, url: await addressFor(saved) }
  active.serverType = await multiServerManager.checkServerType(active.serverId, active.url, active.serverType || 'jellyfin')
  jellyfinApi.setServer(active.url)
  jellyfinApi.setServerType(active.serverType)
  jellyfinApi.setAuth(active.userId, active.accessToken)
  let user
  try {
    user = await jellyfinApi.api.getUserConfiguration()
  } catch (e) {
    // A Silo profile with a PIN answers nothing until the PIN gate, next, unlocks it.
    if (active.serverType !== 'silo' || !active.siloHasPin) {
      jellyfinApi.setAuth(null, null)
      setSignedOut()
      return false
    }
    user = { Id: active.userId, Name: active.username }
  }
  setSignedIn({ url: active.url, name: active.name, type: active.serverType, user })
  return true
}

// Leaves the account without forgetting it, so it can be picked again (Time's up, Forgot PIN).
export const leaveSession = () => {
  stopMusic()
  jellyfinApi.setAuth(null, null)
  setSignedOut()
}

export const logout = async () => {
  await remoteControl.runPlayerCommand('stop')
  stopMusic()
  const active = await multiServerManager.getActiveServer()
  if (active) await multiServerManager.removeServer(active.serverId, active.userId, { keepServer: true })
  const remaining = await multiServerManager.getTotalUserCount()
  if (remaining > 0) {
    const next = await multiServerManager.getActiveServer()
    if (next && (await switchUser(next.serverId, next.userId))) return
  }
  await removeFromStorage('auth')
  jellyfinApi.setAuth(null, null)
  await loadServers()
  setSignedOut()
}

// Silo rotates an account's tokens on every refresh, so the saved profiles holding the old access
// token move to the new one.
onSiloTokensRotated(async (session, previousToken) => {
  const next = session.tokens.accessToken
  const stale = (await multiServerManager.getAllServersArray()).filter((e) => e.serverType === 'silo' && e.accessToken === previousToken)
  for (const entry of stale) await multiServerManager.updateServer(entry.serverId, null, entry.userId, { accessToken: next })
  if (stale.length) loadServers()
})

// Silo refused the refresh because the password changed or the account's sessions were signed
// out. The login was the whole household's, so every saved profile of the account goes, and
// sign-in opens for it with the name filled in.
onSiloSessionEnded(async (session) => {
  if (jellyfinApi.getServerType() !== 'silo' || siloServerKey(jellyfinApi.getServerUrl()) !== session.server) return
  console.warn('[auth] Silo refused the session refresh, sign-in needed')
  const token = jellyfinApi.getApiKey()
  const userId = jellyfinApi.getUserId()
  const signedIn = !!(store() && store().authenticated)
  jellyfinApi.setAuth(null, null)
  try {
    const saved = (await multiServerManager.getAllServersArray()).filter(
      (e) => e.serverType === 'silo' && siloServerKey(e.url) === session.server
    )
    const self = saved.find((e) => e.userId === userId)
    const household = self
      ? saved.filter((e) => multiServerManager.sameSiloHousehold(e, { ...self, siloAccountId: session.accountId }, token))
      : saved.filter((e) => e.siloAccountId === session.accountId)
    if (self) {
      siloSignInAgain = {
        server: { serverId: self.serverId, url: self.url, name: self.name, serverType: 'silo', version: null },
        username: self.username,
      }
    }
    for (const entry of household) await multiServerManager.removeServer(entry.serverId, entry.userId)
    await removeFromStorage('auth')
  } catch (e) {
    console.error('[auth] forgetting the ended Silo login failed', e)
  } finally {
    // Signed out whatever the storage did, or the screens stay up sending requests without a token.
    await loadServers()
    leaveSession()
    if (signedIn) router.to('/login', {}, { inHistory: false })
  }
})
