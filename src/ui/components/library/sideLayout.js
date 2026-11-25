// The sort and settings sheets in SidePanel.jsx. Headers, titles and labels sit in a 33px line.
// Genres' sheet leaves 28 under the title and 12 under a label with 52 tall radio rows, and
// Favorites' uses 32, 16 and 54. Neon Pulse's body face has a taller line, so its radio rows are a
// pixel taller.
const SIDE_METRICS = { titleGap: 28, labelGap: 12, radioH: 52 }
export const layoutSide = (rows, metrics = SIDE_METRICS, neonFace = false) => {
  const m = { ...SIDE_METRICS, ...metrics }
  let y = 40
  let lastOption = false
  return rows.map((r) => {
    const out = { ...r }
    if (r.kind === 'header') {
      out.y = y
      y += 33 + 4
      lastOption = false
    } else if (r.kind === 'title') {
      out.y = y
      y += 33 + m.titleGap
      lastOption = false
    } else if (r.kind === 'label') {
      out.y = y
      y += 33 + m.labelGap
      lastOption = false
    } else if (r.kind === 'radio' || r.kind === 'setting') {
      if (lastOption) y += 4
      out.y = y
      out.h = r.kind === 'radio' ? m.radioH + (neonFace ? 1 : 0) : 84
      y += out.h
      lastOption = true
    } else if (r.kind === 'end') {
      y += 28
      lastOption = false
    }
    return out
  })
}
