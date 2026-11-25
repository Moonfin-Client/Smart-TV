// Lays out a settings screen as a column: each entry becomes a model with its place and the place
// of every part inside it, so the row components only draw. Entries are plain descriptions:
//   {type: 'section', text}            a group heading, or the gap one leaves when text is empty
//   {type: 'divider'} | {type: 'text', text, style} (style from TEXT_STYLES, 'description' by default)
//   {type: 'block', block, h, stops: [{sid, x, y, w, h, press(page), side(page, dir)}]} drawn by SettingsBlock
//   {type: 'card', sid, shape, title, sub, subTone, icon, iconStyle, trail, ...}
// [tight] takes the closer padding switches and pickers have, [three] lays the text out the way a
// picker with a description does (its line in the small size), and shape 'slider' adds the track.
// body 'center' stacks a title and its line in the middle of a one-line row, and body 'bare' is a
// heading with no body at all.
// trail is 'toggle', 'bubble', 'chevron', 'swatch', 'circle', 'empty', 'reorder' or 'none'.
import { ROW, BUBBLE, TOGGLE, SECTION, BORDER_REST as DP_REST, dp, lineCount, textWidth } from './look.js'

// The list column's width: 440dp beside the live preview and 420dp in the Friends drawer. Settings
// sets it with setColumnWidth before it lays anything out, and every part reads it as it's built.
export let COLUMN_W = dp(440)

// The lines of text a screen carries between its rows: a screen's description and caption, a
// status or error, an editor's hint and lead, and a loading line. Sizes are in px, some in raw
// pixels and the rest in design units. Lines without a line height of their own take the app's 33px.
const TEXT_STYLES = {
  description: { padTop: 8, padBottom: 16, padX: 24, size: 15, lh: 21, tone: 'caption' },
  caption: { padTop: 0, padBottom: 8, padX: 24, size: 13, lh: 18.2, tone: 'caption' },
  status: { padTop: 12, padBottom: 12, padX: 24, size: 15, lh: 33, tone: 'caption', marginBottom: 4 },
  error: { padTop: 12, padBottom: 12, padX: 24, size: 15, lh: 33, tone: 'error', marginBottom: 4 },
  authHint: { padTop: 16, padBottom: 16, padX: 24, size: 14, lh: 21, tone: 'caption' },
  loading: { padTop: 40, padBottom: 40, padX: 24, size: 18, lh: 33, tone: 'muted', align: 'center' },
  // The RomM code to type in on the phone.
  rommCode: { padTop: 8, padBottom: 0, padX: 24, size: 56, weight: 'bold', spacing: 8, lh: 33, tone: 'strong', align: 'center' },
  // The theme store's message, flush with the list's edges.
  storeMessage: { padTop: 16, padBottom: 16, padX: 0, size: 16, lh: 33, tone: 'caption' },
  // The Library Order message, on its own and as the line over a button.
  orderMessage: { padTop: 24, padBottom: 8, padX: 16, size: 17, lh: 33, tone: 'strong', align: 'center' },
  orderMessageLead: { padTop: 24, padBottom: 12, padX: 16, size: 17, lh: 33, tone: 'strong', align: 'center' },
  hint: { padTop: dp(16), padBottom: dp(4), padX: dp(16), size: dp(12), lh: dp(16), spacing: dp(0.4), tone: 'strong' },
  hintLast: { padTop: 0, padBottom: dp(12), padX: dp(16), size: dp(12), lh: dp(16), spacing: dp(0.4), tone: 'strong' },
  hintSolo: { padTop: dp(16), padBottom: dp(12), padX: dp(16), size: dp(12), lh: dp(16), spacing: dp(0.4), tone: 'strong' },
  hintClean: { padTop: 0, padBottom: dp(8), padX: dp(16), size: dp(12), lh: dp(16), spacing: dp(0.4), tone: 'strong' },
  hintShort: { padTop: dp(16), padBottom: dp(8), padX: dp(16), size: dp(12), lh: dp(16), spacing: dp(0.4), tone: 'strong' },
  lead: { padTop: dp(16), padBottom: dp(8), padX: dp(16), size: dp(14), lh: dp(20), spacing: dp(0.25), tone: 'strong' },
}
export let CARD_W = COLUMN_W - 2 * ROW.marginX
export const setColumnWidth = (w) => {
  COLUMN_W = w
  CARD_W = w - 2 * ROW.marginX
}
const ICON_BLOCK = ROW.tile + ROW.tileGap
const SLIDER_TRACK_H = dp(48)
const SLIDER_TRACK_MARGIN = dp(24)
const MAX_TICKS = 30

// [look] is the theme's settings type (faces.js rowLook), null for the stock one: [px] scales the
// rows' text (a pixel theme's 60 percent, in the same line boxes), and [bubble] measures a value
// bubble set in the theme's face ({size, width(text)}).
const trailWidth = (e, look) => {
  switch (e.trail) {
    case 'toggle':
      return TOGGLE.w + 2 * TOGGLE.margin
    case 'chevron':
      return ROW.chevron
    case 'bubble':
      return bubbleBox(e.bubble, look).w
    case 'swatch':
      return dp(18)
    case 'circle':
      return dp(24)
    case 'reorder':
      return e.reorderW || 0
    case 'check':
      return e.on ? dp(24) : 0
    default:
      return 0
  }
}

// A picker's value in its outlined bubble, three lines at most.
const bubbleBox = (text, look) => {
  const str = String(text == null ? '' : text)
  const room = BUBBLE.maxW - 2 * BUBBLE.padX - 2
  const face = look && look.bubble
  const natural = face ? face.width(str) : textWidth(str, BUBBLE.size, 'bold', BUBBLE.spacing)
  const lines = face
    ? Math.min(3, Math.max(1, Math.ceil(natural / room)))
    : Math.min(3, Math.max(1, lineCount(str, BUBBLE.size, 'bold', room, BUBBLE.spacing)))
  const w = Math.min(BUBBLE.maxW, natural + 2 * BUBBLE.padX + 2)
  return { w, h: lines * BUBBLE.lh + 2 * BUBBLE.padY + 2, lines, textW: w - 2 * BUBBLE.padX - 2 }
}

const trailHeight = (e, look) => {
  if (e.trail === 'toggle') return TOGGLE.h
  if (e.trail === 'bubble') return bubbleBox(e.bubble, look).h
  if (e.trail === 'chevron') return ROW.chevron
  if (e.trail === 'circle') return dp(24)
  if (e.trail === 'swatch') return dp(18)
  if (e.trail === 'check') return e.on ? dp(24) : 0
  return e.trailH || 0
}

// One card: the text column between the icon and the trailing part, padded by its shape. A
// [plainCard] is a plain list item, edge to edge with no card, 72 units tall, and a [static] one
// only heads the list under it.
export const layoutCard = (e, look) => {
  const px = look ? look.px : 1
  const heading = ROW.heading * px
  const headingLH = ROW.headingLH * px
  const plain = e.plainCard === true
  const tight = e.tight === true
  const padX = plain ? dp(16) : ROW.padX
  const padY = plain ? (e.static ? dp(16) + (DP_REST) : 0) : tight ? ROW.padTightY : ROW.padY
  const w = plain ? COLUMN_W : CARD_W
  const innerW = w - 2 - 2 * padX
  const hasIcon = !!e.icon
  const iconBlock = plain ? dp(40) + dp(16) : ICON_BLOCK
  const trailW = e.trail && e.trail !== 'none' ? ROW.trailGap + Math.max(ROW.trailMin, trailWidth(e, look)) : 0
  const bodyX = 1 + padX + (hasIcon ? iconBlock : 0)
  const bodyW = innerW - (hasIcon ? iconBlock : 0) - trailW
  const sub = e.sub == null || e.sub === '' ? '' : String(e.sub)
  const small = e.three === true
  const subSize = (small ? ROW.small : ROW.caption) * px
  const subLH = e.static ? dp(16) : (small ? ROW.smallLH : ROW.captionLH) * px
  const titleLines = Math.max(1, lineCount(e.title, heading, 'bold', bodyW))
  const subLines = sub ? lineCount(sub, subSize, 'regular', bodyW) : 0
  let bodyH
  let titleY
  let subY = 0
  let sliderValueY = 0
  let sliderTrackY = 0
  if (e.shape === 'slider') {
    const pad = dp(8)
    titleY = pad
    subY = titleY + titleLines * headingLH
    sliderValueY = subY + subLines * ROW.captionLH * px
    sliderTrackY = sliderValueY + ROW.captionLH * px
    bodyH = sliderTrackY + SLIDER_TRACK_H + pad
  } else if (e.static) {
    titleY = 0
    subY = titleLines * headingLH + (sub ? dp(2) : 0)
    bodyH = subY + subLines * subLH
  } else if (e.body === 'bare') {
    // A heading straight in the card, with no body to hold it to a row's height.
    titleY = 0
    bodyH = titleLines * headingLH
  } else if (!sub || e.body === 'center') {
    // A plain body: at least a one-line row tall, its lines stacked in the middle.
    const textH = titleLines * headingLH + subLines * subLH
    bodyH = Math.max(ROW.oneLine, textH)
    titleY = (bodyH - textH) / 2
    subY = titleY + titleLines * headingLH
  } else if (small) {
    titleY = dp(15)
    subY = titleY + titleLines * headingLH + dp(6.4)
    bodyH = Math.max(ROW.threeLine, subY + subLines * subLH)
  } else if (subLines > 1 || titleLines > 1) {
    titleY = dp(8)
    subY = titleY + titleLines * headingLH
    bodyH = subY + subLines * subLH + dp(8)
  } else {
    // A pixel theme's smaller text sits lower in the same two-line row.
    bodyH = ROW.twoLine
    titleY = px < 1 ? dp(25) : dp(19)
    subY = titleY + headingLH + (px < 1 ? dp(10.85) : dp(5.45))
  }
  const iconH = hasIcon ? (plain ? dp(24) : ROW.tile) : 0
  const minH = plain && !e.static ? dp(72) - 2 : 0
  const contentH = Math.max(bodyH, iconH, trailHeight(e, look), minH)
  const h = contentH + 2 * padY + 2
  const bodyTop = 1 + padY + (contentH - bodyH) / 2
  const model = {
    ...e,
    type: 'card',
    w,
    h,
    bodyX,
    bodyW,
    titleSize: heading,
    titleLH: headingLH,
    titleY: bodyTop + titleY,
    titleLines,
    sub,
    subY: bodyTop + subY,
    subSize,
    subLH,
    subLines,
    iconX: 1 + padX,
    iconY: (h - (plain ? dp(24) : ROW.tile)) / 2,
    trailX: w - 1 - padX,
    trailMid: h / 2,
  }
  if (e.shape === 'slider') {
    model.valueY = bodyTop + sliderValueY
    model.trackX = bodyX + SLIDER_TRACK_MARGIN
    model.trackW = bodyW - 2 * SLIDER_TRACK_MARGIN
    model.trackMid = bodyTop + sliderTrackY + SLIDER_TRACK_H / 2
    const span = e.max - e.min
    const divisions = Math.round(span / e.step)
    model.ticks = []
    if (divisions > 0 && divisions <= MAX_TICKS) {
      for (let i = 0; i <= divisions; i++) model.ticks.push({ k: 't' + i, x: model.trackX + (i / divisions) * model.trackW })
    }
  }
  if (e.trail === 'bubble') {
    const box = bubbleBox(e.bubble, look)
    model.bubbleW = box.w
    model.bubbleH = box.h
    model.bubbleLines = box.lines
    model.bubbleTextW = box.textW
  }
  return model
}

// The whole screen, top to bottom, with the list's padding at the end.
// bySlot keys the cards' components (rk) by place rather than by setting. The screen a category
// pill opens takes it, so switching categories (focus is on the pills then) hands each card the
// next category's setting in place of building every card again. A pushed screen, opened with the
// list focused, keeps them by setting, so no card passes its focus fade on to another setting.
export const layoutRows = (entries, bySlot = false, look = null) => {
  const out = []
  let y = 0
  let slot = 0
  entries.forEach((e, i) => {
    if (!e) return
    if (e.type === 'section') {
      const h = e.text ? SECTION.padTop + SECTION.lh + SECTION.padBottom : SECTION.padTop
      out.push({ ...e, k: e.k || 'section-' + i, y, h })
      y += h
    } else if (e.type === 'divider') {
      out.push({ ...e, k: e.k || 'divider-' + i, y: y + dp(8), h: 1 })
      y += 1 + 2 * dp(8)
    } else if (e.type === 'text') {
      const st = TEXT_STYLES[e.style || 'description']
      const lines = Math.max(1, lineCount(e.text, st.size, st.weight || 'regular', COLUMN_W - 2 * st.padX, st.spacing || 0))
      const h = st.padTop + lines * st.lh + st.padBottom + (st.marginBottom || 0)
      out.push({ ...e, k: e.k || 'text-' + i, y, h, lines, st, textX: st.padX, textY: st.padTop, textW: COLUMN_W - 2 * st.padX })
      y += h
    } else if (e.type === 'block') {
      // A custom block keeps its own height and its own focus stops.
      out.push({ ...e, k: e.k || e.sid || 'block-' + i, y })
      y += e.h
    } else {
      const card = layoutCard(e, look)
      card.k = e.sid
      card.rk = bySlot ? 'c' + slot++ : e.sid
      const margin = card.plainCard ? 0 : ROW.marginY
      card.y = y + margin
      card.x = card.plainCard ? 0 : ROW.marginX
      out.push(card)
      y += card.h + 2 * margin
    }
  })
  return { rows: out, height: y + dp(8) }
}
