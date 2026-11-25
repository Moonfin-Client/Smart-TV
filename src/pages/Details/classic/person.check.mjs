// Self-check that a person's tab switch, which lays out only the tabs and the row under them, comes
// out as a full paint of that tab would: node src/pages/Details/classic/person.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// Stubs stand in for the measuring, the server and the rows, which this check doesn't reach.
const stub = (src) => `data:text/javascript,${encodeURIComponent(src)}`
const STUBS = {
  text: stub("export const cssShift = (s) => Math.round(0.0918 * s * 2) / 2; export const fontFor = () => 'roboto'; export const uiFont = () => 'roboto'"),
  hero: stub('export const ratingsRow = () => 40'),
  meta: stub('export const SEERR_PILL = {}'),
  detailMarks: stub('export const drawAnimePills = () => ({ w: 0, h: 0 })'),
  animePills: stub('export const PILL_H = 28.5'),
  helpers: stub("export const getImageUrl = (s, id, t) => s + '/' + id + '/' + t; export const formatDuration = () => '1h'"),
  personCredits: stub('export const personDateLines = (a, b) => [a, b].filter(Boolean)'),
  personFavorite: stub('export const offersFavorite = () => true'),
  detailsMedia: stub('export const hidesMediaDescription = () => false'),
  sections: stub("export const compactAnimePills = () => null; export const scrollRowFor = () => null; export const thumbEntries = () => []; export const mediaRowFor = (k, title, items, s, w, type) => ({ k, title, n: items.length, type, h: type === 'landscape' ? 300 : 400 })"),
  i18n: stub("export default (s) => s; export const currentLocale = () => 'en'"),
  actions: stub('export const classicActions = () => ({ buttons: [], behind: [] })'),
}
registerHooks({
  resolve(spec, ctx, next) {
    const m = /\/(ui\/text|modern\/hero|modern\/meta|detailMarks|player\/animePills|utils\/helpers|utils\/personCredits|personFavorite|detailsMedia|sections|services\/i18n|actions)(\.js)?$/.exec(spec)
    if (m) return { url: STUBS[m[1].split('/').pop()], shortCircuit: true }
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { paintPerson, personTabs } = await import('./screens.js')

const tokens = { neon: false, onSurface: '#ffffffff', os: () => '#ffffffe6' }
const film = { movies: [{ Id: 'm1', ImageTags: { Backdrop: 'b' } }, { Id: 'm2' }], series: [{ Id: 's1' }], guestAppearances: [{ Id: 'g1' }], musicVideos: [] }
const d = {
  item: { Id: 'p', Name: 'A Person With A Long Name', Type: 'Person', Overview: 'Bio text '.repeat(40), PremiereDate: '1970', ImageTags: { Primary: 'x' } },
  settings: {}, left: 100, contentW: 1700, server: 'srv', birthPlace: 'Town', ratings: [{ k: 1 }], ratingStyle: {},
  showsSection: () => true, filmography: film,
}
const comp = (tab) => ({ tokens, _person: { expanded: false, tab, credits: { appearances: [{ Id: 'a' }], crew: [] }, bg: 'kept' }, personOv: null, randomBg: '' })

// Tab 9 runs past the tabs there are, so both go back to the first.
for (const tab of [0, 1, 2, 3, 9]) {
  const full = comp(tab)
  const want = paintPerson(full, d)
  const switched = comp(0)
  const first = paintPerson(switched, d)
  switched._person.tab = tab
  const got = { ...first, ...personTabs(switched, first.head) }
  delete want.head
  delete got.head
  assert.deepEqual(got, want, `tab ${tab}`)
  assert.equal(switched._person.tab, full._person.tab)
}
console.log('person ok')
