import { cssShift, displayFont, faceDy, normalLine, normalShift, textWidth, uiFont } from '../text.js'
import { robotoShift, robotoWidth, wrapText } from './shell/MessageMarkdown.js'

// Dialog's two layouts at 1920x1080, where a dp is 1.66957px.
const DP = 1.66957
export const dp = (n) => n * DP

// The alert: the title, the message, and text buttons along the bottom right.
export const alertLayout = (title, message, buttons, t) => {
  const pad = dp(24)
  const bw = t.isPixel ? 3 : t.isGlass ? 1 : 0
  const msgSize = dp(14)
  const btns = buttons.map((b) => ({ ...b, w: textWidth(b.label, msgSize, 'medium') + 2 * dp(12) }))
  const btnsW = btns.reduce((s, b) => s + b.w, 0) + dp(8) * Math.max(0, btns.length - 1)
  const fit = Math.max(textWidth(title, dp(24)), robotoWidth(message, msgSize), btnsW)
  const w = Math.min(dp(560), Math.max(dp(280), fit + 2 * pad + 2 * bw))
  // The renderer wraps text that CSS fits exactly, so it gets a couple of pixels of the padding.
  const contentW = w - 2 * pad - 2 * bw
  const lines = message ? wrapText(message, msgSize, 'regular', contentW).length : 0
  const btnFont = uiFont('medium')
  const titleH = title ? dp(24) * 1.33 + dp(16) : 0
  const msgY = bw + pad + titleH
  const btnY = msgY + lines * msgSize * 1.43 + dp(24)
  const h = btnY + dp(40) + pad + bw
  let bx = w - bw - pad - btnsW
  btns.forEach((b, i) => {
    b.x = bx
    b.i = i
    bx += b.w + dp(8)
  })
  const inset = bw + pad
  return {
    w,
    h,
    x: (1920 - w) / 2,
    y: (1080 - h) / 2,
    bw,
    inset,
    contentW,
    msgY,
    btnY,
    btns,
    titleY: inset + cssShift(dp(24), displayFont('regular')),
    msgTextY: msgY + robotoShift(msgSize),
    // A button's label sits on Chrome's normal line, centered in its 40dp.
    btnTextY: btnY + (dp(40) - normalLine(msgSize, btnFont)) / 2 + normalShift(msgSize, btnFont),
  }
}

// The message and exit dialogs: a centered card with its buttons centered under the message.
export const cardLayout = (title, message, buttons) => {
  const btns = buttons.map((b) => ({ ...b, w: Math.max(140, textWidth(b.label, 20, 'bold') + 82) }))
  const btnsW = btns.reduce((s, b) => s + b.w, 0) + 16 * Math.max(0, btns.length - 1)
  const fit = Math.max(textWidth(title, 30, 'bold'), ...String(message).split('\n').map((l) => textWidth(l, 20)), btnsW)
  const contentW = Math.min(520, Math.max(420, fit))
  const lines = message ? wrapText(message, 20, 'regular', contentW, textWidth).length : 0
  const w = contentW + 96 + 2
  const msgY = 1 + 40 + 33 + 12
  const btnY = msgY + lines * 33 + 36
  const h = btnY + 54 + 40 + 1
  let bx = (w - btnsW) / 2
  btns.forEach((b, i) => {
    b.x = bx
    b.i = i
    bx += b.w + 16
  })
  // Its text is in the theme's face, so each line moves by how that face sits against Roboto.
  const dy = { title: faceDy(30), message: faceDy(20), btn: faceDy(20, true) }
  return { w, h, x: (1920 - w) / 2, y: (1080 - h) / 2, contentW, msgY, btnY, btns, dy }
}
