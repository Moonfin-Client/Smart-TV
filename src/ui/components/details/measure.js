// Text widths and line breaks worked out before the renderer draws, so a layout can place its text
// ahead of time. Widths come from ui/text.js, which measures the face the text draws in, a theme's
// own (Neon Pulse's Rajdhani, 8-bit Hero's pixel face) included. A width asked for before the faces
// land is an estimate and isn't kept, and whenReady() says when to lay out again. A theme face
// landing later bumps the store's settingsVersion, which lays out again.
import { textReady, textWidth as faceWidth } from '../../text.js'
import { clampLines } from '../music/musicGrid.js'

let loaded = false

export const whenReady = () => (loaded ? Promise.resolve() : textReady().then(() => (loaded = true)))

export const fontsReady = () => loaded

export const textWidth = (text, size, weight = 'regular', spacing = 0) => {
  const str = String(text == null ? '' : text)
  return faceWidth(str, size, weight) + spacing * str.length
}

// The lines a paragraph wraps to at a width, breaking at a space or after a hyphen between letters
// ("out-of-" | "this"), the same rule the patched renderer follows. Hard breaks start a new line.
const HYPHEN_BREAK = /([^\s-]-)(?=[A-Za-z\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff])/g
export const wrapLines = (text, size, weight, maxW) => {
  const out = []
  String(text || '').split('\n').forEach((para) => {
    let line = ''
    para.split(/\s+/).filter(Boolean).forEach((whole) => {
      whole.replace(HYPHEN_BREAK, '$1\u200b').split('\u200b').forEach((word, i) => {
        const next = line ? line + (i ? '' : ' ') + word : word
        if (!line || textWidth(next, size, weight) <= maxW) {
          line = next
          return
        }
        out.push(line)
        line = word
      })
    })
    out.push(line)
  })
  return out
}

export const lineCount = (text, size, weight, maxW) => (text ? wrapLines(text, size, weight, maxW).length : 0)

// A paragraph clamped to `n` lines with musicGrid's clampLines, the same rule the patched renderer's
// maxLines follows, for a layout that needs the clamped text before it draws.
export const clampText = (text, size, weight, maxW, n) => clampLines(wrapLines(text, size, weight, maxW), n, (s) => textWidth(s, size, weight) <= maxW)
