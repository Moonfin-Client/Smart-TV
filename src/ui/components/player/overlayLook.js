// What the playback overlays share: the countdown text, the frosted panel's fill and its shadow.
import { perfTier } from '../../tier.js'
import { glowShadow, theme } from '../../theme.js'

export const formatRemaining = (seconds) => {
  const safe = Math.max(0, seconds)
  const rest = String(safe % 60).padStart(2, '0')
  return safe >= 60 ? `${Math.floor(safe / 60)}:${rest}` : `:${rest}`
}

// The theme's surface at 0.88 under a backdrop blur, or 0.97 on the tiers that strip the blur. The canvas
// can't blur the video plane under it, so the high tier gets the tint without the blur.
export const panelFill = (t = theme(), tier = perfTier()) => t.surface.slice(0, 7) + (tier === 'high' ? 'e0' : 'f7')

// The prompts' colors from the theme: text in onSurface, the icons, rings and filled buttons in the
// accent with onAccent ink on them, and focus borders in the focus color. A button filled with the
// accent takes its ink as the border when the focus color is that same accent (Moonfin and Neon
// Pulse ship that way), so focus still shows.
export const promptColors = (t = theme()) => ({
  text: t.onSurface,
  os: t.os,
  accent: t.accent,
  accentA: t.accentA,
  onAccent: t.onAccentInk,
  onAccentA: (a) => t.onAccentInk.slice(0, 7) + Math.round(a * 255).toString(16).padStart(2, '0'),
  focus: t.focus,
  accentButtonFocus: t.focus.slice(0, 7) === t.accent.slice(0, 7) ? t.onAccentInk : t.focus,
})

// box-shadow: 0 6px 29px, at 0.45 on the skip prompt and the Next Up card and 0.5 on Still Watching.
export const panelShadow = (alpha) => glowShadow({ color: alpha === 0.5 ? '#00000080' : '#00000073', x: 0, y: 6, blur: 29, spread: 0 }).shadow
