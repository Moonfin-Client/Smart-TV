// The sign-in screens' sizes at 1920x1080 (dp x 1.66957), for the components and the page.
import { textWidth } from './look.js'

// Each button kind: height, corner radius, label size and line height, side padding, the least
// width, label weight, focus ring width and spinner size.
export const BUTTONS = {
  outline: { h: 78.79, r: 40.07, size: 23.374, lh: 33.391, pad: 38.4, min: 0, weight: 'medium', ring: 2.67, icon: 0, spin: 33.39 },
  action: { h: 75.46, r: 40.07, size: 23.374, lh: 33.391, pad: 13.36, min: 0, weight: 'medium', ring: 2.67, icon: 0, spin: 33.39 },
  toggle: { h: 72.12, r: 40.07, size: 23.374, lh: 33.391, pad: 31.72, min: 200.35, weight: 'medium', ring: 2.67, icon: 0, spin: 33.39 },
  primary: { h: 80.14, r: 23.37, size: 25.044, lh: 29.35, pad: 33.39, min: 0, weight: 'bold', ring: 3.34, icon: 0, spin: 30.05 },
  ghost: { h: 80.14, r: 23.37, size: 25.044, lh: 29.35, pad: 30.05, min: 0, weight: 'medium', ring: 3.34, icon: 0, spin: 30.05 },
  round: { h: 66.78, r: 33.39, size: 0, lh: 0, pad: 0, min: 66.78, weight: 'medium', ring: 3.34, icon: 30.05, spin: 0 },
}

export const buttonWidth = (kind, label) => {
  const k = BUTTONS[kind] || BUTTONS.outline
  if (kind === 'round') return k.min
  const border = kind === 'outline' || kind === 'toggle' || kind === 'action' ? 2 : 0
  return Math.max(k.min, border + 2 * k.pad + textWidth(label, k.size, k.weight))
}

// A centered row of buttons, 12dp apart.
const WRAP_GAP = 20.03
export const wrapRow = (items, centerX) => {
  const total = items.reduce((sum, b) => sum + b.w, 0) + Math.max(0, items.length - 1) * WRAP_GAP
  let x = centerX - total / 2
  return items.map((b) => {
    const out = { ...b, x }
    x += b.w + WRAP_GAP
    return out
  })
}

// The field looks LoginField draws: corner radius, padding, text size and line height, the
// address globe's room, and the resting border.
export const FIELD_LOOKS = {
  login: { r: 20.03, padX: 26.71, padY: 26.71, size: 26.71, lh: 33, icon: 0, spacing: 0, focusable: true, rest: '#ffffff1a' },
  address: { r: 26.71, padX: 26.71, padY: 26.71, size: 26.71, lh: 33, icon: 70.12, spacing: 0, focusable: true, rest: '#ffffff1f' },
  pin: { r: 24, padX: 24, padY: 21.6, size: 48, lh: 57, icon: 0, spacing: 0, caretSpacing: 9.6, focusable: false, rest: '#ffffff33' },
}

// Focus thickens the border from 1 to 4 px, which makes the field 6 px taller.
export const fieldHeight = (look, focused) => {
  const l = FIELD_LOOKS[look] || FIELD_LOOKS.login
  const border = l.focusable && focused ? 4 : 1
  return 2 * border + 2 * l.padY + l.lh
}
