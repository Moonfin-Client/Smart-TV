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

const tokens = { neon: false, onSurface: '#ffffffff', os: () => '#ffffffe6', focus: '#00a4dcff', accent: '#00a4dcff', accentA: () => '#00a4dc4d' }
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

// The portrait has no ring, on any theme, and Neon Pulse's pink glow is gone with it.
for (const neon of [false, true]) {
  const p = paintPerson({ ...comp(0), tokens: { ...tokens, neon } }, d)
  assert.ok(!p.out.rects.some((r) => r.k === 'photoRing'), 'no portrait ring')
  assert.ok(!p.out.rects.some((r) => r.shadow && /ff2e92/.test(r.shadow.color)), 'no pink glow')
}
// The open tab fills with the focus color and its label reads on it: dark on a bright focus color
// (Glass's white, Moonfin's cyan), white on a dim one. A focused tab writes in the text color.
const NEON = { neon: true, onSurface: '#00e5ffff', os: (a) => '#00e5ff' + Math.round(a * 255).toString(16).padStart(2, '0'), accent: '#ff2e92ff', accentA: () => '#ff2e924d' }
for (const [focus, ink] of [['#ffffffff', '#000000de'], ['#00e5ffff', '#000000de'], ['#7b1fa2ff', '#ffffffff']]) {
  const tabs = paintPerson({ ...comp(1), tokens: { ...NEON, focus } }, d).pillsB
  const open = tabs.find((x) => x.idx === 1)
  assert.equal(open.bg, focus, 'open tab fill')
  assert.equal(open.ink, ink, `open tab label on ${focus}`)
  assert.equal(open.inkOn, NEON.onSurface, 'focused open tab')
  const other = tabs.find((x) => x.idx === 0)
  assert.equal(other.ink, NEON.os(0.7), 'closed tab label')
  assert.equal(other.inkOn, NEON.onSurface)
}
// The action pills take the accent when focused and the text color for their labels.
const pills = paintPerson({ ...comp(0), tokens: { ...NEON, focus: '#ffd400ff' } }, d).pillsA
assert.ok(pills.length && pills.every((x) => x.bdOn === NEON.accent && x.ink === NEON.onSurface && x.inkOn === NEON.onSurface), 'action pills')
console.log('person ok')
