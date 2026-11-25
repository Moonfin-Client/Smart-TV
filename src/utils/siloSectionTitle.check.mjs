// Silo's own Home rows in the app's language, from the title_key Silo sends while a row keeps its own title.
//   node --conditions=browser src/utils/siloSectionTitle.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// A marked $L shows the string went through translation.
const stub = (src) => `data:text/javascript,${encodeURIComponent(src)}`
registerHooks({
  resolve(spec, ctx, next) {
    if (/services\/i18n(\.js)?$/.test(spec)) return { url: stub('export default (s) => `[${s}]`'), shortCircuit: true }
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { siloSectionTitle } = await import('./siloSectionTitle.js')
const { findServerSection } = await import('./pickedRows.js')
const { createSiloItems } = await import('../services/siloItems.js')

// A keyed row takes the app's string, and the row's value fills its placeholder after translation.
assert.equal(siloSectionTitle({ title: 'Hidden Gems', titleKey: 'home.section.hiddenGems' }), '[Hidden Gems]')
assert.equal(siloSectionTitle({ title: 'Seasonal Picks', titleKey: 'home.section.seasonal.christmas.classics' }), '[Christmas Classics]')
assert.equal(siloSectionTitle({ title: 'Top Drama', titleKey: 'home.section.topGenre', titleArgs: { genre: 'Drama' } }), '[Top Drama]')
assert.equal(siloSectionTitle({ title: 'x', titleKey: 'home.section.recentlyAddedIn', titleArgs: { library: 'Films' } }), '[Recently Added in Films]')
assert.equal(siloSectionTitle({ title: 'x', titleKey: 'home.section.becauseYouWatchedTitle', titleArgs: { title: "Rock $'n' Roll" } }), "[Because You Watched Rock $'n' Roll]")

// Silo's title stays when there is nothing to translate by.
assert.equal(siloSectionTitle({ title: 'Sunday Picks', titleKey: '' }), 'Sunday Picks')
assert.equal(siloSectionTitle({ title: 'Brand New Row', titleKey: 'home.section.brandNewRow' }), 'Brand New Row')
assert.equal(siloSectionTitle({ title: 'Recently Added in Films', titleKey: 'home.section.recentlyAddedIn', titleArgs: {} }), 'Recently Added in Films')
assert.equal(siloSectionTitle({ title: 'Odd', titleKey: 'constructor' }), 'Odd')

// Silo's sections carry the label beside the title settings keep.
const call = async (path) => (path === '/api/v2/home/layout' ? { sections: [
  { id: 's1', section_type: 'continue_watching', title: 'Continue Watching', title_key: 'home.section.continueWatching' },
  { id: 's2', section_type: 'hidden_gems', title: 'Hidden Gems', title_key: 'home.section.hiddenGems' },
  { id: 's3', section_type: 'top_genre', title: 'Sunday Picks' },
] } : null)
const items = createSiloItems({ call, images: { register: () => null, tagFor: () => null }, getConfiguration: async () => ({}), getUserId: () => 'p1', publishUserData: () => {} })
const sections = await items.getServerHomeSections()
assert.deepEqual(sections, [
  { id: 's2', title: 'Hidden Gems', label: '[Hidden Gems]', kind: 'hidden_gems' },
  { id: 's3', title: 'Sunday Picks', label: 'Sunday Picks', kind: 'top_genre' },
])

// A picked row finds its section by id; a Moonbase section-type row only while it keeps the stock name.
assert.equal(findServerSection(sections, { itemId: 's2', name: 'Whatever' }).label, '[Hidden Gems]')
assert.equal(findServerSection(sections, { itemId: 'type:hidden_gems', name: 'Hidden gems' }).label, '[Hidden Gems]')
assert.equal(findServerSection(sections, { itemId: 'type:hidden_gems', name: 'Our Favourites' }), null)
assert.equal(findServerSection(sections, { itemId: 'gone' }), null)
console.log('siloSectionTitle ok')
