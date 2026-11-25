// Color conversions for ui/theme.js, with no imports so their check runs in node.
export const hex2 = (n) => {
  const s = Math.max(0, Math.min(255, Math.round(n))).toString(16)
  return s.length < 2 ? '0' + s : s
}

// Theme files write colors as '#AARRGGBB' (or '#RRGGBB'), and the renderer wants '#RRGGBBAA'. `mul`
// scales the alpha.
export const lc = (hex, mul = 1) => {
  const v = String(hex || '').replace('#', '')
  const argb = v.length === 6 ? 'ff' + v : v
  return '#' + argb.slice(2, 8).toLowerCase() + hex2(parseInt(argb.slice(0, 2), 16) * mul)
}

// A plain '#rrggbb' at an alpha, for fixed colors.
export const rgba = (rgbHex, a = 1) => '#' + rgbHex.replace('#', '').slice(0, 6).toLowerCase() + hex2(a * 255)

// A '#rrggbbaa' color as the renderer's shadow shaders want it: a 0xRRGGBBAA number with its color
// already multiplied by its alpha, since the shader blends it as premultiplied without doing that
// itself. `mul` scales the alpha.
export const shadowColor = (c, mul = 1) => {
  const a = (parseInt(c.slice(7, 9) || 'ff', 16) / 255) * mul
  const ch = (i) => hex2(parseInt(c.slice(i, i + 2), 16) * a)
  return parseInt(ch(1) + ch(3) + ch(5) + hex2(a * 255), 16)
}

const cache = {}

// '#rrggbbaa', '#rrggbb' or a number, as the renderer's 0xRRGGBBAA number.
export const hex = (c) => {
  if (typeof c === 'number') return c
  if (!c) return 0
  let n = cache[c]
  if (n === undefined) {
    const v = c.charCodeAt(0) === 35 ? c.slice(1) : c
    n = cache[c] = parseInt(v.length === 6 ? v + 'ff' : v, 16) >>> 0
  }
  return n
}

// An alpha from 0 to 1 as two hex digits.
export const alphaHex = (a) => hex2(Math.max(0, Math.min(1, a)) * 255)

// '#RRGGBB' as the "r, g, b" a scrim layer takes.
export const rgbTriplet = (hex) => [1, 3, 5].map((i) => parseInt(String(hex).slice(i, i + 2), 16)).join(', ')
