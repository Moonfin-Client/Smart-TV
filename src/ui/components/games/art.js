// Game art colors as hex, since the renderer takes no hsl().
import { gameFallbackColor } from '../../../utils/gameArt.js'
import { hex2 } from '../../themeColor.js'

export const hslToHex = (h, s, l) => {
  const a = s * Math.min(l, 1 - l)
  const f = (n) => {
    const k = (n + h / 30) % 12
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return '#' + hex2(f(0) * 255) + hex2(f(8) * 255) + hex2(f(4) * 255)
}

// The seeded placeholder color behind a cover, as hex.
export const fallbackHex = (seed) => {
  const m = /hsl\((\d+), (\d+)%, (\d+)%\)/.exec(gameFallbackColor(seed))
  return m ? hslToHex(+m[1], m[2] / 100, m[3] / 100) : '#26262b'
}
