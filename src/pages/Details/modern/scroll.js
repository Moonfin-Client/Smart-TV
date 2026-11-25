// Where the page scrolls when focus lands on a piece that isn't already in view: the piece, or the
// whole container it sits in when that fits the screen, is kept 48px clear of the top and bottom,
// and the page rounds to either end once it comes within 48px of it. All values are in page pixels,
// `st` is the current scroll and `contentH` the page height.
const THRESHOLD = 48
const VIEW_H = 1080

// `threshold` is 48 on Modern's page, and other styles pass their own.
export const scrollFor = (st, contentH, item, container, threshold = THRESHOLD) => {
  const max = Math.max(0, contentH - VIEW_H)
  // A piece wholly on screen and clear of the bottom's 48px leaves the page where it is.
  if (item.y - st >= 0 && item.y - st + item.h <= VIEW_H - threshold) return Math.max(0, Math.min(max, st))
  const inView = (top, h, s) => {
    if (top - s - threshold < 0) return top < threshold ? 0 : top
    if (top - s + h + threshold > VIEW_H) {
      const v = top + h - VIEW_H
      return contentH - (v + VIEW_H) < threshold ? max : v + threshold
    }
    return s
  }
  let s = st
  if (container) {
    if (container.h <= VIEW_H) return Math.max(0, Math.min(max, inView(container.y, container.h, s)))
    if (container.y - s > 0) s = container.y
  }
  return Math.max(0, Math.min(max, inView(item.y, item.h, s)))
}
