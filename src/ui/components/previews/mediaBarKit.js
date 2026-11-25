// What the media bar previews share: the dots and the facts line laid out the way CSS flows them,
// and CSS gradients drawn into a canvas, since the renderer's own gradients can't fade to see-through.
import { textWidth } from '../details/measure.js'
import { cssShift } from '../../text.js'

const rgbaOf = (c) => {
  const v = String(c).replace('#', '')
  const n = (i) => parseInt(v.slice(i, i + 2), 16)
  return [n(0), n(2), n(4), v.length >= 8 ? n(6) / 255 : 1]
}

// CSS blends a gradient's stops with their colors weighted by alpha, where a canvas blends color and
// alpha apart, so each span is cut into short steps blended the CSS way. Colors come back as the
// rgba() a canvas takes (Chrome 38 has no 8 digit hex).
const STEPS = 8
const premultipliedStops = (stops) => {
  const out = []
  stops.forEach((s, i) => {
    const b = rgbaOf(s[0])
    if (i === 0) {
      out.push([b, s[1]])
      return
    }
    const a = rgbaOf(stops[i - 1][0])
    for (let k = 1; k <= STEPS; k++) {
      const t = k / STEPS
      const alpha = a[3] + (b[3] - a[3]) * t
      const ch = (j) => (alpha ? (a[j] * a[3] + (b[j] * b[3] - a[j] * a[3]) * t) / alpha : b[j])
      out.push([[ch(0), ch(1), ch(2), alpha], stops[i - 1][1] + (s[1] - stops[i - 1][1]) * t])
    }
  })
  return out.map(([c, at]) => [`rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${Math.round(c[3] * 1000) / 1000})`, at])
}

const urls = {}

// A CSS gradient as an image to lay over its box. [g] is { w, h, stops: [[color, at 0..1], ...] }
// with angle (CSS degrees) for a linear one, or rx, ry, cx, cy (box pixels) for an elliptical
// radial one. Drawn at a fraction of the box, which the renderer stretches back smoothly.
export const gradientUrl = (g) => {
  const key = JSON.stringify(g)
  if (urls[key] !== undefined) return urls[key]
  let url = ''
  try {
    const k = Math.min(1, 256 / Math.max(g.w, g.h))
    const w = Math.max(2, Math.round(g.w * k))
    const h = Math.max(2, Math.round(g.h * k))
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    let grad
    if (g.angle != null) {
      const a = (g.angle * Math.PI) / 180
      const dx = Math.sin(a)
      const dy = -Math.cos(a)
      const len = (Math.abs(w * dx) + Math.abs(h * dy)) / 2
      grad = ctx.createLinearGradient(w / 2 - dx * len, h / 2 - dy * len, w / 2 + dx * len, h / 2 + dy * len)
    } else {
      ctx.translate(g.cx * k, g.cy * k)
      ctx.scale(1, g.ry / g.rx)
      grad = ctx.createRadialGradient(0, 0, 0, 0, 0, g.rx * k)
    }
    premultipliedStops(g.stops).forEach((s) => grad.addColorStop(Math.max(0, Math.min(1, s[1])), s[0]))
    ctx.fillStyle = grad
    if (g.angle != null) ctx.fillRect(0, 0, w, h)
    else ctx.fillRect(-g.cx * k, (-g.cy * k * g.rx) / g.ry, w, (h * g.rx) / g.ry)
    url = c.toDataURL('image/png')
  } catch (e) {
    url = ''
  }
  urls[key] = url
  return url
}

// The facts line: the facts 12px semibold with a bullet between each and no spaces around it, the
// official rating in an outlined 11px chip. Each item's text sits on a 33px line, so a line is 33
// tall, or 37 with the chip's padding and border. Wraps at [maxW]. Returns texts
// { k, text, x, y, size, chip } with y the text's top, chips { k, x, y, w, h } and the height.
const LINE = 33
// [lh] gives an item's line height from its font size, for a parent that sets a unitless one.
export const metaLayout = (parts, rating, maxW, lh = () => LINE) => {
  const items = []
  parts.forEach((p, i) => {
    if (i > 0) items.push({ text: '•', size: 12, chip: false })
    items.push({ text: p, size: rating && p === rating ? 11 : 12, chip: !!(rating && p === rating) })
  })
  const lines = []
  let line = null
  items.forEach((it) => {
    it.w = textWidth(it.text, it.size, 'bold') + (it.chip ? 12 : 0)
    it.h = lh(it.size) + (it.chip ? 4 : 0)
    if (!line || (line.items.length && line.w + it.w > maxW + 0.01)) {
      line = { items: [], w: 0, h: 0 }
      lines.push(line)
    }
    line.items.push(it)
    line.w += it.w
    line.h = Math.max(line.h, it.h)
  })
  const texts = []
  const chips = []
  let y = 0
  lines.forEach((ln, li) => {
    let x = 0
    ln.items.forEach((it, i) => {
      const top = y + (ln.h - it.h) / 2
      if (it.chip) chips.push({ k: `c${li}-${i}`, x, y: top, w: it.w, h: it.h })
      texts.push({ k: `t${li}-${i}`, text: it.text, x: x + (it.chip ? 6 : 0), y: top + (it.chip ? 2 : 0) + cssShift(it.size), size: it.size, chip: it.chip })
      x += it.w
    })
    y += ln.h
  })
  return { texts, chips, h: y }
}

export { dotsLayout, containBox, rowPeekCover, withNewReleasePreview, fallbackShapes, toBottomRight } from './mediaBarMath.js'
