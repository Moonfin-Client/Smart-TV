// Values shared by the sign-in screens, the account switcher, the PIN gate and the keyboard, at
// 1920x1080, where one design point is 1.66957 px. Text in these screens sits 0.0918 x its size
// lower than the renderer puts it: the renderer centers Roboto's 1 em typo box in the line height,
// where CSS centers its 1.17 em hhea box.
import { resolveThemeById } from '../../../theme/themeRegistry.js'
import { contrastRatio, inkOn, MIN_BUTTON_CONTRAST } from '../../../theme/themeSpec.js'
import { applyOledMode } from '../../../utils/oledMode.js'
import { activeThemeId, lc } from '../../theme.js'
import * as settings from '../../../state/settings.js'
import { tier } from '../../tier.js'
import { faceDy, textWidth as baseTextWidth } from '../../text.js'

export const DP = 1.66957

// The legacy tier drops the carousel slide, the pill fades and the keyboard glows.
export const motion = !tier.legacy
export const glows = !tier.legacy

// The active theme's raw colors (#AARRGGBB), with OLED mode applied.
export const rawTheme = () => {
  const s = settings.all()
  return applyOledMode(resolveThemeById(activeThemeId(s)), s.oledMode)
}

// The Switch User screen's colors: the theme accent, white or the theme's own onSurface on the
// dark scrim, and a badge ink that reads on the accent.
export const switcherColors = () => {
  const c = rawTheme().colors
  const base = inkOn(c.onSurface) === '0, 0, 0' ? lc(c.onSurface) : '#ffffff'
  const badgeInk = contrastRatio(c.accent, c.onAccent) >= MIN_BUTTON_CONTRAST
    ? lc(c.onAccent)
    : (inkOn(c.accent) === '0, 0, 0' ? '#000000eb' : '#ffffffeb')
  return { accent: lc(c.accent), base: base.slice(0, 7), badgeInk }
}

// The sign-in screens aren't themed.
const LOGIN_ACCENT = '#00a4dc'
export const loginColors = () => ({ accent: LOGIN_ACCENT, base: '#ffffff', badgeInk: '#04131a' })

// One line's width from ui/text.js, an estimate until textReady() resolves.
export const textWidth = (str, size, weight = 'regular', spacing = 0) =>
  baseTextWidth(str, size, weight) + spacing * String(str || '').length

// Where a paragraph breaks into lines at a width.
export const wrapLines = (str, size, weight, maxW) => {
  const words = String(str || '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word
    if (line && textWidth(next, size, weight) > maxW) {
      lines.push(line)
      line = word
    } else line = next
  })
  if (line) lines.push(line)
  return lines
}

export { cssStops } from './gradient.js'

// A theme with a face of its own (8-bit Hero, Neon Pulse) sets these screens in that face. Text
// placed for Roboto moves by the face's own line box, and Neon Pulse's body face carries 0.6px of
// letter spacing. Both are zero for Roboto.
export const themeDy = (size, font) => faceDy(size, false, font)
export const spacingFor = (font) => (/^neon-/.test(String(font || '')) ? 0.6 : 0)
