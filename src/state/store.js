// The app-wide reactive store, made of Solid signals (state/reactive.js). Plain modules (auth,
// settings, playback glue) write it, and components read it in JSX or memos, which track each key
// they read.
import { reactive } from './reactive.js'

const initialState = () => ({
  authenticated: false,
  serverUrl: '',
  serverName: '',
  serverType: 'jellyfin',
  user: null,
  userId: '',
  servers: [],
  toast: '',
  navVisible: true,
  navSection: 'home',
  libraries: [],
  seerrAvailable: false,
  watchPartyActive: false,
  seerrName: 'Seerr',
  settingsVersion: 0,
  audio: null,
})

const store = reactive(initialState())

export const getStore = () => store

let toastTimer = null
export const toast = (message, ms = 2490) => {
  store.toast = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    if (store.toast === message) store.toast = ''
  }, ms)
}
