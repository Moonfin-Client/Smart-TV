// The Watch Party and SyncPlay dialogs' painter, which collects what PartyPaint draws, and their controls. A text's y
// is the top of its line box.
import { fitText, NORMAL_LH } from '../../ui/components/party/measure.js'
import { textWidth as measure } from '../../ui/components/library/measure.js'
import { avatarColor } from '../../ui/components/party/feed.js'
import { faceMetrics, fontFor } from '../../ui/text.js'
import { flowText } from '../../ui/components/party/sheetMath.js'
import { alphaHex } from '../../ui/themeColor.js'

export const LINE = 33
const WEIGHT = { 400: 'regular', 500: 'medium', 600: 'bold', 700: 'bold' }

const hex2 = (v) => (v < 16 ? '0' : '') + Math.round(v).toString(16)
export const rgba = (r, g, b, a = 1) => `#${hex2(r)}${hex2(g)}${hex2(b)}${hex2(a * 255)}`
export const normal = (size) => size * NORMAL_LH

// A '#rrggbbaa' color at `a` times its own alpha.
const fade = (c, a) => c.slice(0, 7) + alphaHex((parseInt(c.slice(7, 9) || 'ff', 16) / 255) * a)

// The Moonfin theme's tokens, for a sheet laid out with no theme (the node checks).
const MOONFIN = {
  onSurface: '#ffffffff', surface: '#1a1a1aff', accent: '#00a4dcff', onAccent: '#ffffffff', focus: '#00a4dcff',
  buttonNormal: '#2a2a2aff', buttonFocused: '#ffffffff', onButtonNormal: '#ffffffff', onButtonFocused: '#00a4dcff',
  inputBackground: '#2a2a2aff', inputBorder: '#404040ff', inputBorderFocused: '#00a4dcff',
}

// The dialogs' colors from the theme's tokens (ui/theme.js's theme()). Text and lines are the theme's onSurface at
// an alpha, tints its accent, and rings its Focus Color. Status colors (the room dots, state pills, the host ring,
// avatars) and the red of Leave and errors stay fixed, and so does the QR code's white.
// theme() hands back one object until the settings change, so each is turned into a look once.
const looks = new WeakMap()
export const partyLook = (t = MOONFIN) => {
  if (!looks.has(t)) looks.set(t, makeLook(t))
  return looks.get(t)
}
const makeLook = (t) => {
  const os = (a) => fade(t.onSurface, a)
  return {
    text: t.onSurface,
    ink: os(0.9),
    inkA: (a) => os(0.9 * a),
    os,
    panel: t.surface,
    accent: t.accent,
    accentA: (a) => fade(t.accent, a),
    onAccent: t.onAccent,
    focus: t.focus,
    focusA: (a) => fade(t.focus, a),
    button: t.buttonNormal,
    buttonFocused: t.buttonFocused,
    onButton: t.onButtonNormal,
    onButtonFocused: t.onButtonFocused,
    input: t.inputBackground,
    inputBorder: t.inputBorder,
    inputBorderFocused: t.inputBorderFocused,
  }
}
const BASE = partyLook()

// Boxes and rings go under pictures unless drawn with `s.over` set, for what sits on top of a picture (a tile's chips).
// shortcut: a label wider than its control (the pixel themes' wide faces) is cut short instead of wrapping and growing
// the control. Lay labels out with para() and measure the control's height if the pixel themes need it exact.
export const createSheet = (focusId, look = BASE) => {
  const out = { boxes: [], rings: [], pics: [], boxes2: [], rings2: [], texts: [], focusables: [] }
  const s = {
    out,
    look,
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
        k, x, y: y + faceMetrics(f).shift * o.size, t: str || ' ', f, s: o.size, c: o.color || look.text,
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

const glow = (s, k, x, y, w, h, r, on) => s.ring(k, x - 2, y - 2, w + 4, h + 4, s.look.focusA(0.3), 2, r + 2, on ? 1 : 0)

// Buttons have padding 14 24, a 1px border, radius 12 and 20px medium text on a normal line height.
export const BTN_H = 2 + 28 + normal(20)
const BTN = {
  create: (L) => ({ bg: L.accentA(0.85), focus: L.accent, ink: L.onAccent, focusInk: L.onAccent }),
  plain: (L) => ({ bg: L.button, focus: L.buttonFocused, ink: L.onButton, focusInk: L.onButtonFocused }),
  leave: () => ({ bg: rgba(220, 50, 50, 0.75), focus: '#dc3232', ink: '#ffffff', focusInk: '#ffffff' }),
}
export const btnWidth = (s, label) => 2 + 48 + s.width(label, 20, 500)
// `h` is for a button stretched by its row, and `focusable` is false for one that's disabled outright.
export const button = (s, id, x, y, w, label, kind = 'create', disabled = false, h = BTN_H, focusable = true) => {
  const st = BTN[kind](s.look)
  const f = s.is(id)
  const a = disabled ? 0.5 : 1
  s.box(`${id}:bg`, x, y, w, h, f && !disabled ? st.focus : st.bg, 12, a)
  // A plain button keeps an edge at rest, since a theme's button fill can be clear (Neon Pulse).
  const rest = kind === 'plain' ? a : 0
  s.ring(`${id}:ring`, x, y, w, h, f ? s.look.focus : s.look.os(0.25), 1, 12, f ? a : rest)
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
  const L = s.look
  let bg = L.os(0.06)
  let border = L.os(0.1)
  let inkColor = L.os(0.7)
  if (active) {
    bg = L.accentA(0.15)
    border = L.accentA(0.3)
    inkColor = L.accent
  }
  if (f) {
    bg = L.os(0.1)
    border = L.focus
    inkColor = L.text
  }
  s.box(`${id}:bg`, x, y, w, CONTROL_H, bg, 10)
  s.ring(`${id}:ring`, x, y, w, CONTROL_H, border, 1, 10)
  s.text(`${id}:t`, x + w / 2, y + 11, label, { size: 18, weight: 500, color: inkColor, mx: 0.5, mw: w - 34 })
  s.focusable(id, x, y, w, CONTROL_H)
  return CONTROL_H
}

export const actionButton = (s, id, x, y, w, label, danger = false) => {
  const f = s.is(id)
  const L = s.look
  s.box(`${id}:bg`, x, y, w, 58, f ? L.buttonFocused : L.button, 12)
  s.ring(`${id}:ring`, x, y, w, 58, L.os(0.25), 1, 12, f ? 0 : 1)
  s.text(`${id}:t`, x + w / 2, y + 29 - normal(21) / 2, label, { size: 21, weight: 500, color: f ? L.onButtonFocused : danger ? '#ff8a8a' : L.onButton, mx: 0.5, mw: w - 32 })
  s.focusable(id, x, y, w, 58)
  return 58
}

// Inputs have padding 14 18, a 1px border, radius 16 and 20px text on a 33px line.
export const INPUT_H = 2 + 28 + LINE
export const input = (s, id, x, y, w, value, placeholder) => {
  const f = s.is(id)
  const L = s.look
  s.box(`${id}:bg`, x, y, w, INPUT_H, L.input, 16)
  s.ring(`${id}:ring`, x, y, w, INPUT_H, f ? L.inputBorderFocused : L.inputBorder, 1, 16)
  s.text(`${id}:t`, x + 19, y + 15, value || placeholder, { size: 20, color: value ? L.text : L.os(0.4), mw: w - 38, lh: LINE })
  s.focusable(id, x, y, w, INPUT_H)
  return INPUT_H
}

// The × at 36px with padding 4 10.
export const closeButton = (s, id, right, top) => {
  const f = s.is(id)
  const w = 20 + s.width('×', 36)
  const x = right - w
  s.box(`${id}:bg`, x, top, w, 44, f ? s.look.os(0.15) : '#00000000', 8)
  s.ring(`${id}:ring`, x - 1, top - 1, w + 2, 46, s.look.focus, 1, 8, f ? 1 : 0)
  s.text(`${id}:t`, x + w / 2, top + 4, '×', { size: 36, color: f ? s.look.text : s.look.os(0.6), lh: 36, mx: 0.5 })
  s.focusable(id, x, top, w, 44)
}

// A member's picture in a circle, or their initial on a color of their own. `a` is the opacity of the row it sits in.
export const avatar = (s, k, x, y, size, name, url, fontSize = 18, a = 1) => {
  s.box(`${k}:bg`, x, y, size, size, url ? s.look.os(0.2) : avatarColor(name), size / 2, a)
  if (url) {
    s.pic(`${k}:pic`, x, y, size, size, [url], size / 2, a)
    return
  }
  const initial = (String(name || '').charAt(0) || '?').toUpperCase()
  s.text(`${k}:t`, x + size / 2, y + (size - normal(fontSize)) / 2, initial, { size: fontSize, weight: 700, color: '#ffffff', mx: 0.5, a })
}

// The error banner. Returns its height.
export const banner = (s, k, x, y, w, text) => {
  const lines = flowText([{ text, style: 0 }], w - 32, (word) => s.width(word, 20))
  const h = 24 + lines.length * LINE
  s.box(`${k}:bg`, x, y, w, h, rgba(220, 70, 70, 0.2), 8)
  s.para(`${k}:t`, x + 16, y + 12, text, { size: 20, w: w - 32, color: s.look.ink })
  return h
}

export const sectionTitle = (s, k, x, y, text) => {
  s.text(k, x, y, String(text).toUpperCase(), { size: 18, weight: 500, color: s.look.os(0.6), ls: 0.5, lh: LINE })
  return LINE + 10
}
