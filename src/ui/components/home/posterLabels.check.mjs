// node src/ui/components/home/posterLabels.check.mjs
import assert from 'node:assert/strict'
import { labelColors, labelNodes, posterLabelBoxes } from './posterLabels.js'

const env = {
  measure: (text, size) => text.length * size * 0.6,
  shift: () => 0,
  knownIcon: (name) => name === 'hdr_on',
  iconSrc: (name) => `icon:${name}`,
  flagSrc: (code) => `flag:${code}`,
  fontOf: () => 'roboto-bold',
}
const badge = (over) => ({ label: '4K', color: '#2563EB', textColor: '', style: 'solid', opacity: 100, size: 'medium', corner: 'topLeft', shape: 'rounded', icon: '', ...over })
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.01, `${a} != ${b}`)

// Solid fill keeps white text on a dark blue, and the text color the admin set wins.
assert.deepEqual(labelColors(badge()), { fill: '#2563ebff', border: null, text: '#ffffffff' })
assert.equal(labelColors(badge({ color: '#ffff00' })).text, '#000000ff')
assert.equal(labelColors(badge({ textColor: '#ff0000' })).text, '#ff0000ff')
// Opacity fades the fill and border, never below a tenth.
assert.equal(labelColors(badge({ style: 'glass', opacity: 0 })).fill, '#2563eb0b')

// A medium label at the card scale: 10 points font, 2 and 6 points padding, on a 1.2 line.
const at = (p) => p * (1920 / 1150) * 0.85
const one = posterLabelBoxes([badge()], { w: 300, h: 450 }, env)
const box = one.left[0]
near(box.h, at(10) * 1.2 + 2 * at(2))
near(box.w, 2 * at(10) * 0.6 + 1.6 + 2 * at(6))
assert.equal(box.x, 8)
assert.equal(box.y, 8)

// Two to a corner, stacked 6px apart, and a bottom corner stacks upwards from its offset.
const many = posterLabelBoxes([badge(), badge(), badge(), badge({ corner: 'bottomRight' }), badge({ corner: 'bottomRight' })], { w: 300, h: 450, bottom: 26 }, env)
assert.equal(many.left.length, 2)
near(many.left[1].y, 8 + box.h + 6)
assert.equal(many.right.length, 2)
near(many.right[0].y, 450 - 26 - box.h)
near(many.right[1].y, 450 - 26 - box.h - 6 - box.h)
near(many.right[0].x, 300 - 8 - box.w)

// Nothing to draw: no text and an icon the app doesn't know.
assert.equal(posterLabelBoxes([badge({ label: ' ', icon: 'nope' })], { w: 300, h: 450 }, env), null)
// An icon alone sits in a squarer pill, and a flag alone is its own 4:3 shape.
const iconOnly = posterLabelBoxes([badge({ label: '', icon: 'hdr_on' })], { w: 300, h: 450 }, env).left[0]
near(iconOnly.w, at(12.5) + 2 * at(3))
const flagOnly = posterLabelBoxes([badge({ label: '', icon: 'flag-fr' })], { w: 300, h: 450 }, env).left[0]
near(flagOnly.h, at(16))
near(flagOnly.w, (at(16) * 4) / 3)
// A long label stops 16px short of the art's width.
const long = posterLabelBoxes([badge({ label: 'A very long label indeed for a card' })], { w: 120, h: 180 }, env).left[0]
assert.equal(long.w, 104)

// The nodes: a pill per label, its icon or flag, and its text.
const nodes = labelNodes(posterLabelBoxes([badge({ icon: 'hdr_on' }), badge({ label: '', icon: 'flag-de' })], { w: 300, h: 450 }, env).left, env)
assert.equal(nodes.pills.length, 2)
assert.deepEqual(nodes.art.map((a) => a.src), ['icon:hdr_on', 'flag:de'])
assert.equal(nodes.texts.length, 1)
console.log('posterLabels ok')
