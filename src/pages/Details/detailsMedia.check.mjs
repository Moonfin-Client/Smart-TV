import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

const stub = (src) => `data:text/javascript,${encodeURIComponent(src)}`
const STUBS = {
  i18n: stub('export default (s) => s'),
  helpers: stub('export const getImageUrl = () => ""'),
  videoRange: stub('export const videoRangeBadges = () => []'),
}
registerHooks({
  resolve(spec, ctx, next) {
    const m = /\/(services\/i18n|utils\/helpers|utils\/videoRange)(\.js)?$/.exec(spec)
    if (m) return { url: STUBS[m[1].split('/').pop()], shortCircuit: true }
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})

const { hidesMediaDescription } = await import('./detailsMedia.js')
const { kidsModeSettings } = await import('../../utils/kidsMode.js')

const off = {
  hideDetailsMediaDescription: false,
  hideDetailsMediaDescriptionMovie: false,
  hideDetailsMediaDescriptionShow: false,
  hideDetailsMediaDescriptionSeason: false,
  hideDetailsMediaDescriptionEpisode: false,
  hideDetailsMediaDescriptionBoxSet: false,
}

// All off -> nothing hidden
for (const Type of ['Movie', 'Series', 'Season', 'Episode', 'BoxSet', 'Person', 'Book', 'MusicAlbum']) {
  assert.equal(hidesMediaDescription({ Type }, off), false, `${Type} should not hide when all off`)
}

// Granular video toggles act independently
assert.equal(hidesMediaDescription({ Type: 'Movie' }, { ...off, hideDetailsMediaDescriptionMovie: true }), true)
assert.equal(hidesMediaDescription({ Type: 'Episode' }, { ...off, hideDetailsMediaDescriptionMovie: true }), false)

assert.equal(hidesMediaDescription({ Type: 'Series' }, { ...off, hideDetailsMediaDescriptionShow: true }), true)
assert.equal(hidesMediaDescription({ Type: 'Show' }, { ...off, hideDetailsMediaDescriptionShow: true }), true)
assert.equal(hidesMediaDescription({ Type: 'Tv' }, { ...off, hideDetailsMediaDescriptionShow: true }), true)
assert.equal(hidesMediaDescription({ Type: 'Season' }, { ...off, hideDetailsMediaDescriptionShow: true }), false)

assert.equal(hidesMediaDescription({ Type: 'Season' }, { ...off, hideDetailsMediaDescriptionSeason: true }), true)
assert.equal(hidesMediaDescription({ Type: 'Episode' }, { ...off, hideDetailsMediaDescriptionEpisode: true }), true)
assert.equal(hidesMediaDescription({ Type: 'BoxSet' }, { ...off, hideDetailsMediaDescriptionBoxSet: true }), true)
assert.equal(hidesMediaDescription({ Type: 'Collection' }, { ...off, hideDetailsMediaDescriptionBoxSet: true }), true)

// Legacy fallback for Movie & Episode when granular key is omitted
assert.equal(hidesMediaDescription({ Type: 'Movie' }, { hideDetailsMediaDescription: true }), true)
assert.equal(hidesMediaDescription({ Type: 'Episode' }, { hideDetailsMediaDescription: true }), true)
assert.equal(hidesMediaDescription({ Type: 'Series' }, { hideDetailsMediaDescription: true }), false)
assert.equal(hidesMediaDescription({ Type: 'Season' }, { hideDetailsMediaDescription: true }), false)
assert.equal(hidesMediaDescription({ Type: 'BoxSet' }, { hideDetailsMediaDescription: true }), false)

// Explicit false overrides legacy true
assert.equal(hidesMediaDescription({ Type: 'Movie' }, { hideDetailsMediaDescription: true, hideDetailsMediaDescriptionMovie: false }), false)
assert.equal(hidesMediaDescription({ Type: 'Episode' }, { hideDetailsMediaDescription: true, hideDetailsMediaDescriptionEpisode: false }), false)

// Non-video types and Seerr discovery items stay visible even when all 5 toggles are enabled
const allOn = {
  hideDetailsMediaDescription: true,
  hideDetailsMediaDescriptionMovie: true,
  hideDetailsMediaDescriptionShow: true,
  hideDetailsMediaDescriptionSeason: true,
  hideDetailsMediaDescriptionEpisode: true,
  hideDetailsMediaDescriptionBoxSet: true,
}
for (const Type of ['Person', 'Book', 'AudioBook', 'MusicAlbum', 'MusicArtist', 'Audio', 'Playlist']) {
  assert.equal(hidesMediaDescription({ Type }, allOn), false, `non-video ${Type} should not hide`)
}
assert.equal(hidesMediaDescription({ Type: 'Movie', _seerrMediaId: 123 }, allOn), false)
assert.equal(hidesMediaDescription({ Type: 'Series', _seerrImdbId: 'tt12345' }, allOn), false)
assert.equal(hidesMediaDescription({ Type: 'Episode', ServerId: 'seerr' }, allOn), false)

// Kids Mode always hides descriptions and populates all granular flags
const kids = kidsModeSettings({ ...off, kidsModeEnabled: true })
assert.equal(kids.hideDetailsMediaDescriptionMovie, true)
assert.equal(kids.hideDetailsMediaDescriptionShow, true)
assert.equal(kids.hideDetailsMediaDescriptionSeason, true)
assert.equal(kids.hideDetailsMediaDescriptionEpisode, true)
assert.equal(kids.hideDetailsMediaDescriptionBoxSet, true)
assert.equal(hidesMediaDescription({ Type: 'Movie' }, kids), true)
assert.equal(hidesMediaDescription({ Type: 'Series' }, kids), true)
assert.equal(hidesMediaDescription({ Type: 'Movie', _seerrMediaId: 123 }, kids), true)
