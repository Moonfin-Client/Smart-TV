// Attaches the trailer preview to a media bar. A bar creates one as it mounts, reports its focus and
// slide changes, and gets two fields set on the context it passes: trailerHolding (the carousel
// waits, from the first frame) and trailerActive (the bar clears the way, three seconds later), with
// Home told through the context's onBarTrailer(active). Home calls sync() when the screensaver or
// the route changes, so a trailer never outlives the page or fights the player.
// rect is the video's frame in 1920x1080 pixels. Anything outside it is the bar's to keep opaque.
// The trailer's captions draw over that frame and show once the trailer does.
import { createSignal } from 'solid-js'
import { createTrailerPreview, mayPlay } from './trailerPreview.js'
import { mountTrailerCaption } from './TrailerCaption.jsx'
import * as settings from '../../../state/settings.js'
import { audio } from '../../../state/audioPlayer.js'
import { shell } from '../../../state/shell/shellState.js'
import { holdScreensaver } from '../../../state/shell/idle.js'
import { getStore } from '../../../state/store.js'
import { afterHomeReady } from '../../../utils/homeReady.js'
import { router } from '../../../app/router.js'

const FULL = { x: 0, y: 0, w: 1920, h: 1080 }

export const trailerHost = (bar, { current, hidesChrome = false, rect = () => FULL, onEnded }) => {
  let focused = false
  let homeReady = false
  let hidNav = false
  let preview = null
  let gone = false
  let unmountCaption = null
  const [caption, setCaption] = createSignal('')
  const [captionShown, setCaptionShown] = createSignal(false)

  const onChange = ({ holding, active }) => {
    bar.trailerHolding = holding
    bar.trailerActive = active
    setCaptionShown(active)
    holdScreensaver('trailer', active)
    const store = getStore()
    const hide = active && hidesChrome && focused
    if (store && hide !== hidNav) {
      hidNav = hide
      store.navVisible = !hide
    }
    if (bar.onBarTrailer) bar.onBarTrailer(active)
  }

  const host = {
    sync() {
      // afterHomeReady and the visibility event can land after the bar is gone.
      if (gone) return
      const item = current()
      const path = router.state.path
      const go = mayPlay({
        enabled: settings.get('featuredTrailerPreview') === true,
        homeReady,
        focused: focused && (!path || path === '/home'),
        item,
        saver: shell.saver,
        music: audio.playing,
        hidden: document.hidden,
      })
      if (!preview) {
        if (!go) return
        preview = createTrailerPreview({ load: () => import('./trailerSources.js'), rect, onChange, onEnded, onCaption: setCaption })
        unmountCaption = mountTrailerCaption({ text: caption, shown: captionShown, rect, fade: true })
      }
      preview.want(go ? item : null, { muted: settings.get('featuredTrailerMuted') === true, volume: settings.get('trailerVolume') })
    },
    focus(on) {
      focused = on
      host.sync()
    },
    // Ends what plays and keeps it off until the slide changes, for MakD's first Left or Right.
    dismiss() {
      if (preview) preview.dismiss()
    },
    stop() {
      if (preview) preview.stop()
    },
    destroy() {
      gone = true
      document.removeEventListener('visibilitychange', host.sync)
      host.stop()
      if (unmountCaption) unmountCaption()
    },
  }
  afterHomeReady().then(() => {
    homeReady = true
    host.sync()
  })
  document.addEventListener('visibilitychange', host.sync)
  return host
}
