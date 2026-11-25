// The page color as it shows, as one opaque color, for BackdropLayer's fades. App paints html and
// body in the theme's background, so a see-through one (Glass's is 80%) shows twice over the
// browser's white.
import { hex2 } from '../../themeColor.js'

export const shownColor = (hex) => {
  const v = hex.replace('#', '')
  const a = v.length > 6 ? parseInt(v.slice(6, 8), 16) / 255 : 1
  const ch = (i) => {
    const c = parseInt(v.slice(i, i + 2), 16)
    return hex2(c * a + (c * a + 255 * (1 - a)) * (1 - a))
  }
  return '#' + ch(0) + ch(2) + ch(4) + 'ff'
}
