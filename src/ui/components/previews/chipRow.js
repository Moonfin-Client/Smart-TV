// A row of chips [{ w }] at the right of a [colW] column, each with [gap] of margin on its left:
// { items (with off, the chip's x in the box, and i), boxX, boxW, max }. Chips that don't fit start
// at the column's left, and max is how far they scroll.
export const chipRowLayout = (list, colW, gap) => {
  let end = 0
  const items = list.map((c, i) => {
    const off = end + gap
    end = off + c.w
    return { ...c, off, i }
  })
  const boxW = Math.min(end, colW)
  return { items, boxX: colW - boxW, boxW, max: Math.max(0, end - colW) }
}
