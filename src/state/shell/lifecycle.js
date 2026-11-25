// Platform glue that no screen owns, beside App's setupPlatformLifecycle:
// - Samsung's Smart Hub preview tiles (platform/tizen/smarthub.js, Tizen above 3 only), and the title
//   a tile opens, held until someone is signed in and past the gates to open it for.
// - The video let go when the page goes away or the app closes itself, and paused while another
//   app is in front.
// - webOS Developer Mode renewed once per launch, or later if someone turns Keep Developer Mode on.
import { createEffect, createSignal, untrack } from 'solid-js'
import { cleanupVideoElement, initVideo, setupVisibilityHandler } from '../../services/video.js'
import { renewDevMode } from '../../utils/appLifecycle.js'
import { isTizen } from '../../platform.js'
import { router } from '../../app/router.js'
import * as settings from '../settings.js'
import { getStore } from '../store.js'
import { deepLinkItem } from './deepLink.js'

const videos = () => Array.prototype.slice.call(document.querySelectorAll('video'))

// Lets go of every video element. This also runs before the app closes itself.
export const releaseVideos = () => videos().forEach((v) => cleanupVideoElement(v))

// With Default Action on Play the title's page opens under the player and starts it, from its
// resume point if it has one, so Back from the player lands there.
const openDeepLink = (link) => {
  const item = deepLinkItem(link, getStore().user)
  if (!item) return
  router.to(`/details/${item.Id}`, settings.get('continueWatchingDefaultAction') === 'play' ? { item, autoPlay: true } : { item })
}

// `ready()` says whether a title can open now: signed in, past the gates and not on Time's up.
export const startLifecycle = (ready) => {
  const [link, setLink] = createSignal(null)
  window.addEventListener('moonfin:deepLink', (e) => setLink((e && e.detail) || null))
  createEffect(() => {
    const l = link()
    if (!l || !ready()) return
    setLink(null)
    untrack(() => openDeepLink(l))
  })
  // After the listener, since a launch from a tile raises its link as soon as this runs.
  if (isTizen()) import('@moonfin/platform-tizen/smarthub').then((m) => m.initSmartHub()).catch(() => {})

  window.addEventListener('beforeunload', releaseVideos)
  window.addEventListener('pagehide', (e) => e.persisted || releaseVideos())
  initVideo()
    .then(() => setupVisibilityHandler(() => videos().forEach((v) => v.paused || v.pause())))
    .catch(() => {})

  let renewed = false
  createEffect(() => {
    if (renewed || settings.get('keepDevModeAlive') === false) return
    renewed = true
    renewDevMode()
  })
}
