import $L from '../../../services/i18n.js'

// Where the Identify dialog's pieces sit, in panel coordinates at 1920x1080: a 24px rounded panel
// with 36 by 32 padding, 460 to 620 wide, the title, an error line, then the menu rows, the search
// form or the results and their Back button. Text tops are line box tops, all 33 tall.
// `measure(text, size, weight)` gives widths.
const PAD_X = 36
const PAD_Y = 32
const MIN_W = 460
const MAX_W = 620
// 70vh of content, plus the padding and border.
export const MAX_PANEL_H = 756 + 2 * PAD_Y + 2
const LH = 33

const buttonW = (label, measure) => Math.max(120, 66 + measure(label, 18, 'bold'))

export const identifyLayout = (s, measure) => {
  const title = s.view === 'menu' ? $L('Admin Controls') : $L('Identify')
  let rows = []
  if (s.view === 'menu') {
    rows = [
      { id: 'identify', label: $L('Identify'), detail: $L('Search the metadata providers for a better match') },
      { id: 'refresh', label: s.busy ? $L('Refreshing...') : $L('Refresh Metadata'), detail: $L('Re-read the metadata the providers already have') },
    ]
  } else if (s.view === 'results') {
    rows = s.results.map((r, i) => ({ id: `result${i}`, label: r.Name || $L('Unknown'), detail: [r.ProductionYear, r.SearchProviderName].filter(Boolean).join(' · ') }))
  }
  // The rows never wrap, so a long one widens the dialog up to its max.
  const natural = Math.max(measure(title, 28, 'bold'), ...rows.map((r) => Math.max(measure(r.label, 20) + 32, measure(r.detail, 15) + 32)))
  const cw = Math.min(MAX_W, Math.max(MIN_W, Math.ceil(natural)))
  const x0 = 1 + PAD_X
  const out = { boxes: [], texts: [], focusables: [], w: cw + 2 * PAD_X + 2 }
  const text = (k, x, y, t, size, weight, color, extra) => out.texts.push({ k, x, y, t, size, weight, color, lh: LH, maxw: cw, ...extra })
  const centered = (k, y, t, size, weight, color) => text(k, x0 + (cw - measure(t, size, weight)) / 2, y, t, size, weight, color)
  let line = 0
  let y = 1 + PAD_Y
  centered('title', y, title, 28, 'bold', '#ffffffff')
  y += LH + 20
  if (s.error) {
    centered('error', y, s.error, 18, 'regular', '#ff6b6bff')
    y += LH + 16
  }
  rows.forEach((r, i) => {
    if (i) y += 4
    const h = 14 + LH + 2 + (r.detail ? LH : 0) + 14
    out.boxes.push({ k: `r-${r.id}`, id: r.id, kind: 'row', x: x0, y, w: cw, h, r: 12 })
    out.focusables.push({ id: r.id, line: line++, x: x0, y, w: cw, h })
    text(`${r.id}l`, x0 + 16, y + 14, r.label, 20, 'regular', '#ffffffff', { maxw: cw - 32 })
    if (r.detail) text(`${r.id}d`, x0 + 16, y + 14 + LH + 2, r.detail, 15, 'regular', '#ffffff66', { maxw: cw - 32 })
    y += h
  })
  const buttons = (list, top) => {
    const made = list.map((b) => ({ ...b, w: buttonW(b.label, measure) }))
    let x = x0 + (cw - made.reduce((sum, b) => sum + b.w, 0) - 12 * Math.max(0, made.length - 1)) / 2
    made.forEach((b) => {
      out.boxes.push({ k: `b-${b.id}`, id: b.id, kind: 'button', x, y: top, w: b.w, h: 47, r: 14, primary: !!b.primary, dim: !!b.dim })
      out.focusables.push({ id: b.id, line, x, y: top, w: b.w, h: 47 })
      text(`b-${b.id}t`, x + (b.w - measure(b.label, 18, 'bold')) / 2, top + 13, b.label, 18, 'bold', '#ffffffff', { lh: 21, dim: !!b.dim })
      x += b.w + 12
    })
    line++
  }
  if (s.view === 'search') {
    y += 8
    ;[['name', s.name, $L('Name')], ['year', s.year, $L('Year')]].forEach(([id, value, placeholder]) => {
      out.boxes.push({ k: `i-${id}`, id, kind: 'input', x: x0, y, w: cw, h: 63, r: 16 })
      out.focusables.push({ id, line: line++, x: x0, y, w: cw, h: 63 })
      text(`i-${id}t`, x0 + 17, y + 15, value || placeholder, 20, 'regular', value ? '#ffffffff' : '#ffffff4d', { maxw: cw - 34 })
      y += 63 + 12
    })
    buttons([
      { id: 'search', label: s.busy ? $L('Searching...') : $L('Search'), primary: true, dim: !s.name.trim() || s.busy },
      { id: 'cancel', label: $L('Cancel') },
    ], y)
    y += 47 + 8
  } else if (s.view === 'results') {
    if (!rows.length) {
      centered('none', y, $L('No matches found'), 18, 'regular', '#ffffff80')
      y += LH
    }
    y += 20
    buttons([{ id: 'back', label: $L('Back') }], y)
    y += 47
    if (s.busy) {
      y += 16
      centered('applying', y, $L('Applying…'), 18, 'regular', '#ffffff80')
      y += LH + 16
    }
  }
  out.fullH = y + PAD_Y + 1
  out.h = Math.min(MAX_PANEL_H, out.fullH)
  out.x = Math.round((1920 - out.w) / 2)
  out.y = Math.round((1080 - out.h) / 2)
  return out
}
