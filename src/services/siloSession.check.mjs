// Self-check for siloSession.js's refresh during a sign-out, with the network stubbed:
//   node --conditions=browser src/services/siloSession.check.mjs
// A refused refresh ends the login and sends the app to sign-in, except while that login is being
// signed out, so ending an expired login on Silo doesn't bounce the app to sign-in.
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const src = join(dirname(fileURLToPath(import.meta.url)), '..')
const STUBS = {
  'services/storage.js': `export const getFromStorage = async () => null
    export const saveToStorage = async () => {}`,
  'services/secureFetch.js': `export const corsFreeFetch = (url, init) => globalThis.__fetch(url, init)`,
  'utils/requestQueue.js': `export const mediaServerQueue = { run: (fn) => fn() }`,
  'utils/connectionErrors.js': `export const classifyError = () => 'network'`,
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
const silo = await import('./siloSession.js')

const SILO = 'http://silo.test'
const refused = async () => ({ ok: false, status: 401, headers: { get: () => null }, text: async () => '{}', json: async () => ({}) })
globalThis.__fetch = refused

let ended = 0
silo.onSiloSessionEnded(() => { ended++ })
const open = () => silo.openSiloSession(SILO, 'acct', { accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() - 1000, lifetimeMs: 3600000 })

let failed = 0
const test = async (name, fn) => {
  try {
    await fn()
    console.log(`ok - ${name}`)
  } catch (e) {
    failed++
    console.log(`not ok - ${name}\n  ${e.stack}`)
  }
}

await test('a refused refresh ends the login and tells the app', async () => {
  ended = 0
  const session = open()
  assert.equal(await silo.refreshSiloSession(session), false)
  assert.equal(session.tokens, null)
  assert.equal(ended, 1)
})

await test('a refused refresh while the login is signed out ends it quietly', async () => {
  ended = 0
  const session = open()
  session.signingOut = session.identity
  assert.equal(await silo.refreshSiloSession(session), false)
  assert.equal(session.tokens, null)
  assert.equal(ended, 0)
})

await test('a login opened again after a sign-out is told about its own refused refresh', async () => {
  ended = 0
  const session = open()
  session.signingOut = session.identity
  const again = open()
  assert.equal(again, session)
  assert.equal(await silo.refreshSiloSession(again), false)
  assert.equal(ended, 1)
})

if (failed) process.exit(1)
