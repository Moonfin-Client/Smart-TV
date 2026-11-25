// Scrolls a list to show what took focus: an item wholly out of view comes to the middle, and one
// partly out moves just far enough to show it. `start` and `size` are the item's untransformed box
// along the list, `view` the list's visible length and `max` its furthest scroll. No imports, so
// the checks run in node.
export const focusScroll = (start, size, scroll, view, max) => {
  let s = scroll
  if (start + size - s <= 0 || start - s >= view) s = Math.round(start + size / 2 - view / 2)
  else if (start - s < 0) s = start
  else if (start + size - s > view) s = start + size - view
  return Math.max(0, Math.min(max, s))
}
