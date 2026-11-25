// What the playback overlays share: the countdown text, the frosted panel's fill and its shadow.
import { perfTier } from '../../tier.js'
import { glowShadow } from '../../theme.js'

export const formatRemaining = (seconds) => {
  const safe = Math.max(0, seconds)
  const rest = String(safe % 60).padStart(2, '0')
  return safe >= 60 ? `${Math.floor(safe / 60)}:${rest}` : `:${rest}`
}

// rgba(30, 30, 40) at 0.88 under a backdrop blur, or 0.97 on the tiers that strip the blur. The canvas
// can't blur the video plane under it, so the high tier gets the tint without the blur.
export const panelFill = () => (perfTier() === 'high' ? '#1e1e28e0' : '#1e1e28f7')

// box-shadow: 0 6px 29px, at 0.45 on the skip prompt and the Next Up card and 0.5 on Still Watching.
export const panelShadow = (alpha) => glowShadow({ color: alpha === 0.5 ? '#00000080' : '#00000073', x: 0, y: 6, blur: 29, spread: 0 }).shadow
