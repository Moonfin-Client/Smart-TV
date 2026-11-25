// The Library screen's header in each of its three styles at 1920 by 1080: every focusable control
// as a ChromeControl model, the plain text and panels around them, and where the focused item's
// details and the grid start.
import $L from '../../../services/i18n.js'
import { LETTERS } from '../../../utils/gridChrome.js'
import { textWidth } from './measure.js'
import { uiFont } from '../../text.js'
import { hex } from '../../themeColor.js'

const WHITE = '#ffffff'
const INK = '#101010'
const ACCENT = '#00a4dc'
const FIELD = '#1e1e28b8'
const SIDE = 87
const INFO_H = 152

// A bound border object reaches the renderer as it is, so its color goes in as the renderer's number.
export { hex as colorNum }
const ringOf = (w, color = WHITE) => ({ w, color: hex(color) })

// The round-cornered toolbar button, 44 square in the Classic toolbar and 66 in
// the Modern bar and the dock.
const iconButton = (id, icon, x, y, size, group, ms, extra) => ({
  id, group, kind: 'button', x, y, w: size, h: size, r: size === 44 ? 9 : 16, ms,
  fill: WHITE, icon, ix: (size - 29) / 2, iy: (size - 29) / 2, isz: 29, iconOff: '#ffffff80', inkOn: INK, iconAlpha: 1,
  ...extra,
})

// The search field, a frosted pill with the glyph inside and a ring on focus.
const searchField = (x, y, w, query, group, ms, extra) => ({
  id: 'search', group, kind: 'search', x, y, w, h: 66, r: 33, ms,
  base: FIELD, ring: true, ringBorder: ringOf(3),
  icon: 'lib_search', ix: 20, iy: 19, isz: 28, iconOff: WHITE, inkOn: WHITE, iconAlpha: 1,
  label: query || $L('Search this library...'), lfont: uiFont(), lsize: 25, lx: 61, ly: 16.5, lh: 33, lmax: w - 84,
  labelOff: query ? WHITE : '#ffffff9e', labelOn: query ? WHITE : '#ffffff9e',
  ...extra,
})

// A letter of the jump strip, bare until focus outlines it in the accent.
const letterButton = (letter, x, y, group, ms, extra) => ({
  id: 'L-' + letter, group, kind: 'letter', letter, x, y, w: 44, h: 44, r: 6, ms,
  ring: true, ringBorder: ringOf(1, ACCENT),
  label: letter, lfont: uiFont('medium'), lfontOn: uiFont('bold'), lsize: 22, lh: 44, ly: 0,
  lx: (44 - textWidth(letter, 22, 'medium')) / 2, lmax: 44,
  labelOff: '#ffffffd9', labelOn: ACCENT,
  ...extra,
})

const letterStrip = (x0, y, group, ms, extra) =>
  LETTERS.map((l, i) => letterButton(l, x0 + i * 44, y, group, ms, extra))

// The Modern bar's labeled control: icon, name, what it's set to and, for the sort,
// which way it runs.
const pill = (p, x, y, ms, extra) => {
  const labelW = textWidth(p.label, 22, 'bold')
  const valueW = Math.min(240, textWidth(p.value || '', 22))
  let w = 3 + 18 + 28 + 10 + labelW
  const vx = w + 10
  if (p.value) w = vx + valueW
  const ax = w + 10
  if (p.arrow) w = ax + 22
  w += 22 + 3
  return {
    id: p.id, group: 'bar', kind: 'pill', x, y, w: Math.ceil(w), h: 66, r: 16, ms,
    fill: WHITE, icon: p.icon, ix: 21, iy: 19, isz: 28, iconOff: WHITE, inkOn: INK, iconAlpha: 0.7,
    label: p.label, lfont: uiFont('bold'), lsize: 22, lx: 59, ly: 20.5, lh: 25, lmax: labelW + 40, labelOff: WHITE, labelOn: INK,
    value: p.value, vfont: uiFont(), vsize: 22, vx, vy: 20.5, vmax: 240, valueOff: WHITE, valueAlpha: 0.65,
    arrow: p.arrow, ax, ay: 22, asz: 22, arrowOff: WHITE,
    ...extra,
  }
}

// A row of the docked panel. The name takes the room the value, sort arrow and chevron
// leave it.
const dockRow = (p, y, ms) => {
  const valueW = Math.min(150, textWidth(p.value || '', 20))
  const chevX = 359 - 3 - 14 - 26
  const ax = chevX - 12 - 22
  const vx = (p.arrow ? ax - 12 : chevX - 12) - valueW
  return {
    id: p.id, group: 'dock', kind: 'dockRow', x: 30, y, w: 359, h: 66, r: 16, ms,
    fill: WHITE, icon: p.icon, ix: 19, iy: 19, isz: 28, iconOff: WHITE, inkOn: INK, iconAlpha: 0.7,
    label: p.label, lfont: uiFont('bold'), lsize: 20, lx: 59, ly: 21, lh: 24, lmax: Math.max(20, vx - 12 - 59), labelOff: WHITE, labelOn: INK,
    value: p.value, vfont: uiFont(), vsize: 20, vx, vy: 21, vmax: 150, valueOff: WHITE, valueAlpha: 0.65,
    arrow: p.arrow, ax, ay: 22, asz: 22, arrowOff: WHITE,
    chev: 'lib_chevron_right', cx: chevX, cy: 20, csz: 26, chevOff: WHITE, chevAlpha: 0.5,
    next: { right: 'out' },
  }
}

// The title and the item count beside it, or the folder path in a folder view.
// Returns the crumb controls and the plain text, with the block's width.
const titleBlock = (s, x0, y0, group, ms, stacked) => {
  const out = { controls: [], texts: [], w: 0 }
  const count = s.count > 0 ? $L('{count} items').replace('{count}', s.count) : ''
  if (!s.crumbs || !s.crumbs.length) {
    const tw = s.neon ? textWidth(s.title, 38, 'neon-display-bold', NEON_TITLE_LS) : textWidth(s.title, 38)
    out.texts.push({ k: 'title', text: s.title, x: x0, y: y0, size: 38, lh: 33, font: s.titleFont, color: WHITE, max: s.titleMax })
    if (count) {
      const cx = stacked ? x0 : x0 + Math.min(tw, s.titleMax) + 17
      out.texts.push({ k: 'count', text: count, x: cx, y: stacked ? y0 + 33 : y0 + 7, size: 17, lh: 33, font: uiFont(), color: '#ffffff66' })
      out.w = stacked ? Math.max(tw, textWidth(count, 17)) : Math.min(tw, s.titleMax) + 17 + textWidth(count, 17)
    } else out.w = tw
    return out
  }
  // The path: the library, then each folder, the open one as plain text.
  let x = x0
  const mid = y0 + 16
  const crumbButton = (name, depth) => {
    const w = textWidth(name, 26, 'bold') + 16 + 2
    const c = {
      id: 'crumb-' + depth, group, kind: 'crumb', depth, x, y: mid - 19, w, h: 38, r: 6, ms,
      fill: '#ffffff14', ring: true, ringBorder: ringOf(1, ACCENT),
      label: name, lfont: s.crumbFonts[depth] || uiFont('bold'), lsize: 26, lx: 9, ly: 4, lh: 30, lmax: w,
      labelOff: '#ffffff99', labelOn: WHITE,
    }
    out.controls.push(c)
    x += w
  }
  crumbButton(s.rootName, 0)
  s.crumbs.forEach((f, i) => {
    out.texts.push({ k: 'sep' + i, text: '›', x: x + 4, y: mid - 17, size: 28, lh: 33, font: uiFont(), color: '#ffffff4d' })
    x += 4 + textWidth('›', 28) + 4
    if (i < s.crumbs.length - 1) crumbButton(f.name, i + 1)
    else {
      out.texts.push({ k: 'cur', text: f.name, x: x + 8, y: mid - 19, size: 32, lh: 38, font: f.font || uiFont('bold'), color: WHITE })
      x += 16 + textWidth(f.name, 32, 'bold')
    }
  })
  if (count) {
    out.texts.push({ k: 'count', text: count, x: x + 17, y: mid - 16, size: 17, lh: 33, font: uiFont(), color: '#ffffff66' })
    x += 17 + textWidth(count, 17)
  }
  out.w = x - x0
  return out
}

const shift = (block, dx) => {
  block.controls.forEach((c) => { c.x += dx })
  block.texts.forEach((t) => { t.x += dx })
}

// s: { style, title, titleFont, count, crumbs, rootName, crumbFonts, query, info, letters,
//      group, shuffle, show, settings, sortLabel, ascending, groupLabel, showLabel, displayLabel, ms, neon }
const layout = (s) => {
  const ms = s.ms || 0
  const arrow = s.ascending ? 'lib_arrow_up' : 'lib_arrow_down'
  const out = { controls: [], texts: [], boxes: [], infoX: SIDE, infoY: -1, gridX: SIDE, gridTop: 0, gridW: 1920 - 2 * SIDE }

  if (s.style === 'docked') {
    out.boxes.push({ k: 'dock', x: 0, y: 0, w: 420, h: 1080, color: '#171717e0' })
    out.boxes.push({ k: 'dockEdge', x: 419, y: 0, w: 1, h: 1080, color: '#ffffff0f' })
    out.controls.push(iconButton('home', 'lib_home', 30, 36, 66, 'dock', ms, { next: { right: 'out' } }))
    const title = titleBlock({ ...s, titleMax: 279 }, 110, 36, 'dock', ms, true)
    out.controls.push(...title.controls)
    out.texts.push(...title.texts)
    out.controls.push(searchField(30, 126, 359, s.query, 'dock', ms, { next: { right: 'out' } }))
    const rows = [{ id: 'sort', icon: 'lib_sort', label: $L('Sort By'), value: s.sortLabel, arrow }]
    if (s.group) rows.push({ id: 'group', icon: 'lib_group', label: $L('Group By'), value: s.groupLabel })
    if (s.show) rows.push({ id: 'show', icon: 'lib_show', label: $L('Show'), value: s.showLabel })
    if (s.shuffle) rows.push({ id: 'shuffle', icon: 'lib_shuffle', label: $L('Shuffle') })
    if (s.settings) rows.push({ id: 'settings', icon: 'lib_display', label: $L('Display'), value: s.displayLabel })
    rows.forEach((r, i) => out.controls.push(dockRow(r, 216 + i * 70, ms)))
    if (s.letters) {
      const top = 216 + rows.length * 70 - 4 + 20
      out.boxes.push({ k: 'dockRule', x: 30, y: top, w: 359, h: 1, color: '#ffffff14' })
      out.texts.push({ k: 'caption', text: $L('Jump to letter'), x: 30, y: top + 25, size: 17, lh: 33, font: uiFont('medium'), color: '#ffffff99', spacing: 1 })
      LETTERS.forEach((l, i) => {
        out.controls.push(letterButton(l, 30 + (i % 7) * 52, top + 70 + Math.floor(i / 7) * 52, 'dock', ms))
      })
    }
    out.gridX = 420 + SIDE
    out.gridW = 1920 - 420 - 2 * SIDE
    out.infoX = 420 + SIDE
    out.infoY = s.info ? 33 : -1
    out.gridTop = 30 + (s.info ? INFO_H : 0)
    return out
  }

  if (s.style === 'modern') {
    const title = titleBlock({ ...s, titleMax: 1746 - 200 }, SIDE, 24, 'crumbs', ms, false)
    out.controls.push(...title.controls.map((c) => ({ ...c, next: { down: '@bar' } })))
    out.texts.push(...title.texts)
    out.boxes.push({ k: 'bar', x: SIDE, y: 76, w: 1746, h: 82, r: 24, color: FIELD })
    const down = s.letters ? 'L-#' : 'out'
    const pills = [{ id: 'sort', icon: 'lib_sort', label: $L('Sort By'), value: s.sortLabel, arrow }]
    if (s.group) pills.push({ id: 'group', icon: 'lib_group', label: $L('Group By'), value: s.groupLabel })
    if (s.show) pills.push({ id: 'show', icon: 'lib_show', label: $L('Show'), value: s.showLabel })
    const built = pills.map((p) => pill(p, 0, 84, ms, { next: { down } }))
    const tail = []
    if (s.shuffle) tail.push(iconButton('shuffle', 'lib_shuffle', 0, 84, 66, 'bar', ms, { next: { down } }))
    if (s.settings) tail.push(iconButton('settings', 'lib_settings', 0, 84, 66, 'bar', ms, { next: { down } }))
    const controls = built.concat(tail)
    const controlsW = controls.reduce((a, c) => a + c.w, 0) + 6 * (controls.length - 1)
    const searchW = 1730 - 66 - 6 - 1 - 6 - 6 - 6 - 1 - 6 - 6 - controlsW
    out.controls.push(iconButton('home', 'lib_home', 95, 84, 66, 'bar', ms, { next: { down } }))
    out.boxes.push({ k: 'div1', x: 167, y: 97, w: 1, h: 40, color: '#ffffff1a' })
    out.controls.push(searchField(180, 84, searchW, s.query, 'bar', ms, { next: { down } }))
    out.boxes.push({ k: 'div2', x: 180 + searchW + 6, y: 97, w: 1, h: 40, color: '#ffffff1a' })
    let x = 180 + searchW + 6 + 1 + 6 + 6
    controls.forEach((c) => {
      c.x = x
      x += c.w + 6
    })
    out.controls.push(...controls)
    let y = 172
    out.infoY = s.info ? y + 3 : -1
    if (s.info) y += INFO_H
    if (s.letters) {
      out.controls.push(...letterStrip(SIDE, y + 12, 'letters', ms, { next: { up: '@bar', down: 'out' } }))
      y += 70
    }
    out.gridTop = y
    return out
  }

  // Classic: the title centered over the screen, the search on the right, the toolbar under the
  // focused item's details.
  const title = titleBlock({ ...s, titleMax: 954 - 120 }, 0, 25, 'crumbs', ms, false)
  shift(title, Math.round(960 - title.w / 2))
  out.controls.push(...title.controls)
  out.texts.push(...title.texts)
  out.controls.push(searchField(1453, 12, 380, s.query, 'search', ms, { next: { down: 'home' } }))
  let y = 84
  out.infoY = s.info ? y + 3 : -1
  if (s.info) y += INFO_H
  const tools = [['home', 'lib_home'], ['sort', 'lib_sort']]
  if (s.group) tools.push(['group', 'lib_group'])
  if (s.shuffle) tools.push(['shuffle', 'lib_shuffle'])
  if (s.settings) tools.push(['settings', 'lib_settings'])
  let x = SIDE
  tools.forEach(([id, icon]) => {
    out.controls.push(iconButton(id, icon, x, y + 12, 44, 'toolbar', ms, { next: { down: 'out' } }))
    x += 47
  })
  if (s.letters) out.controls.push(...letterStrip(x - 3 + 15, y + 12, 'toolbar', ms, { next: { down: 'out' } }))
  out.gridTop = y + 70
  return out
}

// Neon Pulse puts the title in the display face with the accent's glow and the count and captions in
// cyan. Focused controls get a pink-tinted fill and edge, and a toolbar button's icon goes dark.
const NEON_ACCENT = '#ff2e92'
const NEON_CYAN = '#00e5ff'
const NEON_FOCUS = '#ff2e9226'
const NEON_TITLE_LS = 0.4
export const NEON_GLOW = { color: '#ff2e9259', x: 0, y: 0, blur: 8 }
const neon = (out) => {
  out.texts.forEach((t) => {
    if (t.k === 'title') Object.assign(t, { color: NEON_ACCENT, spacing: NEON_TITLE_LS, shadow: NEON_GLOW })
    else if (t.k === 'count' || t.k === 'caption') t.color = NEON_CYAN
  })
  out.controls.forEach((c) => {
    if (c.kind === 'search') return
    const edge = ringOf(c.kind === 'letter' || c.kind === 'crumb' ? c.ringBorder.w : 3, NEON_ACCENT)
    Object.assign(c, { fill: NEON_FOCUS, ring: true, ringBorder: edge })
    if (c.kind === 'button') Object.assign(c, { iconOff: NEON_CYAN, inkOn: c.w === 44 ? INK : NEON_CYAN })
    if (c.kind === 'pill' || c.kind === 'dockRow') Object.assign(c, { labelOn: NEON_CYAN, inkOn: NEON_CYAN, valueOff: NEON_CYAN })
  })
  return out
}

export const libraryChrome = (s) => (s.neon ? neon(layout(s)) : layout(s))
