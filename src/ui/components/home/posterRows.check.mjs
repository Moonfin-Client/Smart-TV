// A Poster set on Continue Watching or Next Up in Row Image Types turns their cards into posters,
// and an episode on Home's poster card shows its series poster, as Core does.
//   node --conditions=browser src/ui/components/home/posterRows.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

const stub = (src) => `data:text/javascript,${encodeURIComponent(src)}`
registerHooks({
  resolve(spec, ctx, next) {
    if (/services\/i18n(\.js)?$/.test(spec)) return { url: stub("export default (s) => s; export const currentLocale = () => 'en-US'"), shortCircuit: true }
    if (/package\.json$/.test(spec)) return { url: stub("export default { version: '0.0.0' }"), shortCircuit: true }
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { rowCardType, rowPeekHeight } = await import('./rowPeek.js')
const { classicCard, shapeRow } = await import('./cards.js')
const { episodeArtwork } = await import('./cardArtwork.js')

const classic = { homeRowsStyle: 'v1', homeRowsImageType: 'poster', homeRowsPosterSize: 'default' }
const continueRow = { id: 'continue-nextup', type: 'landscape' }

// A Poster set on the row itself, or on either half of the merged row, makes the cards posters.
assert.equal(rowCardType({ id: 'resume', type: 'landscape' }, { ...classic, homeRowImageTypes: { resume: 'poster' } }), 'portrait')
assert.equal(rowCardType({ id: 'nextup', type: 'landscape' }, { ...classic, homeRowImageTypes: { nextup: 'poster' } }), 'portrait')
assert.equal(rowCardType(continueRow, { ...classic, homeRowImageTypes: { nextup: 'poster' } }), 'portrait')
// The rows stay wide under the default image type, another override, or Modern rows.
assert.equal(rowCardType(continueRow, classic), 'landscape')
assert.equal(rowCardType(continueRow, { ...classic, homeRowImageTypes: { resume: 'thumb', nextup: 'poster' } }), 'landscape')
assert.equal(rowCardType(continueRow, { ...classic, homeRowsStyle: 'v2', homeRowImageTypes: { resume: 'poster' } }), 'landscape')
// Other rows keep their own type.
assert.equal(rowCardType({ id: 'favoriteEpisodes', type: 'landscape' }, { ...classic, homeRowImageTypes: { favoriteEpisodes: 'poster' } }), 'landscape')
assert.equal(rowCardType({ id: 'latest-movies', isLatestRow: true, type: 'portrait' }, classic), 'portrait')
// The media bar's peek shows half of a poster card: 69 + 360 / 2.
const peek = { ...classic, mediaBarRowPeek: true, featuredBarStyle: 'fullscreen' }
assert.equal(rowPeekHeight({ ...peek, homeRowImageTypes: { resume: 'poster' } }, { id: 'resume', type: 'landscape' }), 249)
assert.equal(rowPeekHeight(peek, { id: 'resume', type: 'landscape' }), 177)

// Home's rows draw poster cards.
const movie = { _serverUrl: 'http://server', Id: 'm1', Type: 'Movie', Name: 'Film', ImageTags: { Primary: 'p' } }
const look = { style: 'classic' }
const cardsOf = (s) => shapeRow({ id: 'resume', key: 'resume', type: 'landscape', items: [movie] }, look, s).cards
const posterCard = cardsOf({ ...classic, homeRowImageTypes: { resume: 'poster' } })[0]
assert.ok(posterCard.h > posterCard.w, `poster card is ${posterCard.w}x${posterCard.h}`)
const wideCard = cardsOf(classic)[0]
assert.ok(wideCard.w > wideCard.h, `wide card is ${wideCard.w}x${wideCard.h}`)

// An episode on a Home poster card shows its series poster, or the season poster the server named, else its still.
const episode = { _serverUrl: 'http://server', Id: 'e1', Type: 'Episode', Name: 'Pilot', SeriesId: 's1', SeriesPrimaryImageTag: 'tag', ImageTags: { Primary: 'still' } }
const image = (it, opts = {}) => classicCard(it, 0, { s: classic, cardType: 'portrait', imageType: 'poster', ...opts }).image
assert.match(image(episode), /\/Items\/s1\/Images\/Primary/)
const noSeriesPoster = { ...episode, SeriesPrimaryImageTag: undefined }
assert.match(image({ ...noSeriesPoster, ParentPrimaryImageItemId: 'season1', ParentPrimaryImageTag: 'st' }), /\/Items\/season1\/Images\/Primary\?.*tag=st/)
assert.match(image(noSeriesPoster), /\/Items\/e1\/Images\/Primary/)
// A wide card and a poster card off Home keep the episode still.
assert.match(image(episode, { cardType: 'landscape', imageType: 'thumb' }), /\/Items\/e1\/Images\/Primary/)
assert.match(image(episode, { plain: true }), /\/Items\/e1\/Images\/Primary/)
// A season poster isn't guessed for a wide row.
assert.equal(episodeArtwork({ ...noSeriesPoster, ImageTags: {}, ParentPrimaryImageItemId: 'season1', ParentPrimaryImageTag: 'st' }, 'http://server', 'thumb', true), null)

console.log('posterRows ok')
