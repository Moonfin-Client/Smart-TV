// The media bars' pure math, importing only what runs in node so its check does: colors as the
// renderer wants them, and the Gallery's panel and pill layout.
import { shadowColor, hex2, hex } from '../../themeColor.js'

// A break after a hyphen inside a word, but not before a number, as UAX #14 allows. The renderer
// only breaks at spaces, so a zero width space goes in.
export const breakable = (text) => String(text || '').replace(/(\S)-(?=[^\s\d-])/g, '$1-\u200b')

// The Gallery and Bookshelf numbers, 01 on.
export const padIndex = (n) => (n + 1 < 10 ? '0' : '') + (n + 1)

// "r, g, b" from galleryGlow.js at an alpha, as a '#rrggbbaa' color.
export const rgbA = (rgb, a = 1) => '#' + String(rgb).split(',').map((n) => hex2(+n)).join('') + hex2(a * 255)

// A '#rrggbb[aa]' color over an opaque '#rrggbb' ground, at alpha a, as an opaque color.
export const over = (ground, top, a) => {
  const g = (i) => parseInt(ground.slice(1 + i * 2, 3 + i * 2), 16)
  const t = (i) => parseInt(top.slice(1 + i * 2, 3 + i * 2), 16)
  return '#' + [0, 1, 2].map((i) => hex2(g(i) * (1 - a) + t(i) * a)).join('') + 'ff'
}

export { hex as toNum }

// Border and shadow colors go to the renderer as numbers.
export const shade = (o) => (o && typeof o.color === 'string' ? { ...o, color: hex(o.color) } : o)

// A CSS box-shadow glow as the renderer's shadow, with on false for a glow the theme doesn't have.
export const glowOf = (g) => {
  if (!g) return { on: false, shadow: { color: 0, x: 0, y: 0, blur: 0, spread: 0 } }
  return { on: true, shadow: { color: shadowColor(g.color), x: g.x, y: g.y, blur: g.blur, spread: g.spread } }
}

// The part of a w by h picture that a box at sx, sy (fw by fh) shows when the picture lies cover-fit
// and centered across the 1920 by 1080 screen, in the picture's own pixels (Frost's SubTexture).
export const coverRegion = (w, h, sx, sy, fw, fh) => {
  const s = Math.max(1920 / w, 1080 / h)
  return { x: (sx + (w * s - 1920) / 2) / s, y: (sy + (h * s - 1080) / 2) / s, w: fw / s, h: fh / s }
}

// Up to five panels share the row, the active one grown sixteen times, 6px apart.
export const galleryPanels = (rowW, count, active, grow = 16, gap = 6) => {
  const unit = (rowW - gap * (count - 1)) / (grow + count - 1)
  const out = []
  let x = 0
  for (let i = 0; i < count; i++) {
    const w = unit * (i === active ? grow : 1)
    out.push({ x, w })
    x += w + gap
  }
  return out
}

// The pills wrap with 8px after each and 8px under each line, inside maxW (the column plus 4px). A
// line is as tall as its tallest pill.
export const wrapPills = (pills, maxW) => {
  const out = []
  let x = 0
  let y = 0
  let lineH = 0
  let start = 0
  const close = () => {
    for (let j = start; j < out.length; j++) out[j].h = lineH
    y += lineH + 8
  }
  pills.forEach((p) => {
    if (x > 0 && x + p.w + 8 > maxW) {
      close()
      x = 0
      lineH = 0
      start = out.length
    }
    out.push({ ...p, x, y })
    lineH = Math.max(lineH, p.h)
    x += p.w + 8
  })
  if (out.length) close()
  return { list: out, h: y }
}
