// The Achievement Badges and Friends screens' parts as settings list blocks, laid out at
// 1920x1080. Most colors here are fixed rather than the theme's. SocialBlock draws them.
import { ROW, TOGGLE, dp, lineCount, textWidth } from '../look.js'
import { CARD_W, COLUMN_W } from '../layoutRows.js'

// Text takes the app's 33px line height unless it names its own.
const LH = 33
const SECONDARY = '#ffffffb3'
const CARD_X = ROW.marginX
const IN_L = 1 + ROW.padX
const inR = () => CARD_W - 1 - ROW.padX
const BODY_MIN = ROW.oneLine
const content = () => COLUMN_W - 48

// The badge color at an alpha, as '#rrggbbaa'.
export const tint = (hex, alpha = 0.18) => {
  const v = /^#?[0-9a-f]{6}$/i.test(String(hex || '').trim()) ? String(hex).trim().replace('#', '') : '00a4dc'
  const a = Math.round(alpha * 255).toString(16)
  return '#' + v.toLowerCase() + (a.length < 2 ? '0' + a : a)
}

// Lines of text at [width], with each newline starting a new line.
const linesOf = (text, size, weight, width) =>
  String(text == null ? '' : text)
    .split('\n')
    .reduce((n, part) => n + Math.max(1, lineCount(part, size, weight, width)), 0)

const leadW = (lead) => {
  if (!lead) return 0
  if (lead.kind === 'tile') return 48 + 20
  if (lead.kind === 'glyph') return ROW.tile + ROW.tileGap
  if (lead.kind === 'avatar') return 56 + 20
  if (lead.kind === 'gutter') return 56 + 16
  return 0
}
const leadH = (lead) => (!lead ? 0 : lead.kind === 'tile' ? 48 : lead.kind === 'glyph' ? ROW.tile : lead.kind === 'avatar' ? 56 : LH)

// A trailing part: [w] its width with its margin, [h] its height.
const trailBox = (t) => {
  if (!t) return { w: 0, h: 0 }
  if (t.kind === 'stack') {
    const w = Math.max(textWidth(t.top, 20, 'bold'), textWidth(t.bottom, 20))
    return { w: w + 20, h: LH + 4 + LH, textW: w }
  }
  if (t.kind === 'text') {
    const w = textWidth(t.text, t.size, 'bold')
    return { w: w + 20, h: LH, textW: w }
  }
  if (t.kind === 'check') return { w: 30 + 20, h: 30 }
  if (t.kind === 'chevron') return { w: dp(14) + Math.max(dp(18), ROW.chevron), h: ROW.chevron }
  if (t.kind === 'toggle') return { w: dp(14) + TOGGLE.w + 2 * TOGGLE.margin, h: TOGGLE.h }
  if (t.kind === 'unread') {
    const w = Math.max(36, textWidth(String(t.count), 20, 'bold') + 20)
    return { w, h: 36, textW: w }
  }
  return { w: 0, h: 0 }
}

// One card: [lead] on the left, [lines] stacked in the body and [trail] on the end, all centered
// on the row. lines are {kind: 'heading' | 'caption' | 'note' | 'bar', text, color, value, slim}.
// [dim] draws it faded. A card without [press] still takes focus.
export const cardRow = (o) => {
  const lead = o.lead || null
  const trail = o.trail || null
  const tb = trailBox(trail)
  const bodyX = IN_L + leadW(lead)
  const bodyW = inR() - tb.w - bodyX
  let y = 0
  const parts = []
  ;(o.lines || []).forEach((line, i) => {
    if (line.kind === 'heading') {
      const n = Math.max(1, linesOf(line.text, ROW.heading, 'bold', bodyW))
      parts.push({ ...line, k: 'h' + i, y, h: n * ROW.headingLH })
      y += n * ROW.headingLH
    } else if (line.kind === 'caption') {
      const n = Math.max(1, linesOf(line.text, ROW.caption, 'regular', bodyW))
      parts.push({ ...line, k: 'c' + i, y, h: n * ROW.captionLH })
      y += n * ROW.captionLH
    } else if (line.kind === 'note') {
      const n = Math.max(1, linesOf(line.text, 20, 'regular', bodyW))
      parts.push({ ...line, k: 'n' + i, y: y + 6, h: n * LH })
      y += 6 + n * LH
    } else if (line.kind === 'bar') {
      const h = line.slim ? 8 : 10
      parts.push({ ...line, k: 'b' + i, y: y + 10, h })
      y += 10 + h
    }
  })
  const bodyH = Math.max(BODY_MIN, y)
  const contentH = Math.max(bodyH, leadH(lead), tb.h)
  const h = contentH + 2 * ROW.padY + 2
  const mid = h / 2
  const top = 1 + ROW.padY + (contentH - bodyH) / 2 + (bodyH - y) / 2
  return {
    type: 'block',
    block: 'social.row',
    k: o.sid,
    h: h + 2 * ROW.marginY,
    card: {
      sid: o.sid,
      x: CARD_X,
      y: ROW.marginY,
      w: CARD_W,
      h,
      dim: !!o.dim,
      lead: lead ? [{ ...lead, k: 'lead', x: IN_L, y: mid - leadH(lead) / 2, h: leadH(lead) }] : [],
      lines: parts.map((part) => ({ ...part, x: bodyX, y: top + part.y, w: bodyW })),
      trail: trail ? [{ ...trail, k: 'trail', right: inR(), mid, w: tb.textW || 0 }] : [],
    },
    stops: [{ sid: o.sid, x: CARD_X, y: ROW.marginY, w: CARD_W, h, press: o.press || null, side: o.side }],
  }
}

// A centered message, 40 above and below.
export const message = (k, text) => {
  const n = linesOf(text, 24, 'regular', content())
  return { type: 'block', block: 'social.message', k, h: 80 + n * LH, text, lines: n }
}

// The Retry pill centered under a load failure's message.
export const retry = (k, sid, label, press) => {
  const w = textWidth(label, 24) + 88 + 2
  const x = (COLUMN_W - w) / 2
  return { type: 'block', block: 'social.retry', k, h: 8 + 63, label, sid, bx: x, w, stops: [{ sid, x, y: 8, w, h: 63, press }] }
}

// Pills that wrap, 10 apart, starting [top] below the block and [pad] above its end.
export const chips = (k, list, top = 0, pad = 0) => {
  let x = 0
  let y = top
  const placed = list.map((chip, i) => {
    const w = 14 + 26 + 10 + textWidth(chip.label, 22) + 18
    if (x > 0 && x + w > content()) {
      x = 0
      y += 49 + 10
    }
    const out = { ...chip, k: 'chip' + i, x: 24 + x, y, w }
    x += w + 10
    return out
  })
  return { type: 'block', block: 'social.chips', k, h: list.length ? y + 49 + pad : top + pad, chips: placed }
}

// The rank header: the tier in its shell, the bar to the next one and the summary chips under it.
export const rankHeader = (k, rank, chipList) => {
  const out = { type: 'block', block: 'social.rank', k, rank: rank ? [{ k: 'r', ...rank }] : [] }
  let h = 8
  if (rank) h += 88 + 18 + 10 + 10 + LH
  const c = chips(k + '-chips', chipList || [], 0, 0)
  out.chips = (chipList || []).length ? c.chips.map((chip) => ({ ...chip, y: chip.y + h + (rank ? 20 : 0) })) : []
  if ((chipList || []).length) h += (rank ? 20 : 0) + c.h
  out.h = h + 20
  return out
}

// The showcase: badges in a row that scrolls sideways, each a stop of its own.
export const showcase = (k, badges, scroll, onSide) => {
  const items = badges.map((badge, i) => ({ ...badge, k: 'sc' + i, x: 24 + i * 170 - scroll }))
  return {
    type: 'block',
    block: 'social.showcase',
    k,
    h: 4 + 137 + 12,
    items,
    stops: items.map((item, i) => ({ sid: item.sid, x: item.x, y: 4, w: 150, h: 137, keepRight: true, side: (page, dir) => onSide(page, i, dir) })),
  }
}

// The showcase scroll that shows item [i] whole.
export const showcaseScroll = (scroll, i) => {
  const left = i * 170
  if (left < scroll) return left
  if (left + 150 > scroll + content()) return left + 150 - content()
  return scroll
}

const TAB_PAD_X = 16
const tabWidth = (label, active) => 3 + 22 + textWidth(label, 19, active ? 'bold' : 'medium') + 22 + 3

// A full width pill track whose tabs butt together, scrolled by [scroll] when they run past the
// edge.
export const tabBar = (k, tabs, active, scroll, onSide, onPress) => {
  let x = TAB_PAD_X + 4
  const pills = tabs.map((tab, i) => {
    const on = tab.id === active
    const w = tabWidth(tab.label, on)
    const out = { ...tab, k: tab.sid, i, x: x - scroll, w, on }
    x += w
    return out
  })
  return {
    type: 'block',
    block: 'social.tabs',
    k,
    h: 8 + 63 + 12,
    pills,
    stops: pills.map((p, i) => ({ sid: p.sid, x: p.x, y: 12, w: p.w, h: 55, keepRight: true, side: (page, dir) => onSide(page, i, dir), press: (page) => onPress(page, p.id) })),
  }
}

// The least scroll that shows tab [i] whole inside the bar.
export const tabScroll = (tabs, active, scroll, i) => {
  let left = TAB_PAD_X + 4
  for (let j = 0; j < i; j++) left += tabWidth(tabs[j].label, tabs[j].id === active)
  const right = left + tabWidth(tabs[i].label, tabs[i].id === active)
  if (left < scroll) return left
  if (right > scroll + COLUMN_W) return right - COLUMN_W
  return scroll
}

// A figure, and a bar under it when there's one.
export const progress = (k, figure, bar) => ({
  type: 'block',
  block: 'social.progress',
  k,
  h: LH + 12 + (bar ? 10 : 0) + 12,
  figure,
  bar: bar ? [{ k: 'bar', ...bar }] : [],
})

export const blurb = (k, text) => {
  const n = linesOf(text, 24, 'regular', content())
  return { type: 'block', block: 'social.blurb', k, h: n * 32.4 + 4, text }
}

// The watch clock: 24 bars as a share of the busiest hour, over a 56px box with a 2px floor.
export const watchClock = (k, hours) => {
  const busiest = Math.max(...Array.from({ length: 24 }, (_, h) => hours[h] || 0))
  const pitch = content() / 24
  const bars = Array.from({ length: 24 }, (_, h) => {
    const bh = (Math.round(((2 + 54 * ((hours[h] || 0) / busiest)) / 56) * 100) / 100) * 56
    return { k: 'b' + h, x: 24 + h * pitch + 1, w: pitch - 2, y: 4 + 56 - bh, h: bh }
  })
  const marks = [0, 6, 12, 18, 23]
  const widths = marks.map((m) => textWidth(String(m), 18))
  const gap = (content() - widths.reduce((a, b) => a + b, 0)) / (marks.length - 1)
  let lx = 24
  const labels = marks.map((m, i) => {
    const out = { k: 'l' + m, text: String(m), x: lx }
    lx += widths[i] + gap
    return out
  })
  return { type: 'block', block: 'social.clock', k, h: 4 + 56 + 6 + LH + 16, bars, labels }
}

// A friend's profile header, with statChips for the stats under it.
export const profileHeader = (k, o) => {
  let h = 8 + 88 + 12 + LH
  const lines = []
  if (o.title) {
    lines.push({ k: 't', text: o.title, y: h + 4 })
    h += 4 + LH
  }
  if (o.caption) {
    lines.push({ k: 'c', text: o.caption, y: h + 4 })
    h += 4 + LH
  }
  return { type: 'block', block: 'social.profile', k, h: h + 16, name: o.name, letter: o.letter, online: o.online, lines }
}

export const statChips = (k, list) => {
  const widths = list.map((text) => textWidth(text, 20) + 32)
  const total = widths.reduce((a, w) => a + w + 16, 0)
  let x = 24 + (content() - total) / 2 + 8
  const items = list.map((text, i) => {
    const out = { k: 's' + i, text, x, w: widths[i] }
    x += widths[i] + 16
    return out
  })
  return { type: 'block', block: 'social.stats', k, h: 4 + 49 + 4 + 8, items }
}

// Rows of action buttons. A bar lines them up on the right, 8 units apart, and an [inline] one
// stacks them full width, each after the first 12px in. [end] is one under a message of the
// user's own, where the bar shrinks to its widest button and sits on the right.
export const actionBar = (k, buttons, inline, end) => {
  let placed
  let h
  if (inline) {
    const widths = buttons.map((b, i) => textWidth(b.label, 17, 'bold') + 56 + 2 + (i ? 12 : 0))
    const inner = end ? Math.max(...widths) : content()
    const left = end ? 24 + content() - inner - 48 + 24 : 24
    placed = buttons.map((b, i) => ({ ...b, k: b.sid, x: left + (i ? 12 : 0), y: 8 + i * 63, w: inner - (i ? 12 : 0), h: 63 }))
    h = 8 + 63 * buttons.length + 16
  } else {
    const widths = buttons.map((b) => textWidth(b.label, 17, 'bold') + 56 + 2)
    const total = widths.reduce((a, w) => a + w, 0) + dp(8) * Math.max(0, buttons.length - 1)
    let x = COLUMN_W - dp(16) - total
    placed = buttons.map((b, i) => {
      const out = { ...b, k: b.sid, x, y: dp(8), w: widths[i], h: 63 }
      x += widths[i] + dp(8)
      return out
    })
    h = dp(8) + 63 + dp(16)
  }
  return {
    type: 'block',
    block: 'social.actions',
    k,
    h,
    buttons: placed,
    stops: placed.map((b) => ({ sid: b.sid, x: b.x, y: b.y, w: b.w, h: b.h, keepRight: !inline, press: b.press })),
  }
}

// A confirm box: its question as a message, then Cancel and the answer. [end] shrinks it to its
// content on the right, under a message of the user's own.
export const confirmBox = (k, text, buttons, end) => {
  const m = message(k + '-msg', text)
  const bar = actionBar(k + '-bar', buttons, false)
  if (end) {
    const barW = bar.buttons.reduce((a, b) => a + b.w, 0) + dp(8) * (buttons.length - 1) + 2 * dp(16)
    const w = Math.min(content(), Math.max(textWidth(text, 24) + 48, barW))
    const shift = COLUMN_W - 24 - (bar.buttons[bar.buttons.length - 1].x + bar.buttons[bar.buttons.length - 1].w + dp(16))
    bar.buttons.forEach((b) => (b.x += shift))
    bar.stops.forEach((st) => (st.x += shift))
    m.centerX = COLUMN_W - 24 - w / 2
    m.textW = w - 48
  }
  return [{ ...m, h: m.h + 8, padTop: 8 }, { ...bar, h: bar.h + 16 }]
}

// A text field, which keeps the 33px line, and its label when it has one.
export const inputField = (k, o) => {
  const labelH = o.label ? LH + dp(8) : 0
  const fieldY = dp(8) + labelH
  const fieldH = 2 * dp(12) + LH
  return {
    type: 'block',
    block: 'social.input',
    k,
    h: fieldY + fieldH + dp(8) + dp(8),
    label: o.label || '',
    value: o.value || '',
    placeholder: o.placeholder || '',
    sid: o.sid,
    fieldX: dp(16),
    fieldY,
    fieldW: COLUMN_W - 2 * dp(16),
    fieldH,
    disabled: !!o.disabled,
    stops: [{ sid: o.sid, x: dp(16), y: fieldY, w: COLUMN_W - 2 * dp(16), h: fieldH, press: o.press }],
  }
}

// One chat bubble in the messages list (padded 8 24): the sender in a group, the text, and what's under it.
const bubbleMax = () => content() * 0.8
export const bubble = (k, o) => {
  const inner = bubbleMax() - 42
  const textW = Math.min(inner, Math.max(
    o.sender ? textWidth(o.sender, 17, 'bold') : 0,
    o.text ? textWidth(o.text, 22) : o.photo ? textWidth(o.photo, 22) : 0,
    textWidth(o.meta, 16)
  ))
  let y = 0
  const parts = []
  if (o.sender) {
    parts.push({ k: 's', kind: 'sender', text: o.sender, y, size: 17, lh: 17 * 1.35 })
    y += 17 * 1.35 + 4
  }
  if (o.photo) {
    parts.push({ k: 'p', kind: 'photo', text: o.photo, y, size: 22, lh: 22 * 1.35 })
    y += 22 * 1.35
  }
  if (o.text) {
    const n = linesOf(o.text, 22, 'regular', textW)
    parts.push({ k: 't', kind: 'text', text: o.text, y, size: 22, lh: 22 * 1.35 })
    y += n * 22 * 1.35
  }
  parts.push({ k: 'm', kind: 'meta', text: o.meta, y: y + 6, size: 16, lh: 16 * 1.35 })
  y += 6 + 16 * 1.35
  const w = textW + 42
  const h = y + 30
  const x = o.own ? 24 + content() - w : 24
  const top = o.first ? 8 : 0
  return {
    type: 'block',
    block: 'social.bubble',
    k,
    h: top + h + (o.joined ? 0 : 12 + (o.last ? 8 : 0)),
    sid: o.sid,
    own: !!o.own,
    bx: x,
    by: top,
    w,
    bh: h,
    textW,
    maxW: inner,
    parts,
    stops: [{ sid: o.sid, x, y: top, w, h, press: o.press }],
  }
}

// The composer: the field taking the room and its buttons after it, 12 apart, centered on it.
export const composer = (k, o) => {
  const widths = o.buttons.map((b) => textWidth(b.label, 17, 'bold') + 56 + 2)
  const room = content() - widths.reduce((a, w) => a + w + 12, 0)
  const fieldH = 2 * dp(12) + LH
  let x = 24 + room + 12
  const buttons = o.buttons.map((b, i) => {
    const out = { ...b, k: b.sid, x, y: 8 + (fieldH - 63) / 2, w: widths[i], h: 63 }
    x += widths[i] + 12
    return out
  })
  return {
    type: 'block',
    block: 'social.composer',
    k,
    h: 8 + fieldH + 16,
    sid: o.sid,
    value: o.value || '',
    placeholder: o.placeholder || '',
    fieldX: 24,
    fieldY: 8,
    fieldW: room,
    fieldH,
    buttons,
    stops: [{ sid: o.sid, x: 24, y: 8, w: room, h: fieldH, keepRight: true, press: o.press }, ...buttons.map((b) => ({ sid: b.sid, x: b.x, y: b.y, w: b.w, h: b.h, keepRight: true, press: b.press }))],
  }
}

export { SECONDARY }
