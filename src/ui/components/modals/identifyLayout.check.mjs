// node src/ui/components/modals/identifyLayout.check.mjs
import assert from 'node:assert/strict'

const { identifyLayout, MAX_PANEL_H } = await import('./identifyLayout.js')

const measure = (t, size) => String(t || '').length * size * 0.5
const base = { name: 'The Bourne Legacy', year: '2012', results: [], busy: false, error: '' }

// The menu: two 96 rows 4 apart under the title, in a 534 wide panel 314.9 tall.
const menu = identifyLayout({ ...base, view: 'menu' }, measure)
assert.equal(menu.w, 534)
assert.deepEqual(menu.focusables.map((f) => [f.id, f.y, f.h]), [['identify', 86, 96], ['refresh', 186, 96]])
assert.equal(menu.h, 315)

// The search form: two 63 fields 12 apart, then Search and Cancel on one line, 331.9 tall.
const search = identifyLayout({ ...base, view: 'search' }, measure)
assert.deepEqual(search.focusables.map((f) => f.line), [0, 1, 2, 2])
assert.equal(search.focusables[0].y, 94)
assert.equal(search.focusables[2].y, 244)
assert.equal(search.h, 332)
// No name, no search.
assert.equal(identifyLayout({ ...base, name: ' ', view: 'search' }, measure).boxes.find((b) => b.id === 'search').dim, true)

// Results grow the dialog up to its max and then it scrolls.
const many = identifyLayout({ ...base, view: 'results', results: Array.from({ length: 20 }, () => ({ Name: 'x'.repeat(80), ProductionYear: 2012 })) }, measure)
assert.equal(many.w, 620 + 74)
assert.equal(many.h, MAX_PANEL_H)
assert.ok(many.fullH > many.h)
const none = identifyLayout({ ...base, view: 'results' }, measure)
assert.deepEqual(none.focusables.map((f) => f.id), ['back'])
console.log('identifyLayout ok')
