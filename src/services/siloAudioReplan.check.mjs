// What a replan of a Silo title tells Silo about audio. The track the player plays is the plan's, or on the original
// file one the player switched to itself: asking for another is a track change, asking with that one again only
// moves the timeline, and only a failed original file (or the TV refusing the plan's own track) is a failure.
//   node --conditions=browser src/services/siloAudioReplan.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { createSiloPlayback } = await import('./siloPlayback.js')
const { siloItemMediaSources } = await import('./siloMediaSources.js')

const ITEM = 'local-dual'
const audioTrack = (language, isDefault) => ({ language, codec: 'aac', layout: 'stereo', channels: 2, default: isDefault })
const version = {
  file_id: '235', container: 'mkv', codec_video: 'h264', codec_audio: 'aac', duration: 120,
  video_tracks: [{ codec: 'h264', width: 1280, height: 720 }],
  audio_tracks: [audioTrack('en', true), audioTrack('es', false)],
}
const item = { Id: ITEM, MediaSources: siloItemMediaSources({ type: 'movie', versions: [version] }, ITEM) }
const source = item.MediaSources[0]
const [english, spanish] = source.MediaStreams.filter((s) => s.Type === 'Audio').map((s) => s.Index)

const plan = (delivery, audio, n) => ({
  protocol_version: 3,
  plan_id: `plan:${n}`,
  plan_attempt_key: `v3:${n}`,
  session_id: 'session',
  delivery,
  stream: { url: `/api/v2/stream/session?st=${n}`, protocol: delivery === 'server_remux_hls' ? 'hls' : 'http_progressive', container: 'mkv', headers: {} },
  timeline: { source_start_seconds: 0, stream_origin_seconds: 0, player_start_seconds: 0, timeline_offset_seconds: 0, can_seek_anywhere: true },
  selected_tracks: { audio },
  requested_media_file_id: 235,
  effective_media_file_id: 235,
})

// Starts the title on a plan (direct play unless told), lets `before` act on the playing session, then sends each ask
// in turn and returns the replans Silo was sent. A reanchor keeps the route; anything else answers with a remux.
const replansFor = async (bodies, { delivery = 'original_http', before } = {}) => {
  const replans = []
  let current = delivery
  const call = async (path, opts = {}) => {
    if (path.endsWith('/playback/capabilities')) return { state: 'available', allowed: true, protocol_versions: [3], installation_id: 'install', features: ['playback_plan_v3'] }
    if (path.endsWith('/playback/start')) return { outcome: 'playable', session_id: 'session', playback_plan: plan(delivery, { id: 'file:235:audio:0', index: 0 }, 1) }
    if (path.endsWith('/replan')) {
      replans.push(opts.body)
      if (opts.body.operation !== 'seek_reanchor') current = 'server_remux_hls'
      return { outcome: 'playable', session_id: 'session', playback_plan: plan(current, opts.body.selected_tracks.audio, replans.length + 1) }
    }
    throw new Error(`unexpected call ${path}`)
  }
  const silo = createSiloPlayback({
    call, getBaseUrl: () => 'http://silo', getUserId: () => 'profile', getAccessToken: () => 'token',
    getDeviceInfo: () => ({ appVersion: '1.0.0' }), platform: 'webos', getItem: async () => item, onPlaying: () => {},
  })
  const started = await silo.getPlaybackInfo(ITEM, { MediaSourceId: '235' }, item)
  assert.equal(started.MediaSources[0].DefaultAudioStreamIndex, english, 'starts on the default audio')
  if (before) before(silo, started.PlaySessionId)
  for (const body of bodies) await silo.getPlaybackInfo(ITEM, { MediaSourceId: '235', StartTimeTicks: 300000000, DirectPlayFailed: false, ...body }, item)
  assert.equal(replans.length, bodies.length)
  return replans
}
const replanFor = async (body, opts) => (await replansFor([body], opts))[0]
// The player switched the original file to Spanish itself.
const switchedToSpanish = { before: (silo, id) => silo.noteAudioPlaying(id, spanish) }
const ENGLISH = { id: 'file:235:audio:0', index: 0 }
const SPANISH = { id: 'file:235:audio:1', index: 1 }

// An audio change (a menu pick, or the player asking for the preferred track at start): a track change with the new
// track, and the direct route isn't ruled out.
const change = await replanFor({ AudioStreamIndex: spanish })
assert.equal(change.operation, 'track_change')
assert.deepEqual(change.selected_tracks.audio, SPANISH)
assert.equal(change.failure, undefined)
assert.deepEqual(change.attempted_plan_keys, [])

// Seeks and reloads after the player switched to Spanish itself: the original file still plays it and the player sets
// it again, so Silo only moves the timeline, each time.
const reanchors = await replansFor([{ AudioStreamIndex: spanish }, { AudioStreamIndex: spanish }], switchedToSpanish)
for (const r of reanchors) {
  assert.equal(r.operation, 'seek_reanchor')
  assert.deepEqual(r.selected_tracks.audio, ENGLISH)
}

// Back to the plan's own track from the menu after that switch: a track change, which can stay on the original file.
const back = await replanFor({ AudioStreamIndex: english }, switchedToSpanish)
assert.equal(back.operation, 'track_change')
assert.deepEqual(back.selected_tracks.audio, ENGLISH)

// The same, on a TV that can't play the plan's own track from the file: a failure of the original file.
const refused = await replanFor({ AudioStreamIndex: english, AudioNotNative: true }, switchedToSpanish)
assert.equal(refused.operation, 'failure_recovery')
assert.deepEqual(refused.failure, { classification: 'playback_error' })
assert.deepEqual(refused.selected_tracks.audio, ENGLISH)

// A quality change after the switch carries the track the player plays.
const quality = await replanFor({ AudioStreamIndex: spanish, MaxStreamingBitrate: 1500000 }, switchedToSpanish)
assert.equal(quality.operation, 'quality_change')
assert.deepEqual(quality.selected_tracks.audio, SPANISH)

// fallbackStream after the switch: the original file failed. Still a playback error (a track-change class would tell
// Silo the route didn't fail, and it could plan it again), and it keeps Spanish.
const failure = await replanFor({ AudioStreamIndex: spanish, DirectPlayFailed: true }, switchedToSpanish)
assert.equal(failure.operation, 'failure_recovery')
assert.deepEqual(failure.failure, { classification: 'playback_error' })
assert.deepEqual(failure.attempted_plan_keys, ['v3:1'])
assert.deepEqual(failure.selected_tracks.audio, SPANISH)

// A failure with the plan's own track names it.
const plain = await replanFor({ AudioStreamIndex: english, DirectPlayFailed: true })
assert.equal(plain.operation, 'failure_recovery')
assert.deepEqual(plain.selected_tracks.audio, ENGLISH)

// On a remux only the server's track plays, so another track is a track change.
const remux = await replanFor({ AudioStreamIndex: spanish }, { delivery: 'server_remux_hls' })
assert.equal(remux.operation, 'track_change')
assert.deepEqual(remux.selected_tracks.audio, SPANISH)

console.log('ok siloAudioReplan')
