// SolidTV's own boot (src/index.jsx) without the browser and TV-engine steps.
import { createEffect, createRoot } from 'solid-js'
import { Config, ElementNode, createRenderer, loadFonts, registerDefaultShaders } from '@solidtv/solid'
import { getSignalBeacon } from '@roku-sdk/runtime/signal-beacon'
import { FONTS, rendererFonts } from '@moonfin/app/src/ui/fonts.js'
import { installColorProps } from '@moonfin/app/src/ui/color.js'
import { loadStrings } from '@moonfin/app/src/services/i18n.js'
import { initStorage, getFromStorage } from '@moonfin/app/src/services/storage.js'
import { loadSettings } from '@moonfin/app/src/state/settings.js'
import { registerKeys } from '@moonfin/app/src/utils/keys.js'
import { measureFonts } from '@moonfin/app/src/ui/text.js'
import { current } from '@moonfin/app/src/app/router.js'
import { whenHomeShown } from '@moonfin/app/src/utils/homeReady.js'
import App from '@moonfin/app/src/App.jsx'

const settle = (p, ms) => Promise.race([p, new Promise((resolve) => setTimeout(resolve, ms))])

// Roku times a launch to AppLaunchComplete: Home once its rows have drawn, or the sign-in, PIN or
// setup page once it has drawn, when one of those opens first.
const signalLaunch = (renderer) => {
  let sent = false
  createRoot(() =>
    createEffect(() => {
      const page = current()
      if (sent || !page || page.path === '/') return
      sent = true
      const drawn = page.path === '/home' ? whenHomeShown() : new Promise((resolve) => renderer.once('idle', resolve))
      drawn.then(() => getSignalBeacon().signal('AppLaunchComplete'))
    }),
  )
}

export default async () => {
  const measured = Promise.resolve(measureFonts(FONTS)).catch((e) => console.warn(`[boot] fonts ${e}`))
  try {
    await initStorage()
    const stored = (await getFromStorage('settings')) || {}
    await Promise.all([loadSettings(), settle(loadStrings(stored.uiLanguage || 'en-US').catch((e) => console.warn(`[boot] strings ${e}`)), 1500)])
  } catch (e) {
    console.warn(`[boot] settings ${(e && e.stack) || e}`)
  }
  registerKeys()
  await settle(measured, 1500)
  installColorProps()
  Object.defineProperty(ElementNode.prototype, 'textShadow', {
    get() {
      return this.lng.textShadow
    },
    set(v) {
      this.lng.textShadow = v
    },
  })
  Config.animationsEnabled = true
  Config.fontSettings = { fontFamily: 'roboto', fontSize: 32, color: 0xffffffff, overflowSuffix: '…' }
  Config.rendererOptions = { appWidth: 1920, appHeight: 1080, boundsMargin: 300 }
  const { renderer, render } = createRenderer(undefined, 'app')
  registerDefaultShaders(renderer.stage.shManager)
  loadFonts(rendererFonts(false))
  render(() => <App />)
  signalLaunch(renderer)
}
