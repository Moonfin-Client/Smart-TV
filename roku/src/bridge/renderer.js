// Stands in for @solidtv/renderer. @solidtv/solid's ElementNode drives these nodes exactly as it drives
// the WebGL ones, and each one keeps a SceneGraph node in step: a Group, Rectangle, Poster or Label.
// Changes collect on the JS side and reach SceneGraph once per tick, in one transaction.
import { EventEmitter } from '@solidtv/renderer/utils'
import { tmTransaction } from '@roku-sdk/solid'
import { transactionManager } from '@roku-sdk/common/transaction'
import { getFontMeasure, whenFontReady } from '@roku-sdk/runtime/font'
import { layoutLabel, scalesFor } from '@roku-sdk/text-layout'
import { arcSegments, gradientStrips } from './canvasShapes.js'
import { ASCENT, drawableText } from './text.js'

export const TextureType = { generic: 0, color: 1, image: 2, noise: 3, renderToTexture: 4, subTexture: 5 }
export const prefetchFont = () => {}

let mountNode = null
let tweenLayer = null
export const setMount = (node, tweens) => {
  mountNode = node
  tweenLayer = tweens
}

const tx = () => transactionManager.startTransaction()
const sgCreate = (tag) => {
  tx()
  return tmTransaction.createElement(tag)
}
const sgSet = (node, key, value) => {
  tx()
  tmTransaction.setProperty(node, key, value)
}
const sgInsert = (parent, node, anchor) => {
  tx()
  tmTransaction.insertNode(parent, node, anchor)
}
const sgRemove = (parent, node) => {
  tx()
  tmTransaction.removeNode(parent, node)
}
// The same calls for SceneGraph nodes the bridge doesn't draw itself, like the player's Video node.
export const sg = { create: sgCreate, set: sgSet, insert: sgInsert, remove: sgRemove }

const hex = (c) => {
  const s = (c >>> 0).toString(16)
  return '0x' + '00000000'.slice(s.length) + s
}
const alphaOf = (c) => (c >>> 0) & 0xff
// Two RGBA colors multiplied channel by channel, as a tint multiplies a picture.
const mixTint = (c, t) => {
  let out = 0
  for (const shift of [24, 16, 8, 0]) out = out * 256 + Math.round((((c >>> shift) & 0xff) * ((t >>> shift) & 0xff)) / 255)
  return out >>> 0
}

const same = (a, b) => {
  if (a === b) return true
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}
// A value just off v, too small to see, for a tween target that has to differ from the last one.
const nudge = (v) => (Array.isArray(v) ? [v[0] + 0.001, v[1]] : v > 0.5 ? v - 0.0001 : v + 0.0001)

// SceneGraph stops drawing altogether on a NaN or infinite size, position or font size, so those never go out.
const finite = (v) => {
  if (typeof v === 'number') return Number.isFinite(v)
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) if (typeof v[i] === 'number' && !Number.isFinite(v[i])) return false
  }
  return true
}
let rejected = 0
const rejectValue = (sg, key, value) => {
  if (rejected++ < 20) console.warn(`[bridge] skipped ${sg.t}.${key} = ${JSON.stringify(value)}`)
}

// One SceneGraph node and the field values last sent to it, so a sync only sends what changed.
class Target {
  constructor(sg, cache) {
    this.sg = sg
    this.cache = cache || {}
    this.tweens = null
    this.effect = null
  }
  put(key, value) {
    if (!finite(value)) return rejectValue(this.sg, key, value)
    if (same(this.cache[key], value)) return
    const tween = this.tweens && this.tweens[key]
    if (tween && tween.active) {
      sgSet(tween.sg, 'control', 'stop')
      tween.active = false
    }
    this.cache[key] = value
    sgSet(this.sg, key, value)
  }
  tweening(key) {
    const tween = this.tweens && this.tweens[key]
    return !!(tween && tween.active)
  }
}

const GROUP_DEFAULTS = () => ({ translation: [0, 0], opacity: 1, visible: true, scale: [1, 1], rotation: 0, clippingRect: [0, 0, 0, 0] })

const dirty = new Set()
let queued = false
let idleTimer = 0
let rendererMain = null
const queue = (node) => {
  dirty.add(node)
  if (!queued) {
    queued = true
    Promise.resolve().then(flush)
  }
}
function flush() {
  queued = false
  for (const node of dirty) {
    dirty.delete(node)
    node.sync()
  }
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    idleTimer = 0
    if (rendererMain) rendererMain.emit('idle')
  }, 32)
}

// Lightning eases by CSS names, SceneGraph by its own.
const EASE = {
  linear: 'linear',
  ease: 'inOutCubic',
  'ease-in': 'inCubic',
  'ease-out': 'outCubic',
  'ease-in-out': 'inOutCubic',
  'ease-in-sine': 'inQuad',
  'ease-out-sine': 'outQuad',
  'ease-in-out-sine': 'inOutQuad',
}
const easeFor = (e) => (typeof e === 'string' ? EASE[e] || (e.indexOf('cubic-bezier') === 0 ? 'outCubic' : 'linear') : 'linear')

const hasGradient = (p) => p.colorTop !== p.colorBottom || p.colorLeft !== p.colorRight
// A relative path is a file in the package.
const pkgUri = (src) => (/^[a-z][a-z0-9+.-]*:/i.test(src) ? src : 'pkg:/' + src.replace(/^\.?\//, ''))
const canvasSrc = (p) => {
  const src = imageSrc(p)
  return !!src && src.indexOf('canvas:') === 0
}

// Recorded canvas rectangles merged for drawing: a row's touching cells of one color become one run,
// and a run repeated in the row below grows down instead of adding a node.
const mergeRects = (ops) => {
  const runs = []
  const rows = {}
  for (const [x, y, w, h, color] of ops) {
    const row = rows[y + ',' + h] || (rows[y + ',' + h] = [])
    row.push([x, y, w, h, color])
  }
  for (const key of Object.keys(rows)) {
    const row = rows[key].sort((a, b) => a[0] - b[0])
    for (const r of row) {
      const last = runs.length && runs[runs.length - 1]
      if (last && last[1] === r[1] && last[3] === r[3] && last[4] === r[4] && last[0] + last[2] === r[0]) last[2] += r[2]
      else runs.push(r.slice())
    }
  }
  const open = {}
  const out = []
  runs.sort((a, b) => a[1] - b[1] || a[0] - b[0])
  for (const r of runs) {
    const k = r[0] + ',' + r[2] + ',' + r[4]
    const above = open[k]
    if (above && above[1] + above[3] === r[1]) above[3] += r[3]
    else {
      out.push(r)
      open[k] = r
    }
  }
  return out
}

const subTexture = (p) => (p.texture && p.texture.type === TextureType.subTexture ? p.texture.props : null)
const imageSrc = (p) => {
  if (p.src) return pkgUri(p.src)
  const t = p.texture
  if (!t || !t.props) return null
  if (typeof t.props.src === 'string') return pkgUri(t.props.src)
  // Pixels handed over as an ImageData from a bridge canvas name that canvas's drawing.
  if (typeof t.props.src === 'function') {
    const img = t.props.src()
    return (img && img.canvas) || null
  }
  const parent = t.props.texture
  return parent && parent.props && typeof parent.props.src === 'string' ? pkgUri(parent.props.src) : null
}

// Effect angles follow CSS (0 puts the first color at the bottom, 90 at the left). Lightning's are radians,
// half a turn from CSS.
const cssAngle = (rad) => ((((rad || 0) * 180) / Math.PI - 180) % 360 + 360) % 360

// SolidTV's hole punches cover everything outside a rounded rectangle, which the Effect node can't
// draw, so those nodes draw nothing and the corners they'd round stay square.
const HOLE_SHADERS = { holePunch: true, cornerMask: true }
const holePunch = (p) => !!(p.shader && HOLE_SHADERS[p.shader.shaderType])

// The Effect fields for a node's rounded corners, border and gradient, or null when it has none.
const effectFields = (p) => {
  if (holePunch(p)) return null
  const sh = p.shader && p.shader.props
  let radius = 0
  let borderWidth = 0
  let borderColor = 0
  let grad = null
  if (sh) {
    const r = sh.radius
    if (typeof r === 'number') radius = r
    else if (Array.isArray(r) && r.length) radius = r.length === 4 ? r.slice() : r[0]
    const w = sh['border-w']
    borderWidth = typeof w === 'number' ? w : Array.isArray(w) ? Math.max(w[0] || 0, w[1] || 0, w[2] || 0, w[3] || 0) : 0
    borderColor = sh['border-color']
    if (typeof borderColor !== 'number' || !alphaOf(borderColor)) borderWidth = 0
    // A gradient shader carries its stops at the top level, a combined one under linear or radial.
    const type = p.shader.shaderType
    const lin = type === 'linearGradient' ? sh : sh.linear
    if (lin && lin.colors && lin.colors.length > 1) grad = { style: 'linear', colors: lin.colors, stops: lin.stops, angle: cssAngle(lin.angle) }
    const rad = type === 'radialGradient' ? sh : sh.radial
    if (!grad && rad && rad.colors && rad.colors.length > 1) grad = { style: 'radial', colors: rad.colors, stops: rad.stops }
  }
  if (!grad && p.colorTop !== p.colorBottom) grad = { style: 'linear', colors: [p.colorTop, p.colorBottom], angle: 180 }
  if (!grad && p.colorLeft !== p.colorRight) grad = { style: 'linear', colors: [p.colorLeft, p.colorRight], angle: 90 }
  if (!radius && !borderWidth && !grad) return null
  const f = { borderRadius: radius || 0, borderWidth }
  if (borderWidth) f.borderColor = hex(borderColor)
  f.gradientStyle = grad ? grad.style : 'none'
  if (!grad) return f
  // The Effect takes 2 to 8 colors, so a longer gradient is resampled to 8 evenly spread stops.
  const n = grad.colors.length
  const pick = n <= 8 ? grad.colors.map((_, i) => i) : [0, 1, 2, 3, 4, 5, 6, 7].map((k) => Math.round((k * (n - 1)) / 7))
  f.gradientColors = pick.map((i) => hex(grad.colors[i]))
  const stops = grad.stops && grad.stops.length === n ? grad.stops : null
  f.gradientStops = pick.map((i) => (stops ? stops[i] : n > 1 ? i / (n - 1) : 0))
  if (grad.style === 'linear') f.gradientAngle = grad.angle
  return f
}

let nextId = 0
// The pictures a Poster has finished loading, so SolidTV can ask whether a node showing one draws at
// once. The oldest are let go past a few thousand.
const loadedImages = new Set()
const LOADED_KEPT = 4000
const imageKey = (props) => (props && typeof props.src === 'string' ? pkgUri(props.src) : null)

export class RokuNode extends EventEmitter {
  constructor(stage, props) {
    super()
    this.stage = stage
    this.props = props
    this.id = ++nextId
    this.children = new Set()
    this.order = []
    this.sg = null
    this.main = null
    this.rect = null
    this.image = null
    this.kind = null
    this.attachedTo = null
    this.destroyed = false
    this.renderState = 8
    this.preventCleanup = true
    this.loaded = false
    const parent = props.parent
    props.parent = null
    if (props.shader) bindShader(props.shader, this)
    if (parent) this.parent = parent
    queue(this)
  }

  chooseKind() {
    const p = this.props
    // A shader node draws its surface on a layer of its own, so inset() can shrink it for a border.
    if (subTexture(p) || holePunch(p) || canvasSrc(p) || p.shader) return 'group'
    if (imageSrc(p)) return 'poster'
    if (alphaOf(p.color) || hasGradient(p) || effectFields(p)) return 'rectangle'
    return 'group'
  }

  create() {
    if (this.sg) return true
    if (this === this.stage.root) {
      if (!mountNode) return false
      this.sg = mountNode
      this.kind = 'group'
      this.main = new Target(mountNode, GROUP_DEFAULTS())
      return true
    }
    const parent = this.props.parent
    if (!parent || parent.destroyed) return false
    if (!parent.sg && !parent.create()) return false
    this.kind = this.chooseKind()
    this.sg = sgCreate(this.kind)
    this.main = new Target(this.sg, GROUP_DEFAULTS())
    if (this.kind === 'poster') this.watchImage(this.main)
    this.attach()
    return true
  }

  // Siblings draw in insertion order, lower zIndex first.
  attach() {
    const parent = this.props.parent
    if (!parent || !parent.sg || !this.sg) return
    const z = this.props.zIndex
    const order = parent.order
    const at = order.indexOf(this)
    if (at >= 0) order.splice(at, 1)
    let i = 0
    let anchor
    for (; i < order.length; i++) {
      const sib = order[i]
      if (sib.props.zIndex > z && sib.attachedTo === parent.sg) {
        anchor = sib.sg
        break
      }
    }
    order.splice(i, 0, this)
    if (this.attachedTo && this.attachedTo !== parent.sg) sgRemove(this.attachedTo, this.sg)
    sgInsert(parent.sg, this.sg, anchor)
    this.attachedTo = parent.sg
  }

  detach() {
    if (this.attachedTo && this.sg) sgRemove(this.attachedTo, this.sg)
    this.attachedTo = null
    const parent = this.props.parent
    if (parent) {
      const at = parent.order.indexOf(this)
      if (at >= 0) parent.order.splice(at, 1)
    }
  }

  get parent() {
    return this.props.parent
  }
  set parent(value) {
    const prev = this.props.parent
    if (prev === value) return
    if (prev) {
      prev.children.delete(this)
      this.detach()
    }
    this.props.parent = value
    if (value) {
      value.children.add(this)
      if (this.sg) this.attach()
    }
    queue(this)
  }

  destroy() {
    if (this.destroyed) return
    this.detach()
    const parent = this.props.parent
    if (parent) parent.children.delete(this)
    this.markDestroyed()
  }
  markDestroyed() {
    this.destroyed = true
    dirty.delete(this)
    for (const child of this.children) child.markDestroyed()
  }

  touch() {
    if (!this.destroyed) queue(this)
  }

  // A layer under the node's children, for a fill or picture the node's own SceneGraph type can't draw.
  layer(slot, tag) {
    let t = this[slot]
    if (!t) {
      t = this[slot] = new Target(sgCreate(tag), {})
      const kids = this.sg.c
      sgInsert(this.sg, t.sg, slot === 'image' && this.rect ? kids[1] : kids && kids[0])
      if (tag === 'poster') this.watchImage(t)
    }
    return t
  }

  // loaded reports the picture's own size, as a Lightning texture does, which logos and other
  // pictures that size themselves read. The device sets the bitmap size and the status separately.
  watchImage(t) {
    const report = () => {
      if (!t.ready || !t.bw || !t.bh || t.reported) return
      t.reported = true
      this.loaded = true
      this.emit('loaded', { type: 'texture', dimensions: { w: t.bw, h: t.bh } })
    }
    sgSet(t.sg, 'onBitmapWidth', (w) => {
      t.bw = w
      report()
    })
    sgSet(t.sg, 'onBitmapHeight', (h) => {
      t.bh = h
      report()
    })
    sgSet(t.sg, 'onLoadStatus', (status) => {
      if (status === 'ready') {
        if (t.cache.uri) loadedImages.add(t.cache.uri)
        if (loadedImages.size > LOADED_KEPT) loadedImages.delete(loadedImages.values().next().value)
        t.ready = true
        report()
      } else if (status === 'failed') {
        this.emit('failed', { type: 'texture', error: new Error('image failed') })
      }
    })
  }

  sync() {
    if (this.destroyed) return
    if (!this.sg && !this.create()) return
    const p = this.props
    const m = this.main
    if (this === this.stage.root) return
    if (!m.tweening('translation')) m.put('translation', [p.x - p.w * p.mountX, p.y - p.h * p.mountY + this.textShift()])
    if (!m.tweening('opacity')) m.put('opacity', p.alpha)
    m.put('visible', p.alpha > 0 || m.tweening('opacity'))
    if (!m.tweening('scale')) m.put('scale', [p.scaleX, p.scaleY])
    if (p.scaleX !== 1 || p.scaleY !== 1 || p.rotation) m.put('scaleRotateCenter', [p.w * p.pivotX, p.h * p.pivotY])
    if (!m.tweening('rotation')) m.put('rotation', -p.rotation)
    m.put('clippingRect', p.clipping || subTexture(p) ? [0, 0, p.w, p.h] : [0, 0, 0, 0])
    this.syncSurface()
  }

  textShift() {
    return 0
  }

  syncSurface() {
    const p = this.props
    const src = imageSrc(p)
    const fx = effectFields(p)
    // On a node with a picture, color tints the picture as in Lightning, so only a node without one
    // draws its own rectangle (a fill, a gradient, or just a border or rounded edge).
    const box = !src && !holePunch(p) && (alphaOf(p.color) || hasGradient(p) || !!fx)
    if (this.kind === 'rectangle') {
      this.paint(this.main, box ? fx : null, box)
    } else if (this.kind === 'group' && box) {
      this.paint(this.layer('rect', 'rectangle'), fx, true)
    } else if (this.rect) {
      this.rect.put('visible', false)
    }
    const sub = subTexture(p)
    if (canvasSrc(p)) {
      this.vector(src)
    } else if (sub && src) {
      this.frame(this.layer('image', 'poster'), src, sub)
    } else if (this.kind === 'poster') {
      this.picture(this.main, src, fx)
    } else if (src) {
      this.picture(this.layer('image', 'poster'), src, fx)
    }
  }

  // A recorded canvas drawing as SceneGraph nodes in one group scaled to the node: flat fills merged
  // into as few Rectangles as they make, then gradients, rings and text. It's rebuilt only when the
  // drawing or the node's tint changes.
  vector(src) {
    const p = this.props
    const pic = globalThis.__canvasImages && globalThis.__canvasImages[src]
    if (!pic) return
    const sx = pic.w ? p.w / pic.w : 1
    const sy = pic.h ? p.h / pic.h : 1
    const tint = (p.color >>> 0) === 0 ? 0xffffffff : p.color >>> 0
    if (!this.vec || this.vec.src !== src || this.vec.tint !== tint) {
      if (this.vec) {
        sgRemove(this.sg, this.vec.group.sg)
        const old = globalThis.__canvasImages[this.vec.src]
        if (old && old.once) delete globalThis.__canvasImages[this.vec.src]
      }
      const group = new Target(sgCreate('group'), GROUP_DEFAULTS())
      const kids = this.sg.c
      sgInsert(this.sg, group.sg, kids && kids[0])
      const rect = (x, y, w, h, color, parent) => {
        const r = sgCreate('rectangle')
        sgSet(r, 'translation', [x, y])
        sgSet(r, 'width', w)
        sgSet(r, 'height', h)
        sgSet(r, 'color', color)
        sgInsert(parent || group.sg, r)
        return r
      }
      // The node's color tints its picture, as Lightning tints a texture.
      const tinted = (c) => hex(tint === 0xffffffff ? c : mixTint(c, tint))
      for (const [x, y, w, h, color] of mergeRects(pic.ops.filter((op) => Array.isArray(op) && typeof op[4] === 'number'))) rect(x, y, w, h, tinted(color))
      // Gradient strip edges land on whole screen pixels at the node's size, so touching strips leave
      // no hairline seams once scaled.
      const snap = (v, sc) => Math.round(v * sc) / sc
      for (const op of pic.ops) {
        if (!Array.isArray(op) || typeof op[4] === 'number' || op[4].stops.length < 1) continue
        for (const [x, y, w, h, color] of gradientStrips(op)) {
          const x0 = snap(x, sx)
          const y0 = snap(y, sy)
          const x1 = snap(x + w, sx)
          const y1 = snap(y + h, sy)
          if (x1 > x0 && y1 > y0) rect(x0, y0, x1 - x0, y1 - y0, tinted(color))
        }
      }
      // A full ring is an Effect border around a nearly clear Rectangle whose edge is the stroke's
      // inner edge (the Effect draws a border outside its Rectangle, and skips a clear one). A part
      // of one is short Rectangles along the arc, each turned to it, since clipping a turned node
      // to half its box lets the other half through on Roku.
      for (const op of pic.ops) {
        if (Array.isArray(op) || !op.ring) continue
        const span = op.to - op.from
        if (Math.abs(span) >= 2 * Math.PI - 0.01) {
          const inner = Math.max(0, op.r - op.width / 2)
          const ring = rect(op.x - inner, op.y - inner, 2 * inner, 2 * inner, '0xffffff01')
          const effect = sgCreate('effect')
          sgSet(effect, 'borderRadius', inner)
          sgSet(effect, 'borderWidth', op.width)
          sgSet(effect, 'borderColor', tinted(op.color))
          sgSet(effect, 'gradientStyle', 'none')
          sgSet(ring, 'effect', effect)
          continue
        }
        for (const seg of arcSegments(op)) {
          const r = rect(seg.x, seg.y, seg.w, seg.h, tinted(op.color))
          sgSet(r, 'scaleRotateCenter', [seg.w / 2, seg.h / 2])
          sgSet(r, 'rotation', seg.rotation)
        }
      }
      // Text last, in drawing order, so shadow copies sit under the glyphs. A Label's top is its line's
      // top, so each sits its font's ascent above the baseline it was drawn on.
      for (const op of pic.ops) {
        if (Array.isArray(op) || op.ring) continue
        const size = parseFloat((/([\d.]+)px/.exec(op.font) || [])[1]) || 32
        const weight = /\b(bold|[6-9]00)\b/.test(op.font) ? 'roboto-bold' : /\b500\b/.test(op.font) ? 'roboto-medium' : 'roboto'
        const label = sgCreate('label')
        sgSet(label, 'font', fontNode(weight, size))
        sgSet(label, 'color', tinted(op.color))
        sgSet(label, 'text', op.text)
        sgSet(label, 'translation', [op.x, op.y - ASCENT * size])
        sgInsert(group.sg, label)
      }
      this.vec = { src, group, tint }
    }
    this.vec.group.put('scale', [sx, sy])
  }

  // One frame of a sprite sheet: the whole sheet at its own size, scaled and shifted so the frame
  // fills the node, which clips the rest.
  frame(t, src, sub) {
    const p = this.props
    const sx = sub.w ? p.w / sub.w : 1
    const sy = sub.h ? p.h / sub.h : 1
    t.put('loadDisplayMode', 'noScale')
    t.put('scale', [sx, sy])
    t.put('translation', [-(sub.x || 0) * sx, -(sub.y || 0) * sy])
    const c = p.color >>> 0
    if (c !== 0 && c !== 0xffffffff) t.put('blendColor', hex(c))
    t.put('uri', src)
  }

  // Lightning draws a border inside the node, and the Effect draws it outside its Rectangle or
  // Poster, so a layer with a border shrinks by its width and its corners by as much.
  inset(t, fx) {
    const p = this.props
    const bw = t !== this.main && fx && fx.borderWidth > 0 ? fx.borderWidth : 0
    if (t !== this.main) t.put('translation', [bw, bw])
    t.put('width', Math.max(0, p.w - 2 * bw))
    t.put('height', Math.max(0, p.h - 2 * bw))
    if (!bw) return fx
    const r = fx.borderRadius
    return { ...fx, borderRadius: Array.isArray(r) ? r.map((v) => Math.max(0, v - bw)) : Math.max(0, r - bw) }
  }

  paint(t, fx0, shown) {
    const p = this.props
    if (t !== this.main) t.put('visible', true)
    const fx = this.inset(t, fx0)
    t.put('color', !shown || (fx && fx.gradientStyle !== 'none') ? '0x00000000' : hex(p.color))
    this.effect(t, fx)
  }

  picture(t, src, fx0) {
    const p = this.props
    const fx = this.inset(t, fx0)
    const mode = p.textureOptions && p.textureOptions.resizeMode && p.textureOptions.resizeMode.type
    t.put('loadDisplayMode', mode === 'cover' ? 'scaleToZoom' : mode === 'contain' ? 'scaleToFit' : 'scaleToFill')
    // An Effect draws the whole bitmap across its Poster, so a covering picture is cropped as it loads.
    const crop = fx && mode === 'cover'
    if (crop || t.cache.loadWidth) {
      t.put('loadWidth', crop ? Math.round(t.cache.width) : 0)
      t.put('loadHeight', crop ? Math.round(t.cache.height) : 0)
    }
    const c = p.color >>> 0
    if (c !== 0 && c !== 0xffffffff) t.put('blendColor', hex(c))
    if (fx) t.put('shaderCompatible', true)
    this.effect(t, fx)
    if (t.cache.uri !== (src || '')) {
      t.ready = false
      t.reported = false
      t.bw = 0
      t.bh = 0
    }
    t.put('uri', src || '')
  }

  effect(t, fx) {
    if (!fx && !t.effect) return
    if (!t.effect) {
      t.effect = new Target(sgCreate('effect'), {})
      t.put('effect', t.effect.sg)
    }
    const f = fx || { borderRadius: 0, borderWidth: 0, gradientStyle: 'none' }
    for (const k in f) t.effect.put(k, f[k])
  }

  animate(props, settings) {
    return new Anim(this, props, settings || {})
  }

  get absX() {
    const parent = this.props.parent
    return this.props.x - this.props.w * this.props.mountX + (parent ? parent.absX : 0)
  }
  get absY() {
    const parent = this.props.parent
    return this.props.y - this.props.h * this.props.mountY + (parent ? parent.absY : 0)
  }
}

const VIEW_KEYS = [
  'x', 'y', 'w', 'h', 'alpha', 'color', 'colorTop', 'colorBottom', 'colorLeft', 'colorRight', 'colorTl', 'colorTr',
  'colorBl', 'colorBr', 'clipping', 'scaleX', 'scaleY', 'mountX', 'mountY', 'pivotX', 'pivotY', 'rotation', 'src',
  'textureOptions', 'autosize', 'ignoreParentAlpha', 'placeholderColor', 'srcX', 'srcY', 'srcWidth', 'srcHeight',
  'imageType', 'data', 'texture',
]
const defineKeys = (proto, keys) => {
  for (const key of keys) {
    Object.defineProperty(proto, key, {
      configurable: true,
      get() {
        return this.props[key]
      },
      set(v) {
        if (this.props[key] === v) return
        this.props[key] = v
        this.touch()
      },
    })
  }
}
defineKeys(RokuNode.prototype, VIEW_KEYS)
const alias = (proto, name, set, get) => Object.defineProperty(proto, name, { configurable: true, get, set })
alias(RokuNode.prototype, 'width', function (v) { this.w = v }, function () { return this.props.w })
alias(RokuNode.prototype, 'height', function (v) { this.h = v }, function () { return this.props.h })
alias(RokuNode.prototype, 'scale', function (v) {
  this.props.scale = v
  this.scaleX = v
  this.scaleY = v
}, function () { return this.props.scale })
alias(RokuNode.prototype, 'mount', function (v) {
  this.props.mount = v
  this.mountX = v
  this.mountY = v
}, function () { return this.props.mount })
alias(RokuNode.prototype, 'pivot', function (v) {
  this.props.pivot = v
  this.pivotX = v
  this.pivotY = v
}, function () { return this.props.pivot })
alias(RokuNode.prototype, 'zIndex', function (v) {
  if (this.props.zIndex === v) return
  this.props.zIndex = v
  if (this.sg) this.attach()
}, function () { return this.props.zIndex })
alias(RokuNode.prototype, 'shader', function (v) {
  this.props.shader = v
  if (v) bindShader(v, this)
  this.touch()
}, function () { return this.props.shader })

// Shader props change in place after a node draws, so each prop write tells the node to sync.
const bindShader = (shader, node) => {
  shader.node = node
  if (shader.watched || !shader.props) return
  const raw = shader.props
  shader.props = new Proxy(raw, {
    set(target, key, value) {
      target[key] = value
      if (shader.node) shader.node.touch()
      return true
    },
  })
  shader.watched = true
}

// Fonts are files in the package. Families without one fall back to Roboto at the nearest weight.
const FONT_FILES = { roboto: 'Roboto-Regular', 'roboto-medium': 'Roboto-Medium', 'roboto-bold': 'Roboto-Bold' }
const fontUri = (family) => {
  const f = String(family || 'roboto').replace(/-web$/, '')
  const file = FONT_FILES[f] || (/bold/.test(f) ? 'Roboto-Bold' : /medium|semibold/.test(f) ? 'Roboto-Medium' : 'Roboto-Regular')
  return 'pkg:/fonts/' + file + '.ttf'
}
const fonts = new Map()
const fontNode = (family, size) => {
  const uri = fontUri(family)
  const s = Number.isFinite(size) ? Math.max(1, Math.round(size)) : 32
  const key = uri + '|' + s
  let f = fonts.get(key)
  if (!f) {
    f = sgCreate('font')
    f.fontKey = key
    sgSet(f, 'uri', uri)
    sgSet(f, 'size', s)
    fonts.set(key, f)
  }
  return f
}

const SCALES = scalesFor('fhd', 'fhd')
const ALIGN = { left: 'left', center: 'center', right: 'right' }

export class RokuText extends RokuNode {
  chooseKind() {
    return 'label'
  }
  // A lineHeight of 3 or under is a multiple of the font's own line, as SolidTV's renderer reads it.
  lineBox() {
    const lh = this.props.lineHeight
    if (lh > 3) return lh
    const bare = this.fontLine || this.props.fontSize * 1.2
    return lh > 0 ? lh * bare : Math.round(this.props.fontSize * 1.2)
  }
  textShift() {
    return this.fontLine ? (this.lineBox() - this.fontLine) / 2 : 0
  }
  layoutKey(font) {
    const p = this.props
    return [p.text, font.fontKey, p.maxWidth, p.maxHeight, p.maxLines, p.lineHeight, p.overflowSuffix, p.contain].join('|')
  }
  // Text lays out as SolidTV's renderer lays it out: wrapped at maxWidth, held to maxLines (and to
  // the lines maxHeight fits), the last kept line ending in the overflow suffix, and aligned within
  // its widest line, or within maxWidth when contain holds the width. Once measured, the Label gets
  // those exact lines.
  syncSurface() {
    const p = this.props
    const t = this.main
    const font = fontNode(p.fontFamily, p.fontSize)
    t.put('font', font)
    t.put('color', hex(p.color || 0xffffffff))
    t.put('vertAlign', 'top')
    t.put('ellipsisText', p.overflowSuffix || '…')
    t.put('height', 0)
    const key = this.layoutKey(font)
    const lay = this.lay && this.lay.key === key ? this.lay : null
    if (lay) {
      const align = ALIGN[p.textAlign] || 'left'
      const width = lay.box ? lay.w : Math.ceil(lay.w) + 4
      t.put('horizAlign', align)
      t.put('wrap', false)
      t.put('width', width)
      t.put('maxLines', 0)
      t.put('text', lay.lines[0])
      this.moreLines(lay.lines.slice(1), font, align, width)
    } else {
      this.moreLines([], font)
      // Until the font can be measured the device wraps on its own. Wrapping at width 0 never
      // finishes there, so text without a maxWidth stays on one line.
      const wraps = p.maxWidth > 0
      t.put('horizAlign', 'left')
      t.put('wrap', wraps)
      t.put('width', wraps ? p.maxWidth : 0)
      t.put('maxLines', wraps && p.maxLines > 0 ? p.maxLines : 0)
      t.put('text', drawableText(p.text))
    }
    this.measure(font, key)
  }
  // Each line after the first is its own Label one line height below, so lines sit exactly as
  // SolidTV spaces them. The device's own line spacing drops every line after the first when the
  // line height is under the font's.
  moreLines(lines, font, align, width) {
    const extra = this.extra || (this.extra = [])
    const lh = this.lineBox()
    const p = this.props
    for (let i = 0; i < Math.max(lines.length, extra.length); i++) {
      let t = extra[i]
      if (i >= lines.length) {
        if (t) t.put('visible', false)
        continue
      }
      if (!t) {
        t = extra[i] = new Target(sgCreate('label'), {})
        sgInsert(this.sg, t.sg)
      }
      t.put('visible', true)
      t.put('font', font)
      t.put('color', hex(p.color || 0xffffffff))
      t.put('horizAlign', align)
      t.put('vertAlign', 'top')
      t.put('width', width)
      t.put('translation', [0, (i + 1) * lh])
      t.put('text', lines[i])
    }
  }
  // The device can say a font is ready seconds before it measures with it, so a layout that finds it
  // not loaded tries again every half second for up to 15 seconds. Until then its size stays unknown.
  measure(font, key, tries = 0) {
    if (key === this.measureKey && !tries) return
    this.measureKey = key
    whenFontReady(font.r).then(() => {
      if (this.destroyed || this.measureKey !== key) return
      try {
        this.measured(font, key)
      } catch (e) {
        const msg = (e && e.message) || String(e)
        if (/not yet loaded/i.test(msg) && tries < 30) setTimeout(() => this.measure(font, key, tries + 1), 500)
        else console.warn(`[bridge] label layout ${(e && e.stack) || e}`)
      }
    })
  }
  measured(font, key) {
    const p = this.props
    const fm = getFontMeasure()
    this.fontLine = fm.getOneLineHeight(font.r)
    const width = (s) => (s ? fm.getOneLineWidth(font.r, s, 100000) : 0)
    const lh = this.lineBox()
    let maxLines = p.maxLines > 0 ? p.maxLines : 0
    if (p.maxHeight > 0) {
      const fit = Math.max(1, Math.floor(p.maxHeight / lh))
      if (!maxLines || fit < maxLines) maxLines = fit
    }
    const text = drawableText(p.text)
    let lines
    if (p.maxWidth > 0) {
      lines = layoutLabel(
        { text, width: p.maxWidth, wrap: true, maxLines, lineSpacing: lh - this.fontLine, ellipsisText: p.overflowSuffix || '…' },
        { width, lineHeight: this.fontLine, defaultLineSpacing: 0 },
        SCALES,
      ).lines
    } else {
      lines = text.split('\n')
      if (maxLines) lines = lines.slice(0, maxLines)
    }
    if (!lines.length) lines = ['']
    let w = 0
    for (const l of lines) w = Math.max(w, width(l))
    const box = p.maxWidth > 0 && (p.contain === 'width' || p.contain === 'both')
    if (box) w = p.maxWidth
    const h = lines.length * lh
    this.lay = { key, lines, w, box }
    const changed = p.w !== w || p.h !== h
    p.w = w
    p.h = h
    queue(this)
    if (!this.loaded || changed) {
      this.loaded = true
      this.emit('loaded', { type: 'text', dimensions: { w, h } })
    }
  }
}

const TEXT_KEYS = [
  'text', 'fontFamily', 'fontSize', 'fontStyle', 'fontWeight', 'fontStretch', 'lineHeight', 'maxWidth', 'maxHeight',
  'letterSpacing', 'textAlign', 'overflowSuffix', 'maxLines', 'contain', 'verticalAlign', 'offsetY', 'wordBreak',
  'forceLoad', 'textRendererOverride',
]
defineKeys(RokuText.prototype, TEXT_KEYS)

// A Lightning animation as SceneGraph tweens, one per field, run on the render thread. The JS-side props
// take their end values at once, the way a Lightning node's props read after an animation finishes.
class Anim extends EventEmitter {
  constructor(node, props, settings) {
    super()
    this.node = node
    this.to = props
    this.settings = settings
    this.state = 'paused'
    this.pending = 0
    this.timer = 0
    this.stopPromise = null
    this.stopResolve = null
  }
  start() {
    if (this.state === 'running') return this
    this.state = 'running'
    const delay = this.settings.delay || 0
    if (delay > 0) this.timer = setTimeout(() => this.run(), delay)
    else this.run()
    return this
  }
  run() {
    this.timer = 0
    const node = this.node
    if (node.destroyed || !node.sg || node === node.stage.root) {
      Object.assign(node.props, this.endProps())
      node.touch()
      this.finish()
      return
    }
    const p = node.props
    const before = { x: p.x, y: p.y, w: p.w, h: p.h, alpha: p.alpha, scaleX: p.scaleX, scaleY: p.scaleY, rotation: p.rotation }
    Object.assign(p, this.endProps())
    if (this.to.shaderProps && p.shader && p.shader.props) Object.assign(p.shader.props, this.to.shaderProps)
    const secs = (this.settings.duration == null ? 300 : this.settings.duration) / 1000
    const ease = easeFor(this.settings.easing)
    const m = node.main
    const moved = p.x !== before.x || p.y !== before.y || p.w !== before.w || p.h !== before.h
    if (moved) this.tween(m, 'translation', [p.x - p.w * p.mountX, p.y - p.h * p.mountY + node.textShift()], secs, ease)
    if (p.alpha !== before.alpha) {
      if (p.alpha > 0) m.put('visible', true)
      this.tween(m, 'opacity', p.alpha, secs, ease)
    }
    if (p.rotation !== before.rotation) {
      m.put('scaleRotateCenter', [p.w * p.pivotX, p.h * p.pivotY])
      this.tween(m, 'rotation', -p.rotation, secs, ease)
    }
    if (p.scaleX !== before.scaleX || p.scaleY !== before.scaleY) {
      m.put('scaleRotateCenter', [p.w * p.pivotX, p.h * p.pivotY])
      this.tween(m, 'scale', [p.scaleX, p.scaleY], secs, ease)
    }
    node.touch()
    if (this.pending === 0) this.finish()
  }
  endProps() {
    const out = {}
    for (const k in this.to) {
      if (k === 'shaderProps') continue
      if (k === 'scale') {
        out.scale = out.scaleX = out.scaleY = this.to.scale
      } else {
        out[k] = this.to[k]
      }
    }
    return out
  }
  tween(target, field, value, secs, ease) {
    if (same(target.cache[field], value)) return
    if (!(secs > 0)) return target.put(field, value)
    const tweens = target.tweens || (target.tweens = {})
    let tw = tweens[field]
    if (!tw) {
      if (!tweenLayer) return target.put(field, value)
      tw = tweens[field] = { sg: sgCreate('tween'), active: false, owner: null, last: 0 }
      sgInsert(tweenLayer, tw.sg)
      sgSet(tw.sg, 'field', field)
      sgSet(tw.sg, 'targetNode', target.sg)
      sgSet(tw.sg, 'onAnimationStop', () => {
        tw.active = false
        const owner = tw.owner
        tw.owner = null
        if (owner) owner.done()
      })
    }
    if (tw.active && tw.owner && tw.owner !== this) tw.owner.done()
    tw.active = true
    tw.owner = this
    this.pending++
    // The tween node starts only when its target field changes, and a new one's targetValue is
    // already 0, so a target equal to the last one runs to a value just off it. The cache keeps
    // that value, so the sync after the tween writes the exact one.
    const to = same(tw.last, value) ? nudge(value) : value
    tw.last = to
    target.cache[field] = to
    sgSet(tw.sg, 'duration', secs)
    sgSet(tw.sg, 'easeFunction', ease)
    if (Array.isArray(to)) sgSet(tw.sg, 'targetVector', to)
    else sgSet(tw.sg, 'targetValue', to)
  }
  done() {
    this.pending--
    if (this.pending <= 0) {
      this.node.touch()
      this.finish()
    }
  }
  finish() {
    if (this.state === 'stopped') return
    this.state = 'stopped'
    this.emit('stopped', this)
    if (this.stopResolve) {
      this.stopResolve()
      this.stopResolve = null
      this.stopPromise = null
    }
  }
  pause() {
    return this.stop()
  }
  stop() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = 0
    this.finish()
    return this
  }
  restore() {
    return this
  }
  waitUntilStopped() {
    if (this.state === 'stopped') return Promise.resolve()
    if (!this.stopPromise) this.stopPromise = new Promise((resolve) => (this.stopResolve = resolve))
    return this.stopPromise
  }
}

const nodeDefaults = (props) => {
  const color = props.color == null ? 0 : props.color
  const scale = props.scale == null ? 1 : props.scale
  const mount = props.mount || 0
  const pivot = props.pivot == null ? 0.5 : props.pivot
  return {
    x: props.x || 0,
    y: props.y || 0,
    w: props.w || 0,
    h: props.h || 0,
    alpha: props.alpha == null ? 1 : props.alpha,
    autosize: !!props.autosize,
    clipping: !!props.clipping,
    color,
    colorTop: props.colorTop == null ? color : props.colorTop,
    colorBottom: props.colorBottom == null ? color : props.colorBottom,
    colorLeft: props.colorLeft == null ? color : props.colorLeft,
    colorRight: props.colorRight == null ? color : props.colorRight,
    zIndex: props.zIndex || 0,
    parent: props.parent || null,
    texture: props.texture || null,
    textureOptions: props.textureOptions || {},
    shader: props.shader || null,
    src: props.src || null,
    scale: props.scale == null ? null : props.scale,
    scaleX: props.scaleX == null ? scale : props.scaleX,
    scaleY: props.scaleY == null ? scale : props.scaleY,
    mount,
    mountX: props.mountX == null ? mount : props.mountX,
    mountY: props.mountY == null ? mount : props.mountY,
    pivot,
    pivotX: props.pivotX == null ? pivot : props.pivotX,
    pivotY: props.pivotY == null ? pivot : props.pivotY,
    rotation: props.rotation || 0,
    data: props.data || {},
  }
}
const textDefaults = (props) => ({
  ...nodeDefaults(props),
  color: props.color == null ? 0xffffffff : props.color,
  text: props.text == null ? '' : String(props.text),
  fontFamily: props.fontFamily || 'roboto',
  fontSize: props.fontSize || 32,
  textAlign: props.textAlign || 'left',
  contain: props.contain || 'none',
  lineHeight: props.lineHeight || 0,
  maxLines: props.maxLines || 0,
  maxWidth: props.maxWidth || 0,
  maxHeight: props.maxHeight || 0,
  overflowSuffix: props.overflowSuffix || '…',
  letterSpacing: props.letterSpacing || 0,
  verticalAlign: props.verticalAlign || 'top',
})

export class RendererMain extends EventEmitter {
  constructor(settings) {
    super()
    rendererMain = this
    this.settings = settings || {}
    const noop = () => {}
    this.stage = {
      root: null,
      renderer: { mode: 'roku', boundsMargin: this.settings.boundsMargin },
      shManager: { registerShaderType: noop },
      txManager: {
        createTexture: (type, props) => this.createTexture(type, props),
        loadTexture: (tex) => setTimeout(() => tex && tex.emit && tex.emit('loaded', { type: 'texture' }), 0),
        txConstructors: { ImageTexture: { makeCacheKey: imageKey } },
        getTextureFromCache: (key) => (key && loadedImages.has(key) ? { state: 'loaded' } : null),
      },
      txMemManager: { cleanup: noop, freeTexture: noop },
      animationManager: { registerAnimation: noop, unregisterAnimation: noop },
      textRenderers: {},
      loadFont: async () => {},
      cleanup: noop,
      requestRender: noop,
      reprocessUpdates: noop,
    }
    this.root = new RokuNode(this.stage, nodeDefaults({ w: this.settings.appWidth || 1920, h: this.settings.appHeight || 1080 }))
    this.stage.root = this.root
    this.boundsMargin = this.settings.boundsMargin
  }
  // SceneGraph draws on its own thread and tells JS nothing about frames, so frameTick is a 30 Hz
  // timer that runs only while something listens (SolidTV's sprite spinner and afterDraw).
  on(event, listener) {
    super.on(event, listener)
    if (event === 'frameTick' && !this.ticker) {
      const start = Date.now()
      let last = start
      this.ticker = setInterval(() => {
        const list = this.eventListeners && this.eventListeners.frameTick
        if (!list || list.length === 0) {
          clearInterval(this.ticker)
          this.ticker = 0
          return
        }
        const now = Date.now()
        this.emit('frameTick', { time: now - start, delta: now - last })
        last = now
      }, 33)
    }
  }
  createNode(props) {
    return new RokuNode(this.stage, nodeDefaults(props))
  }
  createTextNode(props) {
    return new RokuText(this.stage, textDefaults(props))
  }
  createShader(shaderType, props) {
    return { shaderType, props: props || {}, program: {} }
  }
  // The bridge reads a texture's pixels when it draws a node that shows it. Loaded fires only for a
  // loadTexture call, so pixels a caller lets go of once loaded stay until then.
  createTexture(textureType, props) {
    const tex = new EventEmitter()
    tex.type = textureType === 'SubTexture' ? TextureType.subTexture : textureType === 'ImageTexture' ? TextureType.image : TextureType.generic
    tex.props = props || {}
    tex.state = 'loaded'
    tex.destroy = () => {
      tex.state = 'freed'
    }
    return tex
  }
}

// Canvas measureText for SolidTV's own text layout. The device's per-string width call fails now
// and then even with the font loaded, so each weight's ASCII advances are measured once at 100 px
// and a string's width is their sum, scaled. Kerning is left out, and other characters count 0.55 em.
const WIDEN = { regular: 1, medium: 1.02, bold: 1.05 }
const advanceTable = (fm, font) => {
  const table = {}
  for (let c = 32; c < 127; c++) table[String.fromCharCode(c)] = fm.getOneLineWidth(font.r, String.fromCharCode(c), 100000)
  return table
}
export const prepareTextMeasure = async () => {
  const faces = { regular: fontNode('roboto', 100), medium: fontNode('roboto-medium', 100), bold: fontNode('roboto-bold', 100) }
  // A font loads once a Label on screen draws with it, so these draw there in a clear color.
  for (const f of Object.values(faces)) {
    const label = sgCreate('label')
    sgSet(label, 'color', '0x00000000')
    sgSet(label, 'font', f)
    sgSet(label, 'text', 'M')
    sgInsert(mountNode, label)
  }
  const ready = Promise.all(Object.values(faces).map((f) => whenFontReady(f.r)))
  await Promise.race([ready, new Promise((resolve) => setTimeout(resolve, 3000))])
  const fm = getFontMeasure()
  const tables = {}
  for (let attempt = 0; attempt < 10 && Object.keys(tables).length < 3; attempt++) {
    for (const name of Object.keys(faces)) {
      if (tables[name]) continue
      try {
        tables[name] = advanceTable(fm, faces[name])
      } catch {}
    }
    if (Object.keys(tables).length < 3) await new Promise((resolve) => setTimeout(resolve, 200))
  }
  const base = tables.regular || tables.medium || tables.bold
  if (!base) console.warn('[bridge] no font measured, text widths are estimates')
  globalThis.__measureText = (font, text, px) => {
    if (!text) return 0
    const name = /bold|[6-9]00/i.test(font) ? 'bold' : /medium|semibold|500/i.test(font) ? 'medium' : 'regular'
    const table = tables[name] || base
    const scale = (tables[name] ? 1 : WIDEN[name]) * px / 100
    let w = 0
    for (let i = 0; i < text.length; i++) {
      const a = table && table[text.charAt(i)]
      w += a == null ? 55 : a
    }
    return w * scale
  }
}
