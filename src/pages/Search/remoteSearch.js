// App's remoteSearch state: the phone's search (services/remoteSearch.js) that Search attaches to.
// It's kept here so it outlives the page, and a Search already on screen hears a new one at once.
let current = null
let listener = null

export const offerRemoteSearch = (search) => {
  current = search
  if (listener) listener(search)
}

export const pendingRemoteSearch = () => current

export const listenRemoteSearch = (fn) => {
  listener = fn
  return () => {
    if (listener === fn) listener = null
  }
}
