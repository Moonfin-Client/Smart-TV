// Self-check for collectionParts.js: node src/pages/Seerr/collectionParts.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { isPartRequestable, firstSelectable, selectionCap, sheetLayout } = await import('./collectionParts.js')

const part = (id, status, status4k) => ({ id, title: `Part ${id}`, releaseDate: '2001-01-01', mediaInfo: status == null ? null : { status, status4k } })
const parts = [part(1, 5), part(2, null), part(3, 1, 5), part(4, 6), part(5, 7)]

assert.equal(isPartRequestable(parts[0], false), false, 'an available part is not asked for again')
assert.equal(isPartRequestable(parts[1], false), true, 'a part Seerr never saw can be asked for')
assert.equal(isPartRequestable(parts[2], false), true)
assert.equal(isPartRequestable(parts[2], true), false, 'its 4K copy is already there')
assert.equal(isPartRequestable(parts[3], false), false, 'blocklisted')
assert.equal(isPartRequestable(parts[4], false), true, 'deleted files are a reason to ask again')

assert.equal(selectionCap(null, 4), 4)
assert.equal(selectionCap({ limit: 5, remaining: 2 }, 4), 2)
assert.equal(selectionCap({ limit: 5, remaining: -1 }, 4), 0)
assert.deepEqual(firstSelectable(parts, false, null), [2, 3, 5])
assert.deepEqual(firstSelectable(parts, false, { limit: 3, remaining: 1 }), [2])

const layout = sheetLayout({ parts, is4k: false, selected: [2, 3, 5], quota: null, canUse4k: true, wraps: () => 1 })
assert.equal(layout.rows[0].on, true, 'Select All shows ticked when every part it can take is')
assert.equal(layout.rows.filter((r) => r.kind === 'part').length, 5)
assert.equal(layout.rows.find((r) => r.id === 'part:1').trailing, 'Available')
assert.equal(layout.listH, 5 * 77)
assert.equal(layout.overCap, false)
const capped = sheetLayout({ parts, is4k: false, selected: [2, 3], quota: { limit: 3, remaining: 1 }, canUse4k: false, wraps: () => 2 })
assert.equal(capped.overCap, true)
assert.equal(capped.listH, 467, 'the list stops at 467px and scrolls')
assert.ok(capped.rows.some((r) => r.kind === 'quota' && r.blocked))

const adv = { h: 200, focusables: [{ id: 'advanced', y: 26.7, h: 82 }, { id: 'adv:server', y: 120, h: 80 }] }
const withAdv = sheetLayout({ parts, is4k: false, selected: [2], quota: null, canUse4k: true, wraps: () => 1, advanced: adv })
assert.equal(withAdv.buttonsY - layout.buttonsY, 200, 'the section pushes the buttons down')
assert.deepEqual(withAdv.rows.filter((r) => r.kind === 'adv').map((r) => [r.id, Math.round(r.y - withAdv.advTop)]), [['advanced', 27], ['adv:server', 120]], 'its rows take focus in place')

console.log('collectionParts ok')
