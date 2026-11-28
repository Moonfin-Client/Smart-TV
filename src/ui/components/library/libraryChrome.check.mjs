// The library header's letters and crumbs outline in the theme's accent, and its search field rings
// in the focus color, so the Focus Color setting reaches it.
//   node --conditions=browser src/ui/components/library/libraryChrome.check.mjs
import assert from 'node:assert/strict'
import { stubUnloadable } from '../../../../scripts/stubUnloadable.mjs'

stubUnloadable()
const { libraryChrome, colorNum } = await import('./libraryChrome.js')

const t = { accent: '#ff2e92ff', focus: '#05d9e8ff', onSurface: '#202020ff', os: (a) => `os${a}`, background: '#f5f5f5ff', surface: '#e0e0e0ff' }
const base = { title: 'Films', titleFont: 'x', count: 3, query: '', letters: true, show: true, settings: true, sortLabel: 'Name', ascending: true, ms: 0 }
for (const style of ['classic', 'modern', 'docked']) {
  const out = libraryChrome({ ...base, style }, t)
  const search = out.controls.find((c) => c.id === 'search')
  if (search) assert.equal(search.ringBorder.color, colorNum('#05d9e8ff'), style)
  const letter = out.controls.find((c) => c.kind === 'letter')
  assert.ok(letter, style)
  assert.equal(letter.ringBorder.color, colorNum('#ff2e92ff'), style)
  assert.equal(letter.labelOn, '#ff2e92ff', style)
}
const crumbs = libraryChrome({ ...base, style: 'classic', crumbs: [{ name: 'A', font: 'x' }, { name: 'B', font: 'x' }], rootName: 'Root', crumbFonts: ['x', 'x', 'x'] }, t)
const crumb = crumbs.controls.find((c) => c.kind === 'crumb')
assert.ok(crumb)
assert.equal(crumb.ringBorder.color, colorNum('#ff2e92ff'))

// The rest follows the theme: text in its foreground, a focused button, pill or dock row filled with
// it in background-colored ink, and the bar, dock and field on its surface.
const modern = libraryChrome({ ...base, style: 'modern' }, t)
const sort = modern.controls.find((c) => c.id === 'sort')
assert.deepEqual([sort.fill, sort.inkOn, sort.labelOff, sort.labelOn], ['#202020ff', '#f5f5f5ff', '#202020ff', '#f5f5f5ff'])
assert.equal(modern.boxes.find((b) => b.k === 'bar').color, '#e0e0e0b8')
assert.equal(modern.controls.find((c) => c.id === 'search').base, '#e0e0e0b8')
assert.equal(modern.texts.find((x) => x.k === 'title').color, '#202020ff')
assert.equal(modern.texts.find((x) => x.k === 'count').color, 'os0.4')
const docked = libraryChrome({ ...base, style: 'docked' }, t)
assert.equal(docked.boxes.find((b) => b.k === 'dock').color, '#e0e0e0e0')
const row = docked.controls.find((c) => c.kind === 'dockRow')
assert.deepEqual([row.fill, row.inkOn], ['#202020ff', '#f5f5f5ff'])
const classic = libraryChrome({ ...base, style: 'classic' }, t)
const home = classic.controls.find((c) => c.id === 'home')
assert.deepEqual([home.fill, home.inkOn, home.iconOff], ['#202020ff', '#f5f5f5ff', 'os0.5'])
// On Neon Pulse a focused toolbar button keeps its icon cyan on the pink tint, as the bar's do.
const neon = libraryChrome({ ...base, style: 'classic', neon: true }, t)
assert.equal(neon.controls.find((c) => c.id === 'home').inkOn, '#00e5ff')

console.log('libraryChrome ok')
