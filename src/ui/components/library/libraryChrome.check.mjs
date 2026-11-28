// The library header's letters and crumbs outline in the theme's accent, and its search field rings
// in the focus color, so the Focus Color setting reaches it.
//   node --conditions=browser src/ui/components/library/libraryChrome.check.mjs
import assert from 'node:assert/strict'
import { stubUnloadable } from '../../../../scripts/stubUnloadable.mjs'

stubUnloadable()
const { libraryChrome, colorNum } = await import('./libraryChrome.js')

const t = { accent: '#ff2e92ff', focus: '#05d9e8ff' }
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

console.log('libraryChrome ok')
