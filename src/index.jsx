import './polyfills.js'
import './fetchFix.js'
import { Config, ElementNode, activeElement, createRenderer, loadFonts, registerDefaultShaders } from '@solidtv/solid'
import { WebGlRenderer, SdfTextRenderer } from '@solidtv/renderer/webgl'
import { CanvasTextRenderer } from '@solidtv/renderer/canvas'
import { FONTS, rendererFonts, themeFonts } from './ui/fonts.js'
import { installColorProps } from './ui/color.js'
import { loadStrings } from './services/i18n.js'
import { initStorage, getFromStorage } from './services/storage.js'
import { loadSettings } from './state/settings.js'
import { paceArrowKeys, registerKeys } from './utils/keys.js'
import { isTizen, isWebOS, isXbox } from './platform.js'
import { installGamepadKeys } from './platform/xbox/keys.js'
import { legacy } from './ui/tier.js'
import { measureFonts, onThemeFonts } from './ui/text.js'
import { getActivePage } from './state/pages.js'
import { getStore } from './state/store.js'
import * as auth from './state/auth.js'
import { router } from './app/router.js'
import App from './App.jsx'

// Render resolution, off by default. The layout is always 1920x1080 and the canvas always fills the
// screen at that size, but the GPU can draw it at fewer pixels and let the browser stretch it. On a
// panel with fewer pixels than 1080p, like a 1366x768 set, that looks the same and cuts the GPU's
// fill by the ratio of the pixel counts, about 2.2x there.
//   null      draw at 1920x1080
//   'panel'   draw at the panel's own height when it's under 1080, as the TV reports it: webOS
//             PalmSystem.deviceInfo (the video plane, which runs at the panel's size), Tizen
//             systeminfo DISPLAY. A set that reports 1080 or more, or nothing, draws at 1080.
//   a number  draw at that fraction of 1920x1080, for a set that doesn't report its panel.
//             768 / 1080 fits a 1366x768 panel.
const RENDER_SCALE = null

// Text batching that keeps the z-order (scripts/patch-renderer.mjs, "text waits until something
// covers it"): text draws with the text after it unless something drawn in between may cover it.
const TEXT_DEFER = true

const panelHeight = () =>
  new Promise((resolve) => {
    try {
      if (window.PalmSystem && window.PalmSystem.deviceInfo) {
        resolve(JSON.parse(window.PalmSystem.deviceInfo).screenHeight || 0)
        return
      }
      if (window.tizen && window.tizen.systeminfo) {
        window.tizen.systeminfo.getPropertyValue('DISPLAY', (d) => resolve(d.resolutionHeight || 0), () => resolve(0))
        setTimeout(() => resolve(0), 1000)
        return
      }
    } catch (e) {
      console.warn('[boot] panel size', e)
    }
    resolve(0)
  })

// The canvas's pixels over the layout's.
const renderScale = async () => {
  if (typeof RENDER_SCALE === 'number') return RENDER_SCALE
  if (RENDER_SCALE !== 'panel') return 1
  const h = await panelHeight()
  return h > 0 && h < 1080 ? h / 1080 : 1
}

// Some Tizen WebKit builds shift the page zoom without this.
const enforceTizenViewport = () => {
  let meta = document.querySelector('meta[name="viewport"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'viewport')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', 'width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no,viewport-fit=cover')
}

const boot = async () => {
  if (isTizen()) enforceTizenViewport()
  // A held arrow's repeats wait for the last move to draw, so focus stops when the key is let go.
  paceArrowKeys()
  // Roboto's advances are measured before the first text lays out (ui/text.js), loading meanwhile.
  const measured = measureFonts(FONTS)
  try {
    await initStorage()
    const stored = (await getFromStorage('settings')) || {}
    // App builds with the stored settings, so a nav or theme that differs from the defaults isn't
    // built twice before the first frame.
    await Promise.all([loadSettings(), loadStrings(stored.uiLanguage || navigator.language || 'en-US')])
  } catch (e) {
    console.warn('[boot] strings', e)
  }
  registerKeys()
  // The Xbox controller reaches the page as gamepad key codes, made into arrows, Enter and Escape
  // before the focus manager hears them.
  if (isXbox()) installGamepadKeys()
  // A reload keeps the hash (webOS restarts a page that ran out of memory), and a page opened
  // straight from it has no session yet, so the app always starts over.
  if (location.hash && location.hash !== '#/') history.replaceState(null, '', location.pathname + location.search)
  await measured

  installColorProps()
  // textShadow={{ color, x, y, blur }} on a <text> goes to the renderer's text node as it is
  // (scripts/patch-renderer.mjs draws it).
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
  Config.rendererOptions = {
    appWidth: 1920,
    appHeight: 1080,
    deviceLogicalPixelRatio: 1,
    devicePhysicalPixelRatio: await renderScale(),
    // Transparent, so video can play under the canvas.
    clearColor: 0x00000000,
    renderEngine: WebGlRenderer,
    fontEngines: [SdfTextRenderer, CanvasTextRenderer],
    // Text hangs from its line box (half the leading, then the ascender), which every text offset in
    // ui/text.js (cssShift, normalShift) assumes. The renderer's default centers the glyphs instead.
    textBaselineMode: 'linebox',
    boundsMargin: 300,
    // Chrome 38 has no createImageBitmap, so images decode on the main thread there.
    numImageWorkers: legacy ? 0 : 1,
    // On webOS 3, textures piling up to 120 MB had webOS reload the app. Past 59 MiB the textures no
    // node holds go when the app idles, and past 90 MiB anything off screen goes at once
    // (scripts/patch-renderer.mjs, "keep held textures"). It isn't strict, since a refused upload
    // stays blank. Newer engines get more room, but a 200 MB limit let low-memory Tizen sets keep
    // 90 MB of pictures nothing showed, so past 100 MB the unheld ones go when the app idles.
    textureMemory: legacy
      ? {
          criticalThreshold: 90 * 1024 * 1024,
          targetThresholdLevel: 0.66,
          cleanupInterval: 4000,
          baselineMemoryAllocation: 20 * 1024 * 1024,
          doNotExceedCriticalThreshold: false,
        }
      : { criticalThreshold: 150e6, targetThresholdLevel: 0.667, cleanupInterval: 5000, baselineMemoryAllocation: 25e6 },
  }
  const { renderer, render } = createRenderer(undefined, 'app')
  registerDefaultShaders(renderer.stage.shManager)
  renderer.stage.renderer.textDefer = TEXT_DEFER
  loadFonts(rendererFonts(isWebOS()))
  onThemeFonts((id) => loadFonts(themeFonts(id)).catch((e) => console.warn('[boot] theme fonts', e)))

  // A handle for DevTools, tools/cdp.mjs and the component lab.
  window.__moonfin = { getActivePage, getStore, auth, router, renderer, activeElement }

  render(() => <App />)

  // The watch party engine loads once the first screens have drawn.
  setTimeout(() => {
    import('./state/watchParty.js').then((p) => p.start()).catch((e) => console.warn('[boot] watch party', e))
  }, 4000)
}

boot()
