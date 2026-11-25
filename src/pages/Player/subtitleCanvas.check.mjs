// Self-check for subtitleCanvas.js and subtitleSettings.js: node src/pages/Player/subtitleCanvas.check.mjs
// The expected numbers are at 1080p.
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(
  'data:text/javascript,' +
    encodeURIComponent(`export async function resolve(spec, ctx, next) {
  if (spec.startsWith('.') && !/\\.m?js$/.test(spec)) return next(spec + '.js', ctx)
  return next(spec, ctx)
}`)
)

const { cssColor, subtitleLook, overlayPlace, parseCue, wrapRuns } = await import('./subtitleCanvas.js')
const { settingRows, scrollTo, stepValue } = await import('./subtitleSettings.js')
const { defaultSettings: defaults } = await import('../../context/defaultSettings.js')

assert.equal(cssColor('#00000080', 100), 'rgba(0, 0, 0, 0.502)')
assert.equal(cssColor('#ffffff', 50), 'rgba(255, 255, 255, 0.5)')
const look = subtitleLook({ ...defaults, subtitleSize: 'large', subtitleDropShadow: true, subtitleStrokeWidth: 0 })
assert.equal(look.size, 52)
assert.equal(look.stroke, 2, 'a stroke width of 0 falls back to 100')
assert.equal(look.blur, 5.2)
assert.deepEqual(look.drop, { offset: 2.08, blur: 2.08, color: 'rgba(0, 0, 0, 0.8)' })
const sec = subtitleLook({ ...defaults, secondarySubtitleSize: 30, secondarySubtitleColor: '#ffff00' }, true)
assert.equal(sec.size, 30)
assert.equal(sec.color, 'rgba(255, 255, 0, 1)')
assert.equal(subtitleLook({ ...defaults }, false, 'ja').jp, true)
assert.equal(subtitleLook({ ...defaults }, false, 'en').jp, false)
assert.equal(overlayPlace({ ...defaults }).bottom, 972)
assert.equal(overlayPlace({ ...defaults, subtitlePosition: 'middle', subtitleOpacity: 60 }).alpha, 0.6)
assert.equal(overlayPlace({ ...defaults, subtitleOpacity: 0 }).alpha, 1, '0 reads as full')
assert.equal(Math.round(overlayPlace({ ...defaults, subtitlePosition: 'absolute', subtitlePositionAbsolute: 50 }).bottom), 540)
assert.equal(Math.round(overlayPlace({ ...defaults, secondarySubtitleOffset: 12 }, true).bottom), 929)

assert.deepEqual(parseCue('[high]\n<i>Frederator!</i>'), [[{ text: '[high]', italic: false, bold: false }], [{ text: 'Frederator!', italic: true, bold: false }]])
assert.deepEqual(parseCue('{\\an8}a\\Nb &amp; c'), [[{ text: 'a', italic: false, bold: false }], [{ text: 'b & c', italic: false, bold: false }]])
assert.deepEqual(parseCue('<font color="#ff0">x</font>'), [[{ text: 'x', italic: false, bold: false }]])

const measure = (s) => s.length * 10
const lines = wrapRuns([{ text: 'aaaa bbbb cccc', italic: false, bold: false }], measure, 95)
assert.deepEqual(lines.map((l) => [l.segs.map((s) => s.text).join(''), l.w]), [['aaaa bbbb', 90], ['cccc', 40]])
const mixed = wrapRuns([{ text: 'one ', italic: false, bold: false }, { text: 'two', italic: true, bold: false }], measure, 500)[0]
assert.deepEqual(mixed.segs.map((s) => [s.text, s.x, s.italic]), [['one ', 0, false], ['two', 40, true]])

const rows = settingRows({ ...defaults })
assert.deepEqual(
  rows.filter((r) => r.kind !== 'divider').map((r) => r.id),
  ['size', 'position', 'opacity', 'color', 'bold', 'font', 'shadowColor', 'shadowOpacity', 'shadowBlur', 'strokeWidth', 'dropShadow', 'bgColor', 'bgOpacity']
)
const at = (id) => rows.find((r) => r.id === id)
assert.equal(at('position').y, 90)
assert.equal(at('opacity').y, 186)
assert.equal(at('bgOpacity').y, 1225)
assert.equal(rows.contentH, 1362)
assert.equal(stepValue(at('shadowBlur'), 1), 0.2)
assert.equal(stepValue({ ...at('shadowBlur'), raw: 0.7000000000000001 }, 1), 0.8)
assert.equal(stepValue(at('opacity'), 1), 100, 'stops at the end')
assert.equal(at('shadowBlur').value, '0.1')
assert.equal(at('opacity').value, '100%')
assert.equal(settingRows({ ...defaults, subtitlePosition: 'absolute', subtitleDropShadow: true }).filter((r) => r.kind === 'slider').length, 8)

// Down from Size to Background Opacity scrolls 0 through Font, then 35, 156, 293, 394, 490, 586, 707.
let st = 0
const seen = []
rows.filter((r) => r.kind !== 'divider').forEach((r) => {
  st = scrollTo(st, r, rows.contentH)
  seen.push(Math.round(st))
})
assert.deepEqual(seen, [0, 0, 0, 0, 0, 0, 35, 156, 293, 394, 490, 586, 707])
// Up brings a row above the view to the top, or all the way back near the start.
assert.equal(scrollTo(707, at('strokeWidth'), rows.contentH), 707, 'a row in view stays put')
assert.equal(scrollTo(707, at('font'), rows.contentH), at('font').y)
assert.equal(scrollTo(30, at('size'), rows.contentH), 0)
console.log('subtitleCanvas ok')
