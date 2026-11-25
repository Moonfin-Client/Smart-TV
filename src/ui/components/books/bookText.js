// Kept apart from bookGrid.js so its checks run without the app's settings.
import { textReady, textWidth as measured } from '../../text.js'

// Resolves once real widths are in. A theme's own face (Neon Pulse, 8-bit Hero) only starts loading
// the first time it's measured and answers the 0.55em estimate until then, which for 'MW' at 100px
// is exactly 110. So this waits for that too, two seconds at most, since the screens lay out once.
const ESTIMATE = 110
export const measureReady = () =>
  textReady().then(
    () =>
      new Promise((resolve) => {
        const real = () => measured('MW', 100, 'regular') !== ESTIMATE && measured('MW', 100, 'bold') !== ESTIMATE
        if (real()) return resolve()
        let n = 0
        const timer = setInterval(() => {
          if (!real() && ++n < 40) return
          clearInterval(timer)
          resolve()
        }, 50)
      }),
  )

export const textWidth = (text, size, weight = 'regular', spacing = 0) => {
  const str = String(text == null ? '' : text)
  return measured(str, size, weight) + spacing * str.length
}

// A line cut short with an ellipsis, character by character.
export const ellipsize = (text, size, weight, maxW, spacing = 0) => {
  const str = String(text == null ? '' : text)
  if (!str || textWidth(str, size, weight, spacing) <= maxW) return str
  const dots = textWidth('\u2026', size, weight, spacing)
  let lo = 0
  let hi = str.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (textWidth(str.slice(0, mid), size, weight, spacing) + dots <= maxW) lo = mid
    else hi = mid - 1
  }
  return str.slice(0, lo) + '\u2026'
}

// The lines a paragraph wraps to at a width, breaking between words.
const wrapLines = (text, size, weight, maxW, spacing = 0) => {
  const out = []
  String(text || '').split('\n').forEach((para) => {
    let line = ''
    para.split(/\s+/).filter(Boolean).forEach((word) => {
      const next = line ? line + ' ' + word : word
      if (!line || textWidth(next, size, weight, spacing) <= maxW) {
        line = next
        return
      }
      out.push(line)
      line = word
    })
    if (line) out.push(line)
  })
  return out
}
export const lineCount = (text, size, weight, maxW, max, spacing = 0) => Math.min(max || 99, text ? wrapLines(text, size, weight, maxW, spacing).length : 0)

// A tab bar's tabs, each as wide as its label in the weight it's drawn in, and the bar around them.
export const tabWidths = (tabs, active) => tabs.map((tab) => Math.ceil(textWidth(tab.label, 19, tab.id === active ? 'bold' : 'medium')) + 50)
export const tabBarWidth = (tabs, active) => tabWidths(tabs, active).reduce((sum, w) => sum + w, 0) + 8
