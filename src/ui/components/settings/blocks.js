// Builders for the parts of a settings screen that aren't rows, as entries for layoutRows.
// SettingsBlock draws them.
import $L from '../../../services/i18n.js'
import { dp, textWidth } from './look.js'
import { COLUMN_W } from './layoutRows.js'

const BTN_H = dp(40)

// A button's width: its label and padding, with wider padding on the filled primary one.
const buttonWidth = (b) => textWidth(b.label, dp(14), 'medium', dp(0.1)) + 2 * (b.primary ? dp(24) : dp(12)) + 2

// The buttons an editor ends on: right-aligned, 8 units apart, padded 8 16 16.
// Each button is {sid, label, primary, disabled, press(page)}. A disabled one can't take focus.
export const buttonsBlock = (k, buttons, options = {}) => {
  const padTop = options.padTop == null ? dp(8) : options.padTop
  const padBottom = options.padBottom == null ? dp(16) : options.padBottom
  const padX = options.padX == null ? dp(16) : options.padX
  const gap = options.gap == null ? dp(8) : options.gap
  const widths = buttons.map(buttonWidth)
  const total = widths.reduce((a, w) => a + w, 0) + gap * Math.max(0, buttons.length - 1)
  let x = options.align === 'start' ? padX : options.align === 'center' ? (COLUMN_W - total) / 2 : COLUMN_W - padX - total
  const placed = buttons.map((b, i) => {
    const out = { ...b, k: b.sid, x, y: padTop, w: widths[i], h: BTN_H }
    x += widths[i] + gap
    return out
  })
  return {
    type: 'block',
    block: 'buttons',
    k,
    h: padTop + BTN_H + padBottom,
    buttons: placed,
    // A disabled button can't be moved onto, but one that's [busy] keeps the focus it already had.
    stops: placed.filter((b) => !b.disabled || b.busy).map((b) => ({ sid: b.sid, x: b.x, y: b.y, w: b.w, h: b.h, press: b.disabled ? null : b.press })),
  }
}

// A labeled field. Enter opens the keyboard on it. [secret] draws dots, [onLive] hears every
// change and [onDone] the submitted text.
export const inputBlock = (k, { sid, label, value, placeholder, secret, purpose, maxLength, onDone, onLive }) => {
  const labelH = label ? 33 + dp(8) : 0
  // The input inside takes the app's 33px line rather than its font's.
  const fieldH = 2 * dp(12) + 33
  const y = dp(8) + labelH
  return {
    type: 'block',
    block: 'input',
    k,
    h: dp(8) + labelH + fieldH + dp(8) + dp(8),
    label: label || '',
    value: value || '',
    shown: value ? (secret ? '•'.repeat(String(value).length) : String(value)) : placeholder || '',
    empty: !value,
    sid,
    fieldY: y,
    fieldH,
    stops: [
      {
        sid,
        x: dp(16),
        y,
        w: COLUMN_W - 2 * dp(16),
        h: fieldH,
        press: (page) => page.openKeyboard({ value: value || '', secret, purpose: purpose || (secret ? 'password' : 'text'), maxLength, live: onLive, done: onDone }),
      },
    ],
  }
}

// The drawer's search field: a pill 48 units tall in 8 by 16 of padding.
// Enter opens the keyboard on it, and [live] hears the query as it's typed.
export const searchBlock = (k, { sid, value, live }) => ({
  type: 'block',
  block: 'search',
  k,
  h: dp(64),
  sid,
  value: value || '',
  shown: value || $L('Search settings'),
  stops: [
    {
      sid,
      x: dp(16),
      y: dp(8),
      w: COLUMN_W - 2 * dp(16),
      h: dp(48),
      press: (page) => page.openKeyboard({ value: value || '', purpose: 'text', live, done: live }),
    },
  ],
})

// The spinner a screen shows while it loads, 24px above and below.
export const spinnerBlock = (k) => ({ type: 'block', block: 'spinner', k, h: 24 + 72 + 24 })

export const cancelSave = (k, { cancelSid, saveSid, saveLabel, onCancel, onSave, saveDisabled, saveBusy }) =>
  buttonsBlock(k, [
    { sid: cancelSid, label: $L('Cancel'), press: onCancel },
    { sid: saveSid, label: saveLabel || $L('Save'), primary: true, press: onSave, disabled: saveDisabled || saveBusy, busy: saveBusy },
  ])
