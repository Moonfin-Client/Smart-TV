// The colors every preview draws with, read from the settings being looked at (a picker's tried
// value included), as '#rrggbbaa'. Radii are [topLeft, topRight, bottomRight, bottomLeft] for `rounded`.
import { resolveThemeById } from '../../../theme/themeRegistry.js'
import { isValidHexColor } from '../../../theme/themeSpec.js'
import { makdTint, resolveOverlayColor } from '../../../theme/overlayColors.js'
import { applyOledMode } from '../../../utils/oledMode.js'
import { activeThemeId } from '../../theme.js'
import { lc, hex2 } from '../../themeColor.js'

// The color's own alpha is dropped for [a].
const withAlpha = (hex, a) => lc(hex).slice(0, 7) + hex2(Math.round(a * 1000) / 1000 * 255)

const corners = (r) => (r ? [r.topLeft, r.topRight, r.bottomRight, r.bottomLeft] : [0, 0, 0, 0])

let lastKey = null
let last = null

export const previewPalette = (s) => {
  const id = activeThemeId(s)
  const key = [id, s.oledMode, s.focusBorderColor, s.mediaBarOverlayColor, s.mediaBarOverlayOpacity, s.navbarColor, s.navbarOpacity].join('|')
  if (key === lastKey && last) return last
  const theme = applyOledMode(resolveThemeById(id), s.oledMode)
  const c = theme.colors
  const b = theme.borders
  const overlayHex = resolveOverlayColor(s.mediaBarOverlayColor) || '#6B7280'
  const overlayOpacity = Math.min(100, Math.max(0, Number(s.mediaBarOverlayOpacity != null ? s.mediaBarOverlayOpacity : 50))) / 100
  const navbarHex = resolveOverlayColor(s.navbarColor) || '#6B7280'
  const navbarOpacity = Math.min(100, Math.max(0, Number(s.navbarOpacity != null ? s.navbarOpacity : 50))) / 100
  const navbarOverlay = withAlpha(navbarHex, navbarOpacity)
  const cycle = theme.navColorCycle || []
  const radius = corners(b.cardRadius)
  last = {
    themeId: theme.id,
    background: lc(c.background),
    surface: lc(c.surface),
    onSurface: lc(c.onSurface),
    accent: lc(c.accent),
    onAccent: lc(c.onAccent),
    scrim: lc(c.scrim),
    badgeWatched: lc(c.badgeWatched),
    onBadge: lc(c.onBadge),
    onSurfaceA: (a) => withAlpha(c.onSurface, a),
    accentA: (a) => withAlpha(c.accent, a),
    scrimA: (a) => withAlpha(c.scrim, a),
    backgroundA: (a) => withAlpha(c.background, a),
    surfaceA: (a) => withAlpha(c.surface, a),
    overlayA: (a) => withAlpha(overlayHex, a * overlayOpacity),
    makdA: (a) => withAlpha(makdTint(overlayHex), a * overlayOpacity),
    // The rail wears the navbar color on every theme, and only the top bar clears it for a theme
    // asking for a transparent nav surface.
    navbarRail: navbarOverlay,
    navbarSurface: theme.transparentNavbarSurface ? '#00000000' : navbarOverlay,
    navBorder: b.navBorder ? { w: b.navBorder.width, color: lc(b.navBorder.color) } : null,
    navColorForSlot: (slot) => (cycle.length > 0 ? lc(cycle[slot % cycle.length]) : null),
    cardRadius: radius,
    cardRadiusRing: b.cardRadius ? radius.map((r) => r + 3.5) : [3.5, 3.5, 3.5, 3.5],
    chipBorder: { w: b.chipBorder.width, color: lc(b.chipBorder.color) },
    cardBorder: { w: b.cardBorder.width, color: lc(b.cardBorder.color) },
    focusBorderColor: lc(isValidHexColor(s.focusBorderColor) ? s.focusBorderColor : b.focusBorder.color),
  }
  lastKey = key
  return last
}
