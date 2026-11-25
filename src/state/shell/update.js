// Offering a new version: three seconds after a sign-in (with Update Notifications on) the releases
// are checked, and Settings' Check for Updates sends 'moonfin:show-update' to offer a version even
// after it was closed. App opens the panel.
import { checkForUpdates, dismissVersion, formatReleaseNotes } from '../../services/versionChecker.js'
import * as settings from '../settings.js'
import { getStore } from '../store.js'
import { shell, shellApp } from './shellState.js'

let info = null
let timer = null

const offer = (next) => {
  info = next || null
  shell.update = info ? info.latestVersion : ''
  if (info && shellApp()) shellApp().maybeUpdate()
}

export const updateInfo = () => info
export const releaseNotes = () => (info ? formatReleaseNotes(info.releaseNotes) : '')

// Called whenever the sign-in or the setting changes.
export const scheduleUpdateCheck = () => {
  clearTimeout(timer)
  const store = getStore()
  if (!store || !store.authenticated || settings.get('updateNotificationsEnabled') === false) {
    offer(null)
    return
  }
  timer = setTimeout(() => {
    checkForUpdates().then(offer, (e) => console.warn('[VERSION] Check failed:', e))
  }, 3000)
}

export const dismissUpdate = async () => {
  if (!info || !info.latestVersion) return
  await dismissVersion(info.latestVersion)
  offer(null)
}

if (typeof window !== 'undefined') {
  window.addEventListener('moonfin:show-update', () => {
    checkForUpdates(true, { includeDismissed: true }).then((next) => {
      if (next) offer(next)
    }, (e) => console.warn('[VERSION] Check failed:', e))
  })
}
