import { theme } from '../../theme.js'
import { flatten } from './bookGrid.js'

export const bookLook = () => {
  const t = theme()
  const bg = flatten(t.background)
  return {
    t,
    bg,
    accent: t.accent,
    accentA: t.accentA,
    onAccent: t.onAccent,
    focus: t.focus,
    glow: t.focusGlow,
    os: t.os,
    os06: t.os(0.06),
    os08: t.os(0.08),
    os09: t.os(0.09),
    os12: t.os(0.12),
    os14: t.os(0.14),
    os18: t.os(0.18),
    os35: t.os(0.35),
    os40: t.os(0.4),
    os50: t.os(0.5),
    os60: t.os(0.6),
    os62: t.os(0.62),
    os65: t.os(0.65),
    os68: t.os(0.68),
    os75: t.os(0.75),
    os80: t.os(0.8),
    os90: t.os(0.9),
    accent16: t.accentA(0.16),
    accent45: t.accentA(0.45),
    onSurface: t.onSurface,
    radius: t.cardRadius,
    buttonFocused: t.buttonFocused,
    buttonInk: t.onButtonFocused,
    surface: t.surface,
    surfaceVariant: t.surfaceVariant,
    scrim: t.scrim,
  }
}
