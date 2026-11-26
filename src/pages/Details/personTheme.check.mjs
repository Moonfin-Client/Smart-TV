// Self-check that a person's name, facts and biography take the theme's text colour on the detail
// styles that draw people themselves (Modern, Spotlight, Nouveau): node src/pages/Details/personTheme.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// Stubs stand in for the measuring, the strings and the marks, which this check doesn't reach.
const stub = (src) => `data:text/javascript,${encodeURIComponent(src)}`
const STUBS = {
  text: stub("export const cssShift = (s) => Math.round(0.0918 * s * 2) / 2; export const fontFor = () => 'roboto'; export const uiFont = () => 'roboto'"),
  measure: stub('export const textWidth = (s, size) => String(s).length * size * 0.5; export const wrapLines = (s) => [String(s)]'),
  i18n: stub("export default (s) => s; export const currentLocale = () => 'en'"),
  detailMarks: stub('export const drawAnimePills = () => ({ w: 0, h: 0 })'),
  meta: stub('export const SEERR_PILL = {}'),
}
registerHooks({
  resolve(spec, ctx, next) {
    const m = /\/(ui\/text|details\/measure|services\/i18n|detailMarks|modern\/meta)(\.js)?$/.exec(spec)
    if (m) return { url: STUBS[m[1].split('/').pop()], shortCircuit: true }
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { layoutHero: modernHero } = await import('./modern/hero.js')
const { layoutSpotlightHero } = await import('./spotlight/hero.js')
const { layoutHero: nouveauHero } = await import('./nouveau/layout.js')

// Neon Pulse's text colour, so white can't pass for it.
const CYAN = '#00e5ffff'
const os = (a) => CYAN.slice(0, 7) + Math.round(a * 255).toString(16).padStart(2, '0')
const t = { accent: '#ff2bd6ff', onAccent: '#000000ff', focus: '#ff2bd6ff', onSurface: CYAN, onBackground: CYAN, os, accentA: os, surfaceA: os, scrimA: os, isPixel: false, isGlass: false }
const ink = (out, k) => {
  const hit = out.texts.find((x) => x.k === k)
  assert.ok(hit, `no text ${k}`)
  return hit.color
}

// Modern: the name in the theme's text colour and the birth line at 70%; a film's title stays white.
const modern = (person) => modernHero({ left: 58, title: 'Jane Doe', born: person ? '1970 · Paris' : '', person, meta: [], techChips: [], ratings: [], ratingStyle: {}, tagline: '', overview: '' }, t)
assert.equal(ink(modern(true), 'title0'), CYAN)
assert.equal(ink(modern(true), 'born'), os(0.7))
assert.equal(ink(modern(false), 'title0'), '#ffffffff')

// Spotlight: the same for its person row.
const spot = layoutSpotlightHero({ x0: 58, y0: 135, W: 1000, person: true, avatar: '', born: '1970', ringColor: t.focus, title: 'Jane Doe', meta: [], seerrPills: [], techChips: [], ratings: [], ratingStyle: {}, overview: '' }, t)
assert.equal(ink(spot, 'title'), CYAN)
assert.equal(ink(spot, 'born'), os(0.7))

// Nouveau: the name and the facts line.
const nouveau = (isPerson) => nouveauHero({ left: 56, top: 135, isPerson, name: 'Jane Doe', meta: ['1970', 'Paris'], tech: [], ratings: [], seerrPills: [] }, t)
assert.equal(ink(nouveau(true), 'title0'), CYAN)
assert.equal(ink(nouveau(true), 'meta0'), os(0.66))
assert.equal(ink(nouveau(true), 'metaDot1'), os(0.4))
assert.equal(ink(nouveau(false), 'title0'), '#ffffffff')

console.log('personTheme.check: ok')
