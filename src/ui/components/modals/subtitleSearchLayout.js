// Where everything in the Download Subtitles modal sits, in panel coordinates, for its two looks:
// Details' framed rows with a padding, border and indent, and the player's flat rows and footer.
// `measure(text, size, weight, spacing)` gives widths. Text tops are line box tops, so the drawing
// shifts each line for its size.
const LOOKS = {
  details: { padX: 16, padY: 12, border: 1, indent: 16, listGap: 24, cancel: true, footer: false },
  // The player's footer paragraph keeps the page's 33px line height.
  player: { padX: 36, padY: 21, border: 0, indent: 0, listGap: 18, cancel: false, footer: true, footLh: 33 },
}

export const PANEL = { x: 629, w: 662, inner: 660, maxH: 926, padTop: 30, titleLh: 33, rule: 18 }
const NAME_LH = 28
const STATUS_LH = 33
const INFO_LH = 24
const FLAG = { h: 23, line: 27, gap: 6, padX: 10, size: 16, spacing: 0.4 }
const FOOT_LH = 21

// Words broken onto lines no wider than `w`.
export const wrap = (text, w, size, weight, measure) => {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word
    if (line && measure(next, size, weight) > w) {
      lines.push(line)
      line = word
    } else line = next
  })
  if (line || !lines.length) lines.push(line)
  return lines
}

// rows: [{ kind: 'status', name } | { kind: 'result', name, info, flags }]
export const layoutSubtitleSearch = (variant, rows, labels, measure) => {
  const L = LOOKS[variant] || LOOKS.details
  const textW = PANEL.inner - 2 * L.border - 2 * L.padX
  const out = { rows: [], focusables: [] }
  let y = 1 + PANEL.padTop
  out.titleY = y
  y += PANEL.titleLh + PANEL.rule
  out.ruleY = y
  y += 1 + L.listGap
  rows.forEach((r, i) => {
    const top = y
    const inner = top + L.border + L.padY
    const nameLines = wrap(r.name, textW, 24, 'bold', measure)
    // A status line keeps the page's 33px line height, and a result's name uses 28.
    const nameLh = r.kind === 'status' ? STATUS_LH : NAME_LH
    const row = { k: `${r.kind}${i}`, kind: r.kind, idx: out.focusables.length, y: top, name: nameLines.join('\n'), nameLh, nameX: L.border + L.padX, nameY: inner, nameW: textW, info: '', flags: [] }
    let h = nameLines.length * nameLh
    if (r.info) {
      const infoLines = wrap(r.info, textW - L.indent, 20, 'regular', measure)
      row.info = infoLines.join('\n')
      row.infoX = L.border + L.padX + L.indent
      row.infoY = inner + h + 4
      row.infoW = textW - L.indent
      h += 4 + infoLines.length * INFO_LH
    }
    if (r.flags && r.flags.length) {
      const room = textW - L.indent
      let fx = 0
      let line = 0
      r.flags.forEach((f, j) => {
        const label = String(f).toUpperCase()
        const w = measure(label, FLAG.size, 'bold', FLAG.spacing) + 2 * FLAG.padX
        if (fx > 0 && fx + w > room) {
          fx = 0
          line++
        }
        row.flags.push({ k: `f${j}`, text: label, x: L.border + L.padX + L.indent + fx, y: inner + h + 6 + line * FLAG.line + 2, w, h: FLAG.h })
        fx += w + FLAG.gap
      })
      h += 6 + (line + 1) * FLAG.line - 0.1
    }
    row.h = 2 * L.border + 2 * L.padY + h
    out.rows.push(row)
    out.focusables.push({ y: top, h: row.h, kind: r.kind })
    y += row.h
  })
  if (L.cancel) {
    y += 8
    out.dividerY = y
    y += 9
    out.cancel = { idx: out.focusables.length, y, h: 72, label: labels.cancel }
    out.focusables.push({ y, h: 72, kind: 'cancel' })
    y += 72
    y += 32
  }
  if (L.footer) {
    y += 20
    const footLh = L.footLh || FOOT_LH
    out.footer = { y: y + (footLh - FOOT_LH) / 2, text: labels.footer }
    y += footLh + 18
  }
  out.contentH = y + PANEL.padTop + 1
  out.h = Math.min(PANEL.maxH, out.contentH)
  out.y = Math.round((1080 - out.h) / 2)
  return out
}

// How far the panel scrolls to bring a focused box into view, moving as little as it can.
export const revealScroll = (scroll, box, viewH, contentH) => {
  if (contentH <= viewH || !box) return 0
  let s = scroll
  if (box.y - s < 0) s = box.y
  else if (box.y + box.h - s > viewH) s = box.y + box.h - viewH
  return Math.max(0, Math.min(contentH - viewH, s))
}
