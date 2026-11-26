import { prepareTextMeasure, setMount } from './renderer.js'
import { getRegistry } from '@roku-sdk/runtime/registry'
import { setVideoLayer } from '../platform/video.js'
import boot from './boot.jsx'

export { pressKey } from './dom.js'
export { setDeviceCaps } from '../platform/caps.js'

// A Roku deep link (contentId and mediaType) goes to SolidTV as the moonfin:deepLink event its
// lifecycle opens titles from, once SolidTV listens for it, which is after it has booted.
let pendingLink = null
let linkTries = 0
const deliverLink = () => {
  if (!pendingLink) return
  if (!window.hasListener('moonfin:deepLink')) {
    if (++linkTries < 240) setTimeout(deliverLink, 500)
    return
  }
  const detail = pendingLink
  pendingLink = null
  window.dispatchEvent({ type: 'moonfin:deepLink', detail })
}
export const deepLink = (params) => {
  if (!params || !params.contentId) return
  pendingLink = { id: params.contentId, type: params.mediaType === 'episode' ? 'episode' : 'movie' }
  linkTries = 0
  deliverLink()
}

const SECTION = 'moonfin'

// localStorage starts as the registry section, and each change goes back to it. The registry stores
// text as UTF-8 but hands back one character per byte, so a value with anything past ASCII is kept
// percent-encoded behind a marker. The registry writes to flash on flush, so flushes wait for a
// second of quiet.
const UTF8 = 'RKU8:'
const encode = (v) => (/[^\x00-\x7e]/.test(v) ? UTF8 + encodeURIComponent(v) : v)
const decode = (v) => {
  if (typeof v !== 'string' || v.indexOf(UTF8) !== 0) return v
  try {
    return decodeURIComponent(v.slice(UTF8.length))
  } catch {
    return null
  }
}

// The registry holds 32 KB in all, so the browse cache (often over 100 KB) stays in memory, as does
// a canvas: picture, which is a handle into this session's drawings.
const sessionOnly = (key, v) => key.indexOf('browse_cache_') === 0 || (typeof v === 'string' && v.indexOf('canvas:') === 0)

const loadStorage = async () => {
  try {
    const registry = await getRegistry()
    const section = registry.get(SECTION)
    const stored = section.readMulti(section.getKeyList())
    const entries = {}
    for (const key in stored) {
      const value = decode(stored[key])
      if (value == null || sessionOnly(key, value)) section.delete(key)
      else entries[key] = value
    }
    localStorage.hydrate(entries)
    let timer = 0
    localStorage.persist = (key, value) => {
      if (value == null || sessionOnly(key, value)) {
        if (section.exists(key)) section.delete(key)
      } else if (!section.write(key, encode(value))) console.warn(`[storage] registry refused ${key} (${value.length} bytes)`)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => registry.flush().then((done) => done || console.warn('[storage] registry flush failed')), 1000)
    }
  } catch (e) {
    console.warn('[storage] registry unavailable, settings last until exit', e)
  }
}

// SolidTV closes itself with window.close, which here asks Main to end the app.
export const start = async (mount, tweens, video, close) => {
  window.close = close
  setMount(mount, tweens)
  setVideoLayer(video)
  await Promise.all([loadStorage(), prepareTextMeasure()])
  boot().catch((e) => console.error(`[boot] ${(e && e.stack) || e}`))
}
