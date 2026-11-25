import { textWidth } from '../../../ui/components/details/measure.js'
import { cssShift } from '../../../ui/text.js'

// Frost's toolbar laid out in the pane's own pixels: Play a pill that runs over the pane's padding by
// its 6px ring, then bare 90px icons 9px apart, Play included.
const PANE_PAD = 12
export const BTN = 90
const PLAY_H = 102
// The label chip: 10.5px padding around a 21px line at line-height 1.1.
export const TAG_H = 10.5 + 23.1 + 10.5

export const toolbarLayout = (buttons) => {
  let x = PANE_PAD
  const placed = (buttons || []).map((b, i) => {
    if (i === 0) {
      const w = Math.max(312, 6 + 42 + 28.5 + 15 + textWidth(b.label, 28.5, 'bold') + 42 + 6)
      const out = { b, i, x: x - 6, y: PANE_PAD - 6, w, h: PLAY_H, lead: true }
      x += w - 12
      return out
    }
    x += 9
    const out = { b, i, x, y: PANE_PAD, w: BTN, h: BTN, lead: false }
    x += BTN
    return out
  })
  return { placed, w: x + PANE_PAD, h: PANE_PAD + BTN + PANE_PAD }
}

// What each placed button draws: Play's icon and label centered in the pill, the others' icon
// centered in the 90px slot.
export const buttonLook = (p) => {
  const b = p.b
  if (p.lead) {
    const labelW = Math.min(450, textWidth(b.label, 28.5, 'bold'))
    const ix = (p.w - (28.5 + 15 + labelW)) / 2
    return {
      lead: true, icon: `icons/d/${b.icon}.webp`, iconX: ix, iconY: (p.h - 28.5) / 2, iconW: 28.5,
      label: b.label, labelX: ix + 43.5, labelY: (p.h - 34) / 2 + cssShift(28.5), labelW: labelW + 12,
    }
  }
  return { lead: false, icon: `icons/d/${b.icon}.webp`, iconX: (BTN - 37.5) / 2, iconY: (BTN - 37.5) / 2, iconW: 37.5, label: b.label, labelX: 0, labelY: 0, labelW: 0 }
}

// The label chip floating 24px above a focused icon button, centered on it.
export const tagFor = (p) => {
  if (!p || p.lead) return null
  const w = 21 + textWidth(p.b.label, 21, 'bold') + 21
  return { x: p.x + BTN / 2 - w / 2, y: p.y - 24 - TAG_H, w, label: p.b.label }
}
