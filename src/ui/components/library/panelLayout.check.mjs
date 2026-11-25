import assert from 'node:assert/strict'
import { layoutPanel, scrollFor } from './panelLayout.js'

// Sort & Filter at the top: two option rows, then closed sections 65 apart.
const { rows, height } = layoutPanel([
  { kind: 'check', id: 'a' },
  { kind: 'check', id: 'b' },
  { kind: 'section', key: 'sort', id: 's1', open: false },
  { kind: 'section', key: 'filters', id: 's2', open: true, rows: [{ kind: 'check', id: 'fav' }, { kind: 'check', id: 'fav2' }] },
  { kind: 'wrap', id: 'w', rows: [{ kind: 'clear', id: 'c' }] },
])
const at = (id) => rows.find((r) => r.id === id && r.kind !== 'line')
assert.equal(at('a').y, 76)
assert.equal(at('b').y, 134)
assert.equal(at('s1').y, 205)
assert.equal(at('s2').y, 270)
assert.equal(at('fav').y, 322)
assert.equal(at('fav2').y, 380)
assert.equal(at('c').y, 451)
assert.equal(height, 451 + 54 + 31)
// A row below the panel's foot scrolls up into view with 24 to spare, and never past the end.
assert.equal(scrollFor({ y: 900, h: 54 }, 0, 800, 1200), 178)
assert.equal(scrollFor({ y: 1150, h: 54 }, 0, 800, 1200), 400)
assert.equal(scrollFor({ y: 76, h: 54 }, 300, 800, 1200), 52)
// The Display dialog: headings 60 high, the first folding its margin into the title's.
const display = layoutPanel([
  { kind: 'heading', id: 'h1' }, { kind: 'radio', id: 'v' }, { kind: 'radio', id: 'h' }, { kind: 'heading', id: 'h2' }, { kind: 'radio', id: 'p' },
])
const dat = (id) => display.rows.find((r) => r.id === id && r.kind !== 'line')
assert.equal(dat('h1').y, 77)
assert.equal(dat('v').y, 136)
assert.equal(dat('h').y, 194)
assert.equal(dat('h2').y, 257)
assert.equal(dat('p').y, 320)
// Group By opens on a rule, which folds the same way.
assert.equal(layoutPanel([{ kind: 'rule', id: 'r' }, { kind: 'radio', id: 'n' }]).rows.find((r) => r.id === 'n').y, 85)
console.log('panelLayout ok')
