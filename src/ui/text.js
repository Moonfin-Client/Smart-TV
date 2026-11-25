// SDF (MSDF) text is cheap to change but only covers the glyphs baked into its atlas, so a
// string falls back to canvas text when it holds anything else (CJK, Cyrillic, Arabic...).
// The atlas charset is MSDF_CHARS, also written to public/fonts/*.config.json by scripts/fonts.mjs.
import { currentLocale } from '../services/i18n.js'
import * as settings from '../state/settings.js'
import { activeThemeId } from './theme.js'
import { getStore } from '../state/store.js'

import { MSDF_CHARS } from './msdfChars.js'
import { MSDF_GAPS } from './msdfGaps.js'
import { assetUrl } from '../utils/assetUrl.js'

// A plain object: Chrome 38's native Set won't take a string to iterate.
const covered = {}
for (let i = 0; i < MSDF_CHARS.length; i++) covered[MSDF_CHARS.charAt(i)] = true

export const sdfSafe = (str) => {
  if (!str) return true
  for (let i = 0; i < str.length; i++) {
    if (!covered[str.charAt(i)] && str.charAt(i) !== '\n') return false
  }
  return true
}

const LATIN_LOCALES = /^(en|de|fr|es|it|pt|nl|sv|da|nb|no|fi|pl|cs|sk|sl|hr|hu|ro|tr|ca|gl|eu|et|lv|lt|sq|af|cy|ga|is|id|ms|sw|tl|vi|eo)\b/i

// UI strings follow the locale, item text follows its own characters.
export const uiUsesSdf = () => LATIN_LOCALES.test(currentLocale()) && !/^vi\b/i.test(currentLocale())

const families = {
  regular: ['roboto', 'roboto-web'],
  medium: ['roboto-medium', 'roboto-medium-web'],
  bold: ['roboto-bold', 'roboto-bold-web'],
}

// Neon Pulse and 8-bit Hero set the whole app in their own faces. Those faces have no medium cut, so
// medium draws in the regular one. Text a face's atlas can't cover, its non-Latin glyphs or the
// Latin ones its TTF lacks (Rajdhani has no "Ž"), draws with the face's canvas twin, which takes
// each missing glyph from sans-serif.
const THEME_FACES = {
  neon_pulse: { regular: 'neon-body', medium: 'neon-body', bold: 'neon-body-bold' },
  '8bit_hero': { regular: 'eightbit', medium: 'eightbit', bold: 'eightbit' },
}
// index.jsx hands over the loader for a theme's atlases. The first ask for a theme's family starts
// its upload, so the renderer knows the family is coming before any text can take it.
let loadTheme = null
const asked = {}
export const onThemeFonts = (fn) => {
  loadTheme = fn
}
const needTheme = (id) => {
  if (asked[id] || !loadTheme) return
  asked[id] = true
  loadTheme(id)
}
const themeFace = (weight) => {
  const id = activeThemeId(settings.all())
  const faces = THEME_FACES[id]
  if (!faces) return null
  needTheme(id)
  return faces[weight]
}
const faceCovers = (family, str) => {
  const gaps = MSDF_GAPS[THEME_TTF[family]]
  if (!gaps || !str) return true
  for (let i = 0; i < str.length; i++) if (gaps.indexOf(str.charAt(i)) >= 0) return false
  return true
}
const themed = (face, str) => (sdfSafe(str) && faceCovers(face, str) ? face : face + '-web')

export const fontFor = (str, weight = 'regular') => {
  const face = themeFace(weight)
  if (face) return themed(face, str)
  return families[weight][sdfSafe(str) ? 0 : 1]
}
export const uiFont = (weight = 'regular') => {
  const face = themeFace(weight)
  if (!uiUsesSdf()) return face ? face + '-web' : families[weight][1]
  return face || families[weight][0]
}
// Neon Pulse's display face, for the few titles set in it (the Settings title). Pass the
// text when it's the server's, so glyphs Orbitron lacks draw from its canvas twin.
export const displayFont = (weight = 'bold', str) => {
  const id = activeThemeId(settings.all())
  if (id === 'neon_pulse') {
    needTheme(id)
    const face = weight === 'bold' ? 'neon-display-bold' : 'neon-display'
    return str == null ? face : themed(face, str)
  }
  return str == null ? uiFont(weight) : fontFor(str, weight)
}

// A CSS weight as one of Roboto's cuts (400, 500, 700). A weight between cuts takes the nearest
// heavier one, so 600 draws Bold.
export const cssWeight = (w) => (w >= 600 || w === 'bold' ? 'bold' : w >= 500 ? 'medium' : 'regular')

// The width Chrome gives a run of Roboto, for layouts that fit their text (a pill that grows to fit
// its label). The TTFs the renderer draws with are loaded into faces of their own, since the
// renderer only registers its canvas faces once something draws with them. Until they land the
// width is an estimate and isn't kept. textReady() resolves when real widths are available.
const FACES = { regular: 'Roboto-Regular', medium: 'Roboto-Medium', bold: 'Roboto-Bold' }
let measureCtx
let facesLoaded = false
let facesLoading = null
// Keyed by the whole string, so it's capped and the oldest widths are measured again when asked.
const widthCache = new Map()

// Each measuring face is a FontFace named 'measure-<key>', keyed by weight for Roboto and by SDF
// family for the rest. State is 'loading', 'ready' or 'failed'.
const measureFaces = {}
const canLoadFaces = () => typeof document !== 'undefined' && !!document.fonts && typeof FontFace === 'function'
const loadFace = (key, file) => {
  if (measureFaces[key]) return measureFaces[key].done
  const entry = { state: 'failed', done: Promise.resolve() }
  measureFaces[key] = entry
  if (!canLoadFaces()) return entry.done
  entry.state = 'loading'
  const face = new FontFace('measure-' + key, `url(${assetUrl(file)})`)
  document.fonts.add(face)
  entry.done = face.load().then(
    () => {
      entry.state = 'ready'
    },
    () => {
      entry.state = 'failed'
    }
  )
  return entry.done
}

export const textReady = () => {
  if (facesLoaded) return Promise.resolve()
  if (facesLoading) return facesLoading
  facesLoading = Promise.all(Object.keys(FACES).map((k) => loadFace(k, `fonts/${FACES[k]}.ttf`))).then(() => {
    facesLoaded = true
  })
  return facesLoading
}

// A theme face is measured from its own TTF, loaded the first time the theme needs it. Neon Pulse
// spaces its body text 0.6px, added after each character.
const THEME_TTF = {
  'neon-body': 'Rajdhani-Regular',
  'neon-body-bold': 'Rajdhani-Bold',
  eightbit: 'PressStart2P-Regular',
  'neon-display': 'Orbitron-Regular',
  'neon-display-bold': 'Orbitron-Bold',
}
const themeFaces = {}
const loadThemeFace = (family) => {
  if (themeFaces[family]) return
  themeFaces[family] = 'loading'
  loadFace(family, `fonts/${THEME_TTF[family]}.ttf`).then(() => {
    themeFaces[family] = measureFaces[family].state
    // What laid out with estimates measures again.
    const st = getStore()
    if (st && themeFaces[family] === 'ready') st.settingsVersion = st.settingsVersion + 1
  })
}

// SDF text lays out with these advances (scripts/patch-renderer.mjs, hinted advances). The TVs' Chrome
// draws text at FreeType's hinted whole-pixel advances, which differ from the exact ones the atlas
// holds by a few percent and differently on each TV, so what Chrome gives one character, or a
// kerned pair, at a size is measured here on the family's own TTF. It answers -1 until that face
// has loaded, and the renderer keeps the exact advance then.
const ROBOTO_KEY = { roboto: 'regular', 'roboto-medium': 'medium', 'roboto-bold': 'bold' }
const SDF_FILES = {}
const advances = {}
let advanceCtx = null
const advanceFace = (family) => {
  const key = ROBOTO_KEY[family] || family
  const entry = measureFaces[key]
  if (entry) return entry.state === 'ready' ? 'measure-' + key : null
  if (SDF_FILES[family]) loadFace(key, SDF_FILES[family])
  return null
}
const hintedAdvance = (family, size, text) => {
  const face = advanceFace(family)
  if (face === null) return -1
  const bySize = advances[family] || (advances[family] = {})
  const memo = bySize[size] || (bySize[size] = {})
  let w = memo[text]
  if (w === undefined) {
    if (advanceCtx === null) advanceCtx = document.createElement('canvas').getContext('2d')
    advanceCtx.font = `${size}px ${face}`
    w = memo[text] = advanceCtx.measureText(text).width
  }
  return w
}
// index.jsx hands over its font list, so every SDF family is measured from the TTF it's drawn from.
// Roboto is awaited before launch (textReady) and the rest load in the background.
export const measureFonts = (fonts) => {
  fonts.forEach((f) => {
    if (f.type !== 'msdf') return
    SDF_FILES[f.family] = f.file
    if (!ROBOTO_KEY[f.family]) loadFace(f.family, f.file)
  })
  if (typeof window !== 'undefined') window.__moonfinAdvance = hintedAdvance
  return textReady()
}
export const themeSpacing = () => (activeThemeId(settings.all()) === 'neon_pulse' ? 0.6 : 0)

// `weight` is 'regular', 'medium' or 'bold' (the theme's face for it, spaced as the theme spaces its
// body), or a theme family by name ('neon-display-bold', unspaced).
export const textWidth = (text, size, weight = 'regular') => {
  const str = String(text == null ? '' : text)
  const named = THEME_TTF[weight] ? weight : null
  const face = named || themeFace(weight)
  const family = face && THEME_TTF[face] && themeFaces[face] !== 'failed' ? face : null
  const key = (named ? '=' : '') + (family || weight) + '|' + size + '|' + str
  const known = widthCache.get(key)
  if (known != null) return known
  if (family && themeFaces[family] !== 'ready') {
    loadThemeFace(family)
    return str.length * size * 0.55
  }
  if (!facesLoaded) {
    textReady()
    return str.length * size * 0.55
  }
  if (measureCtx === undefined) {
    try {
      measureCtx = document.createElement('canvas').getContext('2d')
    } catch (e) {
      measureCtx = null
    }
  }
  let w = str.length * size * 0.55
  if (measureCtx) {
    measureCtx.font = `${size}px measure-${family || weight}, sans-serif`
    w = measureCtx.measureText(str).width + (family && !named ? themeSpacing() * str.length : 0)
  }
  widthCache.set(key, w)
  if (widthCache.size > 4000) widthCache.delete(widthCache.keys().next().value)
  return w
}

// The renderer places a face by its OS/2 typo metrics and Chrome by its hhea ones (or the typo ones
// where the font sets USE_TYPO_METRICS). For Roboto they differ (ascender 0.75 em in the renderer,
// 0.928 em in Chrome), so its text sits higher than Chrome would put it. The theme faces carry the
// same numbers in both tables. Add these to the CSS line box's top:
// - cssShift(size, font) for a Text whose lineheight is the CSS line-height in px,
// - normalShift(size, font) for a Text with lineheight="1" standing in for line-height: normal,
//   whose line box Chrome rounds to normalLine(size, font) px.
// `font` is the Text's family, and without it the active theme's face (or Roboto) is assumed.
// Per face, in em: Chrome's ascender and descender, the renderer's ascender, and the explicit
// line-height shift ((Chrome's ascender - descender) - (the renderer's)) / 2. From the font files.
const ROBOTO = { asc: 0.927734, desc: 0.244141, sdfAsc: 0.75, shift: 0.0918 }
const FACE_METRICS = {
  'neon-body': { asc: 0.93, desc: 0.346, sdfAsc: 0.93, shift: 0 },
  'neon-display': { asc: 1.011, desc: 0.243, sdfAsc: 1.011, shift: 0 },
  eightbit: { asc: 1, desc: 0, sdfAsc: 1, shift: 0 },
}
export const faceMetrics = (font) => {
  const f = font || themeFace('regular') || ''
  return FACE_METRICS[f.replace(/(-bold)?(-web)?$/, '')] || ROBOTO
}
export const cssShift = (size, font) => Math.round(faceMetrics(font).shift * size * 2) / 2
export const normalShift = (size, font) => {
  const m = faceMetrics(font)
  return Math.round(m.asc * size) - m.sdfAsc * size
}
export const normalLine = (size, font) => {
  const m = faceMetrics(font)
  return Math.round(m.asc * size) + Math.round(m.desc * size)
}
// How far a Text placed for Roboto in a CSS line box of fixed height moves for `font` (the active
// theme's face by default): `one` for a Text with lineheight="1", else one with the CSS lineheight.
const centerRise = (m) => ((m.asc - m.desc) / 2 - m.sdfAsc)
export const faceDy = (size, one, font) => {
  const m = faceMetrics(font)
  if (m === ROBOTO) return 0
  return one ? (centerRise(m) - centerRise(ROBOTO)) * size : cssShift(size, font) - cssShift(size, 'roboto')
}

// A canvas face named with a style ('roboto-web@italic') as text props: the renderer's canvas text
// draws `<fontStyle> <size>px Unknown, <family>`, so the style rides in fontStyle. Spread it on a
// <text>: <text {...fontProps(font)}>.
export const fontProps = (font) => {
  const at = String(font).lastIndexOf('@')
  return at > 0 ? { fontFamily: font.slice(0, at), fontStyle: font.slice(at + 1) } : { fontFamily: font }
}
