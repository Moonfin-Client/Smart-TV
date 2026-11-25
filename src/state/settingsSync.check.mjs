import assert from 'node:assert/strict'
import { stubUnloadable } from '../../scripts/stubUnloadable.mjs'

stubUnloadable()
const { profileToLocal, resolveFromEnvelope } = await import('./settingsSync.js')

// Legacy true carries over to unset Movie and Episode only (never Show/Season/BoxSet)
const fromLegacyTrue = profileToLocal({ hideDetailsMediaDescription: true })
assert.equal(fromLegacyTrue.hideDetailsMediaDescription, true)
assert.equal(fromLegacyTrue.hideDetailsMediaDescriptionMovie, true)
assert.equal(fromLegacyTrue.hideDetailsMediaDescriptionEpisode, true)
assert.equal(fromLegacyTrue.hideDetailsMediaDescriptionShow, undefined)
assert.equal(fromLegacyTrue.hideDetailsMediaDescriptionSeason, undefined)
assert.equal(fromLegacyTrue.hideDetailsMediaDescriptionBoxSet, undefined)

// Legacy false also carries over to unset Movie and Episode so descriptions can be restored
const fromLegacyFalse = profileToLocal({ hideDetailsMediaDescription: false })
assert.equal(fromLegacyFalse.hideDetailsMediaDescription, false)
assert.equal(fromLegacyFalse.hideDetailsMediaDescriptionMovie, false)
assert.equal(fromLegacyFalse.hideDetailsMediaDescriptionEpisode, false)
assert.equal(fromLegacyFalse.hideDetailsMediaDescriptionShow, undefined)
assert.equal(fromLegacyFalse.hideDetailsMediaDescriptionSeason, undefined)
assert.equal(fromLegacyFalse.hideDetailsMediaDescriptionBoxSet, undefined)

// Explicit granular overrides are preserved alongside legacy fallback
const withOverride = profileToLocal({
  hideDetailsMediaDescription: true,
  hideDetailsMediaDescriptionMovie: false,
  hideDetailsMediaDescriptionShow: true,
})
assert.equal(withOverride.hideDetailsMediaDescriptionMovie, false)
assert.equal(withOverride.hideDetailsMediaDescriptionEpisode, true)
assert.equal(withOverride.hideDetailsMediaDescriptionShow, true)

// Active profile takes precedence over global profile, which takes precedence over admin defaults
const resolved = resolveFromEnvelope(
  {
    tv: { hideDetailsMediaDescriptionMovie: false },
    global: { hideDetailsMediaDescription: true, hideDetailsMediaDescriptionSeason: true },
  },
  { hideDetailsMediaDescriptionBoxSet: true },
  'tv',
)
assert.equal(resolved.hideDetailsMediaDescriptionMovie, false)
assert.equal(resolved.hideDetailsMediaDescriptionEpisode, true)
assert.equal(resolved.hideDetailsMediaDescriptionSeason, true)
assert.equal(resolved.hideDetailsMediaDescriptionBoxSet, true)
assert.equal(resolved.hideDetailsMediaDescriptionShow, undefined)

// Active profile legacy false overrides global granular true
const activeLegacyFalse = resolveFromEnvelope(
  {
    tv: { hideDetailsMediaDescription: false },
    global: { hideDetailsMediaDescriptionMovie: true, hideDetailsMediaDescriptionEpisode: true },
  },
  null,
  'tv',
)
assert.equal(activeLegacyFalse.hideDetailsMediaDescriptionMovie, false)
assert.equal(activeLegacyFalse.hideDetailsMediaDescriptionEpisode, false)
