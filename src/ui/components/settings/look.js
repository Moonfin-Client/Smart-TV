// The settings look resolved to pixels and '#rrggbbaa' colors at 1920x1080. Sizes are in design
// units, 1.66957px each.
import { measure } from '../party/measure.js'
import { hex2 } from '../../themeColor.js'

export const DP = 1.66957
export const dp = (n) => n * DP
// A 1 unit border snaps down to 1px, and the rest goes into the padding.
export const BORDER_REST = DP - 1

const parse = (c) => {
  const v = String(c || '#000000').replace('#', '')
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16), v.length >= 8 ? parseInt(v.slice(6, 8), 16) / 255 : 1]
}
// '#rrggbbaa' with its alpha replaced.
export const withAlpha = (c, a) => '#' + String(c).replace('#', '').slice(0, 6) + hex2(a * 255)
// '#rrggbbaa' with its alpha scaled.
export const mulAlpha = (c, m) => withAlpha(c, parse(c)[3] * m)
export const alphaOf = (c) => parse(c)[3]
// [top] drawn over the opaque [under], as one opaque color.
export const over = (top, under) => {
  const t = parse(top)
  const u = parse(under)
  return '#' + hex2(t[0] * t[3] + u[0] * (1 - t[3])) + hex2(t[1] * t[3] + u[1] * (1 - t[3])) + hex2(t[2] * t[3] + u[2] * (1 - t[3])) + 'ff'
}

// Text widths from the same Roboto files the renderer draws with. 600 draws as Roboto Bold.
export const textWidth = (text, size, weight = 'regular', spacing = 0) => measure(text, size, weight, spacing)

// How many lines [text] takes at [width], breaking at spaces the way the renderer does.
export const lineCount = (text, size, weight, width, spacing = 0) => {
  const str = String(text == null ? '' : text)
  if (!str) return 0
  if (textWidth(str, size, weight, spacing) <= width) return 1
  const words = str.split(' ')
  let lines = 1
  let line = ''
  for (let i = 0; i < words.length; i++) {
    const next = line ? line + ' ' + words[i] : words[i]
    if (line && textWidth(next, size, weight, spacing) > width) {
      lines++
      line = words[i]
    } else {
      line = next
    }
  }
  return lines
}

// Row geometry, in pixels.
export const ROW = {
  marginX: dp(12),
  marginY: dp(4),
  padX: dp(16) + BORDER_REST,
  padY: dp(8) + BORDER_REST,
  padTightY: dp(4) + BORDER_REST,
  radius: dp(16),
  oneLine: dp(56),
  twoLine: dp(72),
  threeLine: dp(88),
  tile: dp(44),
  tileRadius: dp(14),
  tileGap: dp(14),
  glyph: dp(22),
  plainGlyph: dp(24),
  trailGap: dp(14),
  trailMin: dp(18),
  chevron: dp(20),
  heading: dp(14),
  headingLH: dp(14) * 1.1719,
  caption: dp(12),
  captionLH: dp(12) * 1.1719,
  small: dp(11),
  smallLH: dp(11) * 1.1719,
}

export const BUBBLE = {
  padX: dp(10) + BORDER_REST,
  padY: dp(8) + BORDER_REST,
  size: dp(11),
  lh: dp(14.67),
  spacing: dp(0.5),
  radius: dp(12),
  maxW: dp(280),
}

export const TOGGLE = {
  w: dp(52),
  h: dp(32),
  margin: dp(4),
  border: 3,
  radius: dp(16),
  thumbOff: dp(16),
  thumbOn: dp(24),
  thumbLeft: dp(8) - dp(2),
  travel: dp(16),
}

export const SECTION = {
  padTop: dp(20),
  padBottom: dp(6),
  padX: dp(16),
  size: dp(12),
  lh: dp(17.16),
  spacing: dp(1.2),
}

export const BAR = {
  h: dp(56),
  titleSize: dp(22),
  titleLH: dp(28),
  titleX: dp(72),
  titleRootX: dp(16),
  action: dp(48),
  actionGlyph: dp(24),
}
