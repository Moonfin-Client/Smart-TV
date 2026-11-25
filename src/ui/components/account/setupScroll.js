// How the setup wizard scrolls its column and its picker list to a newly focused row.
// Boxes are in the list's own coordinates (unscrolled), the view is [top, top + height).

// A row past an edge of the column comes in with 24px to spare, and the last row scrolls to the
// very end. The result stays in range and on whole pixels, as a browser's scrollTop does.
export const columnScroll = ({ scroll, top, bottom, viewTop, viewH, contentH, last }) => {
  const max = Math.max(0, contentH - viewH)
  let next = scroll
  if (top - scroll < viewTop) next -= viewTop - (top - scroll) + 24
  else if (bottom - scroll > viewTop + viewH) next += bottom - scroll - (viewTop + viewH) + 24
  if (last) next = max
  return Math.round(Math.max(0, Math.min(max, next)))
}

// The picker list scrolls the way a browser does on focus: the row comes flush to the edge it
// crossed.
export const listScroll = ({ scroll, top, bottom, viewH, contentH }) => {
  let next = scroll
  if (top < scroll) next = top
  else if (bottom > scroll + viewH) next = bottom - viewH
  return Math.max(0, Math.min(Math.max(0, contentH - viewH), next))
}
