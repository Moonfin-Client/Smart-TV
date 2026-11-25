// The sign-in screen's layout at 1920x1080, as plain functions of the page's state, so Login.jsx
// only draws. `s` is the page's state, `t` its strings, and `d` what the
// page derives from both (the listed servers, whether Quick Connect and its QR show).
import { buttonWidth, fieldHeight, wrapRow } from './loginLayout.js'
import { textWidth, wrapLines } from './look.js'
import { faceMetrics, uiFont } from '../../text.js'

export const LOGO = { big: { h: 133.57, w: 591.8, box: 179.6 }, small: { h: 106.85, w: 473.4, box: 152.9 } }
export const FRAME_PAD = 26.71
export const CARD_PAD = 53.43
export const TILE_H = 112.12
export const TILE_GAP = 6.68
export const LINE = 33

// Jellyfin's six digits read 3+3, Silo's eight 4+4.
export const formatQuickConnectCode = (code) => {
  if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`
  return code
}

// The code is 48dp tall with 8dp between characters, each one centered in a monospace cell.
// shortcut: Roboto glyphs in monospace cells, not the TV's own monospace face. Ship a mono font
// if the shapes need to match too.
export const CODE_SIZE = 80.14
const CODE_CELL = CODE_SIZE * 0.6 + 13.36
export const codeCells = (text) => {
  const chars = String(text || '').split('')
  const left = -(chars.length * CODE_CELL) / 2
  return chars.map((ch, i) => ({ ch, x: left + i * CODE_CELL + (CODE_CELL - 13.36) / 2 }))
}

// The logo and the waiting spinner each sit on the baseline of a line set in the screen's face at
// 30px, so a face that reaches less far below the baseline than Roboto (8-bit Hero's) makes those
// lines shorter.
const below = (m) => m.desc * 30 + (33 - (m.asc + m.desc) * 30) / 2
export const descentShift = () => below(faceMetrics(uiFont())) - below(faceMetrics('roboto'))

// How wide a code runs, every character in its cell with the spacing after it.
const codeWidth = (text) => String(text || '').length * CODE_CELL

// The server list: saved, then discovered (with a spinner while it looks), the error, Add Server.
const serversCard = (s, d) => {
  let y = 0
  const rows = {}
  if (d.savedItems.length) y = LINE + 13.36 + d.savedItems.length * (TILE_H + TILE_GAP) - TILE_GAP + 33.39
  rows.discovered = y
  y += LINE + 13.36
  rows.spinner = false
  rows.none = false
  rows.tight = 0
  if (d.discoveredItems.length) {
    y += d.discoveredItems.length * (TILE_H + TILE_GAP)
    if (s.isDiscovering) {
      rows.tight = y - rows.discovered + 6.68
      y += 56.7
    }
  } else if (s.isDiscovering) {
    rows.spinner = true
    y += 105.4
  } else {
    rows.none = true
    y += 73.07
  }
  if (s.error) {
    rows.error = y + 13.36
    y += 13.36 + wrapLines(s.error, 23.374, 'regular', 1059.9).length * LINE
  }
  rows.add = y + 26.71
  y += 26.71 + 105.5
  return { w: 1168.7, h: y + 2 * CARD_PAD + 2, rows }
}

// With a QR the card is a row as wide as what's in it, up to the wide frame's 948dp less its
// padding, and whichever column is shorter is centered beside the other (Plex's code is shorter
// than its QR, Quick Connect's taller). The caption under the QR wraps as long as it needs.
const QR_SIDE = 66.78 + 367.3 + 2 * CARD_PAD + 2
const QR_CARD_MAX = 948 * 1.66957 - 2 * 40.07
const qrColumnW = (natural) => Math.min(natural, QR_CARD_MAX - QR_SIDE)
const withQr = (rows, y, qr, mainW, caption) => {
  if (!qr) return { w: 1001.8, h: y + 2 * CARD_PAD + 2, rows }
  rows.captionLines = wrapLines(caption, 20.035, 'regular', 367.3).length
  const qrH = 367.3 + 13.36 + rows.captionLines * LINE
  const h = Math.max(y, qrH)
  rows.qrY = (h - qrH) / 2
  rows.mainY = (h - y) / 2
  return { w: mainW + 66.78 + 367.3 + 2 * CARD_PAD + 2, h: h + 2 * CARD_PAD + 2, rows }
}

// Title, the server line, Quick Connect and Password, then either the code (with its QR beside
// the column) or the fields with Back and Sign In.
const signInCard = (s, d, t) => {
  const rows = {}
  const qcMode = d.supportsQuickConnect && s.showQuickConnect
  // Beside a QR the column is as wide as its widest line, which Silo's eight digits can be.
  const code = s.quickConnectCode ? formatQuickConnectCode(s.quickConnectCode) : ''
  const mainW = d.showQr ? qrColumnW(Math.max(textWidth(t.qcInstruction, 23.374), codeWidth(code), 436.73)) : 892.9
  rows.mainW = mainW
  // A face wider than Roboto can push the instruction onto more lines beside the QR.
  rows.instrShift = (wrapLines(t.qcInstruction, 23.374, 'regular', mainW).length - 1) * LINE
  rows.spinShift = descentShift()
  let y = 39.68 + LINE
  rows.toggles = []
  if (d.supportsQuickConnect) {
    rows.toggles = wrapRow([
      { id: 'qc-toggle-btn', label: t.quickConnect, selected: s.showQuickConnect, w: buttonWidth('toggle', t.quickConnect) },
      { id: 'pw-toggle-btn', label: t.password, selected: !s.showQuickConnect, w: buttonWidth('toggle', t.password) },
    ], mainW / 2)
    y += 30.05 + 10.02 + 72.12
  }
  rows.user = -1
  rows.pass = -1
  if (qcMode) {
    rows.qc = y + 40.07
    let q = LINE + rows.instrShift
    if (s.quickConnectCode) q += 33.39 + LINE + 33.39 + 52.47 + rows.spinShift + 20.03 + LINE
    else if (!s.error) q += 33.39 + 79.4
    rows.qcError = q + 26.71
    if (s.error) q += 26.71 + wrapLines(s.error, 23.374, 'regular', mainW).length * LINE
    rows.qcBack = q + 30.05 + 10.02
    rows.backW = buttonWidth('outline', t.back)
    y = rows.qc + rows.qcBack + 78.79
  } else {
    rows.form = y + 40.07
    let f = 0
    if (s.passwordChange) f += wrapLines(d.passwordChangeNote, 20.035, 'regular', mainW).length * LINE + 6.68
    if (!s.signInUser && !s.passwordChange) {
      rows.user = f
      f += fieldHeight('login', s.focusId === 'username-input') + 26.71
    }
    if (!s.signInUser || s.signInUser.hasPassword !== false) {
      rows.pass = f
      f += fieldHeight('login', s.focusId === 'password-input')
    } else if (rows.user >= 0) f -= 26.71
    rows.formError = f + 20.03
    if (s.error) f += 20.03 + wrapLines(s.error, 23.374, 'regular', mainW).length * LINE
    const label = d.signInLabel
    rows.formButtons = wrapRow([
      { id: 'back-btn', label: t.back, w: buttonWidth('outline', t.back) },
      { id: 'signin-btn', label, w: buttonWidth('outline', label), busy: s.isConnecting, disabled: s.isConnecting },
    ], mainW / 2)
    rows.formButtonsY = f + 30.05 + 10.02
    y = rows.form + rows.formButtonsY + 78.79
  }
  return withQr(rows, y, d.showQr, mainW, t.qrCaption)
}

const embyCard = (s, d, t) => {
  const rows = {}
  let f = 39.68 + LINE + 40.07
  rows.user = f
  f += fieldHeight('login', s.focusId === 'emby-username-input') + 26.71
  rows.pass = f
  f += fieldHeight('login', s.focusId === 'emby-password-input')
  rows.formError = f + 20.03
  if (s.error) f += 20.03 + wrapLines(s.error, 23.374, 'regular', 892.9).length * LINE
  const signLabel = s.isConnecting ? t.signingIn : t.signIn
  rows.formButtons = wrapRow([
    { id: 'emby-back-btn', label: t.back, w: buttonWidth('outline', t.back), disabled: s.isConnecting },
    { id: 'emby-signin-btn', label: signLabel, w: buttonWidth('outline', signLabel), disabled: s.isConnecting || !s.username.trim() || !s.password },
  ], 446.45)
  rows.formButtonsY = f + 30.05 + 10.02
  return { w: 1001.8, h: rows.formButtonsY + 78.79 + 2 * CARD_PAD + 2, rows }
}

// Emby Connect's linked servers, or the Plex account's.
const listCard = (s) => {
  const plex = s.step === 'plex-servers'
  const source = plex ? s.plexServers : s.connectServers
  const rows = {}
  rows.none = plex && !source.length
  const listTop = LINE + 13.36 + (rows.none ? 73.07 : 0)
  rows.list = source.map((entry, i) => ({
    key: (plex ? entry.id : entry.systemId) || String(i),
    id: `${plex ? 'plex' : 'emby'}-server-${i}`,
    y: listTop + i * (TILE_H + TILE_GAP),
    serverType: plex ? 'plex' : 'emby',
    name: entry.name,
    detail: plex ? [entry.connections[0], entry.version].filter(Boolean).join(' • ') : entry.candidateAddresses[0] || '',
  }))
  let y = listTop + source.length * (TILE_H + TILE_GAP)
  if (s.error) {
    rows.error = y + 13.36
    y += 13.36 + wrapLines(s.error, 23.374, 'regular', 1059.9).length * LINE
  }
  rows.add = y + 26.71
  y += 26.71 + 75.46
  return { w: 1168.7, h: y + 2 * CARD_PAD + 2, rows }
}

const plexCard = (s, d, t) => {
  const rows = {}
  const mainW = d.plexQr ? qrColumnW(Math.max(textWidth(t.plexLink, 23.374), codeWidth(s.plexPin && s.plexPin.code), 436.73)) : 892.9
  rows.mainW = mainW
  rows.instrShift = (wrapLines(t.plexLink, 23.374, 'regular', mainW).length - 1) * LINE
  rows.spinShift = descentShift()
  let y = LINE
  if (!s.plexUsePassword) {
    let q = LINE + rows.instrShift
    if (s.plexPin) q += 33.39 + LINE + 33.39 + 52.47 + rows.spinShift + 20.03 + LINE
    else if (!s.error) q += 26.71 + 52.0 + 26.71
    rows.qcError = q + 26.71
    if (s.error) q += 26.71 + wrapLines(s.error, 23.374, 'regular', mainW).length * LINE
    rows.plexButtons = wrapRow([
      { id: 'plex-code-back-btn', label: t.back, w: buttonWidth('outline', t.back) },
      { id: 'plex-password-btn', label: t.plexWithPassword, w: buttonWidth('outline', t.plexWithPassword) },
    ], mainW / 2)
    rows.qcBack = q + 30.05 + 10.02
    y += 40.07 + rows.qcBack + 78.79
  } else {
    rows.form = y + 40.07
    let f = 0
    rows.user = f
    f += fieldHeight('login', s.focusId === 'plex-username-input') + 26.71
    rows.pass = f
    f += fieldHeight('login', s.focusId === 'plex-password-input')
    if (s.plexNeedsCode) {
      rows.code = f + 26.71
      f += 26.71 + fieldHeight('login', s.focusId === 'plex-code-input')
    }
    rows.formError = f + 20.03
    if (s.error) f += 20.03 + wrapLines(s.error, 23.374, 'regular', 892.9).length * LINE
    const signLabel = s.isConnecting ? t.signingIn : t.signIn
    rows.formButtons = wrapRow([
      { id: 'plex-back-btn', label: t.back, w: buttonWidth('outline', t.back), disabled: s.isConnecting },
      { id: 'plex-signin-btn', label: signLabel, w: buttonWidth('outline', signLabel), disabled: s.isConnecting || !s.username.trim() || !s.password },
    ], 446.45)
    rows.formButtonsY = f + 30.05 + 10.02
    y = rows.form + rows.formButtonsY + 78.79
  }
  return withQr(rows, y, d.plexQr, mainW, t.plexQrCaption)
}

export const stepCard = (s, d, t) => {
  const step = s.step
  if (step === 'servers') return serversCard(s, d)
  if (step === 'signin') return signInCard(s, d, t)
  if (step === 'embyconnect') return embyCard(s, d, t)
  if (step === 'embyconnect-servers' || step === 'plex-servers') return listCard(s)
  if (step === 'plex') return plexCard(s, d, t)
  return { h: 0, w: 0, rows: {} }
}

// The Add Server panel's address step: the header, the field, Connect, the hint and any notice.
// The hint and notice give way to the keyboard.
export const addressRows = (s, d, t) => {
  const kb = s.keyboardOpen
  const helpLines = kb ? 0 : wrapLines(t.addressHelp, 23.374, 'regular', 615.8).length
  const header = Math.max(66.78, 6.68 + 47.75 + (helpLines ? 6.68 + helpLines * 32.72 : 0))
  const label = header + 30.05
  const field = label + LINE + 13.36
  const connect = field + fieldHeight('address', s.focusId === 'add-address-input') + 20.03
  let h = connect + 80.14
  const hint = h + 16.7
  if (!kb) h = hint + wrapLines(d.addressHint, 20.035, 'regular', 789.4).length * 28.05
  const notice = h + 23.37
  const n = d.notice
  const out = { label, field, connect, hint, notice, noticeH: 0, noticeTextY: 18.37, warning: !!(n && n.warning), noticeTitle: '', noticeText: '' }
  if (n && !kb) {
    out.noticeTitle = n.title
    out.noticeText = n.detail
    out.noticeTextY = n.title ? 18.37 + LINE + 3.34 : 18.37
    out.noticeH = out.noticeTextY + wrapLines(n.detail, 21.704, 'regular', 694.8).length * 31.47 + 18.37
    h = notice + out.noticeH
  }
  out.h = h
  return out
}

// Server found: its card (two lines of name at most, the chips, the address), the note, then
// Use a different address and Continue at the right.
export const foundRows = (server, t) => {
  const nameLines = server ? Math.min(2, wrapLines(server.name, 30.05, 'bold', 621.5).length) : 1
  const chipsY = nameLines * 35.23
  const addressY = chipsY + 40.04 + 5.01 + 10.02
  const bodyH = addressY + 25.43
  const cardH = Math.max(93.49, bodyH) + 2 * 25.04 + 2
  const note = 77.8 + cardH + 23.37
  const actions = note + 32.72 + 33.39
  const continueW = buttonWidth('primary', t.continue)
  const otherW = buttonWidth('ghost', t.otherAddress)
  return {
    chipsY, addressY, bodyH, cardH, note, actions, continueW, otherW,
    continueX: 789.4 - continueW, otherX: 789.4 - continueW - 16.7 - otherW, h: actions + 80.14,
  }
}

// The panel's height and top, centered in the room above the keyboard when it's up.
export const panelBox = (dialog, keyboardOpen, addrH, foundH) => {
  if (!dialog || dialog.kind !== 'add') return { h: 0, y: 0 }
  let content = 0
  if (dialog.step === 'choose') content = 93.8 + 33.39 + 3 * 125.5 + 2 * 16.7
  else if (dialog.step === 'address') content = addrH
  else if (dialog.step === 'found') content = foundH
  const h = content + 2 * 38.4 + 2
  const room = 1080 - 40.07 - (keyboardOpen ? 601.04 : 40.07)
  const shown = Math.min(h, room)
  return { h: shown, y: 40.07 + (room - shown) / 2 }
}

// Who's watching: the middle is centered between the logo row and the pills. `carouselH` is the
// carousel's height for its items (ProfileCarousel's carouselHeight).
export const usersLayout = (carouselH, s) => {
  const statusH = s.status && !s.dialog ? 33.39 + 77.07 : 0
  const disclaimer = s.server && s.server.loginDisclaimer ? wrapLines(s.server.loginDisclaimer, 20.035, 'regular', 1726.3) : []
  const disclaimerH = disclaimer.length ? 26.71 + disclaimer.length * LINE : 0
  const errorH = s.error ? 26.71 + wrapLines(s.error, 23.374, 'regular', 1726.3).length * LINE : 0
  const content = LINE + 53.43 + carouselH + statusH + disclaimerH + errorH
  const top = 130.2 + 40.07 + (812.9 - 80.14 - content) / 2
  const carouselY = top + LINE + 53.43
  return {
    titleY: top,
    carouselY,
    statusY: carouselY + carouselH + 33.39,
    disclaimerY: carouselY + carouselH + statusH + 26.71,
    disclaimer: disclaimer.join('\n'),
    errorY: carouselY + carouselH + statusH + disclaimerH + 26.71,
  }
}
