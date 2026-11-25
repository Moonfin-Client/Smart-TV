// The active theme as renderer colors ('#rrggbbaa'), resolved from visualTheme or customThemeId, the
// OLED crush, the focus color setting and the navbar color and opacity.
import { resolveThemeById, isBuiltInThemeId, getAvailableThemes, replaceCustomThemes, registerStoreTheme } from '../theme/themeRegistry.js'
import { parseThemeSpec, isValidHexColor, relativeLuminance, contrastRatio, MIN_BUTTON_CONTRAST } from '../theme/themeSpec.js'
import { resolveOverlayColor } from '../theme/overlayColors.js'
import { applyOledMode } from '../utils/oledMode.js'
import { getFromStorage } from '../services/storage.js'
import * as settings from '../state/settings.js'
import { getStore } from '../state/store.js'

import { lc, rgba, shadowColor } from './themeColor.js'

export { lc, rgba, shadowColor }

// Ink for text on a fill, black on a bright one and white on a dim one (themeSpec's inkOn).
const inkOn = (argb, a) => (relativeLuminance(argb) > 0.179 ? rgba('#000000', a) : rgba('#ffffff', a))

const shadows = (list) =>
  (list || []).map((s) => ({ color: lc(s.color), x: s.offsetX || 0, y: s.offsetY || 0, blur: s.blurRadius || 0, spread: s.spreadRadius || 0 }))

export const activeThemeId = (s) => {
  const custom = s.customThemeId
  if (custom && getAvailableThemes()[custom]) return custom
  return isBuiltInThemeId(s.visualTheme) ? s.visualTheme : 'moonfin'
}

let cacheKey = null
let cached = null
let catalog = 0

const build = (s) => {
  const theme = applyOledMode(resolveThemeById(activeThemeId(s)), s.oledMode)
  const c = theme.colors
  const b = theme.borders
  const os = (a) => lc(c.onSurface, a)
  const overlay = resolveOverlayColor(s.navbarColor)
  const navOpacity = (s.navbarOpacity == null ? 50 : s.navbarOpacity) / 100
  const focus = isValidHexColor(s.focusBorderColor) ? lc(s.focusBorderColor) : lc(b.focusBorder.color)
  const buttonInk =
    contrastRatio(c.buttonFocused, c.onButtonFocused) >= MIN_BUTTON_CONTRAST ? lc(c.onButtonFocused) : inkOn(c.buttonFocused, 0.92)
  const cycle = theme.navColorCycle.map((x) => lc(x))
  return {
    id: theme.id,
    isGlass: theme.isGlass,
    isPixel: theme.isPixel,
    fontFamily: theme.fontFamily,
    transparentNavbarSurface: theme.transparentNavbarSurface,
    textGlow: shadows(theme.textGlow),
    oled: s.oledMode === 'subtle' || s.oledMode === 'vivid' ? s.oledMode : '',

    background: lc(c.background),
    onBackground: lc(c.onBackground),
    surface: lc(c.surface),
    onSurface: lc(c.onSurface),
    surfaceVariant: lc(c.surfaceVariant),
    scrim: lc(c.scrim),
    accent: lc(c.accent),
    accentA: (a) => lc(c.accent, a),
    onAccent: lc(c.onAccent),
    // Ink on an accent fill: the theme's onAccent, or black or white where that reads too faintly.
    onAccentInk: contrastRatio(c.accent, c.onAccent) >= MIN_BUTTON_CONTRAST ? lc(c.onAccent) : inkOn(c.accent, 0.92),
    buttonNormal: lc(c.buttonNormal),
    buttonFocused: lc(c.buttonFocused),
    buttonDisabled: lc(c.buttonDisabled),
    buttonActive: lc(c.buttonActive),
    onButtonNormal: lc(c.onButtonNormal),
    onButtonFocused: buttonInk,
    onButtonDisabled: lc(c.onButtonDisabled),
    inputBackground: lc(c.inputBackground),
    inputFocused: lc(c.inputFocused),
    inputBorder: lc(c.inputBorder),
    inputBorderFocused: lc(c.inputBorderFocused),
    rangeTrack: lc(c.rangeTrack),
    rangeProgress: lc(c.rangeProgress),
    rangeThumb: lc(c.rangeThumb),
    seekbarBuffered: lc(c.seekbarBuffered),
    badgeBackground: lc(c.badgeBackground),
    onBadge: lc(c.onBadge),
    badgeUnplayed: lc(c.badgeUnplayed),
    badgeWatched: lc(c.badgeWatched),
    recordingActive: lc(c.recordingActive),
    recordingScheduled: lc(c.recordingScheduled),
    error: lc(c.error || '#FFCF6679'),
    status: {
      available: lc(theme.semantic.statusAvailable),
      requested: lc(theme.semantic.statusRequested),
      pending: lc(theme.semantic.statusPending),
      downloading: lc(theme.semantic.statusDownloading),
      error: lc(theme.semantic.statusError),
      movie: lc(theme.semantic.mediaTypeBadgeMovie),
      show: lc(theme.semantic.mediaTypeBadgeShow),
    },

    textPrimary: lc(c.onBackground),
    textSecondary: os(0.7),
    textMuted: os(0.45),
    os,

    // Focus: the ring color (the Focus Color setting wins over the theme's), its width, and the
    // theme's glow, as a list of { color, x, y, blur, spread } (empty for most themes).
    focus,
    focusWidth: b.focusBorder.width,
    focusGlow: shadows(b.focusGlow),
    cardRadius: b.cardRadius.topLeft,
    chipRadius: b.chipRadius.topLeft,
    chipBackground: lc(b.chipBackground),
    chipBorder: { w: b.chipBorder.width, color: lc(b.chipBorder.color) },
    cardBorder: { w: b.cardBorder.width, color: lc(b.cardBorder.color) },
    navBorder: b.navBorder ? { w: b.navBorder.width, color: lc(b.navBorder.color) } : null,

    // The nav: its overlay fill (the Navbar Color at the Navbar Opacity, which the sidebar rail
    // wears on every theme and the top pill clears for a transparent-nav theme), the resting item
    // color (onSurface at 60 percent, or the theme's per-slot cycle), and the focused fill and ink.
    navOverlay: lc('#FF' + overlay.slice(1), navOpacity),
    navFill: theme.transparentNavbarSurface ? '#00000000' : lc('#FF' + overlay.slice(1), navOpacity),
    navItem: os(0.6),
    navCycle: cycle,
    navSlot: (slot) => (cycle.length ? cycle[(slot - 1) % cycle.length] : os(0.6)),
    navFocusFill: lc(c.onSurface),
    navFocusInk: inkOn(c.onSurface, 0.92),
    navActiveSide: lc(c.accent, 0.24),
    navActiveTop: lc(c.accent, 0.28),
  }
}

// A box-shadow ({ color, x, y, blur, spread }) as the renderer's shadow shader props. The shader fades
// a shadow across the spread box's edge over the blur, within half a percent of Chrome's Gaussian,
// and the patched shader draws none under the node's own box. Put it on a clear node under the box
// it glows around, with the box's own size and radius. A box much smaller than its blur glows a
// little stronger than in CSS. Each comes back as { key, shadow }.
export const glowShadow = (s, i = 0) => ({
  key: `${i}:${s.color}`,
  shadow: { color: shadowColor(s.color), x: s.x, y: s.y, blur: s.blur, spread: s.spread },
})

// The resolved tokens for the current settings, rebuilt only when the settings object changes.
export const theme = () => {
  const s = settings.all()
  if (s !== cacheKey || cached === null || cached._catalog !== catalog) {
    cacheKey = s
    cached = build(s)
    cached._catalog = catalog
  }
  return cached
}

// Theme Store themes and the server's custom themes, from the last sync this device saw.
// shortcut: there's no server theme sync, so a custom theme picked on another client
// shows only once the 'customThemes' cache holds it. Add the fetch with the Moonbase sync.
export const loadSavedThemes = async () => {
  const parse = (stored) => {
    const out = []
    if (!stored || typeof stored !== 'object') return out
    Object.keys(stored).forEach((k) => {
      try {
        out.push(parseThemeSpec(stored[k]))
      } catch (e) {
        // A malformed theme is skipped.
      }
    })
    return out
  }
  const [store, custom] = await Promise.all([getFromStorage('storeThemes').catch(() => null), getFromStorage('customThemes').catch(() => null)])
  parse(store).forEach((spec) => registerStoreTheme(spec))
  const specs = parse(custom)
  if (specs.length) replaceCustomThemes(specs)
  catalog++
  const st = getStore()
  if (st) st.settingsVersion = st.settingsVersion + 1
}

// The classic sidebar's rail, collapsed and open.
export const SIDEBAR_W = 78
export const SIDEBAR_OPEN_W = 280

// Where the nav sits, for pages that offset their content for it:
// - navOnLeft(): the nav is a sidebar, so Left at a page's left edge hands focus to it, and Up at
//   the top edge doesn't. With a top bar it's the other way around.
// - sideNavRoom(): 'rail' for the classic sidebar (a 78px rail down the whole left edge),
//   'control' for Reel and Mosaic (a small control at the top left until they open), null for a
//   top bar. Each page picks its own padding for these.
export const navOnLeft = (s = settings.all()) => s.navbarPosition === 'left'
export const sideNavRoom = (s = settings.all()) => {
  if (s.navbarPosition !== 'left') return null
  return s.sidebarStyle === 'reel' || s.sidebarStyle === 'mosaic' ? 'control' : 'rail'
}

// The default theme's fixed colors, for callers that don't follow the active theme.
export const colors = {
  accent: '#00a4dc',
}
