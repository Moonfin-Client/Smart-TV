// Every face the app draws in: SDF (MSDF) faces for Latin text and canvas ('web') twins of the same
// files for anything their atlas lacks (ui/text.js picks). Names are the family names text props
// use (fontFamily="roboto-medium"). `theme` marks an atlas only that theme uses.
import { assetUrl } from '../utils/assetUrl.js'
export const FONTS = [
  { family: 'roboto', type: 'msdf', file: 'fonts/Roboto-Regular.ttf' },
  { family: 'roboto-medium', type: 'msdf', file: 'fonts/Roboto-Medium.ttf' },
  { family: 'roboto-bold', type: 'msdf', file: 'fonts/Roboto-Bold.ttf' },
  { family: 'roboto-web', type: 'web', file: 'fonts/Roboto-Regular.ttf' },
  { family: 'roboto-medium-web', type: 'web', file: 'fonts/Roboto-Medium.ttf' },
  { family: 'roboto-bold-web', type: 'web', file: 'fonts/Roboto-Bold.ttf' },
  // The MakD media bar's faces, Archivo Narrow cut from its variable font.
  { family: 'archivo-narrow', type: 'msdf', file: 'fonts/ArchivoNarrow-Regular.ttf' },
  { family: 'archivo-narrow-medium', type: 'msdf', file: 'fonts/ArchivoNarrow-Medium.ttf' },
  { family: 'archivo-narrow-semibold', type: 'msdf', file: 'fonts/ArchivoNarrow-SemiBold.ttf' },
  { family: 'archivo-narrow-bold', type: 'msdf', file: 'fonts/ArchivoNarrow-Bold.ttf' },
  { family: 'noto-sans', type: 'msdf', file: 'fonts/NotoSans-Regular.ttf' },
  { family: 'archivo-narrow-web', type: 'web', file: 'fonts/ArchivoNarrow-Regular.ttf' },
  { family: 'archivo-narrow-medium-web', type: 'web', file: 'fonts/ArchivoNarrow-Medium.ttf' },
  { family: 'archivo-narrow-semibold-web', type: 'web', file: 'fonts/ArchivoNarrow-SemiBold.ttf' },
  { family: 'archivo-narrow-bold-web', type: 'web', file: 'fonts/ArchivoNarrow-Bold.ttf' },
  { family: 'noto-sans-web', type: 'web', file: 'fonts/NotoSans-Regular.ttf' },
  // The built-in themes' faces: Neon Pulse's body (Rajdhani) and display (Orbitron), and 8-bit
  // Hero's Press Start 2P.
  { family: 'neon-body', type: 'msdf', file: 'fonts/Rajdhani-Regular.ttf', theme: 'neon_pulse' },
  { family: 'neon-body-bold', type: 'msdf', file: 'fonts/Rajdhani-Bold.ttf', theme: 'neon_pulse' },
  { family: 'neon-display', type: 'msdf', file: 'fonts/Orbitron-Regular.ttf', theme: 'neon_pulse' },
  { family: 'neon-display-bold', type: 'msdf', file: 'fonts/Orbitron-Bold.ttf', theme: 'neon_pulse' },
  { family: 'eightbit', type: 'msdf', file: 'fonts/PressStart2P-Regular.ttf', theme: '8bit_hero' },
  // Their canvas twins, for text their atlases can't cover (ui/text.js picks).
  { family: 'neon-body-web', type: 'web', file: 'fonts/Rajdhani-Regular.ttf' },
  { family: 'neon-body-bold-web', type: 'web', file: 'fonts/Rajdhani-Bold.ttf' },
  { family: 'neon-display-web', type: 'web', file: 'fonts/Orbitron-Regular.ttf' },
  { family: 'neon-display-bold-web', type: 'web', file: 'fonts/Orbitron-Bold.ttf' },
  { family: 'eightbit-web', type: 'web', file: 'fonts/PressStart2P-Regular.ttf' },
  // Reading Room's serif headings.
  { family: 'literata-web', type: 'web', file: 'fonts/Literata-SemiBold.woff' },
  // The modifier letters channel names use ("ᴴᴰ", "ᴸᶦᵍᵃ"), cut from Noto Sans Regular. webOS 3's only
  // face with them is a serif, so canvas text takes them from here first (scripts/patch-renderer.mjs).
  { family: 'moonfin-marks', type: 'web', file: 'fonts/MoonfinMarks.otf', webos: true },
]

// A face as @solidtv/solid's loadFonts() takes it. An MSDF face loads the atlas scripts/fonts.mjs
// wrote next to its TTF.
const forRenderer = (f) =>
  f.type === 'msdf'
    ? { type: 'msdf', fontFamily: f.family, atlasUrl: assetUrl(f.file.replace(/\.ttf$/, '.msdf.webp')), atlasDataUrl: assetUrl(f.file.replace(/\.ttf$/, '.msdf.json')) }
    : { fontFamily: f.family, fontUrl: assetUrl(f.file) }
const themeAtlas = (f) => f.type === 'msdf' && !!f.theme

// What launch loads. The theme atlases are 10 MB of the 27 MB of textures the atlases take, so each
// waits until its theme is in use (themeFonts).
export const rendererFonts = (webos) => FONTS.filter((f) => !themeAtlas(f) && (!f.webos || webos)).map(forRenderer)

export const themeFonts = (id) => FONTS.filter((f) => themeAtlas(f) && f.theme === id).map(forRenderer)
