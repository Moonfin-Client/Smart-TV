// Text faces by family and CSS weight, as the renderer's font names, and their widths, so a bar can
// flow its text before the renderer draws it. A string with glyphs outside a face's MSDF atlas draws
// with its canvas twin.
import { cssWeight, fontFor, sdfSafe, textReady, textWidth as robotoWidth } from '../../text.js'
import { assetUrl } from '../../../utils/assetUrl.js'

// Roboto ships at 400, 500 and 700, so a 600 draws in bold.
const FACES = {
  roboto: { 400: 'roboto', 500: 'roboto-medium', 600: 'roboto-bold', 700: 'roboto-bold' },
  archivo: { 400: 'archivo-narrow', 500: 'archivo-narrow-medium', 600: 'archivo-narrow-semibold', 700: 'archivo-narrow-bold' },
  noto: { 400: 'noto-sans' },
}

const FILES = {
  'archivo-narrow': 'ArchivoNarrow-Regular',
  'archivo-narrow-medium': 'ArchivoNarrow-Medium',
  'archivo-narrow-semibold': 'ArchivoNarrow-SemiBold',
  'archivo-narrow-bold': 'ArchivoNarrow-Bold',
  'noto-sans': 'NotoSans-Regular',
}

// Only Archivo Narrow's Latin cut ships, so anything else sets in Roboto.
const ARCHIVO = /^[\u0020-\u007e\u00a0-\u00ff\u2013\u2014\u2018-\u201e\u2022\u2026\u2039\u203a\u20ac\u2122]*$/

export const face = (family, weight, str) => {
  // Roboto is the app's own face, which Neon Pulse and 8-bit Hero swap for theirs (ui/text.js).
  if (family === 'roboto') return fontFor(str, cssWeight(weight))
  const fam = family === 'archivo' && !ARCHIVO.test(str || '') ? 'roboto' : family
  const set = FACES[fam] || FACES.roboto
  const name = set[weight] || set[400]
  return sdfSafe(str) ? name : name + '-web'
}

// ui/text.js already measures Roboto and the theme faces that stand in for it, in faces of its own.
const ROBOTO = { roboto: 'regular', 'roboto-medium': 'medium', 'roboto-bold': 'bold', 'neon-body': 'regular', 'neon-body-bold': 'bold', eightbit: 'regular' }

// Whether a face is a theme's stand-in for Roboto, whose measure already carries the theme's spacing.
export const themeFace = (name) => /^(neon-body|eightbit)/.test(name || '')

const loading = {}
const loaded = {}

// The renderer only fetches a canvas face once a text node asks for it, so measuring loads its own.
const load = (name) => {
  const base = name.replace(/-web$/, '')
  if (ROBOTO[base]) return textReady()
  if (loading[base]) return loading[base]
  let p = Promise.resolve()
  try {
    if (FILES[base] && typeof FontFace === 'function' && document.fonts) {
      p = new FontFace(base + '-web', 'url(' + assetUrl('fonts/' + FILES[base] + '.ttf') + ')').load().then((f) => {
        document.fonts.add(f)
        loaded[base] = true
      })
    }
  } catch (e) {
    p = Promise.resolve()
  }
  loading[base] = p.catch(() => null)
  return loading[base]
}

export const facesReady = (names) => Promise.all(names.map(load))

let ctx
const widths = {}

// Glyphs land on whole pixels at the size they draw, which is the size times any zoom around the
// text, so the canvas measures at that size.
export const textWidth = (str, size, name, zoom = 1) => {
  const text = String(str == null ? '' : str)
  const base = String(name || 'roboto').replace(/-web$/, '')
  const px = size * zoom
  if (ROBOTO[base]) return robotoWidth(text, px, ROBOTO[base]) / zoom
  const key = base + '|' + px + '|' + text
  if (widths[key] != null) return widths[key]
  if (ctx === undefined) {
    try {
      ctx = document.createElement('canvas').getContext('2d')
    } catch (e) {
      ctx = null
    }
  }
  let w = text.length * size * 0.5
  if (ctx) {
    ctx.font = px + 'px ' + base + '-web'
    w = ctx.measureText(text).width / zoom
  }
  // A width read before the face arrived is the fallback font's, so it isn't kept.
  if (loaded[base]) widths[key] = w
  else load(base)
  return w
}
