// What a replan of a direct-play Silo title tells Silo: an audio change is a track change with the new track, and only
// a failed original file is a failure, which keeps an audio track switched to in the player.
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

// Starts the title on a plan (direct play unless told), then sends one more ask for it and returns the replan Silo was sent.
const replanFor = async (body, delivery = 'original_http') => {
  const replans = []
  const call = async (path, opts = {}) => {
    if (path.endsWith('/playback/capabilities')) return { state: 'available', allowed: true, protocol_versions: [3], installation_id: 'install', features: ['playback_plan_v3'] }
    if (path.endsWith('/playback/start')) return { outcome: 'playable', session_id: 'session', playback_plan: plan(delivery, { id: 'file:235:audio:0', index: 0 }, 1) }
    if (path.endsWith('/replan')) {
      replans.push(opts.body)
      return { outcome: 'playable', session_id: 'session', playback_plan: plan('server_remux_hls', opts.body.selected_tracks.audio, 2) }
    }
    throw new Error(`unexpected call ${path}`)
  }
  const silo = createSiloPlayback({
    call, getBaseUrl: () => 'http://silo', getUserId: () => 'profile', getAccessToken: () => 'token',
    getDeviceInfo: () => ({ appVersion: '1.0.0' }), platform: 'webos', getItem: async () => item, onPlaying: () => {},
  })
  const started = await silo.getPlaybackInfo(ITEM, { MediaSourceId: '235' }, item)
  assert.equal(started.MediaSources[0].DefaultAudioStreamIndex, english, 'starts on the default audio')
  await silo.getPlaybackInfo(ITEM, { MediaSourceId: '235', StartTimeTicks: 300000000, ...body }, item)
  assert.equal(replans.length, 1)
  return replans[0]
}

// changeAudioStream: the other track, picked from the menu (playback.js sends DirectPlayFailed only for a real failure).
const change = await replanFor({ AudioStreamIndex: spanish, AudioPicked: true, DirectPlayFailed: false })
assert.equal(change.operation, 'track_change')
assert.deepEqual(change.selected_tracks.audio, { id: 'file:235:audio:1', index: 1 })
assert.equal(change.failure, undefined)
assert.deepEqual(change.attempted_plan_keys, [], "a track change doesn't rule out the direct route")

// fallbackStream after the player switched to the other track itself: the original file failed.
const failure = await replanFor({ AudioStreamIndex: spanish, DirectPlayFailed: true })
assert.equal(failure.operation, 'failure_recovery')
// Still a playback error: a track-change class would tell Silo the route didn't fail, and it could plan it again.
assert.deepEqual(failure.failure, { classification: 'playback_error' })
assert.deepEqual(failure.attempted_plan_keys, ['v3:1'])
assert.deepEqual(failure.selected_tracks.audio, { id: 'file:235:audio:1', index: 1 }, 'keeps the track the player switched to')

// A failure with the track already playing names the plan's own track.
const plain = await replanFor({ AudioStreamIndex: english, DirectPlayFailed: true })
assert.equal(plain.operation, 'failure_recovery')
assert.deepEqual(plain.failure, { classification: 'playback_error' })
assert.deepEqual(plain.selected_tracks.audio, { id: 'file:235:audio:0', index: 0 })

// The menu picks the track Silo has the plan on (the player had switched away from it itself and can't switch back):
// the original file can't play it here, so Silo is asked for another route with that track.
const again = await replanFor({ AudioStreamIndex: english, AudioPicked: true, DirectPlayFailed: false })
assert.equal(again.operation, 'failure_recovery')
assert.deepEqual(again.failure, { classification: 'playback_error' })
assert.deepEqual(again.selected_tracks.audio, { id: 'file:235:audio:0', index: 0 })

// A seek or reload after the player switched to the other track itself: the original file still plays it, and the
// player sets it again, so Silo only moves the timeline.
const reanchor = await replanFor({ AudioStreamIndex: spanish, DirectPlayFailed: false })
assert.equal(reanchor.operation, 'seek_reanchor')
assert.deepEqual(reanchor.selected_tracks.audio, { id: 'file:235:audio:0', index: 0 })

// On a remux only the server's track plays, so another track asked for is a track change, picked or not.
const remux = await replanFor({ AudioStreamIndex: spanish, DirectPlayFailed: false }, 'server_remux_hls')
assert.equal(remux.operation, 'track_change')
assert.deepEqual(remux.selected_tracks.audio, { id: 'file:235:audio:1', index: 1 })

console.log('ok siloAudioReplan')
