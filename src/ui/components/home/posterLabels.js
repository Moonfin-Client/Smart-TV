// The admin's poster labels worked out to plain boxes for a card's art. No imports beyond the flag
// list, so its check runs in node: measuring, the text shift and the icon and flag art come in
// through `env`.
import { POSTER_LABEL_FLAGS } from './posterLabelFlags.js'

// Label sizes are points on an 1150 wide layout, and this app lays out at 1920.
const POINT_SCALE = 1920 / 1150
const FALLBACK_COLOR = '#2563EB'
const LINE_HEIGHT = 1.2
const SIZES = { small: 0.8, medium: 1, large: 1.25, xlarge: 1.5 }
const STACK_GAP = 6
const WHITE = [255, 255, 255]
const BLACK = [0, 0, 0]
const CORNERS = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight']

const parseColor = (hex) => (typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex) ? [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)) : null)
const channel = (value) => {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
export const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
const two = (v) => (v < 16 ? '0' : '') + v.toString(16)
const hex = ([r, g, b], alpha = 1) => '#' + two(r) + two(g) + two(b) + two(Math.round(alpha * 255))

const labelFlag = (icon) => {
  if (typeof icon !== 'string' || icon.indexOf('flag-') !== 0) return null
  const code = icon.slice(5)
  return POSTER_LABEL_FLAGS.has(code) ? code : null
}

// The fill, text and border for a label's style. Opacity fades the fill and the border, never the text.
export const labelColors = (badge) => {
  const color = parseColor(badge.color) || parseColor(FALLBACK_COLOR)
  const alpha = Math.min(100, Math.max(10, badge.opacity)) / 100
  const lum = luminance(color)
  let fill
  let text
  let border = null
  switch (badge.style) {
    case 'glass':
      fill = hex(color, 0.45 * alpha)
      border = { w: 1, color: hex(WHITE, 0.35 * alpha) }
      text = hex(WHITE)
      break
    case 'outline':
      fill = hex(BLACK, 0.55 * alpha)
      border = { w: 1.5, color: hex(color, alpha) }
      text = hex(lum < 0.05 ? WHITE : color)
      break
    case 'dark':
      fill = hex([12, 12, 16], 0.85 * alpha)
      text = hex(lum < 0.05 ? WHITE : color)
      break
    case 'light':
      fill = hex(WHITE, 0.92 * alpha)
      text = lum > 0.4 ? hex([17, 17, 17]) : hex(color)
      break
    default:
      fill = hex(color, alpha)
      text = hex(Math.pow(lum + 0.05, 2) > 0.15 ? BLACK : WHITE)
  }
  const own = parseColor(badge.textColor)
  return { fill, border, text: own ? hex(own) : text }
}

// One label's box and parts at (0, 0), or null when it has nothing to draw. `maxW` is how wide the
// corner lets it grow.
const labelBox = (badge, scale, maxW, env) => {
  const size = scale * (SIZES[badge.size] || 1)
  const at = (points) => points * POINT_SCALE * size
  const hasText = badge.label.trim() !== ''
  const flag = labelFlag(badge.icon)
  const icon = flag ? null : env.knownIcon(badge.icon) ? badge.icon : null
  if (!hasText && !icon && !flag) return null
  // A flag alone is its own shape, with no fill or padding.
  if (!hasText && flag) {
    const h = at(10 * LINE_HEIGHT + 4)
    return { w: (h * 4) / 3, h, r: badge.shape === 'square' ? 0 : at(badge.shape === 'pill' ? 5 : 3), flagOnly: true, flag }
  }
  const colors = labelColors(badge)
  const bw = colors.border ? colors.border.w * POINT_SCALE : 0
  const font = at(10)
  const padV = at(2)
  const padH = at(icon && !hasText ? 3 : 6)
  const gap = hasText ? at(3) : 0
  const iconS = at(12.5)
  const flagW = at(40 / 3)
  const flagH = at(10)
  const lead = icon ? iconS + gap : flag ? flagW + gap : 0
  const contentH = Math.max(hasText ? font * LINE_HEIGHT : 0, icon ? iconS : 0, flag ? flagH : 0)
  const textW = hasText ? env.measure(badge.label, font) + 0.8 * badge.label.length : 0
  const w = Math.min(maxW, lead + textW + 2 * padH + 2 * bw)
  const h = contentH + 2 * padV + 2 * bw
  const inX = bw + padH
  const inY = bw + padV
  return {
    w,
    h,
    r: badge.shape === 'pill' ? h / 2 : badge.shape === 'square' ? 0 : at(4),
    fill: colors.fill,
    border: colors.border ? { w: bw, color: colors.border.color } : null,
    ink: colors.text,
    icon,
    iconX: inX,
    iconY: inY + (contentH - iconS) / 2,
    iconS,
    flag,
    flagX: inX,
    flagY: inY + (contentH - flagH) / 2,
    flagW,
    flagH,
    text: hasText ? badge.label : '',
    font,
    textX: inX + lead,
    textY: inY + (contentH - font * LINE_HEIGHT) / 2 + env.shift(font),
    textMax: Math.max(0, w - lead - 2 * padH - 2 * bw),
  }
}

// The labels over an art box `w` by `h`, each corner stacked away from its corner 6px apart, in
// the admin's order and at most `perCorner` to a corner. The left corners and the right ones come
// back apart, so a card that grows can carry its right side along. Null when there's nothing.
export const posterLabelBoxes = (badges, { w, h, perCorner = 2, scale = 0.85, inset = 8, top = 8, topRight = 8, bottom = 8, bottomLeft = bottom }, env) => {
  const shown = {}
  const out = { left: [], right: [] }
  let any = false
  const maxW = Math.max(0, w - 16)
  ;(badges || []).forEach((badge, i) => {
    const corner = CORNERS.indexOf(badge.corner) >= 0 ? badge.corner : 'topLeft'
    const list = shown[corner] || (shown[corner] = [])
    if (list.length >= perCorner) return
    const box = labelBox(badge, scale, maxW, env)
    if (!box) return
    const right = corner === 'topRight' || corner === 'bottomRight'
    const bottomSide = corner === 'bottomLeft' || corner === 'bottomRight'
    const before = list.reduce((y, b) => y + b.h + STACK_GAP, 0)
    box.x = right ? w - inset - box.w : inset
    box.y = bottomSide ? h - (corner === 'bottomLeft' ? bottomLeft : bottom) - before - box.h : (right ? topRight : top) + before
    box.k = `${corner}${list.length}-${i}`
    list.push(box)
    out[right ? 'right' : 'left'].push(box)
    any = true
  })
  return any ? out : null
}

// The template's node lists for one side: the pills, then their art, then their text, each kind
// together so same-shader nodes draw in one batch.
export const labelNodes = (boxes, env) => {
  const pills = []
  const art = []
  const texts = []
  boxes.forEach((b) => {
    if (b.flagOnly) {
      // The faint edge goes over the flag, so a mostly white one still reads on a light poster.
      pills.push({ k: b.k, x: b.x, y: b.y, w: b.w, h: b.h, r: b.r, fill: '#00000000', bw: 0, bc: '#00000000' })
      art.push({ k: b.k, x: b.x, y: b.y, w: b.w, h: b.h, r: b.r, src: env.flagSrc(b.flag), ink: '#ffffffff', bw: 0.8, bc: '#00000040' })
      return
    }
    pills.push({ k: b.k, x: b.x, y: b.y, w: b.w, h: b.h, r: b.r, fill: b.fill, bw: b.border ? b.border.w : 0, bc: b.border ? b.border.color : '#00000000' })
    if (b.icon) art.push({ k: b.k, x: b.x + b.iconX, y: b.y + b.iconY, w: b.iconS, h: b.iconS, r: 0, src: env.iconSrc(b.icon), ink: b.ink, bw: 0, bc: '#00000000' })
    if (b.flag) art.push({ k: b.k, x: b.x + b.flagX, y: b.y + b.flagY, w: b.flagW, h: b.flagH, r: 3, src: env.flagSrc(b.flag), ink: '#ffffffff', bw: 0, bc: '#00000000' })
    if (b.text) texts.push({ k: b.k, x: b.x + b.textX, y: b.y + b.textY, text: b.text, size: b.font, lh: b.font * LINE_HEIGHT, max: b.textMax, ink: b.ink, font: env.fontOf(b.text) })
  })
  return { pills, art: art.filter((a) => a.src), texts }
}
