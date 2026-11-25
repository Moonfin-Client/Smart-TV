// The calendar's pixel math: its sizes are a 1150 wide design drawn at 1920 (times DP), and the
// flex rows and columns are laid out here the way CSS flows them. Its imports need no browser, so
// calendarLayout.check.mjs runs it under node.
import { hex2 } from '../../themeColor.js'
import { assetUrl } from '../../../utils/assetUrl.js'

const DP = 1.66957
export const dp = (n) => n * DP
// The page's Material body text: line-height 1.43 and 0.25 dp of letter spacing.
export const LH = 1.43
export const LS = dp(0.25)
// The kicker's 0.8 dp (1.34px) of letter spacing is rounded down to 1px.
export const KICKER_LS = 1

// Where a Text node goes for a CSS line box starting at `top`. The renderer centers the em box in
// its line and hangs glyphs from the atlas base, so they sit 0.048 em higher than Chrome draws
// Roboto in the same box. linesY is for a Text given the CSS line height, which the renderer
// centers in itself. lineY is for one given none, which the renderer lays in its default 1.2 em line.
const DROP = 0.048
export const lineY = (top, lineHeight, size) => top + (lineHeight - size) / 2 + (DROP - 0.1) * size
export const linesY = (top, size) => top + DROP * size

// Text widths from the Roboto files the app ships. Those are 400, 500 and 700, so 600 and 800
// measure as bold. The faces load once, widths are estimates until they have, and fontsReady()
// says when to lay out again.
const FILES = { regular: 'Roboto-Regular', medium: 'Roboto-Medium', bold: 'Roboto-Bold' }
let ctx
let ready = null
let loaded = false
let widths = {}
export const fontsReady = () => {
  if (measureReady) return measureReady()
  if (ready) return ready
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) {
    ready = Promise.resolve()
    return ready
  }
  ready = Promise.all(
    Object.keys(FILES).map((w) =>
      new FontFace(`calendar-${w}`, `url(${assetUrl(`fonts/${FILES[w]}.ttf`)})`)
        .load()
        .then((face) => document.fonts.add(face))
        .catch(() => {})
    )
  ).then(() => {
    loaded = true
    widths = {}
  })
  return ready
}

// The app hands in ui/text.js's measure through setMeasure, which follows the theme's face. Without
// it, as in the node check, widths come from Roboto here.
let measure = null
let measureReady = null
export const setMeasure = (fn, ready) => {
  measure = fn
  measureReady = ready
}

export const textWidth = (text, size, weight = 'regular', spacing = LS) => {
  const str = String(text == null ? '' : text)
  if (measure) return measure(str, size, weight) + spacing * str.length
  const key = weight + '|' + size + '|' + spacing + '|' + str
  if (widths[key] != null) return widths[key]
  if (ctx === undefined) {
    try {
      ctx = document.createElement('canvas').getContext('2d')
    } catch (e) {
      ctx = null
    }
    fontsReady()
  }
  let w = str.length * size * 0.55
  if (ctx && loaded) {
    ctx.font = size + 'px calendar-' + weight
    w = ctx.measureText(str).width
  }
  w += spacing * str.length
  widths[key] = w
  return w
}

// How many lines a paragraph wraps to at a width, breaking between words the way CSS does.
export const lineCount = (text, size, weight, maxW, max = 99, spacing = LS) => {
  let lines = 0
  String(text || '').split('\n').forEach((para) => {
    let line = ''
    para.split(/\s+/).filter(Boolean).forEach((word) => {
      const next = line ? line + ' ' + word : word
      if (!line || textWidth(next, size, weight, spacing) <= maxW) {
        line = next
        return
      }
      lines++
      line = word
    })
    if (line) lines++
  })
  return Math.min(max, lines)
}

// Text cut to fit the way Chrome cuts it, so the renderer draws exactly these lines: nowrap with
// text-overflow ellipsis cuts mid word and ends in one "…", and a line clamp wraps between words and
// ends its last line in "…" when there was more.
const ELLIPSIS = '\u2026'
const cutToFit = (line, size, weight, maxW, spacing) => {
  if (textWidth(line, size, weight, spacing) <= maxW) return line
  let lo = 0
  let hi = line.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (textWidth(line.slice(0, mid) + ELLIPSIS, size, weight, spacing) <= maxW) lo = mid
    else hi = mid - 1
  }
  return line.slice(0, lo) + ELLIPSIS
}
export const fitLine = (text, size, weight, maxW, spacing = LS) => cutToFit(String(text || '').replace(/\s+/g, ' '), size, weight, maxW, spacing)
export const fitLines = (text, size, weight, maxW, maxLines, spacing = LS) => {
  const lines = []
  let more = false
  String(text || '').split('\n').forEach((para) => {
    let line = ''
    para.split(/\s+/).filter(Boolean).forEach((word) => {
      const next = line ? line + ' ' + word : word
      if (!line || textWidth(next, size, weight, spacing) <= maxW) {
        line = next
        return
      }
      lines.push(line)
      line = word
    })
    if (line) lines.push(line)
  })
  if (lines.length > maxLines) {
    more = true
    lines.length = maxLines
  }
  const last = lines.length - 1
  if (last >= 0) {
    if (more) {
      const end = lines[last] + ELLIPSIS
      lines[last] = textWidth(end, size, weight, spacing) <= maxW ? end : cutToFit(lines[last] + ' ', size, weight, maxW, spacing)
    } else lines[last] = cutToFit(lines[last], size, weight, maxW, spacing)
  }
  return lines.join('\n')
}

// #AARRGGBB (or #RRGGBB) as the renderer's #rrggbbaa, its alpha times mult.
export const argb = (hex, mult = 1) => {
  const v = String(hex).replace('#', '').toLowerCase()
  const full = v.length === 6 ? 'ff' + v : v
  const a = (parseInt(full.slice(0, 2), 16) / 255) * mult
  return '#' + full.slice(2, 8) + hex2(Math.min(1, Math.max(0, a)) * 255)
}
const rgbOf = (c) => {
  const v = c.replace('#', '')
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16), v.length > 6 ? parseInt(v.slice(6, 8), 16) / 255 : 1]
}
// One color laid over an opaque one, as an opaque color.
export const over = (top, base) => {
  const t = rgbOf(top)
  const b = rgbOf(base)
  return '#' + hex2(t[0] * t[3] + b[0] * (1 - t[3])) + hex2(t[1] * t[3] + b[1] * (1 - t[3])) + hex2(t[2] * t[3] + b[2] * (1 - t[3]))
}

/** A pill button's box and its parts, with x and y left to the caller. */
export const pillBox = ({ label, icon, compact }) => {
  const size = dp(compact ? 13 : 15)
  const iconSize = icon ? dp(compact ? 18 : 20) : 0
  // Chrome draws a border at whole pixels, so 1 dp is 1 px.
  const border = 1
  const padY = dp(compact ? 8 : 11)
  const padL = label ? dp(compact ? 14 : 20) : dp(14)
  const padR = label ? padL : dp(22)
  const line = size * LH
  const inner = Math.max(label ? line : 0, iconSize)
  const labelW = label ? textWidth(label, size, 'bold') : 0
  const gap = label && icon ? dp(8) : 0
  const h = 2 * (border + padY) + inner
  const w = 2 * border + padL + padR + iconSize + gap + labelW
  return {
    w,
    h,
    size,
    iconSize,
    iconX: border + padL,
    iconY: (h - iconSize) / 2,
    textX: border + padL + iconSize + gap,
    textY: lineY((h - line) / 2, line, size),
    textW: labelW + 2,
    border,
    radius: Math.min(dp(24), h / 2),
  }
}

/** Pills laid along a wrapping row from x 0 with a gap between them, as flex-wrap with a gap does. */
export const flowPills = (buttons, { compact = false, gap = dp(12), maxW = Infinity } = {}) => {
  let x = 0
  let y = 0
  let rowH = 0
  return buttons.map((b) => {
    const box = pillBox({ label: b.label, icon: b.icon, compact })
    if (x > 0 && x + box.w > maxW) {
      x = 0
      y += rowH + gap
      rowH = 0
    }
    const out = { ...b, ...box, x, y }
    x += box.w + gap
    rowH = Math.max(rowH, box.h)
    return out
  })
}

/** Tags in a wrapping row, 6 dp apart across and 4 dp down, with each one's box and the block's height. */
export const flowTags = (tags, maxW) => {
  const size = dp(11)
  const line = size * LH
  const h = dp(2) * 2 + line
  const gapX = dp(6)
  const gapY = dp(4)
  let x = 0
  let y = 0
  const out = tags.map((t) => {
    const w = dp(7) * 2 + textWidth(t.label, size, 'bold', dp(0.2))
    if (x > 0 && x + w > maxW) {
      x = 0
      y += h + gapY
    }
    const box = {
      k: t.label,
      label: t.label,
      x,
      y,
      w,
      h,
      ty: lineY(dp(2), line, size),
      color: argb(t.color),
      fill: argb(t.color, 0.18),
    }
    x += w + gapX
    return box
  })
  return { tags: out, h: out.length ? y + h : 0 }
}

/**
 * A flex column's blocks top to bottom ({h, mt, shrink}) inside `room`, as justify-content center
 * places them. Past the room, the blocks that clip their text shrink in proportion to their height,
 * as flex items with overflow hidden do, and the column starts at the top. Sets each block's top.
 */
export const stackColumn = (blocks, room) => {
  const total = blocks.reduce((n, b) => n + b.mt + b.h, 0)
  const over = total - room
  if (over > 0) {
    const base = blocks.reduce((n, b) => n + (b.shrink ? b.h : 0), 0)
    if (base > 0) {
      blocks.forEach((b) => {
        if (b.shrink) b.h -= (over * b.h) / base
      })
    }
  }
  let y = over > 0 ? 0 : (room - total) / 2
  blocks.forEach((b) => {
    y += b.mt
    b.top = y
    y += b.h
  })
  return blocks
}
