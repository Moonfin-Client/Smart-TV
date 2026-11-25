// The Seerr dialogs laid out as draw lists: the dialog panel and the alert, their controls, and the
// request, manage, report and picker bodies, in dp units drawn at 1920 (1dp = 1.66957px).
// Each layout returns the rects, glows, icons and texts to draw and the focusables in reading
// order, each with a row so Up and Down move by row and Left and Right within one. A 1dp border
// stays 1px.
import $L from '../../../services/i18n.js'
import { cssShift, textWidth as faceWidth, uiFont } from '../../text.js'
import { roboto, robotoShift, robotoWidth } from '../shell/MessageMarkdown.js'
import { alphaHex } from '../../themeColor.js'

// Only the dialog titles take the theme's face. The rest stays in Roboto on every theme. Node's
// checks have no canvas to measure Roboto, so they use text.js's widths.
const textWidth = (t, size, weight) => (typeof document === 'undefined' ? faceWidth(t, size, weight) : robotoWidth(t, size, weight))

const DP = 1.66957
const dp = (n) => n * DP
const SCREEN_W = 1920
const SCREEN_H = 1080
// Only the match cards take the theme's accent. The other controls stay blue on every theme.
const CONTROL_ACCENT = '#00a4dc'
const ON_FOCUS = '#000000de'
const PANEL_W = dp(440)
// The scrim's 24dp padding caps a panel's height, and the body scrolls inside what's left.
const PANEL_MAX_H = SCREEN_H - 2 * dp(24)

const white = (a) => `#ffffff${alphaHex(a)}`
const rgbOf = (lc) => String(lc || '#1a1a1aff').slice(0, 7)

// A builder for one layer's draw lists. The match cards take the theme's accent from it.
const drawList = (accent = '#00a4dcff') => {
  const out = { rects: [], glows: [], icons: [], imgs: [], texts: [], spaced: [], spinners: [], focusables: [], accent }
  let n = 0
  out.rect = (x, y, w, h, r, color, bw, bc) => out.rects.push({ k: `r${n++}`, x, y, w, h, r: r || 0, color, bw: bw || 0, bc: bc || '#00000000' })
  out.icon = (x, y, size, name, color) => out.icons.push({ k: `i${n++}`, x, y, w: size, h: size, src: `icons/${name}.webp`, color })
  out.image = (x, y, w, h, r, src) => out.imgs.push({ k: `m${n++}`, x, y, w, h, r, src })
  // A text line whose CSS line box starts at top.
  out.text = (x, top, t, size, weight, color, lh, extra = {}) => {
    const str = String(t == null ? '' : t)
    const spec = { k: `t${n++}`, x, y: top + (extra.title ? cssShift(size) : robotoShift(size)), t: str, size, font: extra.title ? uiFont(weight) : roboto(weight, str), color, lh, maxw: extra.maxw || 0, ls: extra.ls || 0 }
    ;(spec.ls ? out.spaced : out.texts).push(spec)
  }
  out.focus = (id, row, x, y, w, h) => out.focusables.push({ id, row, x, y, w, h })
  return out
}

// Wraps text to maxW the way CSS overflow-wrap: break-word does: at spaces and after a hyphen, and
// a word too long for a line of its own, such as a release name, between letters.
export const wrapText = (text, size, weight, maxW, ls = 0) => {
  const fits = (s) => textWidth(s, size, weight) + ls * s.length <= maxW
  const out = []
  let line = ''
  String(text || '').split(/\s+/).filter(Boolean).forEach((word) => {
    word.match(/[^-]*-+|[^-]+/g).forEach((part, i) => {
      const next = line ? line + (i ? '' : ' ') + part : part
      if (fits(next)) {
        line = next
        return
      }
      if (line) out.push(line)
      let rest = part
      while (rest && !fits(rest)) {
        let cut = 1
        while (cut < rest.length && fits(rest.slice(0, cut + 1))) cut++
        out.push(rest.slice(0, cut))
        rest = rest.slice(cut)
      }
      line = rest
    })
  })
  if (line) out.push(line)
  return out
}

// The dialog panel around a body, centered on the screen. body(d, x, y, w, focusId) draws from
// the body's top left at the body's width and returns its height. A body taller than the panel
// may grow scrolls by `scroll`, and with clipBody it's drawn into its own lists (`body`) for the
// caller to clip to `clip`.
const coreDialog = ({ t, title, focusId, body, bodyInset = 0, scroll = 0, clipBody = false }) => {
  const d = drawList(t.accent)
  const inner = PANEL_W - 2
  const titleH = dp(20) * 1.17 + dp(12)
  // Measure first, then place at the vertical center.
  const probe = drawList(t.accent)
  const bodyH = body(probe, 0, 0, inner - 2 * bodyInset, focusId)
  const chrome = 1 + dp(20) + titleH + dp(1) + dp(8) + dp(20) + 1
  const h = Math.min(PANEL_MAX_H, chrome + bodyH)
  const viewH = h - chrome
  const x = (SCREEN_W - PANEL_W) / 2
  const y = Math.max(dp(24), (SCREEN_H - h) / 2)
  d.rect(0, 0, SCREEN_W, SCREEN_H, 0, '#0000008a')
  // 8-bit Hero's panels are square with a 3px edge in its surface variant.
  if (t.isPixel) d.rect(x, y, PANEL_W, h, 0, `${rgbOf(t.surface)}e6`, 3, t.surfaceVariant)
  else d.rect(x, y, PANEL_W, h, dp(20), `${rgbOf(t.surface)}e6`, 1, t.isGlass ? white(0.2) : t.os(0.12))
  d.text(x + 1 + dp(24), y + 1 + dp(20), title, dp(20), 'bold', t.onSurface, dp(20) * 1.17, { title: true })
  const divY = y + 1 + dp(20) + titleH
  d.rect(x + 1, divY, inner, dp(1), 0, t.os(0.08))
  const bodyTop = divY + dp(1) + dp(8)
  const top = Math.max(0, Math.min(scroll, bodyH - viewH))
  const bd = clipBody ? drawList(t.accent) : d
  body(bd, x + 1 + bodyInset, bodyTop - top, inner - 2 * bodyInset, focusId)
  if (clipBody) d.focusables = bd.focusables
  return { ...d, panel: { x, y, w: PANEL_W, h }, body: clipBody ? bd : null, clip: { x: x + 1, y: bodyTop, w: inner, h: viewH }, bodyTop, bodyH, viewH, scroll: top }
}

// An alert: a title, a message, then text buttons along the bottom right.
export const coreAlert = ({ t, title, message, actions, focusId }) => {
  const d = drawList()
  const pad = dp(24)
  const titleSize = dp(24)
  const msgSize = dp(14)
  const btn = actions.map((a) => ({ ...a, w: textWidth(a.label, msgSize, 'medium') + 2 * dp(12) }))
  const btnW = btn.reduce((s, b) => s + b.w, 0) + dp(8) * (btn.length - 1)
  const contentW = Math.min(dp(560) - 2 * pad - 2, Math.max(dp(280) - 2 * pad - 2, faceWidth(title, titleSize), textWidth(message, msgSize), btnW))
  const w = contentW + 2 * pad + 2
  const titleH = titleSize * 1.33
  const lines = wrapText(message, msgSize, 'regular', contentW)
  const msgH = Math.max(1, lines.length) * msgSize * 1.43
  const h = 1 + pad + titleH + dp(16) + msgH + dp(24) + dp(40) + pad + 1
  const x = (SCREEN_W - w) / 2
  const y = (SCREEN_H - h) / 2
  d.rect(0, 0, SCREEN_W, SCREEN_H, 0, '#0000008a')
  d.glows.push({ k: 'alertShadow', x, y, w, h, r: t.isGlass ? dp(20) : dp(16), color: '#00000038', blur: dp(10), spread: 0, oy: dp(6) })
  if (t.isPixel) d.rect(x, y, w, h, 0, `${rgbOf(t.surface)}ff`, 3, t.surfaceVariant)
  else d.rect(x, y, w, h, t.isGlass ? dp(20) : dp(16), `${rgbOf(t.surface)}ff`, t.isGlass ? 1 : 0, white(0.2))
  d.text(x + 1 + pad, y + 1 + pad, title, titleSize, 'regular', t.onSurface, titleH, { title: true })
  lines.forEach((line, i) => d.text(x + 1 + pad, y + 1 + pad + titleH + dp(16) + i * msgSize * 1.43, line, msgSize, 'regular', t.os(0.7), msgSize * 1.43, { maxw: contentW }))
  let bx = x + 1 + pad + contentW - btnW
  const by = y + 1 + pad + titleH + dp(16) + msgH + dp(24)
  btn.forEach((b) => {
    const on = focusId === b.id
    const tone = b.destructive ? '#e57373' : t.accent
    if (on) d.rect(bx, by, b.w, dp(40), dp(20), b.destructive ? '#e573731a' : t.accentA(0.1))
    d.text(bx + dp(12), by + (dp(40) - Math.round(msgSize * 1.172)) / 2, b.label, msgSize, 'medium', tone, Math.round(msgSize * 1.172))
    d.focus(b.id, 0, bx, by, b.w, dp(40))
    bx += b.w + dp(8)
  })
  return { ...d, panel: { x, y, w, h } }
}

// A focusable row: a solid fill in the text color with an accent hairline when focused, and a
// clear hairline otherwise so nothing moves when focus lands.
const focusRow = (d, x, y, w, h, on) => {
  d.rect(x, y, w, h, dp(8), on ? '#ffffffff' : '#00000000', 1, on ? CONTROL_ACCENT : '#00000000')
}

const ROW_TEXT = dp(14)
const ROW_LH = ROW_TEXT * 1.43
const ROW_LS = dp(0.25)

// A toggle row: a switch at the end, or a checkbox in front.
const toggleRow = (d, { id, row, x, y, w, title, value, checkbox, focusId }) => {
  const on = focusId === id
  const iconSize = checkbox ? dp(22) : dp(34)
  const h = 2 * dp(12) + 2 + Math.max(ROW_LH, iconSize)
  focusRow(d, x, y, w, h, on)
  const midY = y + h / 2
  const tone = on ? ON_FOCUS : value ? CONTROL_ACCENT : white(0.38)
  let tx = x + 1 + dp(8)
  if (checkbox) {
    d.icon(tx, midY - iconSize / 2, iconSize, value ? 'checkBox' : 'checkBoxBlank', tone)
    tx += iconSize + dp(12)
  } else {
    d.icon(x + w - 1 - dp(8) - iconSize, midY - iconSize / 2, iconSize, value ? 'toggleOn' : 'toggleOff', tone)
  }
  d.text(tx, midY - ROW_LH / 2, title, ROW_TEXT, 'regular', on ? ON_FOCUS : '#ffffffff', ROW_LH, { ls: ROW_LS })
  d.focus(id, row, x, y, w, h)
  return h
}

// A divider: 16dp of height with the rule in the middle.
const divider = (d, x, y, w) => {
  d.rect(x, y + dp(7.5), w, dp(1), 0, white(0.12))
  return dp(16)
}

// A selector row: a label, then the value and a drop arrow, split so a short value sits partway
// along.
const selectorRow = (d, { id, row, x, y, w, label, value, focusId }) => {
  const on = focusId === id
  const h = 2 * dp(14) + 2 + Math.max(ROW_LH, dp(24))
  d.rect(x, y, w, h, dp(8), '#00000000', 1, '#8ec8f054')
  if (on) d.rect(x - 1, y - 1, w + 2, h + 2, dp(8), '#00000000', 3, CONTROL_ACCENT)
  const inner = w - 2 - 2 * dp(12)
  const labelW = textWidth(label, ROW_TEXT) + ROW_LS * label.length
  const free = Math.max(0, inner - labelW - dp(32))
  const endX = x + 1 + dp(12) + labelW + free / 2
  const endW = dp(32) + free / 2
  const midY = y + h / 2
  d.text(x + 1 + dp(12), midY - ROW_LH / 2, label, ROW_TEXT, 'regular', white(0.54), ROW_LH, { ls: ROW_LS })
  const valueMax = Math.max(0, endW - dp(24) - dp(8))
  const valueW = Math.min(valueMax, textWidth(value, ROW_TEXT) + ROW_LS * String(value).length)
  d.text(endX, midY - ROW_LH / 2, value, ROW_TEXT, 'regular', '#ffffffff', ROW_LH, { ls: ROW_LS, maxw: valueMax })
  d.icon(endX + valueW + dp(8), midY - dp(12), dp(24), 'arrowDropDown', white(0.54))
  d.focus(id, row, x, y, w, h)
  return h
}

// A dialog button: a filled block, the primary one in its color, with an accent ring on focus.
// A button with no action stays focusable but grayed.
const dialogButton = (d, { id, row, x, y, w, label, icon, primary, primaryColor, foreground, enabled = true, focusId }) => {
  const h = 2 * dp(14) + dp(15) * 1.43
  let fill = white(0.1)
  if (primary) fill = enabled ? primaryColor || '#ff8f00' : white(0.12)
  d.rect(x, y, w, h, dp(10), fill)
  if (focusId === id) d.rect(x, y, w, h, dp(10), '#00000000', 3, CONTROL_ACCENT)
  const size = dp(15)
  const lw = textWidth(label, size, 'bold') + dp(0.25) * label.length
  const iw = icon ? dp(18) + dp(8) : 0
  const lx = x + (w - lw - iw) / 2
  const color = !enabled ? white(0.38) : foreground || '#ffffffff'
  if (icon) d.icon(lx, y + (h - dp(18)) / 2, dp(18), icon, color)
  d.text(lx + iw, y + dp(14), label, size, 'bold', color, size * 1.43, { ls: dp(0.25) })
  d.focus(id, row, x, y, w, h)
  return h
}

// A row of buttons splitting the width with 12dp between.
const buttonRow = (d, { row, x, y, w, buttons, focusId }) => {
  const bw = (w - dp(12) * (buttons.length - 1)) / buttons.length
  return Math.max(...buttons.map((b, i) => dialogButton(d, { ...b, row, x: x + i * (bw + dp(12)), y, w: bw, focusId })))
}

// The 4K, quota and continuing notes are only read, never focused.
const quotaRow = (d, { x, y, w, label, blocked }) => {
  const h = 2 * dp(10) + Math.max(dp(16), dp(12.5) * 1.43)
  d.rect(x, y, w, h, dp(8), blocked ? '#ef44441a' : white(0.08))
  const tone = blocked ? '#ef4444ff' : white(0.7)
  d.icon(x + dp(12), y + (h - dp(16)) / 2, dp(16), blocked ? 'block' : 'dataUsage', tone)
  d.text(x + dp(12) + dp(16) + dp(8), y + (h - dp(12.5) * 1.43) / 2, label, dp(12.5), 'regular', tone, dp(12.5) * 1.43, { ls: ROW_LS })
  return h
}

const continuingNote = (d, { x, y, w, t }) => {
  const lh = dp(13) * 1.43
  const h = 2 * dp(10) + 2 + Math.max(dp(20), lh)
  d.rect(x, y, w, h, dp(8), '#22c55e26', 1, '#22c55e66')
  d.icon(x + 1 + dp(14), y + (h - dp(20)) / 2, dp(20), 'autorenew', t.status.available)
  d.text(x + 1 + dp(14) + dp(20) + dp(10), y + (h - lh) / 2, $L('Series Continuing · Future Seasons Can Be Requested'), dp(13), 'medium', '#ffffffff', lh, { ls: ROW_LS })
  return h
}

// Season chips, wrapping, 8dp apart. A season that can't be asked for isn't focusable.
const seasonChips = (d, { x, y, w, chips, focusId, firstRow }) => {
  const size = dp(13)
  const lh = size * 1.43
  const h = 2 * dp(8) + lh
  let cx = x + dp(8)
  let cy = y + dp(8)
  let row = firstRow
  chips.forEach((c, i) => {
    const check = c.available ? dp(14) + dp(6) : 0
    const cw = 2 * dp(14) + check + textWidth(c.label, size) + ROW_LS * c.label.length
    if (i > 0 && cx + cw > x + w) {
      cx = x + dp(8)
      cy += h + dp(8)
      row++
    }
    const fill = c.selected ? CONTROL_ACCENT : c.disabled ? white(0.04) : white(0.08)
    d.rect(cx, cy, cw, h, h / 2, fill)
    if (focusId === c.id) d.rect(cx, cy, cw, h, h / 2, '#00000000', 3, CONTROL_ACCENT)
    if (c.available) d.icon(cx + dp(14), cy + (h - dp(14)) / 2, dp(14), 'checkCircle', '#22c55eff')
    d.text(cx + dp(14) + check, cy + dp(8), c.label, size, 'regular', c.selected ? '#ffffffff' : c.disabled ? white(0.38) : white(0.7), lh, { ls: ROW_LS })
    if (!c.disabled) d.focus(c.id, row, cx, cy, cw, h)
    cx += cw + dp(8)
  })
  return { h: cy + h - y, rows: row - firstRow + 1 }
}

// A note in the body's own text, wrapped, with its 12dp under it.
const note = (d, x, y, w, text) => {
  const lines = wrapText(text, ROW_TEXT, 'regular', w, ROW_LS)
  lines.forEach((line, i) => d.text(x, y + i * ROW_LH, line, ROW_TEXT, 'regular', white(0.7), ROW_LH, { ls: ROW_LS }))
  return lines.length * ROW_LH
}

// The 36dp arc spinner centered in 16dp of padding. The caller draws and turns it.
const spinnerBox = (d, x, y, w) => {
  d.spinners.push({ x: x + w / 2 - dp(18), y: y + dp(16), size: dp(36) })
  return dp(36) + 2 * dp(16)
}

// A match card: one of Sonarr's series with its poster, year, title and the start of its overview.
// A pick shows as the accent fill and the check, apart from the inset focus ring.
const matchCard = (d, { id, row, x, y, w, match, selected, focusId }) => {
  const posterW = dp(56)
  const posterH = dp(84)
  const px = x + 1 + dp(8)
  const top = y + 1 + dp(8)
  const tx = px + posterW + dp(12)
  const tw = x + w - 1 - dp(8) - (selected ? dp(8) + dp(22) : 0) - tx
  const yearLh = dp(12) * 1.43
  const titleLh = dp(15) * 1.43
  const overview = match.overview ? wrapText(match.overview, dp(12), 'regular', tw, ROW_LS) : []
  if (overview.length > 2) {
    let cut = overview[1]
    while (cut && textWidth(`${cut}…`, dp(12)) + ROW_LS * (cut.length + 1) > tw) cut = cut.slice(0, -1)
    overview.splice(1, overview.length - 1, `${cut.replace(/\s+$/, '')}…`)
  }
  const textH = (match.year > 0 ? yearLh : 0) + titleLh + (overview.length ? dp(4) + overview.length * yearLh : 0)
  const h = 2 + 2 * dp(8) + Math.max(posterH, textH)
  d.rect(x, y, w, h, dp(10), selected ? d.accent.slice(0, 7) + '2e' : white(0.06), 1, white(0.12))
  if (focusId === id) d.rect(x + 1, y + 1, w - 2, h - 2, dp(10) - 1, '#00000000', dp(2), d.accent)
  d.rect(px, top, posterW, posterH, dp(6), white(0.1))
  if (match.remotePoster) d.image(px, top, posterW, posterH, dp(6), match.remotePoster)
  let ty = top
  if (match.year > 0) {
    d.text(tx, ty, String(match.year), dp(12), 'regular', white(0.54), yearLh, { ls: ROW_LS })
    ty += yearLh
  }
  d.text(tx, ty, match.title, dp(15), 'bold', '#ffffffff', titleLh, { ls: ROW_LS, maxw: tw })
  ty += titleLh
  if (overview.length) ty += dp(4)
  overview.forEach((line, i) => d.text(tx, ty + i * yearLh, line, dp(12), 'regular', white(0.54), yearLh, { ls: ROW_LS }))
  if (selected) d.icon(x + w - 1 - dp(8) - dp(22), top, dp(22), 'checkCircle', d.accent)
  if (id) d.focus(id, row, x, y, w, h)
  return h
}

// The request dialog's first step for a series TMDB has no TVDB id for: Sonarr's matches to pick
// from. s: { title, state ('loading', 'failed', 'none' or 'list'), matches, tvdbId }.
export const matchDialog = ({ t, s, focusId, scroll, clipBody }) => coreDialog({
  t, title: s.title, focusId, scroll, clipBody,
  body: (d, bx, by, bw, f) => {
    const x = bx + dp(24)
    const w = bw - 2 * dp(24)
    let y = by + dp(8)
    let row = 0
    if (s.state === 'loading') y += spinnerBox(d, x, y, w)
    else if (s.state === 'failed') y += note(d, x, y, w, $L("Sonarr couldn't find a match for this series, or couldn't be reached. Try again, or check the series on Seerr."))
    else if (s.state === 'none') y += note(d, x, y, w, $L("We couldn't find a match for this series, so it can't be requested."))
    else {
      y += note(d, x, y, w, $L("We couldn't match this series automatically. Pick the right one below.")) + dp(12)
      s.matches.forEach((m, i) => {
        if (i) y += dp(8)
        y += matchCard(d, { id: `match:${m.tvdbId}`, row: row++, x, y, w, match: m, selected: m.tvdbId === s.tvdbId, focusId: f })
      })
    }
    y += dp(20)
    let buttons
    if (s.state === 'none') buttons = [{ id: 'next', label: $L('Close') }]
    else if (s.state === 'failed') buttons = [{ id: 'cancel', label: $L('Close') }, { id: 'next', label: $L('Retry'), primary: true, primaryColor: '#6366f1' }]
    else buttons = [{ id: 'cancel', label: $L('Cancel') }, { id: 'next', label: $L('Next'), primary: true, primaryColor: '#6366f1', enabled: s.tvdbId != null }]
    y += buttonRow(d, { row: row++, x, y, w, focusId: f, buttons })
    return y + dp(20) - by
  },
})

// A picker row: a radio mark and a label across the panel, tinted when focused.
const pickerRow = (d, { id, row, x, y, w, label, selected, dimmed, t, focusId }) => {
  const on = focusId === id
  const size = dp(16)
  const lh = size * 1.17
  const h = 2 * dp(14) + Math.max(dp(20), lh)
  if (on) d.rect(x, y, w, h, 0, t.accentA(0.2))
  d.icon(x + dp(24), y + (h - dp(20)) / 2, dp(20), selected ? 'checkCircle' : 'radioUnchecked', selected ? t.accent : t.os(0.38))
  const tone = dimmed ? t.os(0.5) : t.os(on ? 0.95 : 0.8)
  d.text(x + dp(24) + dp(20) + dp(12), y + (h - lh) / 2, label, size, 'regular', tone, lh, { maxw: w - dp(24) * 2 - dp(32) })
  d.focus(id, row, x, y, w, h)
  return h
}

// The option picker the selector rows open: a dialog with a row per choice and a dimmed Cancel.
export const pickerDialog = ({ t, title, labels, selectedIndex, focusId }) => coreDialog({
  t, title, focusId,
  body: (d, x, y, w, f) => {
    let at = y
    labels.forEach((label, i) => {
      at += pickerRow(d, { id: `opt${i}`, row: i, x, y: at, w, label, selected: i === selectedIndex, t, focusId: f })
    })
    at += dp(4)
    d.rect(x, at, w, dp(1), 0, t.os(0.08))
    at += dp(1) + dp(4)
    at += pickerRow(d, { id: 'cancel', row: labels.length, x, y: at, w, label: $L('Cancel'), dimmed: true, t, focusId: f })
    return at - y
  },
})

// A divider, then the Advanced Options header and, when opened, the server, profile and folder
// pickers. a: { expanded, loading, rows: [{ key, label, value }] }.
const advancedSection = (d, { x, y, w, a, focusId, row }) => {
  const top = y
  y += divider(d, x, y, w)
  const hh = 2 * dp(12) + 2 + Math.max(ROW_LH, dp(24))
  const on = focusId === 'advanced'
  focusRow(d, x, y, w, hh, on)
  d.text(x + 1 + dp(8), y + (hh - ROW_LH) / 2, $L('Advanced Options'), ROW_TEXT, 'regular', on ? ON_FOCUS : '#ffffffff', ROW_LH, { ls: ROW_LS })
  d.icon(x + w - 1 - dp(8) - dp(24), y + (hh - dp(24)) / 2, dp(24), a.expanded ? 'expandLess' : 'expandMore', on ? ON_FOCUS : white(0.7))
  d.focus('advanced', row++, x, y, w, hh)
  y += hh
  if (a.expanded) {
    y += dp(8)
    if (a.loading) {
      y += spinnerBox(d, x, y, w)
    } else if (a.rows.length) {
      a.rows.forEach((r, i) => {
        if (i) y += dp(12)
        y += selectorRow(d, { id: `adv:${r.key}`, row: row++, x, y, w, label: r.label, value: r.value, focusId })
      })
    } else {
      d.text(x + dp(8), y + dp(8), $L('No service servers configured'), ROW_TEXT, 'regular', white(0.54), ROW_LH, { ls: ROW_LS })
      y += 2 * dp(8) + ROW_LH
    }
  }
  return { h: y - top, row }
}

// The advanced section alone, from (0, 0), for a sheet that draws the rest itself.
export const advancedLayout = ({ a, w, focusId }) => {
  const d = drawList()
  return { ...d, h: advancedSection(d, { x: 0, y: 0, w, a, focusId, row: 0 }).h }
}

// The request sheet. s: { title, match (Sonarr's pick, or null), toggle, is4k, isTv,
// continuing, allSeasons, chips, advanced: null | { expanded, loading, rows: [{ key, label, value
// }] }, quota: null | { label, blocked }, canSubmit }.
export const requestDialog = ({ t, s, focusId, scroll, clipBody }) => coreDialog({
  t, title: s.title, focusId, scroll, clipBody,
  body: (d, bx, by, bw, f) => {
    const x = bx + dp(24)
    const w = bw - 2 * dp(24)
    let y = by + dp(8)
    let row = 0
    if (s.match) y += matchCard(d, { id: 'match', row: row++, x, y, w, match: s.match, selected: true, focusId: f }) + dp(8)
    if (s.continuing) y += continuingNote(d, { x, y, w, t }) + dp(12)
    if (s.toggle) y += toggleRow(d, { id: 'quality', row: row++, x, y, w, title: $L('4K'), value: s.is4k, focusId: f })
    if (s.isTv) y += divider(d, x, y, w)
    if (s.isTv) y += toggleRow(d, { id: 'all', row: row++, x, y, w, title: $L('All Seasons'), value: s.allSeasons, checkbox: true, focusId: f })
    if (s.isTv && !s.allSeasons && s.chips.length) {
      const laid = seasonChips(d, { x, y, w, chips: s.chips, focusId: f, firstRow: row })
      y += laid.h
      row += laid.rows
    }
    if (s.advanced) {
      const laid = advancedSection(d, { x, y, w, a: s.advanced, focusId: f, row })
      y += laid.h
      row = laid.row
    }
    if (s.quota) y += dp(12) + quotaRow(d, { x, y: y + dp(12), w, label: s.quota.label, blocked: s.quota.blocked })
    y += dp(20)
    y += buttonRow(d, {
      row: row++, x, y, w, focusId: f,
      buttons: [
        { id: 'cancel', label: s.match ? $L('Back') : $L('Cancel') },
        { id: 'submit', label: $L('Submit Request'), primary: true, primaryColor: '#6366f1', enabled: s.canSubmit },
      ],
    })
    return y + dp(20) - by
  },
})

// Manage Requests: who asked, then Approve and Decline, for each waiting request.
export const manageDialog = ({ t, requests, busy, focusId, scroll, clipBody }) => coreDialog({
  t, title: $L('Manage Requests'), focusId, scroll, clipBody,
  body: (d, x, by, w, f) => {
    let y = by
    requests.forEach((r, i) => {
      d.text(x, y + dp(12), r.label, ROW_TEXT, 'regular', '#ffffffff', ROW_LH, { ls: ROW_LS, maxw: w })
      y += dp(12) + ROW_LH + dp(8)
      y += buttonRow(d, {
        row: i, x, y, w, focusId: f,
        buttons: [
          { id: `approve:${r.id}`, label: $L('Approve'), icon: 'checkCircleOutline', primary: true, primaryColor: '#388e3c', enabled: !busy },
          { id: `decline:${r.id}`, label: $L('Decline'), icon: 'cancelOutlined', foreground: '#e57373', enabled: !busy },
        ],
      })
    })
    return y - by
  },
})

// The report form. s: { types: [{ id, label, selected }], seasonRow, episodeRow (null or
// { label, value }), message, placeholder, fieldOn, canSend, submitting }.
export const reportDialog = ({ t, s, focusId, scroll, clipBody }) => coreDialog({
  t, title: $L('Report Issue'), focusId, scroll, clipBody,
  body: (d, bx, by, bw, f) => {
    const x = bx + dp(24)
    const w = bw - 2 * dp(24)
    let y = by + dp(8)
    let row = 0
    s.types.forEach((ty) => {
      const on = f === ty.id
      const h = 2 * dp(12) + 2 + Math.max(ROW_LH, dp(20))
      focusRow(d, x, y, w, h, on)
      d.icon(x + 1 + dp(8), y + (h - dp(20)) / 2, dp(20), ty.selected ? 'radioChecked' : 'radioUnchecked', on ? ON_FOCUS : ty.selected ? CONTROL_ACCENT : white(0.38))
      d.text(x + 1 + dp(8) + dp(20) + dp(12), y + (h - ROW_LH) / 2, ty.label, ROW_TEXT, 'regular', on ? ON_FOCUS : '#ffffffff', ROW_LH, { ls: ROW_LS })
      d.focus(ty.id, row++, x, y, w, h)
      y += h
    })
    if (s.seasonRow) {
      y += divider(d, x, y, w)
      y += dp(4)
      y += selectorRow(d, { id: 'season', row: row++, x, y, w, label: s.seasonRow.label, value: s.seasonRow.value, focusId: f })
      if (s.episodeRow) {
        y += dp(12)
        y += selectorRow(d, { id: 'episode', row: row++, x, y, w, label: s.episodeRow.label, value: s.episodeRow.value, focusId: f })
      }
    }
    y += dp(16)
    d.text(x, y, $L("What's wrong?"), dp(13), 'regular', white(0.7), dp(13) * 1.43, { ls: ROW_LS })
    y += dp(13) * 1.43 + dp(8)
    const on = f === 'message' || s.fieldOn
    const bwid = on ? 4 : 1
    const fh = 2 * dp(16) + 2 * bwid + ROW_LH
    d.rect(x, y, w, fh, dp(12), '#2a2a2aff', bwid, on ? CONTROL_ACCENT : '#8ec8f054')
    const shown = s.message || s.placeholder
    d.text(x + bwid + dp(16), y + bwid + dp(16), shown, ROW_TEXT, 'regular', s.message ? '#ffffffff' : white(0.54), ROW_LH, { maxw: w - 2 * (bwid + dp(16)) })
    d.focus('message', row++, x, y, w, fh)
    y += fh + dp(20)
    y += buttonRow(d, {
      row: row++, x, y, w, focusId: f,
      buttons: [
        { id: 'cancel', label: $L('Cancel'), enabled: !s.submitting },
        { id: 'submit', label: $L('Submit Report'), primary: true, enabled: s.canSend },
      ],
    })
    return y + dp(20) - by
  },
})

// The focusable Up, Down, Left or Right of the current one: the neighbor in the same row, or in
// the next row the leftmost one that sits under it (the nearest by center when none does).
export const moveFocus = (focusables, id, dir) => {
  const cur = focusables.find((f) => f.id === id)
  if (!cur) return focusables[0] ? focusables[0].id : null
  const cx = cur.x + cur.w / 2
  if (dir === 'left' || dir === 'right') {
    const same = focusables.filter((f) => f.row === cur.row).sort((a, b) => a.x - b.x)
    const at = same.indexOf(cur)
    const next = same[at + (dir === 'right' ? 1 : -1)]
    return next ? next.id : null
  }
  const rows = focusables.map((f) => f.row).filter((r, i, a) => a.indexOf(r) === i).sort((a, b) => a - b)
  const target = rows[rows.indexOf(cur.row) + (dir === 'down' ? 1 : -1)]
  if (target == null) return null
  const cands = focusables.filter((f) => f.row === target)
  const under = cands.filter((f) => f.x < cur.x + cur.w && f.x + f.w > cur.x).sort((a, b) => a.x - b.x)
  if (under.length) return under[0].id
  cands.sort((a, b) => Math.abs(a.x + a.w / 2 - cx) - Math.abs(b.x + b.w / 2 - cx))
  return cands[0].id
}
