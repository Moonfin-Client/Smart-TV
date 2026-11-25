// Spatial focus inside the open card: Left and Right along a row, Up and Down to the cell of the row
// above or below whose middle is nearest. Returns the next cell's index, or -1 where there's nowhere
// to go.
export const nextCell = (cells, cur, dir) => {
  const c = cells[cur]
  if (!c) return cells.length ? 0 : -1
  if (dir === 'left' || dir === 'right') {
    const row = cells.filter((x) => x.row === c.row).sort((a, b) => a.x - b.x)
    const next = row[row.indexOf(c) + (dir === 'left' ? -1 : 1)]
    return next ? next.i : -1
  }
  let target = dir === 'up' ? -1 : Infinity
  cells.forEach((x) => {
    if (dir === 'up' && x.row < c.row && x.row > target) target = x.row
    if (dir === 'down' && x.row > c.row && x.row < target) target = x.row
  })
  if (target < 0 || target === Infinity) return -1
  const mid = c.x + c.w / 2
  let best = -1
  let dist = Infinity
  cells.forEach((x) => {
    if (x.row !== target) return
    const d = Math.abs(x.x + x.w / 2 - mid)
    if (d < dist) {
      dist = d
      best = x.i
    }
  })
  return best
}
