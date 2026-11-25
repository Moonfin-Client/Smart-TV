import { textWidth as faceWidth } from '../details/measure.js'
import { hex } from '../../themeColor.js'
// Each preview scene lays out a miniature screen at 960 by 540, half the TV's 1920 by 1080, and the
// stage scales it into its frame, so the measures inside are the real screen's halved.
export const DESIGN_W = 960
// Home rows render below their desktop size on a TV, and the previews keep that factor.
export const ROW_SCALE = 0.8
export const ROW_LEFT_INSET = 80

// The media pills Home's Carousel panel shows for the details previews' sample film.
export const SAMPLE_PILLS = ['4K', 'HDR10', 'HEVC', 'EAC3', '5.1']

export const itemAt = (items, index) => items[index % items.length]

export const runtimeText = (minutes) => {
  if (!minutes) return ''
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`
}

export const metaParts = (item) => {
  const parts = []
  if (item.year) parts.push(String(item.year))
  if (item.officialRating) parts.push(item.officialRating)
  if (item.runtimeMinutes) parts.push(runtimeText(item.runtimeMinutes))
  if (item.genres.length > 0) parts.push(item.genres.slice(0, 3).join(' • '))
  return parts
}

// Missing artwork shows as a box in onSurface at 10 percent.
export const artColor = (url, t) => (url ? '#ffffffff' : t.onSurfaceA(0.1))

// How many lines [text] takes at [width], breaking at spaces as CSS does, measured in the face it
// draws in (ui/text.js), so a theme's own face wraps where it really breaks.
export const lineCount = (text, size, weight, width, spacing = 0) => {
  const str = String(text == null ? '' : text)
  if (!str) return 0
  const w = (s) => faceWidth(s, size, weight, spacing)
  if (w(str) <= width) return 1
  let lines = 1
  let line = ''
  str.split(' ').forEach((word) => {
    const next = line ? line + ' ' + word : word
    if (line && w(next) > width) {
      lines++
      line = word
    } else line = next
  })
  return lines
}

// A palette border ({ w, color }) as the renderer's, or none at 0 wide.
export const borderOf = (b) => (b && b.w ? { width: b.w, color: hex(b.color) } : undefined)

// Cover fit, centered or at a focal point.
export const COVER = { resizeMode: { type: 'cover' } }
export const coverAt = (x, y) => ({ resizeMode: { type: 'cover', clipX: x, clipY: y } })
export const CONTAIN = { resizeMode: { type: 'contain' } }
