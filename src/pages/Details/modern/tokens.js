// The theme colors the details screens use, with the alpha variants they need.
import { theme } from '../../../ui/theme.js'

const withAlpha = (color, a) => color.slice(0, 7) + Math.max(0, Math.min(255, Math.round(a * 255))).toString(16).padStart(2, '0')

export const detailTokens = () => {
  const t = theme()
  return {
    accent: t.accent,
    onAccent: t.onAccent,
    focus: t.focus,
    os: t.os,
    onSurface: t.onSurface,
    onBackground: t.onBackground,
    buttonFocused: t.buttonFocused,
    onButtonFocused: t.onButtonFocused,
    badgeWatched: t.badgeWatched,
    onBadge: t.onBadge,
    scrimA: (a) => withAlpha(t.scrim, a),
    surfaceA: (a) => withAlpha(t.surface, a),
    accentA: (a) => withAlpha(t.accent, a),
    focusA: (a) => withAlpha(t.focus, a),
    // The current episode's ring keeps this blue in every theme.
    accentRing: '#00a4dcb3',
    isPixel: t.isPixel,
    isGlass: t.isGlass,
  }
}
