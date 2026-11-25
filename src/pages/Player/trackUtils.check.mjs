// Self-check for webosTrackUtils.js and tizenTrackUtils.js: node src/pages/Player/trackUtils.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const src = join(dirname(fileURLToPath(import.meta.url)), '../..')
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('@moonfin/app/src/')) spec = pathToFileURL(join(src, spec.slice('@moonfin/app/src/'.length))).href
    if ((spec.startsWith('.') || spec.startsWith('file:')) && !/\.(m?js|json)$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
  load(url, ctx, next) {
    if (url.endsWith('/platform/tizen/deviceProfile.js')) return { format: 'module', shortCircuit: true, source: 'export const detectTizenVersion = () => 8' }
    return next(url, ctx)
  },
})
const { matchAudioTrack } = await import('./webosTrackUtils.js')
const { mapJellyfinTrackToTizen } = await import('./tizenTrackUtils.js')

const yes = () => true
const streams = [
  { index: 1, language: 'eng', codec: 'aac' },
  { index: 2, language: 'jpn', codec: 'aac' },
]
assert.equal(matchAudioTrack([{ language: 'en' }, { language: 'ja' }], streams, 2, yes), 1, 'two-letter codes match three')
// An unlabeled track isn't a match for every language.
assert.equal(matchAudioTrack([{ language: '' }, { language: 'jpn' }], streams, 2, yes), 1)
assert.equal(matchAudioTrack([{ language: '' }, { language: '' }], streams, 2, yes), 1, 'falls back to the position')
// LG leaves out what it can't play, and only playable streams pair then.
const withTruehd = [{ index: 1, language: 'eng', codec: 'truehd' }].concat(streams.map((x) => ({ ...x, index: x.index + 1 })))
const playable = (x) => x.codec !== 'truehd'
assert.equal(matchAudioTrack([{ language: 'eng' }, { language: 'jpn' }], withTruehd, 3, playable), 1)
assert.equal(matchAudioTrack([{ language: 'eng' }, { language: 'jpn' }], withTruehd, 1, playable), -1, 'an unplayable pick goes to the server')
assert.equal(matchAudioTrack([{}, {}, {}], streams, 2, yes), -1, 'lists that differ go to the server')

// AVPlay leaves out DTS and TrueHD, and PGS and DVD from its TEXT list.
const tracks = [
  { type: 'VIDEO', index: 0 },
  { type: 'AUDIO', index: 1 },
  { type: 'AUDIO', index: 2 },
  { type: 'TEXT', index: 3 },
]
const audio = [
  { index: 1, codec: 'dts' },
  { index: 2, codec: 'aac' },
  { index: 3, codec: 'ac3' },
]
assert.equal(mapJellyfinTrackToTizen(tracks, audio, 'AUDIO', 3), 2)
assert.equal(mapJellyfinTrackToTizen(tracks, audio, 'AUDIO', 2), 1)
assert.equal(mapJellyfinTrackToTizen(tracks, audio, 'AUDIO', 1), null)
const text = [
  { index: 5, codec: 'pgssub' },
  { index: 6, codec: 'subrip' },
]
assert.equal(mapJellyfinTrackToTizen(tracks, text, 'TEXT', 6), 3)
assert.equal(mapJellyfinTrackToTizen([], text, 'TEXT', 6), null)
console.log('trackUtils ok')
