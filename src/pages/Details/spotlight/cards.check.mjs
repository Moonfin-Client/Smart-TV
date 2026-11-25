// Self-check for Spotlight's summary cards: node src/pages/Details/spotlight/cards.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// The app's modules lean on Vite for imports without an extension.
registerHooks({
  resolve(spec, ctx, next) {
    // These pull in the server API and the locale, which need Vite, and the cards only ask them for urls.
    if (/services\/seerrApi(\.js)?$/.test(spec)) return { url: 'data:text/javascript,export const getImageUrl = (p) => p; export default { getImageUrl }', shortCircuit: true }
    else if (/utils\/helpers(\.js)?$/.test(spec)) return { url: 'data:text/javascript,export const getImageUrl = (s, id, type) => `${s}/${id}/${type}`', shortCircuit: true }
    else if (/utils\/kidsMode(\.js)?$/.test(spec)) return { url: 'data:text/javascript,export const isKidsMode = () => false', shortCircuit: true }
    else if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { spotlightCardsFor, spotlightCardFor, spotlightRuntimeLabel, dedupePeople, spotlightMetaPieces } = await import('./cards.js')

const state = (over) => ({ item: { Id: 'item-1', Type: 'Movie', Name: 'Thing' }, serverUrl: 'https://tv.example', settings: {}, ...over })
const child = (Id, Type = 'Movie', over = {}) => ({ Id, Name: Id, Type, ...over })
const ids = (cards) => cards.map((c) => c.id)

assert.equal(spotlightRuntimeLabel(7200 * 10000000), '2h')
assert.equal(spotlightRuntimeLabel(5520 * 10000000), '1h 32m')
assert.equal(spotlightRuntimeLabel(2880 * 10000000), '48m')

const people = dedupePeople([{ Id: 'p1', Name: 'A', Role: 'Self' }, { Id: 'p1', Name: 'A', Role: 'Narrator' }])
assert.equal(people.length, 1)
assert.equal(people[0].Role, 'Self · Narrator')

assert.deepEqual(spotlightCardsFor(state()), [])
assert.deepEqual(ids(spotlightCardsFor(state({
  cast: [child('p1')], item: { Id: 'item-1', Type: 'Movie', Chapters: [{ Name: 'One' }] }, extras: [child('e1', 'Video')], similar: [child('s1')],
}))), ['people', 'chapters_extras', 'similar'])
const person = { Id: 'p1', Name: 'A' }
assert.equal(spotlightCardsFor(state({ cast: [person], crew: [person] }))[0].subtitle, '1 person')

// A series leads with its seasons, named for the show once open.
const series = spotlightCardsFor(state({ item: { Id: 'item-1', Type: 'Series', Name: 'Deadwood' }, seasons: [child('season-1', 'Season')] }))
assert.equal(series[0].id, 'seasons')
assert.equal(series[0].modalTitle, 'Deadwood')

// An episode's run folds into a section per season, only the one being watched open.
const ep = (Id, season, n) => child(Id, 'Episode', { ParentIndexNumber: season, IndexNumber: n })
const more = spotlightCardFor('episodes', state({
  item: { Id: 'e2', Type: 'Episode', ParentIndexNumber: 2, IndexNumber: 1 },
  seriesEpisodes: [ep('e1', 1, 1), ep('e2', 2, 1), ep('e3', 2, 2)],
}))
assert.deepEqual(more.sections.map((s) => [s.title, s.expanded, s.count]), [['Season 1', false, 1], ['Season 2', true, 2]])
assert.equal(more.subtitle, '2 seasons · 3 episodes')

// A collection's titles split into movies and shows, and its play order carries the sort.
const box = spotlightCardsFor(state({
  item: { Id: 'b', Type: 'BoxSet' }, collectionItems: [child('m1'), child('s1', 'Series')], playlistItems: [child('m1')],
  playlistSort: { label: 'Server Order', loading: false },
}))
assert.deepEqual(ids(box), ['boxset_items', 'playlist_order'])
assert.deepEqual(box[0].sections.map((s) => s.title), ['Movies', 'TV Shows'])
assert.equal(box[1].headerAction.label, 'Server Order')

// The facts line draws the runtime as a clock, and a status pill on a series.
const meta = spotlightMetaPieces({ item: { Type: 'Series', Status: 'Ended' }, year: 2001, seasonCount: 3, genres: ['A', 'B'] })
assert.deepEqual(meta.map((p) => p.kind), ['text', 'text', 'status', 'text'])
assert.equal(meta[2].ended, true)
console.log('spotlight cards ok')
