import { robotoShift } from './MessageMarkdown.js'

// The dialog panel's geometry, in dp of 1.66957px at 1920 wide.
export const DP = 1.66957
export const dp = (n) => n * DP

const SCREEN_W = 1920
const SCREEN_H = 1080
const TITLE = dp(20)
const SUBTITLE = dp(13)
const ROW_LABEL = dp(16)
// The cancel row: 14dp above and below the taller of its 20dp icon and its label's line.
const ROW_H = dp(14) * 2 + Math.max(dp(20), ROW_LABEL * 1.17)

// The panel around a body of bodyH, centered in the scrim's padded box. A body taller than fits
// keeps its top and scrolls inside.
export const coreFrame = ({ title = '', subtitle = '', wide = false, bodyH = 0, cancel = false }) => {
  const w = dp(wide ? 720 : 440)
  const titleH = TITLE * 1.17 + (subtitle ? dp(4) : dp(12))
  const subH = subtitle ? SUBTITLE * 1.17 + dp(12) : 0
  const cancelH = cancel ? dp(4) + dp(1) + dp(4) + ROW_H : 0
  const chrome = 2 + 2 * dp(20) + titleH + subH + dp(1) + dp(8) + cancelH
  const maxH = SCREEN_H - 2 * dp(24)
  const shownBody = Math.max(0, Math.min(bodyH, maxH - chrome))
  const h = chrome + shownBody
  const x = (SCREEN_W - w) / 2
  const y = (SCREEN_H - h) / 2
  const top = y + 1 + dp(20)
  const dividerY = top + titleH + subH
  const bodyY = dividerY + dp(1) + dp(8)
  const cancelDivider = bodyY + shownBody + dp(4)
  return {
    x,
    y,
    w,
    h,
    titleTop: top,
    subtitleY: top + titleH + robotoShift(SUBTITLE),
    dividerY,
    bodyX: x + 1,
    bodyY,
    bodyW: w - 2,
    bodyH: shownBody,
    cancelY: cancelDivider + dp(1) + dp(4),
    cancelDivider,
  }
}
