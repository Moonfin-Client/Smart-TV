// Self-check for auth.js's Sign Out with the saved servers in memory and the server APIs stubbed:
//   node --conditions=browser src/state/auth.check.mjs
// Signing out of any profile of a Silo account takes the account's other profiles with it and ends
// the login on Silo once, while other accounts and servers stay saved. Sign Out All Users ends every
// Silo login.
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const src = join(dirname(fileURLToPath(import.meta.url)), '..')
const noop = (names) => names.map((n) => `export const ${n} = () => {}`).join('\n')
const STUBS = {
  'services/storage.js': `const data = (globalThis.__storage = {})
    export const initStorage = async () => {}
    export const getFromStorage = async (k) => (k in data ? JSON.parse(data[k]) : null)
    export const saveToStorage = async (k, v) => { data[k] = JSON.stringify(v) }
    export const removeFromStorage = async (k) => { delete data[k] }`,
  'services/secureFetch.js': `export const platformFetch = async () => ({ ok: false })`,
  'utils/connectionErrors.js': `export const detectServerType = () => null`,
  'services/jellyfinApi.js': `const auth = (globalThis.__auth = { url: null, type: 'jellyfin', userId: null, token: null })
    export const logouts = (globalThis.__logouts = [])
    export const setServer = (u) => { auth.url = u }
    export const setServerType = (t) => { auth.type = t }
    export const setAuth = (id, token) => { auth.userId = id; auth.token = token }
    export const getServerUrl = () => auth.url
    export const getServerType = () => auth.type
    export const getUserId = () => auth.userId
    export const getApiKey = () => auth.token
    export const reportCapabilities = () => {}
    export const createApiForServer = (url, token, userId, type) => ({
      logout: async () => { logouts.push({ url, token, userId, type, loaded: globalThis.__sessionsLoaded === true, signedInAs: globalThis.__store?.userId }); await globalThis.__logoutGate },
    })
    export const api = { getUserConfiguration: async () => ({ Id: auth.userId, Name: 'user ' + auth.userId }) }`,
  'services/i18n.js': `export default (s) => s`,
  'services/animeMarkersApi.js': noop(['clearAnimeMarkerCache']),
  'services/posterBadgesApi.js': noop(['clearPosterBadges']),
  'services/libraryScope.js': noop(['resetLibraryScope']),
  'services/blockedContentGate.js': noop(['resetBlockedContentGate']),
  'services/mergedTitleReads.js': noop(['clearMergedTitleReads']),
  'services/itemMembershipService.js': noop(['clearMembershipCache']),
  'services/serverSocket.js': noop(['connect', 'disconnect', 'onMessage']) + '\nexport const onConnectionChange = () => () => {}',
  'services/userDataSync.js': noop(['bindTo', 'reset']),
  'services/remoteControl.js': noop(['bindTo', 'reset']) + '\nexport const runPlayerCommand = async () => {}',
  'services/plexTv.js': `export const bestPlexAddress = async (e) => e.url`,
  'services/siloSession.js': noop(['onSiloSessionEnded', 'onSiloTokensRotated']) + `
    export const siloServerKey = (u) => u
    export const loadSiloSessions = async () => { globalThis.__sessionsLoaded = true }
    export const siloSessionFor = (server, token) => (globalThis.__siloSessions || []).find((s) => s.tokens.accessToken === token || s.aliases.includes(token)) || null`,
  'services/notificationPrefs.js': `export const syncNotificationPrefs = async () => {}`,
  'utils/signInPin.js': noop(['noteProvedSignIn']),
  'state/settingsSync.js': `export const flushes = (globalThis.__flushes = [])
    export const flushSettingsPush = async () => { flushes.push(globalThis.__auth.token) }`,
  'state/store.js': `const s = (globalThis.__store = {}); export const getStore = () => s`,
  'state/audioPlayer.js': `export const audio = { active: false }\nexport const stop = () => {}`,
  'state/shell/access.js': noop(['stopAccess']),
  'app/router.js': `export const router = {}`,
}

registerHooks({
  resolve(spec, ctx, next) {
    if ((spec.startsWith('.') || spec.startsWith('file:')) && !/\.(m?js|json)$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
  load(url, ctx, next) {
    const rel = url.startsWith('file:') ? fileURLToPath(url).slice(src.length + 1) : ''
    if (STUBS[rel]) return { format: 'module', shortCircuit: true, source: STUBS[rel] }
    return next(url, ctx)
  },
})
const auth = await import('./auth.js')
const msm = await import('../services/multiServerManager.js')
const { logouts } = await import('../services/jellyfinApi.js')

const SILO = 'http://silo.test'
const JELLYFIN = 'http://jellyfin.test'

// A Silo account with two profiles, a second Silo account on the same server, and a Jellyfin user.
const seed = async () => {
  for (const k of Object.keys(globalThis.__storage)) delete globalThis.__storage[k]
  logouts.length = 0
  globalThis.__store.authenticated = false
  globalThis.__store.userId = ''
  const silo = await msm.addServer(SILO, 'Silo', 'main', 'Main', 'tok-a', null, 'silo')
  await msm.addServer(SILO, 'Silo', 'kid', 'Kid', 'tok-a', null, 'silo')
  await msm.addServer(SILO, 'Silo', 'other', 'Other', 'tok-b', null, 'silo')
  for (const [id, account] of [['main', 'acct-a'], ['kid', 'acct-a'], ['other', 'acct-b']]) {
    await msm.updateServer(silo.serverId, null, id, { siloAccountId: account })
  }
  const jf = await msm.addServer(JELLYFIN, 'Jellyfin', 'jf', 'Jelly', 'tok-j', null, 'jellyfin')
  return { silo: silo.serverId, jf: jf.serverId }
}

const signInAs = async (serverId, userId) => assert.equal(await auth.switchUser(serverId, userId), true)
const savedUsers = async () => (await msm.getAllServersArray()).map((e) => e.userId).sort()

let failures = 0
const test = async (name, fn) => {
  try {
    await fn()
    console.log(`ok   ${name}`)
  } catch (e) {
    failures++
    console.log(`FAIL ${name}\n  ${e.message}`)
  }
}

for (const who of ['main', 'kid']) {
  await test(`Sign Out on the ${who} profile removes the whole Silo account and ends its login once`, async () => {
    const ids = await seed()
    await signInAs(ids.silo, who)
    await (await auth.logout()).loggedOut
    assert.deepEqual(await savedUsers(), ['jf', 'other'])
    assert.deepEqual(logouts.map((l) => [l.url, l.token, l.type]), [[SILO, 'tok-a', 'silo']])
    assert.equal(globalThis.__store.authenticated, true)
    assert.notEqual(globalThis.__store.userId, 'main')
    assert.notEqual(globalThis.__store.userId, 'kid')
  })
}

await test('Sign Out moves to the next user without waiting for the Silo logout, so a server out of reach doesn\'t hold it up', async () => {
  const ids = await seed()
  await signInAs(ids.silo, 'main')
  let release
  globalThis.__logoutGate = new Promise((resolve) => { release = resolve })
  let loggedOut = Promise.resolve()
  try {
    // Sign Out is done while the server still hasn't answered the logout.
    const done = await Promise.race([auth.logout(), new Promise((resolve) => setTimeout(resolve, 1000, null))])
    assert.ok(done, 'Sign Out waited on the Silo logout')
    loggedOut = done.loggedOut
    assert.ok(!['main', 'kid'].includes(globalThis.__store.userId))
    for (let i = 0; i < 50 && !logouts.length; i++) await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(logouts.length, 1, 'the logout has started')
    assert.ok(!['main', 'kid'].includes(logouts[0].signedInAs), `ended while signed in as ${logouts[0].signedInAs}`)
  } finally {
    release()
    await loggedOut
    delete globalThis.__logoutGate
  }
})

await test('Sign Out of a Jellyfin user leaves the Silo profiles and logins alone', async () => {
  const ids = await seed()
  await signInAs(ids.jf, 'jf')
  await (await auth.logout()).loggedOut
  assert.deepEqual(await savedUsers(), ['kid', 'main', 'other'])
  assert.equal(logouts.length, 0)
})

await test('A profile saved before its account, sharing only the token, still goes with it', async () => {
  const ids = await seed()
  await msm.addServer(SILO, 'Silo', 'teen', 'Teen', 'tok-a', null, 'silo')
  await signInAs(ids.silo, 'main')
  await (await auth.logout()).loggedOut
  assert.deepEqual(await savedUsers(), ['jf', 'other'])
})

await test('Sign Out All Users removes everything and ends each Silo login once, after reading the stored sessions', async () => {
  const ids = await seed()
  await signInAs(ids.jf, 'jf')
  globalThis.__sessionsLoaded = false
  await auth.signOutAll()
  assert.deepEqual(await savedUsers(), [])
  assert.deepEqual(logouts.map((l) => l.token).sort(), ['tok-a', 'tok-b'])
  assert.ok(logouts.every((l) => l.loaded), 'stored sessions are read before each logout')
  assert.equal(globalThis.__store.authenticated, false)
})

await test('The Silo login is not ended while another saved entry still holds its token', async () => {
  await seed()
  await auth.endSiloLoginIfLast({ serverType: 'silo', url: SILO, accessToken: 'tok-b', userId: 'x' })
  assert.equal(logouts.filter((l) => l.token === 'tok-b').length, 0)
  await auth.endSiloLoginIfLast({ serverType: 'silo', url: SILO, accessToken: 'tok-gone', userId: 'x' })
  assert.equal(logouts.filter((l) => l.token === 'tok-gone').length, 1)
})

await test('The Silo login is not ended when the entry still holding it moved to a refreshed token', async () => {
  await seed()
  globalThis.__siloSessions = [{ tokens: { accessToken: 'tok-b' }, aliases: ['tok-b-old'] }]
  try {
    await auth.endSiloLoginIfLast({ serverType: 'silo', url: SILO, accessToken: 'tok-b-old', userId: 'x' })
  } finally {
    globalThis.__siloSessions = null
  }
  assert.equal(logouts.filter((l) => l.token === 'tok-b-old').length, 0)
})

await test('Remove Server drops every user on that server and ends each of its Silo logins once', async () => {
  const ids = await seed()
  globalThis.__sessionsLoaded = false
  const { loggedOut } = await auth.removeSavedServer(ids.silo)
  assert.deepEqual(await savedUsers(), ['jf'])
  await loggedOut
  assert.deepEqual(logouts.map((l) => [l.url, l.token, l.type]).sort(), [[SILO, 'tok-a', 'silo'], [SILO, 'tok-b', 'silo']])
  assert.ok(logouts.every((l) => l.loaded), 'stored sessions are read before each logout')
})

await test('Remove Server on a Jellyfin server ends no Silo login', async () => {
  const ids = await seed()
  await (await auth.removeSavedServer(ids.jf)).loggedOut
  assert.deepEqual(await savedUsers(), ['kid', 'main', 'other'])
  assert.equal(logouts.length, 0)
})

await test('Removing the signed-in user\'s Silo server pushes settings first, then switches to the next saved user', async () => {
  const ids = await seed()
  await signInAs(ids.silo, 'main')
  globalThis.__flushes.length = 0
  const { wasActive, loggedOut } = await auth.removeSavedServer(ids.silo)
  await loggedOut
  assert.equal(wasActive, true)
  assert.deepEqual(globalThis.__flushes, ['tok-a'], 'settings pushed once, while still signed in')
  assert.deepEqual(await savedUsers(), ['jf'])
  assert.equal(globalThis.__store.authenticated, true)
  assert.equal(globalThis.__store.userId, 'jf')
  assert.deepEqual(logouts.map((l) => l.token).sort(), ['tok-a', 'tok-b'])
})

await test('Removing the only server while signed in to it signs out', async () => {
  const ids = await seed()
  await auth.removeSavedServer(ids.jf)
  await signInAs(ids.silo, 'kid')
  const { wasActive, loggedOut } = await auth.removeSavedServer(ids.silo)
  await loggedOut
  assert.equal(wasActive, true)
  assert.deepEqual(await savedUsers(), [])
  assert.equal(globalThis.__store.authenticated, false)
})

await test('Removing another server while signed in leaves the signed-in user alone', async () => {
  const ids = await seed()
  await signInAs(ids.jf, 'jf')
  globalThis.__flushes.length = 0
  const { wasActive, loggedOut } = await auth.removeSavedServer(ids.silo)
  await loggedOut
  assert.equal(wasActive, false)
  assert.equal(globalThis.__flushes.length, 0)
  assert.equal(globalThis.__store.userId, 'jf')
  assert.deepEqual(await savedUsers(), ['jf'])
})

await test('Remove Server keeps a Silo login another saved server still uses', async () => {
  const ids = await seed()
  const copy = await msm.addServer('http://silo-alias.test', 'Silo 2', 'main2', 'Main', 'tok-a', null, 'silo')
  assert.notEqual(copy.serverId, ids.silo)
  await (await auth.removeSavedServer(ids.silo)).loggedOut
  assert.deepEqual(logouts.map((l) => l.token), ['tok-b'])
})

if (failures) {
  console.log(`\n${failures} failing`)
  process.exit(1)
}
console.log('\nall passed')
