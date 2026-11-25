import { activeThemeId, theme } from '../../theme.js'
import { cssShift, displayFont, fontFor, textWidth as uiWidth, themeSpacing } from '../../text.js'
import { BUBBLE, textWidth } from './look.js'
import * as settings from '../../../state/settings.js'
import { rowFont } from './rowFont.js'

// The faces a settings screen sets its text in under the active theme. The rows stay in Roboto
// (rowFont.js). A theme with a face of its own puts its display face on a screen's title and its
// body face on the section titles and value bubbles, and a clean screen sets those in NotoSans
// instead. Neon Pulse's title also takes its glow, and a pixel theme shrinks the text to 60
// percent in the same line boxes. Sizes here are in px.

// The shift that keeps text of [size] in [font] in the line box laid out for [base] px Roboto.
export const reDy = (base, size, font) => cssShift(size, font) - cssShift(base, 'roboto')

export const settingsFaces = (clean) => {
  const t = theme()
  const themed = !!t.fontFamily && !clean
  const neon = activeThemeId(settings.all()) === 'neon_pulse'
  const px = t.isPixel ? 0.6 : 1
  const glow = neon && t.textGlow.length ? t.textGlow.map((g) => ({ color: g.color, x: g.x, y: g.y, blur: g.blur })) : undefined
  const noto = (text) => (rowFont(text) === 'roboto-web' ? 'noto-sans-web' : 'noto-sans')
  const titleFace = (text) => (clean ? noto(text) : themed && rowFont(text) === 'roboto' ? displayFont(neon ? 'bold' : 'regular') : rowFont(text))
  const bodyFace = (text) => (themed ? fontFor(text, 'bold') : rowFont(text, 'bold'))
  const titleSize = 36.73 * px
  const sectionSize = 20.03 * px
  const bubbleSize = 18.37 * px
  return {
    title: titleFace,
    titleSize,
    titleDy: reDy(36.73, titleSize, titleFace('')),
    titleSpacing: neon && !clean ? 0.4 : 0,
    titleShadow: clean ? undefined : glow,
    // The title stays onSurface under every theme, and only the glow changes.
    titleColor: null,
    section: bodyFace(''),
    sectionSize,
    sectionLH: 28.65,
    sectionSpacing: themed && neon ? 0.6 : 2,
    sectionDy: reDy(20.03, sectionSize, bodyFace('')),
    bubble: bodyFace,
    bubbleSize,
    bubbleSpacing: themed && neon ? 0.6 : 0.83,
    bubbleDy: (text) => reDy(18.37, bubbleSize, bodyFace(text)),
  }
}

// A picker's title takes the theme's display face, and a checklist's stays in Roboto. Both glow
// in Neon Pulse's accent. [size] is the Roboto size.
const titleLook = (text, size, themedFace) => {
  const t = theme()
  const neon = activeThemeId(settings.all()) === 'neon_pulse'
  const font = themedFace && t.fontFamily && rowFont(text, 'bold') === 'roboto-bold' ? displayFont('bold') : rowFont(text, 'bold')
  const sized = themedFace && t.isPixel ? size * 0.6 : size
  const glow = neon && t.textGlow.length
  return {
    font,
    size: sized,
    dy: reDy(size, sized, font),
    spacing: glow ? 0.4 : 0,
    shadow: glow ? t.textGlow.map((g) => ({ color: g.color, x: g.x, y: g.y, blur: g.blur })) : undefined,
    color: glow ? t.accent : null,
  }
}
export const dialogTitleLook = (text) => titleLook(text, 30.05, true)
export const checklistTitleLook = (text) => titleLook(text, 30.05, false)

// What layoutRows needs of the theme (its [look]): the pixel theme's text scale, and a value
// bubble's width in the face it's drawn in. Null for the stock look.
export const rowLook = (clean) => {
  const t = theme()
  const themed = !!t.fontFamily && !clean
  const px = t.isPixel ? 0.6 : 1
  if (px === 1 && !themed) return null
  const size = BUBBLE.size * px
  return {
    px,
    // Neon Pulse's face brings its own spacing, the others keep the bubble's.
    bubble: {
      width: (text) =>
        themed ? uiWidth(text, size, 'bold') + (themeSpacing() ? 0 : BUBBLE.spacing * String(text).length) : textWidth(text, size, 'bold', BUBBLE.spacing),
    },
  }
}
