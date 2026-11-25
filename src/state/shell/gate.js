// Everything between a sign-in and Home: the account's sign-in PIN, then the first-run setup
// wizard. Startup, sign-in and every switch of account go through enterApp.
import { getApiKey } from '../../services/jellyfinApi.js'
import { getActiveServer } from '../../services/multiServerManager.js'
import {
  PIN_ACCEPTED, isSignInPinEnabled, markPinForgotten, refreshSignInPin, resetForgottenPin, signInPinChanges,
  signInPinFor, signInPinMessage, takeForgottenPin, takeProvedSignIn, verifySignInPin,
} from '../../utils/signInPin.js'
import { signInPinStillUnlocked } from '../../services/serverPinApi.js'
import { deferThisLaunch, shouldRun } from '../../utils/setupWizardGate.js'
import * as settings from '../settings.js'
import { getStore } from '../store.js'
import { leaveSession } from '../auth.js'
import { afterSignIn, settingsRead } from '../session.js'
import { shellApp } from './shellState.js'

// How long the wizard waits on the server profile, which would land on top of its answers.
const PROFILE_WAIT_MS = 3000

let proof = { userId: null, proved: false }

const store = () => getStore()

const account = () => {
  const s = store()
  return s && s.authenticated ? { serverUrl: s.serverUrl, accessToken: getApiKey(), serverType: s.serverType, userId: s.userId } : null
}

const pinRecord = () => signInPinFor(settings.all(), store().userId)
const savePin = (record) => settings.update(signInPinChanges(settings.all(), store().userId, record))

// Whether the gate goes up, and the refusal to show on it when a forgotten PIN couldn't be cleared.
// A TV that never saw the account's PIN learns of it here, and one an admin removed stops being
// asked for.
const checkPin = async () => {
  const s = store()
  const acct = account()
  const proved = takeProvedSignIn(s.serverUrl, s.userId)
  const forgotten = takeForgottenPin(s.serverUrl, s.userId) && proved
  proof = { userId: s.userId, proved }
  const before = pinRecord()
  if (await signInPinStillUnlocked(acct)) {
    refreshSignInPin(before, acct).then((next) => next !== before && savePin(next))
    return { gate: false }
  }
  const next = await refreshSignInPin(before, acct)
  if (next !== before) savePin(next)
  if (!isSignInPinEnabled(next)) return { gate: false }
  if (forgotten) {
    const outcome = await resetForgottenPin(next, acct, s.userId)
    if (outcome.record) {
      savePin(outcome.record)
      return { gate: false }
    }
    return { gate: true, error: outcome.refused }
  }
  return { gate: true, error: '' }
}

// The wizard asks once per server and user, after the server profile has had its say. A profile
// that doesn't arrive in time defers the wizard to a later launch. The stored answer comes first,
// so an account that's set up never waits on the profile.
const wizardDue = async () => {
  const s = store()
  const active = await getActiveServer().catch(() => null)
  const due = () => shouldRun(active && active.id, s.serverUrl, s.userId).catch(() => false)
  if (!(await due())) return false
  const settled = await Promise.race([
    settingsRead().then(() => true, () => true),
    new Promise((resolve) => setTimeout(() => resolve(false), PROFILE_WAIT_MS)),
  ])
  if (!settled) {
    deferThisLaunch()
    return false
  }
  return due()
}

export const afterPin = async (router) => {
  if (await wizardDue()) router.to('/setup', {}, { inHistory: false })
  else router.to('/home')
}

export const enterApp = async (router) => {
  // The PIN check runs alongside the libraries' read.
  const pinCheck = checkPin()
  await afterSignIn()
  // The last account's pages go once Home shows for this one.
  if (shellApp()) shellApp().freshStart()
  const pin = await pinCheck
  if (pin.gate) router.to('/pin', { error: pin.error || '' }, { inHistory: false })
  else await afterPin(router)
}

// The PIN typed on the gate. Null when it unlocks, otherwise what to say.
export const submitPin = async (entered) => {
  const before = pinRecord()
  const result = await verifySignInPin(before, entered, account())
  if (result.record !== before) savePin(result.record)
  return result.outcome === PIN_ACCEPTED ? null : signInPinMessage(result)
}

// Right after signing in with the password or Quick Connect the PIN just clears. Otherwise the
// account goes back to its sign-in, and the PIN clears once that proves who it is.
export const forgotPin = async () => {
  const s = store()
  if (proof.proved && proof.userId === s.userId) {
    const outcome = await resetForgottenPin(pinRecord(), account(), s.userId)
    if (outcome.record) {
      savePin(outcome.record)
      return { passed: true }
    }
    return { error: outcome.refused }
  }
  markPinForgotten(s.serverUrl, s.userId, s.user && s.user.Name)
  leaveSession()
  return { signIn: true }
}
