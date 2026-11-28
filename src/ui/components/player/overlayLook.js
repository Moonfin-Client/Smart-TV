// What the playback overlays share: the countdown text, the frosted panel's fill and shadow, and the focus ring
// on buttons filled with the accent.
import { perfTier } from '../../tier.js'
import { glowShadow, rgba, theme } from '../../theme.js'
import { contrastRatio, MIN_BUTTON_CONTRAST } from '../../../theme/themeSpec.js'

export const formatRemaining = (seconds) => {
  const safe = Math.max(0, seconds)
  const rest = String(safe % 60).padStart(2, '0')
  return safe >= 60 ? `${Math.floor(safe / 60)}:${rest}` : `:${rest}`
}

// The theme's surface at 0.88 under a backdrop blur, or 0.97 on the tiers that strip the blur. The canvas
// can't blur the video plane under it, so the high tier gets the tint without the blur.
export const panelFill = (t = theme(), tier = perfTier()) => rgba(t.surface, tier === 'high' ? 0.88 : 0.97)

// A button filled with the accent rings in the focus color where that shows on the accent, and in its
// own ink where it barely does, as on Moonfin and Neon Pulse where the two are the same color.
export const accentButtonFocus = (t = theme()) =>
  contrastRatio(t.focus.slice(0, 7), t.accent.slice(0, 7)) >= MIN_BUTTON_CONTRAST ? t.focus : t.onAccent

// box-shadow: 0 6px 29px, at 0.45 on the skip prompt and the Next Up card and 0.5 on Still Watching.
export const panelShadow = (alpha) => glowShadow({ color: alpha === 0.5 ? '#00000080' : '#00000073', x: 0, y: 6, blur: 29, spread: 0 }).shadow
