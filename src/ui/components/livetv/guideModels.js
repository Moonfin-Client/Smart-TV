import $L from '../../../services/i18n.js'
import { cssShift, fontFor, normalLine, normalShift, textWidth, uiFont } from '../../text.js'
import { CELL_KINDS, TV_CANVAS_SCALE, episodeLine, genreFor, guideWindowFor, isLiveAt, programEnd, programStart, progressAt, recordingMark } from '../../../utils/liveTvGuide.js'

// The guide's layout at 1920x1080, as models its nodes draw from. LH is the 33px line height text
// gets when it sets none, and buttons use the normal line height.

export const ACCENT = '#00a4dc'
export const ROW_H = 87
export const GRID_H = 708
const CHANNEL_W = 296
const GRID_W = 1920 - (70 + 1) - CHANNEL_W
export const WINDOW_MS = guideWindowFor(1920 / TV_CANVAS_SCALE - 48)
export const PX = GRID_W / WINDOW_MS
export const LH = 33

const ACCENT_RGB = '0, 164, 220'
const MIN_META_WIDTH = 139
const CELL_TEXT_INSET = 1.5 + 17 + 12
const NARROW_MARKER_WIDTH = 70
const MARK_RED = '#e0685c'
const MARK_SKIPPED_GREY = '#9e9e9e'

const hex2 = (n) => (n < 16 ? '0' : '') + n.toString(16)
// Turns an 'r, g, b' string and an alpha into the renderer's #rrggbbaa.
export const rgba = (rgb, a) => `#${rgb.split(',').map((v) => hex2(Number(v.trim()))).join('')}${hex2(Math.round(a * 255))}`

// Collapses runs of spaces the way CSS white-space does.
export const collapse = (str) => String(str || '').replace(/\s+/g, ' ').trim()

export const wrapLines = (text, size, weight, width) => {
  const words = collapse(text).split(' ')
  const lines = []
  let line = ''
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word
    if (!line || textWidth(next, size, weight) <= width) line = next
    else {
      lines.push(line)
      line = word
    }
  })
  if (line) lines.push(line)
  return lines
}

export const chipModels = (filters, selected) => {
  let x = 50
  return filters.map((f, i) => {
    const label = $L(f.label)
    const on = f.key === selected
    const weight = on ? 'bold' : 'medium'
    const w = Math.round(textWidth(label, 20, weight) + 40)
    const chip = {
      k: f.key, key: f.key, i, x, w, label, on,
      font: uiFont(weight), color: on ? '#10242e' : '#ffffffd9', bg: on ? ACCENT : '#1a1a1a8c',
      border: on ? '#00000000' : '#ffffff1f', ring: on ? '#ffffffe6' : ACCENT,
      ty: 22 + normalShift(20) - 12,
    }
    x += w + 6
    return chip
  })
}

export const barModels = () => {
  const textW = (s) => Math.round(textWidth(s, 19))
  const icon = (id, src, x) => ({ k: id, id, x, y: 271, w: 60, h: 40, src, ix: 17, iy: 7, is: 26, label: '', tx: 0 })
  const earlier = icon('earlier', 'icons/chevron_left.webp', 47)
  const nowLabel = $L('Now')
  const now = { k: 'now', id: 'now', x: earlier.x + 63, y: 272.5, w: textW(nowLabel) + 34, h: 37, src: '', label: nowLabel, tx: 17 }
  const later = icon('later', 'icons/chevron_right.webp', now.x + now.w + 3)
  const recLabel = $L('Recordings')
  const recW = 34 + 23 + 9 + textW(recLabel)
  const rec = { k: 'recordings', id: 'recordings', x: 1873 - recW, y: 272.5, w: recW, h: 37, src: 'icons/dvr.webp', ix: 17, iy: 7, is: 23, label: recLabel, tx: 49 }
  const date = icon('date', 'icons/guide_event.webp', rec.x - 66)
  const sort = icon('sort', 'icons/sort.webp', date.x - 66)
  const list = [earlier, now, later, sort, date, rec]
  list.forEach((b, i) => {
    b.i = i
    b.r = b.h / 2
    b.font = uiFont()
    b.ty = 7 + normalShift(19)
  })
  return { buttons: list, labelX: later.x + 60 + 12, labelW: sort.x - 12 - (later.x + 72) }
}

export const channelModel = (ch, logoUrl) => {
  const number = ch.ChannelNumber ? String(ch.ChannelNumber) : ''
  const fav = !!(ch.UserData && ch.UserData.IsFavorite === true)
  const chipW = number ? Math.round(textWidth(number, 19, 'bold') + 18) : 0
  const top = number || fav
  const chipX = 274 - chipW
  const textTop = top ? 8.5 : 27
  return {
    logo: logoUrl ? [{ k: logoUrl, src: logoUrl }] : [],
    fallback: logoUrl ? [] : [{ k: 'tv' }],
    num: number ? [{ k: number, text: number, x: chipX, w: chipW, ty: cssShift(19) }] : [],
    fav: fav ? [{ k: 'fav', x: (number ? chipX - 6 : 274) - 15 }] : [],
    name: ch.Name || '',
    nameFont: fontFor(ch.Name || '', 'medium'),
    nameFontFocus: fontFor(ch.Name || '', 'bold'),
    nameY: textTop + (top ? LH + 4 : 0) + cssShift(17.5),
    // Right aligned in its 152 wide column, bold while focused.
    nameX: 274 - Math.min(152, textWidth(ch.Name || '', 17.5, 'medium')),
    nameOver: Math.max(0, textWidth(ch.Name || '', 17.5, 'bold') - 152),
    nameXFocus: 274 - Math.min(152, textWidth(ch.Name || '', 17.5, 'bold')),
  }
}

const markIcon = (mark) => (mark === 'record' ? 'icons/rec_dot.webp' : 'icons/series_record.webp')
const markColor = (mark) => (mark === 'skipped' ? MARK_SKIPPED_GREY : MARK_RED)

export const cellModels = (cells, windowStart, now, noProgramLabel) => cells.map((c) => {
  const p = c.program
  const left = (c.start - windowStart) * PX
  const width = (c.end - c.start) * PX
  const w = Math.max(0, width - 1.5)
  const genre = p ? genreFor(p) : null
  const live = p ? isLiveAt(p, now) : false
  const isGap = c.kind === CELL_KINDS.gap
  const loading = c.kind === CELL_KINDS.loading
  const tintRgb = genre ? genre.rgb : ACCENT_RGB
  const key = `${c.kind}-${c.start}`
  const m = {
    key, x: left, w, live, past: p ? programEnd(p) < now : false, cell: c,
    bg: live ? rgba(tintRgb, 0.14) : '#1a1a1a80',
    bar: loading ? [] : [{ k: 'b', color: p ? (genre ? genre.color : ACCENT) : '#ffffff2e' }],
    marker: [], title: [], meta: [], dot: [], spin: [], progress: [],
  }
  if (loading) {
    m.spin = [{ k: 's', x: (w - 36) / 2 }]
    return m
  }
  if (isGap) {
    const label = noProgramLabel
    const tw = Math.min(textWidth(label, 26), w)
    m.title = [{ k: 'g', text: label, font: uiFont(), x: Math.max(0, (w - tw) / 2), y: (81 - LH) / 2 + cssShift(26), lh: LH, w: Math.max(1, w), lines: 1, color: '#ffffff8c' }]
    return m
  }
  const episode = p ? episodeLine(p) : ''
  const innerWidth = width - CELL_TEXT_INSET
  const showMarker = !!p && programStart(p) < windowStart
  const showMeta = innerWidth >= MIN_META_WIDTH && !!episode
  const wrapTitle = innerWidth >= MIN_META_WIDTH && !showMeta
  const narrow = showMarker && width < NARROW_MARKER_WIDTH
  const padL = narrow ? 3 : 17
  const padR = narrow ? 3 : 12
  let x = padL
  if (showMarker) {
    m.marker = [{ k: 'm', x }]
    x += 27
  }
  const mark = p ? recordingMark(p) : null
  let right = w - padR
  if (mark) {
    right -= 30
    m.dot = [{ k: 'd', x: right + 9, src: markIcon(mark), color: markColor(mark) }]
  }
  const title = (p && p.Name) || ''
  const titleW = Math.max(1, right - x)
  m.title = [{ k: 't', text: title, font: fontFor(title), x, y: 6 + cssShift(26), lh: 30.42, w: titleW, lines: wrapTitle ? 2 : 1, color: '#ffffff' }]
  if (showMeta) m.meta = [{ k: 'e', text: episode, font: fontFor(episode), x: padL, y: 6 + 30.42 + cssShift(20), w: Math.max(1, w - padL - padR) }]
  if (live) {
    const prog = progressAt(p, now)
    if (prog > 0) m.progress = [{ k: 'p', w: Math.max(0, w - 16), fill: Math.max(0, w - 16) * Math.min(1, prog) }]
  }
  return m
})

// Flattens one row's cell parts into a list per part, each item carrying its cell's x, key and fade,
// so the row draws each part in one container and the layers keep their order.
export const flattenCells = (models) => {
  const out = { cells: [], bars: [], markers: [], titles: [], metas: [], dots: [], spins: [], progress: [] }
  models.forEach((m) => {
    const a = m.past ? 0.55 : 1
    out.cells.push({ key: m.key, x: m.x, w: m.w, bg: m.bg, a })
    const put = (list, items) => items.forEach((it) => list.push({ ...it, k: `${m.key}-${it.k}`, ck: m.key, x: m.x + (it.x || 0), a, live: m.live }))
    put(out.bars, m.bar)
    put(out.markers, m.marker)
    const over = (it, size) => (it.lines === 2 ? 0 : Math.max(0, textWidth(it.text, size) - it.w))
    put(out.titles, m.title.map((it) => ({ ...it, over: it.k === 'g' ? 0 : over(it, 26) })))
    put(out.metas, m.meta.map((it) => ({ ...it, over: over(it, 20) })))
    put(out.dots, m.dot)
    put(out.spins, m.spin)
    m.progress.forEach((it) => out.progress.push({ ...it, k: `${m.key}-p`, ck: m.key, x: m.x + 16, a }))
  })
  return out
}

// The marquee on the focused cell or channel name: text that overflows scrolls at 29px a second
// after 1.5s, holds 1s at the end and starts over. The title and episode line move as one group.
const MARQUEE_SPEED = 29
export const marqueeItems = (row, focusKey) => {
  if (!row) return []
  const out = []
  const ms = (over) => Math.round((over / MARQUEE_SPEED) * 1000)
  if (focusKey === 'ch') {
    const ch = row.ch
    if (ch.nameOver > 0) out.push({ k: 'name', x: 122, y: 0, w: 152, h: 87, text: ch.name, font: ch.nameFontFocus, size: 17.5, lh: LH, ty: ch.nameY, color: '#ffffff', over: ch.nameOver, dur: ms(ch.nameOver) })
    return out
  }
  const add = (list, size, lh, color) => list.forEach((t) => {
    if (t.ck !== focusKey || !t.over) return
    out.push({ k: t.k, x: 297 + t.x, y: 3, w: t.w, h: 81, text: t.text, font: t.font, size, lh, ty: t.y, color, over: t.over, dur: ms(t.over) })
  })
  add(row.fl.titles, 26, 30.42, '#ffffff')
  add(row.fl.metas, 20, 23.4, '#ffffff8c')
  return out
}

const HERO = { x: 35, y: 59, w: 1850, h: 209 }
const SYNOPSIS_LH = 23.2 * 1.2

export const heroModel = (props) => {
  const plateUrl = props.programImageUrl || props.channelLogoUrl || ''
  const usingArtwork = !!props.programImageUrl
  const textX = plateUrl ? HERO.x + 157 + 12 : HERO.x + 17
  const textW = HERO.x + HERO.w - 17 - textX
  const live = props.isLive ? $L('Live') : null
  const meta = [
    live, props.timeLabel, props.genreLabel ? $L(props.genreLabel) : null, props.officialRating || null,
    props.communityRating != null ? Number(props.communityRating).toFixed(1) : null,
  ].filter(Boolean).join(' · ')
  const hasChannelPreview = !!props.channelLogoUrl || props.programTitle != null
  const texts = []
  const boxes = []
  const icons = []
  const blocks = []
  let h = 0
  if (hasChannelPreview) {
    const badge = props.badgeLabel ? props.badgeLabel.toUpperCase() : ''
    const lineH = badge ? LH + 9 : LH
    blocks.push({ top: 0, h: lineH, kind: 'line' })
    h = lineH
    if (props.programTitle) {
      blocks.push({ top: h + 3, h: LH, kind: 'program' })
      h += 3 + LH
    }
    blocks.line = { badge, lineH }
  } else {
    blocks.push({ top: 0, h: LH, kind: 'large' })
    h = LH
    if (meta) {
      blocks.push({ top: h + 6, h: LH, kind: 'metaLine' })
      h += 6 + LH
    }
  }
  let synopsisLines = []
  if (props.synopsis) {
    synopsisLines = wrapLines(props.synopsis, 23, 'regular', textW)
    const shown = Math.min(3, synopsisLines.length)
    blocks.push({ top: h + 6, h: shown * 27.6, kind: 'synopsis' })
    h += 6 + Math.min(shown * 27.6, 3 * SYNOPSIS_LH)
  }
  const top = HERO.y + 3 + (203 - h) / 2
  let synopsis = null
  blocks.forEach((b) => {
    const y = top + b.top
    if (b.kind === 'line') {
      const { badge, lineH } = blocks.line
      const titleText = props.title || ''
      const titleBase = textWidth(titleText, 23, 'bold')
      const badgeW = badge ? textWidth(badge, 14.5, 'bold') + badge.length * 0.6 + 21 : 0
      const metaBase = meta ? textWidth(meta, 20) : 0
      const fixed = (badge ? 12 + badgeW : 0) + (meta ? 14 : 0) + (props.mark ? 34 : 0)
      const over = titleBase + metaBase + fixed - textW
      const shrink = over > 0 && titleBase + metaBase > 0 ? over / (titleBase + metaBase) : 0
      const titleWidth = titleBase * (1 - shrink)
      const metaWidth = metaBase * (1 - shrink)
      let x = textX
      texts.push({ k: 'ct', text: titleText, font: fontFor(titleText, 'bold'), size: 23, x, y: y + (lineH - LH) / 2 + cssShift(23), lh: LH, w: Math.max(1, Math.ceil(titleWidth) + (shrink ? 0 : (badge ? 12 : meta ? 14 : textW - titleWidth))), color: '#ffffff' })
      x += titleWidth
      if (badge) {
        x += 12
        boxes.push({ k: 'badge', x, y: y + (lineH - 42) / 2, w: badgeW, h: 42, r: 6, color: rgba(ACCENT_RGB, 0.18), border: rgba(ACCENT_RGB, 0.5), bw: 1.5 })
        texts.push({ k: 'bt', text: badge, font: uiFont('bold'), size: 14.5, x: x + 10.5, y: y + (lineH - 42) / 2 + 4.5 + cssShift(14.5), lh: LH, w: badgeW, color: ACCENT, ls: 0.6 })
        x += badgeW
      }
      if (meta) {
        x += 14
        texts.push({ k: 'cm', text: meta, font: fontFor(meta), size: 20, x, y: y + (lineH - LH) / 2 + cssShift(20), lh: LH, w: Math.max(1, shrink ? Math.ceil(metaWidth) : textX + textW - x - (props.mark ? 34 : 0)), color: '#ffffffb3' })
        x += metaWidth
      }
      if (props.mark) icons.push({ k: 'mark', x: x + 10, y: y + (lineH - 24) / 2, s: 24, src: markIcon(props.mark), color: markColor(props.mark) })
    } else if (b.kind === 'program') {
      const name = props.programTitle
      const nameW = textWidth(name, 35, 'bold')
      texts.push({ k: 'pt', text: name, font: fontFor(name, 'bold'), size: 35, x: textX, y: y + cssShift(35), lh: LH, w: textW, color: '#ffffff' })
      if (props.programSubtitle && nameW < textW) {
        texts.push({ k: 'ps', text: props.programSubtitle, font: fontFor(props.programSubtitle), size: 29, x: textX + nameW, y: y + cssShift(35) + 0.75 * (35 - 29), lh: LH, w: Math.max(1, textW - nameW), color: '#ffffffb3' })
      }
    } else if (b.kind === 'large') {
      const t = props.title || ''
      texts.push({ k: 'lt', text: t, font: fontFor(t), size: 32, x: textX, y: y + cssShift(32), lh: LH, w: textW, color: '#ffffff' })
    } else if (b.kind === 'metaLine') {
      texts.push({ k: 'ml', text: meta, font: fontFor(meta), size: 20, x: textX, y: y + cssShift(20), lh: LH, w: textW, color: '#ffffffb3' })
    } else if (b.kind === 'synopsis') {
      synopsis = { x: textX, y, w: textW, h: Math.min(synopsisLines.length, 3) * SYNOPSIS_LH, text: synopsisLines.join('\n'), lines: synopsisLines.length, ty: cssShift(23), font: fontFor(props.synopsis) }
    }
  })
  return {
    plate: plateUrl ? [{ k: plateUrl, src: plateUrl, artwork: usingArtwork }] : [],
    texts, boxes, icons, synopsis,
  }
}

const BTN_H = 15 * 2 + normalLine(21)

// Buttons sit right aligned and wrap, each with 12 to its left and above.
export const layoutActions = (buttons, width) => {
  const rows = []
  let row = []
  let used = 0
  buttons.forEach((b) => {
    const w = Math.round(textWidth(b.label, 21, 'medium') + 36)
    if (row.length && used + 12 + w > width) {
      rows.push(row)
      row = []
      used = 0
    }
    row.push({ ...b, w })
    used += 12 + w
  })
  if (row.length) rows.push(row)
  const out = []
  rows.forEach((r, ri) => {
    let x = width - r.reduce((s, b) => s + 12 + b.w, 0)
    r.forEach((b) => {
      x += 12
      out.push({ ...b, k: b.id, x, y: 12 + ri * (BTN_H + 12), h: BTN_H, row: ri, ty: 15 + normalShift(21) })
      x += b.w
    })
  })
  return { buttons: out, h: rows.length * (BTN_H + 12) }
}

// A centered popup panel. body() lays its content out from y 0 within width and returns its height.
// The width and the max-height cap (maxFrac of the screen) are the content box's, so the panel is 72
// larger each way. titleStyle restyles the title: { measure (the face textWidth wraps it with),
// font(line), color, spacing, shadow }.
export const popupModel = ({ width, bg = '#1a1a1a', title, titleWeight = 'regular', titleStyle = null, titleGap = 24, maxFrac = 0.8, body, buttons = [], options = null, actionsGap = 24 }) => {
  const inner = Math.min(width, 1920 * maxFrac)
  const texts = []
  const boxes = []
  const icons = []
  const ts = titleStyle
  const titleLines = wrapLines(title || '', 36, ts ? ts.measure : titleWeight, inner)
  titleLines.forEach((ln, i) =>
    texts.push({
      k: `title${i}`, text: ln, font: ts ? ts.font(ln) : fontFor(ln, titleWeight), size: 36, x: 36, y: 36 + i * LH + cssShift(36), lh: LH, w: inner,
      color: ts ? ts.color : '#ffffff', spacing: ts ? ts.spacing : 0, shadow: ts ? ts.shadow : undefined,
    }),
  )
  const bodyTop = 36 + titleLines.length * LH + titleGap
  const ctx = { texts, boxes, icons, w: inner, x: 36, top: bodyTop }
  let bodyH = body ? body(ctx) : 0
  const acts = buttons.length ? layoutActions(buttons, inner) : { buttons: [], h: 0 }
  const actionsH = acts.buttons.length ? actionsGap + acts.h : 0
  const maxH = 1080 * maxFrac + 72
  const full = bodyTop + bodyH + actionsH + 36
  const h = Math.min(full, maxH)
  const listH = options ? Math.max(0, bodyH - (full - h)) : bodyH
  const listFull = bodyH
  if (options) bodyH = listH
  acts.buttons.forEach((b) => {
    b.x += 36
    b.y += bodyTop + bodyH + actionsGap
  })
  return {
    w: inner + 72, h, x: (1920 - inner - 72) / 2, y: (1080 - h) / 2, bg,
    texts, boxes, icons, buttons: acts.buttons, options: options || [], listTop: bodyTop, listH, listFull,
  }
}

// Adds a block of wrapped text to a popup body and returns the y below it.
export const addText = (ctx, k, y, text, { size, weight = 'regular', color, lh = LH, maxLines = 0, x = 0, w = ctx.w }) => {
  let lines = wrapLines(text, size, weight, w)
  if (maxLines && lines.length > maxLines) lines = lines.slice(0, maxLines)
  lines.forEach((ln, i) => ctx.texts.push({ k: `${k}${i}`, text: ln, font: fontFor(ln, weight), size, x: ctx.x + x, y: ctx.top + y + i * lh + cssShift(size), lh, w, color }))
  return y + lines.length * lh
}
