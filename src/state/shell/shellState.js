// What the app shell draws over the pages, and the App instance that draws it, so plain modules
// (exit, idle, access) can reach it.
import { appState } from '../reactive.js'

export const shell = appState.plugin({
  saver: false,
  timesUp: false,
  nextAccess: '',
  messages: 0,
  unread: 0,
  // NoConnection, the banner ('connected', 'reconnecting' or 'disconnected') and an update on offer.
  offline: false,
  connection: 'connected',
  update: '',
})

let app = null
export const setShellApp = (component) => {
  app = component
}
export const shellApp = () => app
