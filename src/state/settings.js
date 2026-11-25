// Local settings, stored under the 'settings' key earlier versions used. get() and all() read
// store.settingsVersion, which bumps on every change, so a memo or JSX that reads a setting runs
// again when settings change. Listeners (settingsSync) hear every change except silent ones, which
// are values pulled from the server.
import { defaultSettings } from '../context/defaultSettings.js'
import { getFromStorage, saveToStorage } from '../services/storage.js'
import { getStore } from './store.js'

let settings = { ...defaultSettings }
let saveTimer = null
const listeners = []

export const onChange = (fn) => {
  listeners.push(fn)
}

const tell = (keys, options) => {
  if (options && options.silent) return
  listeners.forEach((fn) => fn(keys))
}

const track = () => getStore().settingsVersion

// Tizen's playback code reads the TrueHD opt-in from localStorage, since it can't reach this store.
const mirrorTruehd = () => {
  try {
    if (settings.experimentalTruehd) window.localStorage.setItem('moonfin.experimentalTruehd', 'true')
    else window.localStorage.removeItem('moonfin.experimentalTruehd')
  } catch (e) {}
}

const bump = () => {
  const s = getStore()
  s.settingsVersion = s.settingsVersion + 1
}

export const loadSettings = async () => {
  const stored = await getFromStorage('settings')
  settings = { ...defaultSettings, ...(stored || {}) }
  mirrorTruehd()
  // Anything computed from the defaults before this ran computes again.
  bump()
  return settings
}

export const get = (key) => {
  track()
  return settings[key]
}
export const all = () => {
  track()
  return settings
}

const persist = () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => saveToStorage('settings', settings), 300)
}

export const set = (key, value, options) => {
  if (settings[key] === value) return
  settings = { ...settings, [key]: value }
  mirrorTruehd()
  persist()
  bump()
  tell([key], options)
}

export const update = (patch, options) => {
  settings = { ...settings, ...patch }
  mirrorTruehd()
  persist()
  bump()
  tell(Object.keys(patch), options)
}
