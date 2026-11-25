// The settings colors for the active theme, kept apart from look.js so the layout math runs
// without a theme.
import { theme, glowShadow } from '../../theme.js'
import { relativeLuminance } from '../../../theme/themeSpec.js'
import { DP, dp, withAlpha, mulAlpha, alphaOf, over } from './look.js'

// theme() tracks the settings, so a memo over this restyles on a theme change.
let cacheTheme = null
let cached = null
export const palette = () => {
  const t = theme()
  if (t === cacheTheme && cached) return cached
  cacheTheme = t
  const ink = relativeLuminance('#' + 'FF' + t.buttonFocused.slice(1, 7)) > 0.179 ? '#000000' : '#ffffff'
  // A theme with an invisible card border still gets a faint tile outline.
  const tileBorder = alphaOf(t.cardBorder.color) === 0 ? t.os(0.16) : mulAlpha(t.cardBorder.color, 0.55)
  // The renderer takes CSS's box-shadow values as they are (glowShadow), each as { key, shadow }.
  const glow = (t.focusGlow.length ? t.focusGlow : [{ color: withAlpha(t.accent, 0.22), x: 0, y: 0, blur: 28.7, spread: 0.83 }]).map(glowShadow)
  // The settings screens stack three layers of the background over the column's #161616.
  const column = '#161616ff'
  const page = over(t.background, column)
  const view = over(t.background, page)
  const bar = over(t.background, view)
  cached = {
    t,
    accent: t.accent,
    accentA: t.accentA,
    onSurface: t.onSurface,
    os: t.os,
    surface: t.surface,
    surfaceVariant: t.surfaceVariant,
    panel: '#101010ff',
    column,
    page,
    view,
    bar,
    tileFill: withAlpha(t.surface, 0.82),
    tileBorder,
    tileFocusFill: t.buttonFocused,
    tileFocusBorder: withAlpha(t.accent, 0.72),
    tileGlow: glow,
    strong: withAlpha(ink, 0.87),
    soft: withAlpha(ink, 0.54),
    ink,
    caption: t.os(0.7),
    glyph: t.os(0.78),
    iconFill: withAlpha(t.accent, 0.14),
    iconBorder: withAlpha(t.accent, 0.42),
    iconFocusFill: withAlpha(t.accent, 0.22),
    iconFocusBorder: withAlpha(t.accent, 0.64),
    bubbleFill: withAlpha(t.accent, 0.1),
    bubbleBorder: withAlpha(t.accent, 0.35),
    bubbleFocusFill: withAlpha(ink, 0.12),
    bubbleFocusBorder: withAlpha(ink, 0.35),
    trackOff: t.surfaceVariant,
    trackOffBorder: t.onSurface,
    thumbOff: t.onSurface,
    thumbOn: t.onAccent,
    rangeTrack: t.rangeTrack,
    rangeProgress: t.rangeProgress,
    rangeThumb: t.rangeThumb,
    tick: t.os(0.38),
    faint: t.os(0.38),
    os45: t.os(0.45),
    os65: t.os(0.65),
    os55: t.os(0.55),
    accentTen: withAlpha(t.accent, 0.1),
    accentFourteen: withAlpha(t.accent, 0.14),
    inkSeventy: withAlpha(ink, 0.7),
    inkThirtyTwo: withAlpha(ink, 0.32),
    os60: t.os(0.6),
    inkSix: withAlpha(ink, 0.06),
    inkTwenty: withAlpha(ink, 0.2),
    onAccent: t.onAccent,
    plainFocus: withAlpha(t.accent, 0.18),
    barTint: withAlpha(t.accent, 0.08),
    tone: { caption: t.os(0.7), error: t.error, muted: t.os(0.45), strong: t.onSurface },
    divider: t.os(0.12),
    dialog: withAlpha(t.surface, 1),
    // Pickers take the theme's dialog shape: Glass rounds them to 20 units with a faint edge.
    dialogRadius: t.isGlass ? dp(20) : t.isPixel ? 0 : dp(16),
    dialogBorder: t.isGlass ? { w: DP, color: '#ffffff33' } : t.isPixel ? { w: 2 * DP, color: t.surfaceVariant } : null,
    swatchRingW: Math.max(1, Math.round(t.chipBorder.w * DP)),
    swatchRing: t.chipBorder.color,
    error: t.error,
    buttonNormal: t.buttonNormal,
    onButtonNormal: t.onButtonNormal,
    onButtonFocused: t.onButtonFocused,
  }
  return cached
}

