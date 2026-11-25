// Self-check for the Modern action row: node src/pages/Details/modern/actions.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// The app's modules lean on Vite for imports without an extension.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { actionRow } = await import('./actions.js')

const idle = { showsRequest: false, showsRequest4k: false, showsWatchlist: false, showsReportIssue: false, showsManageSlot: false }
const movie = { Id: 'm', Type: 'Movie', MediaType: 'Video', UserData: {}, CanDelete: false }
const base = {
  item: movie, seerr: idle, serverUrl: 'http://x', hasMultipleVersions: false, hasMultipleAudio: true, supportsMediaSourceSelection: true,
  hasTrailer: true, inSyncPlayGroup: false, showsPersonalRating: true, ratingStyle: 'thumbs', canAddToCollection: true, canChangeArtwork: false,
  canIdentify: false, canKeepAsComplete: false, resumeTimeText: '', isReadableBook: false,
}
const ids = (row) => row.buttons.map((b) => b.id)

// Play leads, then the catalog in declaration order with nothing arranged.
let row = actionRow({ ...base, settings: {} })
assert.deepEqual(ids(row), ['play', 'audio', 'subtitles', 'trailer', 'watched', 'favorite', 'personalRating', 'playlist', 'collection'])
// A saved arrangement moves what it names, a button it doesn't name follows the one declared before
// it, and hidden buttons go.
row = actionRow({ ...base, settings: { detailButtonOrderTv: ['trailer', 'audio'], hiddenDetailButtonsTv: ['favorite'] } })
assert.deepEqual(ids(row), ['play', 'trailer', 'watched', 'personalRating', 'playlist', 'collection', 'audio', 'subtitles'])
assert.ok(ids(row).indexOf('favorite') < 0)
// A position on the item turns Play into Resume and Restart.
row = actionRow({ ...base, item: { ...movie, UserData: { PlaybackPositionTicks: 5 } }, resumeTimeText: '1m', settings: {} })
assert.deepEqual(ids(row).slice(0, 2), ['resume', 'play'])
assert.equal(row.buttons[1].label, 'Restart')
// A cap of three keeps three on screen and folds the rest behind More Actions.
row = actionRow({ ...base, settings: { detailButtonsMaxVisible: 3 } })
assert.deepEqual(ids(row), ['play', 'audio', 'subtitles', 'more'])
assert.equal(row.behind[0].id, 'trailer')
// A person has nothing to play.
row = actionRow({ ...base, item: { Id: 'p', Type: 'Person', UserData: {} }, hasMultipleAudio: false, supportsMediaSourceSelection: false, hasTrailer: false, canAddToCollection: false, showsPersonalRating: false, settings: {} })
assert.equal(ids(row)[0], 'favorite')

// The other styles' options. Stage's cap of five with the track pickers left out keeps Play, three
// circles and More.
row = actionRow({ ...base, settings: {} }, { omitTrackButtons: true, buttonCap: 5, overflowAsMenu: true })
assert.deepEqual(ids(row), ['play', 'trailer', 'watched', 'favorite', 'more'])
assert.deepEqual(row.behind.map((b) => b.id), ['personalRating', 'playlist', 'collection'])
// The viewer's own count lowers a cap but never lifts it.
row = actionRow({ ...base, settings: { detailButtonsMaxVisible: 2 } }, { omitTrackButtons: true, buttonCap: 5 })
assert.deepEqual(ids(row), ['play', 'trailer', 'more'])
row = actionRow({ ...base, settings: { detailButtonsMaxVisible: 9 } }, { omitTrackButtons: true, buttonCap: 5 })
assert.equal(ids(row).length, 5)
// Minimalist's Extras and collection buttons follow Play, ahead of the arrangement.
row = actionRow({ ...base, settings: {} }, { maxVisibleButtons: 5, overflowAsMenu: true, extras: true, collectionItems: 'Movies' })
assert.deepEqual(ids(row), ['play', 'extras', 'collectionItems', 'audio', 'more'])
assert.equal(row.buttons[2].label, 'Movies')
// Stage, Premiere and Frost spell the resume position out on the button.
row = actionRow({ ...base, item: { ...movie, UserData: { PlaybackPositionTicks: 5 } }, resumeTimeText: '1m', settings: {} }, { longLabels: true })
assert.equal(row.buttons[0].label, 'Resume from 1m')

console.log('actions ok')
