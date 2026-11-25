import { initVideo, keepScreenOn } from '../../../services/video.js'
import { holdScreensaver } from '../../../state/shell/idle.js'

// The browser side of the photo viewer, kept out of the component: the page going to the
// background, photos fetched ahead, and keeping the TV awake through a slideshow.

// Calls `fn` when the app goes to the background, and returns the unsubscribe.
export const onHidden = (fn) => {
  if (typeof document === 'undefined') return () => {}
  const listener = () => {
    if (document.hidden) fn()
  }
  document.addEventListener('visibilitychange', listener)
  return () => document.removeEventListener('visibilitychange', listener)
}

// A photo fetched ahead, held so the browser keeps it until the viewer gets there.
export const prefetchImage = (url) => {
  const img = new Image()
  img.src = url
  return img
}

export const keepAwake = (on) => {
  holdScreensaver('slideshow', on)
  if (on) initVideo().then(() => keepScreenOn(true)).catch(() => {})
  else {
    try {
      keepScreenOn(false)
    } catch (e) {
      // The video module never loaded, so nothing holds the screen.
    }
  }
}
