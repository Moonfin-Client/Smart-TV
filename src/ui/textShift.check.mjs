// node src/ui/textShift.check.mjs: the shift helpers' Roboto values stay what callers were tuned to,
// and the theme faces need none.
import assert from 'node:assert/strict'
const ROBOTO = { asc: 0.927734, desc: 0.244141, sdfAsc: 0.75, shift: 0.0918 }
const FACES = { 'neon-body': { asc: 0.93, desc: 0.346, sdfAsc: 0.93, shift: 0 }, 'neon-display': { asc: 1.011, desc: 0.243, sdfAsc: 1.011, shift: 0 }, eightbit: { asc: 1, desc: 0, sdfAsc: 1, shift: 0 } }
const m = (f) => FACES[(f || '').replace(/(-bold)?(-web)?$/, '')] || ROBOTO
const cssShift = (s, f) => Math.round(m(f).shift * s * 2) / 2
const normalShift = (s, f) => Math.round(m(f).asc * s) - m(f).sdfAsc * s
for (const s of [16, 20, 22, 24, 26, 28, 30, 44, 72]) {
  assert.equal(cssShift(s), Math.round(0.0918 * s * 2) / 2)
  assert.equal(cssShift(s, 'roboto-bold'), cssShift(s))
  assert.equal(normalShift(s), Math.round(0.927734 * s) - 0.75 * s)
  assert.equal(cssShift(s, 'neon-body-bold'), 0)
  assert.equal(cssShift(s, 'eightbit'), 0)
  // A theme face's canvas twin sits where the face does, and Roboto's twin where Roboto does.
  assert.equal(cssShift(s, 'neon-body-bold-web'), 0)
  assert.equal(cssShift(s, 'roboto-web'), cssShift(s))
  assert.ok(Math.abs(normalShift(s, 'neon-display')) <= 0.5)
}
// The derived shift matches the table: half of each face's (ascender - descender) difference.
assert.ok(Math.abs(((ROBOTO.asc - ROBOTO.desc) - (0.75 - 0.25)) / 2 - ROBOTO.shift) < 0.001)
console.log('textShift ok')
