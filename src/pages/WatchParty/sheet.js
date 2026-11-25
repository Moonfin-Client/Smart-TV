// The Watch Party and SyncPlay dialogs' painter, which collects what PartyPaint draws, and their controls. A text's y
// is the top of its line box.
import { fitText, NORMAL_LH } from '../../ui/components/party/measure.js'
import { textWidth as measure } from '../../ui/components/library/measure.js'
import { avatarColor } from '../../ui/components/party/feed.js'
import { faceMetrics, fontFor } from '../../ui/text.js'
import { flowText } from '../../ui/components/party/sheetMath.js'

export const ACCENT = '#00a4dc'
export const LINE = 33
export const INK = '#e6e6e6'
const WEIGHT = { 400: 'regular', 500: 'medium', 600: 'bold', 700: 'bold' }

const hex2 = (v) => (v < 16 ? '0' : '') + Math.round(v).toString(16)
export const rgba = (r, g, b, a = 1) => `#${hex2(r)}${hex2(g)}${hex2(b)}${hex2(a * 255)}`
export const white = (a) => rgba(255, 255, 255, a)
export const ink = (a) => rgba(230, 230, 230, a)
export const normal = (size) => size * NORMAL_LH

// Boxes and rings go under pictures unless drawn with `s.over` set, for what sits on top of a picture (a tile's chips).
// shortcut: a label wider than its control (the pixel themes' wide faces) is cut short instead of wrapping and growing
// the control. Lay labels out with para() and measure the control's height if the pixel themes need it exact.
export const createSheet = (focusId) => {
  const out = { boxes: [], rings: [], pics: [], boxes2: [], rings2: [], texts: [], focusables: [] }
  const s = {
    out,
    over: false,
    is: (id) => id === focusId,
    box(k, x, y, w, h, c, r = 0, a = 1, src = '') {
      out[s.over ? 'boxes2' : 'boxes'].push({ k, x, y, w, h, c, r, a, src })
    },
    ring(k, x, y, w, h, c, bw, r = 0, a = 1) {
      out[s.over ? 'rings2' : 'rings'].push({ k, x, y, w, h, c, bw, r, a })
    },
    pic(k, x, y, w, h, srcs, r = 0, a = 1) {
      out.pics.push({ k, x, y, w, h, srcs, r, a })
    },
    // `lh` is the line height in px, or none for normal. `mw` cuts the line short with an ellipsis.
    text(k, x, y, t, o) {
      const weight = WEIGHT[o.weight || 400]
      let str = String(t == null ? '' : t)
      if (o.mw) str = fitText(str, o.size, weight, o.mw, o.ls || 0, measure)
      const f = fontFor(str, weight)
      out.texts.push({
        k, x, y: y + faceMetrics(f).shift * o.size, t: str || ' ', f, s: o.size, c: o.color || '#ffffff',
        lh: o.lh || normal(o.size), ls: o.ls || 0.001, mx: o.mx || 0, a: o.a == null ? 1 : o.a,
      })
    },
    width: (t, size, weight = 400, ls = 0) => measure(t, size, WEIGHT[weight], ls),
    focusable(id, x, y, w, h, act) {
      out.focusables.push({ id, x, y, w, h, act })
    },
    // Text wrapped at `w`. Returns its height.
    para(k, x, y, t, o) {
      const lh = o.lh || LINE
      const lines = flowText([{ text: String(t || ''), style: 0 }], o.w, (word) => s.width(word, o.size, o.weight, o.ls))
      lines.forEach((line, i) => {
        const str = line.map((seg) => seg.text).join('')
        const cx = o.align === 'center' ? x + o.w / 2 : x
        s.text(`${k}:${i}`, cx, y + i * lh, str, { ...o, lh, mx: o.align === 'center' ? 0.5 : 0, align: 'left' })
      })
      return lines.length * lh
    },
  }
  return s
}

const glow = (s, k, x, y, w, h, r, on) => s.ring(k, x - 2, y - 2, w + 4, h + 4, rgba(0, 164, 220, 0.3), 2, r + 2, on ? 1 : 0)

// Buttons have padding 14 24, a 1px border, radius 12 and 20px medium text on a normal line height.
export const BTN_H = 2 + 28 + normal(20)
const BTN = {
  create: { bg: rgba(0, 164, 220, 0.85), focus: ACCENT, ink: '#ffffff', focusInk: '#ffffff' },
  plain: { bg: '#efefef', focus: '#efefef', ink: '#000000', focusInk: '#000000' },
  leave: { bg: rgba(220, 50, 50, 0.75), focus: '#dc3232', ink: '#ffffff', focusInk: '#ffffff' },
}
export const btnWidth = (s, label) => 2 + 48 + s.width(label, 20, 500)
// `h` is for a button stretched by its row, and `focusable` is false for one that's disabled outright.
export const button = (s, id, x, y, w, label, kind = 'create', disabled = false, h = BTN_H, focusable = true) => {
  const st = BTN[kind]
  const f = s.is(id)
  const a = disabled ? 0.5 : 1
  s.box(`${id}:bg`, x, y, w, h, f && !disabled ? st.focus : st.bg, 12, a)
  s.ring(`${id}:ring`, x, y, w, h, ACCENT, 1, 12, f ? a : 0)
  glow(s, `${id}:glow`, x, y, w, h, 12, f)
  s.text(`${id}:t`, x + w / 2, y + (h - normal(20)) / 2, label, { size: 20, weight: 500, color: f ? st.focusInk : st.ink, mx: 0.5, a, mw: w - 50 })
  if (focusable) s.focusable(id, x, y, w, h)
  return h
}

// Control buttons have padding 10 16, a 1px border, radius 10 and 18px medium text.
export const CONTROL_H = 2 + 20 + normal(18)
export const CONTROL_EDGE = 34
export const controlButton = (s, id, x, y, w, label, active = false) => {
  const f = s.is(id)
  let bg = white(0.06)
  let border = white(0.1)
  let inkColor = white(0.7)
  if (active) {
    bg = rgba(0, 164, 220, 0.15)
    border = rgba(0, 164, 220, 0.3)
    inkColor = ACCENT
  }
  if (f) {
    bg = white(0.1)
    border = ACCENT
    inkColor = '#ffffff'
  }
  s.box(`${id}:bg`, x, y, w, CONTROL_H, bg, 10)
  s.ring(`${id}:ring`, x, y, w, CONTROL_H, border, 1, 10)
  s.text(`${id}:t`, x + w / 2, y + 11, label, { size: 18, weight: 500, color: inkColor, mx: 0.5, mw: w - 34 })
  s.focusable(id, x, y, w, CONTROL_H)
  return CONTROL_H
}

export const actionButton = (s, id, x, y, w, label, danger = false) => {
  const f = s.is(id)
  s.box(`${id}:bg`, x, y, w, 58, f ? '#ffffff' : '#333333', 12)
  s.text(`${id}:t`, x + w / 2, y + 29 - normal(21) / 2, label, { size: 21, weight: 500, color: f ? '#101010' : danger ? '#ff8a8a' : '#ffffff', mx: 0.5, mw: w - 32 })
  s.focusable(id, x, y, w, 58)
  return 58
}

// Inputs have padding 14 18, a 1px border, radius 16 and 20px text on a 33px line.
export const INPUT_H = 2 + 28 + LINE
export const input = (s, id, x, y, w, value, placeholder) => {
  const f = s.is(id)
  s.box(`${id}:bg`, x, y, w, INPUT_H, white(0.08), 16)
  s.ring(`${id}:ring`, x, y, w, INPUT_H, f ? ACCENT : white(0.15), 1, 16)
  s.text(`${id}:t`, x + 19, y + 15, value || placeholder, { size: 20, color: value ? '#ffffff' : white(0.4), mw: w - 38, lh: LINE })
  s.focusable(id, x, y, w, INPUT_H)
  return INPUT_H
}

// The × at 36px with padding 4 10.
export const closeButton = (s, id, right, top) => {
  const f = s.is(id)
  const w = 20 + s.width('×', 36)
  const x = right - w
  s.box(`${id}:bg`, x, top, w, 44, f ? white(0.15) : '#00000000', 8)
  s.ring(`${id}:ring`, x - 1, top - 1, w + 2, 46, ACCENT, 1, 8, f ? 1 : 0)
  s.text(`${id}:t`, x + w / 2, top + 4, '×', { size: 36, color: f ? '#ffffff' : white(0.6), lh: 36, mx: 0.5 })
  s.focusable(id, x, top, w, 44)
}

// A member's picture in a circle, or their initial on a color of their own. `a` is the opacity of the row it sits in.
export const avatar = (s, k, x, y, size, name, url, fontSize = 18, a = 1) => {
  s.box(`${k}:bg`, x, y, size, size, url ? '#3a3a3a' : avatarColor(name), size / 2, a)
  if (url) {
    s.pic(`${k}:pic`, x, y, size, size, [url], size / 2, a)
    return
  }
  const initial = (String(name || '').charAt(0) || '?').toUpperCase()
  s.text(`${k}:t`, x + size / 2, y + (size - normal(fontSize)) / 2, initial, { size: fontSize, weight: 700, mx: 0.5, a })
}

// The error banner. Returns its height.
export const banner = (s, k, x, y, w, text) => {
  const lines = flowText([{ text, style: 0 }], w - 32, (word) => s.width(word, 20))
  const h = 24 + lines.length * LINE
  s.box(`${k}:bg`, x, y, w, h, rgba(220, 70, 70, 0.2), 8)
  s.para(`${k}:t`, x + 16, y + 12, text, { size: 20, w: w - 32, color: INK })
  return h
}

export const sectionTitle = (s, k, x, y, text) => {
  s.text(k, x, y, String(text).toUpperCase(), { size: 18, weight: 500, color: white(0.6), ls: 0.5, lh: LINE })
  return LINE + 10
}
