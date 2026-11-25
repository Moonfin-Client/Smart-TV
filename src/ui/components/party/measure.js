// Measures text before the renderer draws it, from the same Roboto files the app ships, so boxes fit their text and
// lines wrap or cut where they should. Until the faces load, widths are estimates, and fontsReady() says when to lay
// out again.
import { assetUrl } from '../../../utils/assetUrl.js'
const FILES = { regular: 'Roboto-Regular', medium: 'Roboto-Medium', bold: 'Roboto-Bold' }

let ctx
let ready = null
let loaded = false

export const fontsReady = () => {
  if (ready) return ready
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) {
    ready = Promise.resolve()
    return ready
  }
  ready = Promise.all(Object.keys(FILES).map((w) => new FontFace(`party-${w}`, `url(${assetUrl(`fonts/${FILES[w]}.ttf`)})`).load()
    .then((face) => {
      document.fonts.add(face)
    })
    .catch(() => {}))).then(() => {
    loaded = true
  })
  return ready
}

export const measure = (text, size, weight = 'regular', spacing = 0) => {
  const str = String(text == null ? '' : text)
  if (ctx === undefined) {
    try {
      ctx = document.createElement('canvas').getContext('2d')
    } catch (e) {
      ctx = null
    }
    fontsReady()
  }
  if (!ctx || !loaded) return Math.ceil(str.length * size * 0.52 + spacing * str.length)
  ctx.font = `${size}px party-${FILES[weight] ? weight : 'regular'}`
  return ctx.measureText(str).width + spacing * str.length
}

// Cut to fit `maxW` with an ellipsis, by character, as text-overflow: ellipsis does. `measureFn` takes
// measure's arguments.
export const fitText = (text, size, weight, maxW, spacing = 0, measureFn = measure) => {
  const str = String(text == null ? '' : text)
  if (measureFn(str, size, weight, spacing) <= maxW) return str
  const ell = '…'
  const room = maxW - measureFn(ell, size, weight)
  let lo = 0
  let hi = str.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (measureFn(str.slice(0, mid), size, weight, spacing) <= room) lo = mid
    else hi = mid - 1
  }
  return str.slice(0, lo) + ell
}

// CSS "normal" line height for Roboto (ascent plus descent), which buttons use.
export const NORMAL_LH = 1.172

// The renderer sets a line's baseline at 0.25em below its middle, from its font metrics (ascender 0.75, descender
// -0.25), where a browser sets Roboto's at 0.342em. Moving the box down by the difference puts the glyphs where a
// browser would draw them.
export const BASELINE_DROP = 0.0918
