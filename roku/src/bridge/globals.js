import { patchFetch, utf8 } from './fetchPatch.js'
import { ASCENT, DESCENT, drawableText } from './text.js'

const g = globalThis

// The browser pieces SolidTV uses that Hermes doesn't have. This loads before every other module.
// Listeners keep their capture flag, so dom.js can send a key through them in a browser's order.
const makeTarget = () => {
  const listeners = {}
  const captures = (opts) => opts === true || !!(opts && opts.capture)
  const target = {
    addEventListener(type, fn, opts) {
      const list = listeners[type] || (listeners[type] = [])
      list.push({ fn, capture: captures(opts), once: !!(opts && opts.once) })
    },
    removeEventListener(type, fn, opts) {
      const list = listeners[type]
      if (!list) return
      const i = list.findIndex((l) => l.fn === fn && l.capture === captures(opts))
      if (i >= 0) list.splice(i, 1)
    },
    // Only the capture or the bubbling listeners when one is named, or all of them.
    dispatchTo(e, which) {
      const list = listeners[e.type]
      if (!list) return
      for (const l of list.slice()) {
        if (e.immediateStopped) return
        if (which === 'capture' && !l.capture) continue
        if (which === 'bubble' && l.capture) continue
        if (l.once) target.removeEventListener(e.type, l.fn, l.capture)
        l.fn.call(target, e)
      }
    },
    dispatchEvent(e) {
      target.dispatchTo(e)
      return !e.defaultPrevented
    },
    hasListener: (type) => !!(listeners[type] && listeners[type].length),
  }
  return target
}

// A canvas records what's drawn on it (fills in a color or a linear gradient, filled paths, stroked
// arcs and text), and toDataURL hands back a canvas: reference the bridge draws from those records. A
// QR code, a baked scrim, a ring and a subtitle line all come out this way. Radial gradients and
// anything else draw nothing. Measuring text goes to the bridge's font tables (g.__measureText).
const canvasImages = (g.__canvasImages = g.__canvasImages || {})
let canvasCount = 0
const cssColor = (v) => {
  const s = String(v || '').trim()
  let m = /^#([0-9a-f]{3})$/i.exec(s)
  if (m) return parseInt(m[1].replace(/(.)/g, '$1$1') + 'ff', 16) >>> 0
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s)
  if (m) return parseInt(m[1] + (m[2] || 'ff'), 16) >>> 0
  m = /^rgba?\(([^)]*)\)$/i.exec(s)
  if (m) {
    const [r, gr, b, a] = m[1].split(',').map((x) => parseFloat(x))
    return ((r << 24) | (gr << 16) | (b << 8) | Math.round((a == null ? 1 : a) * 255)) >>> 0
  }
  return 0x000000ff
}
const gradient = (grad) => {
  grad.stops = []
  grad.addColorStop = (offset, color) => grad.stops.push([offset, cssColor(color)])
  return grad
}
// SolidTV draws text outlines as the shadows of glyphs drawn this far off the canvas.
const FAR_SHADOW = 5000
// An ImageData whose pixels are only made if something reads them. One from getImageData also names
// the canvas's drawing, which the bridge draws in place of the pixels (the player's subtitle lines).
const image = (w, h, canvas) => {
  let data = null
  return {
    width: w,
    height: h,
    canvas: canvas ? canvas.toDataURL(true) : '',
    get data() {
      return data || (data = new Uint8ClampedArray(Math.max(0, w * h * 4)))
    },
  }
}
const context2d = (canvas) => {
  const noop = () => {}
  const grow = (x, y) => {
    const b = canvas.path || (canvas.path = { x0: x, y0: y, x1: x, y1: y })
    b.x0 = Math.min(b.x0, x)
    b.y0 = Math.min(b.y0, y)
    b.x1 = Math.max(b.x1, x)
    b.y1 = Math.max(b.y1, y)
  }
  return new Proxy(
    {
      canvas,
      font: '10px sans-serif',
      fillStyle: '#000000',
      measureText(text) {
        const px = parseFloat((/([\d.]+)px/.exec(this.font) || [])[1]) || 10
        const shown = drawableText(text)
        const width = g.__measureText ? g.__measureText(this.font, shown, px) : shown.length * px * 0.5
        return { width, actualBoundingBoxAscent: px * 0.75, actualBoundingBoxDescent: px * 0.25, fontBoundingBoxAscent: px * ASCENT, fontBoundingBoxDescent: px * DESCENT }
      },
      fillRect(x, y, w, h) {
        const fill = this.fillStyle
        if (fill && fill.radial) return
        canvas.ops.push([x, y, w, h, fill && fill.line ? fill : cssColor(fill)])
      },
      // A filled path is kept as its bounding box, which is what a subtitle's rounded box needs.
      beginPath() {
        canvas.path = null
        canvas.arcs = []
      },
      arc(x, y, r, from, to) {
        const arcs = canvas.arcs || (canvas.arcs = [])
        arcs.push({ x, y, r, from, to })
        grow(x - r, y - r)
        grow(x + r, y + r)
      },
      // A stroked arc is kept as a ring, whole or part of one, for the bridge to draw.
      stroke() {
        const color = cssColor(this.strokeStyle)
        for (const a of canvas.arcs || []) canvas.ops.push({ ring: true, x: a.x, y: a.y, r: a.r, from: a.from, to: a.to, width: this.lineWidth || 1, color })
      },
      moveTo: grow,
      lineTo: grow,
      arcTo(x1, y1, x2, y2) {
        grow(x1, y1)
        grow(x2, y2)
      },
      rect(x, y, w, h) {
        grow(x, y)
        grow(x + w, y + h)
      },
      fill() {
        const b = canvas.path
        if (b && typeof this.fillStyle === 'string') canvas.ops.push([b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0, cssColor(this.fillStyle)])
      },
      // Text at its alphabetic baseline. A far-off glyph records only its shadow, where that lands.
      fillText(text, x, y) {
        const op = { text: drawableText(text), x, y, font: this.font, color: cssColor(this.fillStyle) }
        const sx = this.shadowOffsetX || 0
        if (Math.abs(sx) > FAR_SHADOW) {
          const shadow = cssColor(this.shadowColor || 'rgba(0, 0, 0, 0)')
          if (shadow & 0xff) canvas.ops.push({ ...op, x: x + sx, y: y + (this.shadowOffsetY || 0), color: shadow })
          return
        }
        if (op.color & 0xff) canvas.ops.push(op)
      },
      clearRect() {
        canvas.ops.length = 0
      },
      createImageData: (w, h) => image(w, h),
      getImageData: (_x, _y, w, h) => image(w, h, canvas),
      createLinearGradient: (x0, y0, x1, y1) => gradient({ line: [x0, y0, x1, y1] }),
      createRadialGradient: () => gradient({ radial: true }),
      createPattern: () => null,
    },
    { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => ((t[k] = v), true) },
  )
}

const element = (tag) => {
  const el = baseElement()
  if (String(tag).toLowerCase() === 'canvas') {
    let width = 300
    let height = 150
    el.ops = []
    // Resizing a canvas clears it.
    Object.defineProperty(el, 'width', { get: () => width, set: (v) => ((width = v), (el.ops.length = 0)) })
    Object.defineProperty(el, 'height', { get: () => height, set: (v) => ((height = v), (el.ops.length = 0)) })
    el.getContext = () => el.ctx || (el.ctx = context2d(el))
    // once marks a drawing the bridge drops when its node moves on, like a subtitle line's.
    el.toDataURL = (once) => {
      if (!el.ops.length) return ''
      const id = 'canvas:' + ++canvasCount
      canvasImages[id] = { w: width, h: height, ops: el.ops.slice(), once: once === true }
      return id
    }
  }
  return el
}

// There's no layout here. The one box SolidTV reads is its subtitle text probe's: an empty inline mark
// in a line box, whose top is where CSS puts the baseline of a line `line-height` tall in the probe's
// font, with Roboto's ascent and descent.
const boxOf = (el) => {
  const css = (el.parentNode && el.parentNode.style && el.parentNode.style.cssText) || ''
  const lh = /line-height:\s*([\d.]+)px/.exec(css)
  const size = /font:[^;]*?([\d.]+)px/.exec(css)
  const top = lh && size ? (parseFloat(lh[1]) - (ASCENT + DESCENT) * parseFloat(size[1])) / 2 + ASCENT * parseFloat(size[1]) : 0
  return { top, bottom: top, left: 0, right: 0, x: 0, y: top, width: 0, height: 0 }
}
const baseElement = () => {
  const el = {
    style: {},
    dataset: {},
    children: [],
    parentNode: null,
    setAttribute() {},
    removeAttribute() {},
    appendChild(c) {
      c.parentNode = el
      el.children.push(c)
      return c
    },
    removeChild(c) {
      const i = el.children.indexOf(c)
      if (i >= 0) el.children.splice(i, 1)
      return c
    },
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect: () => boxOf(el),
  }
  return el
}

if (typeof g.document === 'undefined') {
  g.document = Object.assign(makeTarget(), {
    documentElement: element(),
    head: element(),
    body: element(),
    hidden: false,
    visibilityState: 'visible',
    createElement: element,
    createTextNode: (text) => ({ nodeType: 3, textContent: String(text), parentNode: null }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  })
}
if (typeof g.window === 'undefined') {
  g.window = Object.assign(g, makeTarget())
}

// The SDK's text-layout package decodes UTF-8 with TextDecoder, which the device doesn't have.
if (typeof g.TextDecoder === 'undefined') {
  g.TextDecoder = class {
    decode(bytes) {
      return bytes ? utf8(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes.buffer || bytes)) : ''
    }
  }
}

// Storage the bridge fills from the registry before the app starts, and writes back as it changes.
const memoryStorage = () => {
  const map = new Map()
  const store = {
    persist: null,
    hydrate(entries) {
      for (const k in entries) if (entries[k] != null) map.set(k, entries[k])
    },
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem(k, v) {
      const s = String(v)
      map.set(k, s)
      if (store.persist) store.persist(k, s)
    },
    removeItem(k) {
      map.delete(k)
      if (store.persist) store.persist(k, null)
    },
    clear() {
      const keys = Array.from(map.keys())
      map.clear()
      if (store.persist) for (const k of keys) store.persist(k, null)
    },
    key: (i) => Array.from(map.keys())[i] || null,
  }
  Object.defineProperty(store, 'length', { get: () => map.size })
  return store
}
if (typeof g.localStorage === 'undefined') g.localStorage = memoryStorage()
if (typeof g.sessionStorage === 'undefined') g.sessionStorage = memoryStorage()

// The router keeps the current page in location.hash.
let hash = ''
if (typeof g.location === 'undefined') {
  g.location = {
    get hash() {
      return hash
    },
    set hash(v) {
      const next = v ? (v.charAt(0) === '#' ? v : '#' + v) : ''
      if (next === hash) return
      hash = next
      setTimeout(() => g.window.dispatchEvent({ type: 'hashchange' }), 0)
    },
    pathname: '/',
    search: '',
    href: 'app://moonfin/',
    origin: 'app://moonfin',
    protocol: 'app:',
    host: 'moonfin',
    hostname: 'moonfin',
    reload() {},
  }
}
if (typeof g.history === 'undefined') {
  const move = (url) => {
    if (typeof url === 'string' && url.indexOf('#') >= 0) hash = url.slice(url.indexOf('#'))
  }
  g.history = {
    state: null,
    length: 1,
    replaceState(state, _title, url) {
      this.state = state
      move(url)
    },
    pushState(state, _title, url) {
      this.state = state
      move(url)
    },
    go() {},
    back() {},
    forward() {},
  }
}
if (typeof g.navigator === 'undefined') {
  g.navigator = { userAgent: 'Roku/16.0 Moonfin SolidTV', language: 'en-US', languages: ['en-US'], onLine: true, platform: 'Roku' }
}
if (typeof g.screen === 'undefined') g.screen = { width: 1920, height: 1080 }
if (typeof g.devicePixelRatio === 'undefined') g.devicePixelRatio = 1
if (typeof g.requestAnimationFrame === 'undefined') {
  g.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16)
  g.cancelAnimationFrame = (id) => clearTimeout(id)
}
// SceneGraph decodes pictures itself, so a page that asks for an Image just hears it failed.
if (typeof g.Image === 'undefined') {
  g.Image = class {
    set src(v) {
      this._src = v
      setTimeout(() => this.onerror && this.onerror(new Error('no Image here')), 0)
    }
    get src() {
      return this._src
    }
    addEventListener() {}
    removeEventListener() {}
  }
}

// Server calls only. Package files aren't reachable by URL here, so a relative path answers 404.
if (typeof g.XMLHttpRequest === 'undefined') {
  g.XMLHttpRequest = class {
    constructor() {
      this.readyState = 0
      this.status = 0
      this.responseText = ''
      this.response = null
      this.responseType = ''
      this.timeout = 0
      this.headers = {}
      this.controller = null
    }
    open(method, url) {
      this.method = method
      this.url = url
      this.readyState = 1
    }
    setRequestHeader(k, v) {
      this.headers[k] = v
    }
    getResponseHeader(k) {
      return this.res ? this.res.headers.get(k) : null
    }
    getAllResponseHeaders() {
      return ''
    }
    abort() {
      if (this.controller) this.controller.abort()
    }
    fire(name, e) {
      if (typeof this['on' + name] === 'function') this['on' + name](e || { type: name, target: this })
    }
    send(body) {
      if (!/^https?:/i.test(this.url)) {
        setTimeout(() => {
          this.readyState = 4
          this.status = 404
          this.fire('readystatechange')
          this.fire('load')
          this.fire('loadend')
        }, 0)
        return
      }
      this.controller = new AbortController()
      const timer = this.timeout ? setTimeout(() => this.controller.abort(), this.timeout) : 0
      fetch(this.url, { method: this.method, headers: this.headers, body: body == null ? undefined : body, signal: this.controller.signal })
        .then((res) => {
          this.res = res
          this.status = res.status
          return this.responseType === 'arraybuffer' ? res.arrayBuffer() : res.text()
        })
        .then((data) => {
          if (timer) clearTimeout(timer)
          this.readyState = 4
          if (this.responseType === 'arraybuffer') this.response = data
          else if (this.responseType === 'json') {
            this.responseText = data
            try {
              this.response = JSON.parse(data)
            } catch {
              this.response = null
            }
          } else {
            this.responseText = data
            this.response = data
          }
          this.fire('readystatechange')
          this.fire('load')
          this.fire('loadend')
        })
        .catch((e) => {
          if (timer) clearTimeout(timer)
          this.readyState = 4
          this.status = 0
          this.fire('readystatechange')
          this.fire(e && e.name === 'AbortError' ? (this.timeout ? 'timeout' : 'abort') : 'error')
          this.fire('loadend')
        })
    }
  }
}

// Hermes has neither URL nor URLSearchParams. These cover what the app reads and builds.
if (typeof g.URLSearchParams === 'undefined') {
  const dec = (v) => decodeURIComponent(v.replace(/\+/g, ' '))
  g.URLSearchParams = class {
    constructor(init) {
      this.list = []
      if (typeof init === 'string') {
        const q = init.charAt(0) === '?' ? init.slice(1) : init
        for (const part of q.split('&')) {
          if (!part) continue
          const i = part.indexOf('=')
          this.list.push(i < 0 ? [dec(part), ''] : [dec(part.slice(0, i)), dec(part.slice(i + 1))])
        }
      } else if (Array.isArray(init)) {
        for (const [k, v] of init) this.list.push([String(k), String(v)])
      } else if (init && typeof init === 'object') {
        for (const k in init) this.list.push([k, String(init[k])])
      }
    }
    get(k) {
      const e = this.list.find((x) => x[0] === k)
      return e ? e[1] : null
    }
    getAll(k) {
      return this.list.filter((x) => x[0] === k).map((x) => x[1])
    }
    has(k) {
      return this.list.some((x) => x[0] === k)
    }
    append(k, v) {
      this.list.push([String(k), String(v)])
    }
    // The first entry for k takes the value and any others go, as in a browser.
    set(k, v) {
      const i = this.list.findIndex((x) => x[0] === k)
      if (i < 0) return this.append(k, v)
      this.list[i] = [String(k), String(v)]
      this.list = this.list.filter((x, j) => x[0] !== k || j === i)
    }
    delete(k) {
      this.list = this.list.filter((x) => x[0] !== k)
    }
    forEach(fn) {
      for (const [k, v] of this.list) fn(v, k, this)
    }
    keys() {
      return this.list.map((x) => x[0])[Symbol.iterator]()
    }
    values() {
      return this.list.map((x) => x[1])[Symbol.iterator]()
    }
    entries() {
      return this.list.map((x) => [x[0], x[1]])[Symbol.iterator]()
    }
    [Symbol.iterator]() {
      return this.entries()
    }
    toString() {
      return this.list.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&')
    }
  }
}
if (typeof g.URL === 'undefined') {
  const PARTS = /^([a-z][a-z0-9+.-]*:)?(?:\/\/([^/?#]*))?([^?#]*)(\?[^#]*)?(#.*)?$/i
  g.URL = class {
    constructor(input, base) {
      let href = String(input)
      if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) {
        if (base == null) throw new TypeError('Invalid URL: ' + href)
        const b = new g.URL(base)
        if (href.indexOf('//') === 0) href = b.protocol + href
        else if (href.charAt(0) === '/') href = b.origin + href
        else if (href.charAt(0) === '?' || href.charAt(0) === '#') href = b.origin + b.pathname + (href.charAt(0) === '#' ? b.search : '') + href
        else href = b.origin + b.pathname.replace(/[^/]*$/, '') + href
      }
      const m = PARTS.exec(href) || []
      this.protocol = (m[1] || '').toLowerCase()
      const authority = m[2] || ''
      this.host = authority.slice(authority.lastIndexOf('@') + 1)
      const colon = this.host.lastIndexOf(':')
      const hasPort = colon >= 0 && this.host.indexOf(']') < colon
      this.hostname = hasPort ? this.host.slice(0, colon) : this.host
      this.port = hasPort ? this.host.slice(colon + 1) : ''
      this.username = ''
      this.password = ''
      this.pathname = m[3] || (this.host ? '/' : '')
      this.hash = m[5] || ''
      this.searchParams = new g.URLSearchParams(m[4] || '')
    }
    get search() {
      const q = this.searchParams.toString()
      return q ? '?' + q : ''
    }
    set search(v) {
      this.searchParams = new g.URLSearchParams(v || '')
    }
    get origin() {
      return this.protocol + '//' + this.host
    }
    get href() {
      return (this.host ? this.origin : this.protocol) + this.pathname + this.search + this.hash
    }
    toString() {
      return this.href
    }
    toJSON() {
      return this.href
    }
  }
}

// Before any module keeps its own reference to fetch.
patchFetch()
