// Colors the player overlays draw with under the default Moonfin theme, as #rrggbbaa, plus text
// measuring for layouts CSS would flow.
import { alphaHex } from '../../themeColor.js'

export const ACCENT = '#00a4dc'
// The anime pills' compact size: 13px with 1 by 9 padding, 23.5 tall.
export const COMPACT_PILL_H = 23.5

export const white = (a) => `#ffffff${alphaHex(a)}`
export const accent = (a) => `${ACCENT}${alphaHex(a)}`

// The Focus Color setting's value as #rrggbbaa, else the default accent. The setting stores #AARRGGBB.
export const focusColor = (value) => {
  const raw = String(value || '').trim().replace(/^#/, '').toLowerCase()
  if (!/^[0-9a-f]+$/i.test(raw)) return ACCENT
  if (raw.length === 3) return `#${raw.split('').map((c) => c + c).join('')}`
  if (raw.length === 6) return `#${raw}`
  if (raw.length === 8) return `#${raw.slice(2)}${raw.slice(0, 2)}`
  return ACCENT
}

const FAMILY = { regular: 'roboto-web', medium: 'roboto-medium-web', bold: 'roboto-bold-web' }
let ctx = null
const widths = {}

// The width CSS would give a single line, measured with the same Roboto files the renderer draws.
export const textWidth = (str, size, weight = 'regular') => {
  const text = String(str || '')
  const key = `${weight}|${size}|${text}`
  if (widths[key] != null) return widths[key]
  if (!ctx && typeof document !== 'undefined') ctx = document.createElement('canvas').getContext('2d')
  let w = text.length * size * 0.55
  if (ctx) {
    ctx.font = `${size}px ${FAMILY[weight] || FAMILY.regular}`
    w = ctx.measureText(text).width
  }
  widths[key] = w
  return w
}

const HYPHEN_BREAK = /([^\s-]-)(?=[A-Za-z\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff])/g

// How many lines a paragraph wraps to at a width, breaking where the renderer does: at a space,
// after a hyphen that comes right before a letter, and inside a word too long for a line of its own.
export const lineCount = (str, size, weight, maxW) => {
  const words = String(str || '').split(/\s+/).filter(Boolean)
  if (!words.length) return 0
  const fits = (s) => textWidth(s, size, weight) <= maxW
  let lines = 1
  let line = ''
  words.forEach((word) => {
    word.replace(HYPHEN_BREAK, '$1\u200b').split('\u200b').forEach((part, i) => {
      const next = line ? line + (i ? '' : ' ') + part : part
      if (fits(next)) {
        line = next
        return
      }
      if (line) lines++
      line = part
      while (line.length > 1 && !fits(line)) {
        let cut = 1
        while (cut < line.length - 1 && fits(line.slice(0, cut + 1))) cut++
        lines++
        line = line.slice(cut)
      }
    })
  })
  return lines
}
