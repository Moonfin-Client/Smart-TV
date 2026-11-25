import { focusScroll } from './focusScroll.js'

// The links column of the Atlas panel, in plain JS so the check runs in node. The section title is
// the only part that shrinks, so a list too long for the column squeezes the title first, to
// nothing by six or more links, and the links move up with it.
export const COLUMN_H = 411
const TITLE_H = 33
const LINK_H = 60
const PITCH = 66

export const atlasColumn = (count) => {
  const over = Math.max(0, TITLE_H + 18 + PITCH * count - 6 - COLUMN_H)
  const titleH = Math.max(0, TITLE_H - over)
  const top = titleH + 18
  return { titleH, top, maxScroll: Math.max(0, top + PITCH * count - 6 - COLUMN_H) }
}

// The column's scroll once link `i` takes focus.
export const atlasLinkScroll = (i, scroll, count) => {
  const { top, maxScroll } = atlasColumn(count)
  return focusScroll(top + PITCH * i, LINK_H, scroll, COLUMN_H, maxScroll)
}
