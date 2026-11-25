// Where each row of the library's Sort & Filter, Display and Group By panels sits. A row is one of:
//   check, radio, clear, more: an option row, 54 high, 4 below an earlier option sibling
//   section: a group's heading, its rows nested in `rows` when it's open
//   heading: a plain heading over choices
//   rule: a divider
//   search: the facet search field, note: the facet's "No results"
const OPTION = { check: 1, radio: 1, clear: 1, more: 1 }
// A 1px rule, then 20 over a 33px line and 6 under it.
const HEADING_H = 60
const TITLE_END = 76

// Flattens the rows into positioned ones, each with y and h inside the panel, and returns the
// panel's content height.
export const layoutPanel = (rows, startY = TITLE_END) => {
  const out = []
  let y = startY
  // The first block's 8 px top margin folds into the title's 12 px bottom one.
  const gap = () => (out.length ? 8 : 0)
  const place = (list, depth) => {
    let optionSeen = false
    list.forEach((r) => {
      if (OPTION[r.kind]) {
        if (optionSeen) y += 4
        optionSeen = true
        out.push({ ...r, y, h: 54, depth })
        y += 54
      } else if (r.kind === 'section') {
        y += gap()
        out.push({ ...r, kind: 'line', key: r.key + '-line', y, h: 1, depth })
        y += 1 + 8
        out.push({ ...r, y, h: 48, depth })
        y += 48
        if (r.open && r.rows) {
          y += 4
          place(r.rows, depth + 1)
        }
      } else if (r.kind === 'wrap') {
        // A section's frame round rows of its own, with no heading (the Clear Filters row).
        y += gap()
        out.push({ ...r, kind: 'line', key: r.id + '-line', y, h: 1, depth })
        y += 1 + 8
        place(r.rows || [], depth + 1)
      } else if (r.kind === 'heading') {
        y += gap()
        out.push({ ...r, kind: 'line', key: r.key + '-line', y, h: 1, depth })
        out.push({ ...r, y: y + 1, h: HEADING_H - 1, depth })
        y += HEADING_H
      } else if (r.kind === 'rule') {
        y += gap()
        out.push({ ...r, kind: 'line', y, h: 1, depth })
        y += 1 + 8
      } else if (r.kind === 'search') {
        y += 4
        out.push({ ...r, y, h: 66, depth })
        y += 66 + 8
      } else if (r.kind === 'note') {
        out.push({ ...r, y, h: 42, depth })
        y += 42
      }
    })
  }
  place(rows, 0)
  return { rows: out, height: y + 30 + 1 }
}

// A row past either edge of the panel is brought in with 24 to spare, never past the content's end.
export const scrollFor = (row, scroll, panelH, contentH) => {
  let next = scroll
  const top = row.y - scroll
  const bottom = row.y + row.h - scroll
  if (top < 0) next -= -top + 24
  else if (bottom > panelH) next += bottom - panelH + 24
  return Math.max(0, Math.min(next, contentH - panelH))
}
