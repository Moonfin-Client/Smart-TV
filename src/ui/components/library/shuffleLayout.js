// The shuffle dialog at 1920x1080. Its 1620 by 920 content box sits at 150,80 inside 18px of padding
// and a 1px border, and its rows stack 18 apart.
const BOX = { x: 150, y: 80, w: 1620, h: 920 }
export const CARD = { w: 172, h: 260, gap: 18, top: 147 }
export const ACTION = { y: 939, h: 61, gap: 12, w: (1620 - 2 * 12) / 3 }
const PICKER = { w: 682, x: 619, titleH: 66, rowH: 56, cancelH: 57, bodyH: 69, listMax: 820 - 2 - 66 - 57 }

// The cards' left edges, with the row centered in the dialog.
export const cardXs = (count) => {
  const span = count * CARD.w + Math.max(0, count - 1) * CARD.gap
  const x0 = BOX.x + (BOX.w - span) / 2
  const out = []
  for (let i = 0; i < count; i++) out.push(x0 + i * (CARD.w + CARD.gap))
  return out
}

export const actionX = (i) => BOX.x + i * (ACTION.w + ACTION.gap)

// Up or down between the rows lands on the one whose center is nearest.
export const nearest = (centerX, lefts, w) => {
  let best = 0
  lefts.forEach((x, i) => {
    if (Math.abs(x + w / 2 - centerX) < Math.abs(lefts[best] + w / 2 - centerX)) best = i
  })
  return best
}

// The info panel grows with its meta line (33 high, or 0 when there's nothing to say) and the
// compact ratings under it, and the card row above takes what's left.
export const panelLayout = (metaH, ratingsH) => {
  const h = 30 + 33 + 8 + metaH + ratingsH + 12 + 102
  const y = ACTION.y - 18 - h
  const top = y + 15
  return {
    y, h, titleY: top, metaY: top + 41, ratingsY: top + 41 + metaH, overviewY: top + 41 + metaH + ratingsH + 12,
    rowH: y - 18 - CARD.top,
  }
}

// A picker is as tall as its list, up to 820, and centered. Loading and empty say so in one line.
export const pickerLayout = (rows, message) => {
  const listH = message ? PICKER.bodyH : Math.min(rows * PICKER.rowH, PICKER.listMax)
  const h = 2 + PICKER.titleH + listH + PICKER.cancelH
  return { listH, h, y: (1080 - h) / 2 }
}

// Scrolls the least that brings focused row i into view.
export const pickerScroll = (i, scroll, viewH) => {
  const top = i * PICKER.rowH
  if (top < scroll) return top
  if (top + PICKER.rowH > scroll + viewH) return top + PICKER.rowH - viewH
  return scroll
}
