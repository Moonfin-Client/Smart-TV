// The version that reaches Silo's start: a pinned version (the one Details shows) plays as that version, the
// default too, and an unpinned default (a title started without a version) leaves Silo free to play another.
//   node --conditions=browser src/services/siloVersionPin.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { createSiloPlayback } = await import('./siloPlayback.js')

const item = (count) => ({ Id: 'movie', MediaSources: [{ Id: 'uhd' }, { Id: 'hd' }].slice(0, count) })

// The start body Silo gets for one play; the start is refused once it's sent, so no plan has to be faked.
const startBody = async (body, { count = 2, features = ['fixed_media_file_v1'] } = {}) => {
  let sent = null
  const silo = createSiloPlayback({
    call: async (path, opts) => {
      if (path === '/api/v2/playback/capabilities') {
        return { state: 'available', allowed: true, protocol_versions: [3], installation_id: 'tv', features }
      }
      sent = opts.body
      throw Object.assign(new Error('refused'), { status: 400 })
    },
    getBaseUrl: () => 'http://silo',
    getUserId: () => 'profile',
    getAccessToken: () => 'token',
    getDeviceInfo: () => ({ appVersion: '1.0.0' }),
    platform: 'webos',
    getItem: async () => item(count),
    onPlaying: () => {},
  })
  await silo.getPlaybackInfo('movie', body, item(count)).catch(() => {})
  return sent
}

// The default, picked: Silo keeps it.
let sent = await startBody({ MediaSourceId: 'uhd', PinVersion: true })
assert.equal(sent.file_id, 'uhd')
assert.equal(sent.allow_alternate_versions, false, 'a picked default is pinned')
// The default, not picked: Silo may play another version.
sent = await startBody({ MediaSourceId: 'uhd' })
assert.equal(sent.file_id, 'uhd')
assert.equal(sent.allow_alternate_versions, undefined, 'an unpicked default is not pinned')
// Another version is pinned, picked or not (a restart, Watch Party's file).
for (const PinVersion of [true, undefined]) {
  sent = await startBody({ MediaSourceId: 'hd', PinVersion })
  assert.equal(sent.allow_alternate_versions, false, `the other version is pinned (PinVersion ${PinVersion})`)
}
// One version has nothing to pin, and a server without fixed_media_file_v1 isn't told.
sent = await startBody({ MediaSourceId: 'uhd', PinVersion: true }, { count: 1 })
assert.equal(sent.allow_alternate_versions, undefined)
sent = await startBody({ MediaSourceId: 'uhd', PinVersion: true }, { features: [] })
assert.equal(sent.allow_alternate_versions, undefined)

console.log('siloVersionPin ok')
