// What Home's rows look like for the current settings, theme and platform, in pixels and colors.
import { navOnLeft, theme, rgba } from '../../theme.js'
import { getPlatform } from '../../../platform.js'
import { getPerfTier } from '../../../utils/perfTier.js'
import { homeRowSpacing } from './modernCardLayout.js'
import { cssStops } from '../account/gradient.js'
import { hex } from '../../color.js'
import { over } from './barMath.js'

// An opaque color seen through a translucent one laid over it ('#rrggbbaa').
const overScrim = (base, top) => over(base, top, top.length > 7 ? parseInt(top.slice(7, 9), 16) / 255 : 1)

export const homeLook = (s) => {
  const t = theme()
  const platform = getPlatform()
  const tier = getPerfTier()
  // Home has only the sidebar's offset and the top bar's, and Reel and Mosaic take the sidebar's.
  const left = navOnLeft(s)
  const style = s.homeRowsStyle === 'v1' ? 'classic' : s.homeRowsStyle === 'carousel' ? 'carousel' : 'modern'
  const neon = t.id === 'neon_pulse'
  // A modern card's open speeds. The lower tiers open it at once.
  const openMs = tier === 'high' ? { extraSlow: 450, slow: 300, medium: 180, fast: 90 }[s.modernCardTransitionSpeed] || 0 : 0
  return {
    style,
    platform,
    tier,
    left,
    // The rows scroller starts 50px in beside the sidebar, and its rows pad 60px more.
    clipX: left ? 50 : 0,
    pad: 60,
    inset: (left ? 50 : 0) + 60,
    viewW: 1920 - (left ? 50 : 0),
    zoom: s.cardFocusZoom === true,
    openMs,
    overlay: style === 'classic' && s.homeRowOverlay !== false,
    spacing: homeRowSpacing(s),
    posterSize: s.homeRowsPosterSize,
    hideProgress: s.hideHomeWatchProgress === true,
    hideCount: s.hideHomeUnwatchedCount === true,
    hideOverview: s.hideHomeMediaDescription === true,
    modernTitleSize: platform === 'webos' ? 29 : platform === 'tizen' ? 26 : 28,
    modernItemsBottom: platform === 'tizen' ? 20 : 24,
    modernCardTitle: platform === 'tizen' ? 22 : 24,
    // On webOS a modern card's art rounds 2px more than the theme says.
    modernRadius: t.cardRadius + (platform === 'webos' ? 2 : 0),
    classicRadius: t.cardRadius,
    border: t.cardBorder,
    focus: t.focus,
    panelShadow: tier === 'high',
    // Only the high tier fades the classic image's border color in.
    borderMs: tier === 'low' || tier === 'mid' ? 0 : 200,
    progressBg: rgba(t.scrim, 0.54),
    accent: t.accent,
    watched: t.badgeWatched,
    unplayed: t.badgeUnplayed,
    fav: t.recordingActive,
    onBadge: t.onBadge,
    surface: t.surface,
    onSurface: t.onSurface,
    title: neon ? t.accent : t.onSurface,
    secondary: neon ? t.onSurface : t.os(0.6),
    classicSecondary: neon ? t.onSurface : t.os(0.65),
    overview: neon ? t.onSurface : t.os(0.7),
    rowSubtitle: t.os(0.95),
    placeholder: t.surfaceVariant,
    placeholderTint: t.accentA(0.25),
    // The cards' placeholder wash, linear-gradient(135deg, accent 25%, accent 5% at 50%, transparent)
    // over the surface color, in the renderer's angle (CSS's plus 180 degrees).
    placeholderWash: { angle: ((135 + 180) * Math.PI) / 180, ...cssStops([hex(t.accentA(0.25)), hex(t.accentA(0.05)), 0], [0, 0.5, 1]) },
    skeleton: t.isGlass ? '#ffffff29' : t.os(0.14),
    background: t.background.slice(0, 7) + 'ff',
    scrim: t.scrim,
    // The page color under the scrim, as one opaque color.
    holeCorner: overScrim(t.background.slice(0, 7), t.scrim),
  }
}

export { rowBox, placeholderCard } from './rowLayout.js'
