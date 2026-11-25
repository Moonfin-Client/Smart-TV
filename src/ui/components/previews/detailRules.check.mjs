// Self-check for the detail previews' rules: node src/ui/components/previews/detailRules.check.mjs
import assert from 'node:assert/strict'
import { stubUnloadable } from '../../../../scripts/stubUnloadable.mjs'

stubUnloadable()
const { detailActions, detailMeta, detailWash, detailTech } = await import('./detailRules.js')

const ids = (r) => r.inline.map((a) => a.id)
const all = ['subtitles', 'trailer', 'watched', 'favorite', 'personalRating', 'playlist']
const inDeclared = (list) => list.slice().sort((a, b) => all.indexOf(a) - all.indexOf(b))

// Classic and Modern keep every button until a count is set.
assert.deepEqual(inDeclared(ids(detailActions('v2', {}))), all)
assert.equal(detailActions('v1', {}).more, false)
// Spotlight and Minimalist cap the row at five: Play, three and More.
assert.equal(detailActions('v3', {}).inline.length, 3)
assert.equal(detailActions('v3', {}).more, true)
assert.equal(detailActions('v5', {}).inline.length, 3)
// Nouveau keeps two when more than three would show.
assert.equal(detailActions('v4', {}).inline.length, 2)
assert.equal(detailActions('v4', {}).more, true)
// Stage drops the subtitle picker and caps at five, Premiere at six, Quick Look and Frost at six.
assert.ok(ids(detailActions('v6', {})).indexOf('subtitles') < 0)
assert.equal(detailActions('v6', {}).inline.length, 3)
assert.equal(detailActions('v7', {}).inline.length, 4)
assert.equal(detailActions('v8', {}).inline.length, 4)
assert.equal(detailActions('v9', {}).inline.length, 4)
// A count of three leaves Play, two and More on Modern. All lifts every cap but Stage's.
assert.equal(detailActions('v2', { detailButtonsMaxVisible: 3 }).inline.length, 2)
assert.equal(detailActions('v3', { detailButtonsMaxVisible: -1 }).more, false)
assert.equal(detailActions('v6', { detailButtonsMaxVisible: 9 }).inline.length, 3)
// Hidden buttons go, and the saved order leads.
assert.ok(ids(detailActions('v2', { hiddenDetailButtonsTv: ['trailer'] })).indexOf('trailer') < 0)
const reordered = ids(detailActions('v2', { detailButtonOrderTv: ['playlist', 'favorite'] }))
assert.ok(reordered.indexOf('playlist') < reordered.indexOf('favorite'))
// The rating button follows the style on the sample's 8 out of 10.
const rating = (style) => detailActions('v2', { personalRatingStyle: style }).inline.find((a) => a.id === 'personalRating')
assert.equal(rating('thumbs').label, 'Like')
assert.equal(rating('thumbs').icon, 'icons/d/rating_thumbUp.webp')
assert.equal(rating('stars').label, '★★★★')
assert.equal(rating('numeric').label, 'Rated')
assert.equal(rating('numeric').icon, 'icons/d/rating_numbers.webp')

const film = { year: 1991, officialRating: 'R', runtimeMinutes: 156, genres: ['Action', 'Thriller', 'Science Fiction', 'Drama'] }
assert.deepEqual(detailMeta(film, {}).map((m) => m.text), ['1991', 'R', '2h 36m', 'Action · Thriller · Science Fiction'])
assert.deepEqual(detailMeta(film, { hiddenDetailMetadataTv: ['year'], detailMetadataOrderTv: ['genres', 'year', 'parentalRating', 'runtimeAndSeasons'] }).map((m) => m.id), ['genres', 'parentalRating', 'runtimeAndSeasons'])

assert.deepEqual(detailWash({}), { alpha: 0.8 * 0.8, gradientScale: 0.3 + 0.7 * 0.8 })
assert.equal(detailTech({}), null)
assert.deepEqual(detailTech({ detailShowTechnicalDetails: true }).badges.map((b) => b.label), ['4K', 'HDR10', 'HEVC', 'MKV', '5.1', 'EAC3'])
console.log('detailRules ok')
