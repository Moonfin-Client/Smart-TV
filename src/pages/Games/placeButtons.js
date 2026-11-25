// The buttons in the game details row: each as wide as its icon and label plus padding but
// never under 270, and squeezed back toward 270 when the row runs past the 820px content column.
// `measure(label, 39, 'bold')` gives a label's width.
const BUTTON_MIN = 270
const BUTTON_PAD = 30
const BUTTON_ICON = 48.75
const BUTTON_GAP = 0
const ROW_W = 820

export const placeButtons = (list, measure) => {
  const natural = list.map((b) => Math.max(BUTTON_MIN, BUTTON_PAD * 2 + BUTTON_ICON + BUTTON_GAP + measure(b.label, 39, 'bold')))
  const over = natural.reduce((a, w) => a + w + 36, 0) - ROW_W
  let widths = natural
  if (over > 0) {
    // Each shrinks in proportion to its size, and a button stuck at its minimum hands its share to
    // the rest.
    let left = over
    widths = natural.slice()
    for (let pass = 0; pass < 3 && left > 0.01; pass++) {
      const free = widths.map((w) => (w > BUTTON_MIN ? w : 0))
      const total = free.reduce((a, w) => a + w, 0)
      if (!total) break
      let taken = 0
      widths = widths.map((w, i) => {
        if (!free[i]) return w
        const next = Math.max(BUTTON_MIN, w - (left * free[i]) / total)
        taken += w - next
        return next
      })
      left -= taken
    }
  }
  let x = 18
  return list.map((b, i) => {
    const w = widths[i]
    const room = w - BUTTON_PAD * 2 - BUTTON_ICON - BUTTON_GAP
    const labelW = Math.min(room, measure(b.label, 39, 'bold'))
    const contentW = BUTTON_ICON + BUTTON_GAP + labelW
    const at = x
    x += w + 36
    return { ...b, x: at, w, room, iconX: (w - contentW) / 2, labelX: (w - contentW) / 2 + BUTTON_ICON + BUTTON_GAP }
  })
}
