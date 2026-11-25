// Whether the app can reach anything, and whether it can reach the signed-in server, which App
// shows as the red banner at the top.
import { api, getServerUrl } from '../../services/jellyfinApi.js'
import { confirmOffline } from '../../utils/connectionProbe.js'
import { getStore } from '../store.js'
import { shell, shellApp } from './shellState.js'

const REVALIDATE_INTERVAL = 5 * 60 * 1000
const BACKOFF_DELAYS = [5000, 10000, 20000]
const RECOVERY_MAX_DELAY = 60000
const recoveryDelay = (attempt) => (attempt < BACKOFF_DELAYS.length ? BACKOFF_DELAYS[attempt] : RECOVERY_MAX_DELAY)

let checking = false
let lastRevalidate = 0
let recovery = null

// Retry asks the server again rather than reading the flag back, so a set that never changes its
// mind still has a way through.
export const checkOffline = async () => {
  if (checking) return
  checking = true
  try {
    shell.offline = await confirmOffline({ probe: () => api.getPublicInfo(), serverUrl: getServerUrl() })
  } finally {
    checking = false
  }
}

// An empty 200 from a reverse proxy resolves without throwing, so reachable means a body.
const probeServer = async () => {
  try {
    return Boolean(await api.getPublicInfo())
  } catch (e) {
    return false
  }
}

const signedIn = () => {
  const store = getStore()
  return !!(store && store.authenticated)
}

// Nothing else moves the state off disconnected, so the banner would sit there until someone pressed
// Retry. It's probed in the background instead and drops as soon as the server answers.
const recover = () => {
  clearTimeout(recovery)
  let attempt = 0
  const check = async () => {
    if (!signedIn() || shell.connection !== 'disconnected') return
    if (await probeServer()) {
      if (shell.connection === 'disconnected') shell.connection = 'connected'
      return
    }
    attempt += 1
    recovery = setTimeout(check, recoveryDelay(attempt))
  }
  recovery = setTimeout(check, recoveryDelay(attempt))
}

const settle = (state) => {
  shell.connection = state
  if (state === 'disconnected') recover()
}

const revalidateSession = async (force) => {
  if (!signedIn()) return
  const now = Date.now()
  if (!force && now - lastRevalidate < REVALIDATE_INTERVAL) return
  lastRevalidate = now
  // One attempt straight away, then another after each backoff delay.
  let reachable = await probeServer()
  for (let i = 0; !reachable && i < BACKOFF_DELAYS.length; i++) {
    shell.connection = 'reconnecting'
    await new Promise((r) => setTimeout(r, BACKOFF_DELAYS[i]))
    reachable = await probeServer()
  }
  if (!reachable) return settle('disconnected')
  try {
    await api.getUserConfiguration()
    settle('connected')
  } catch (e) {
    const status = e && (e.status || (e.response && e.response.status))
    if (status === 401 || status === 403) {
      console.warn('[AUTH] Session expired, requiring re-login')
      settle('connected')
      if (shellApp()) shellApp().sessionExpired()
    } else settle('disconnected')
  }
}

export const startConnection = () => {
  if (typeof window === 'undefined') return
  if (!navigator.onLine) checkOffline()
  window.addEventListener('offline', checkOffline)
  window.addEventListener('online', () => {
    shell.offline = false
  })
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) revalidateSession()
  })
}
