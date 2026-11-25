// The channel caps that reach Silo: the Max Audio Channels setting as max_channels at every value, on every delivery,
// and the HLS profile's MaxAudioChannels on the HLS delivery only.
//   node --conditions=browser src/services/siloChannelCaps.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { siloCapabilitiesFromDeviceProfile } = await import('./siloPlayback.js')

const profile = {
  DirectPlayProfiles: [{ Type: 'Video', Container: 'mkv,mp4', VideoCodec: 'h264,hevc', AudioCodec: 'aac,ac3,eac3' }],
  TranscodingProfiles: [{ Type: 'Video', Protocol: 'hls', Container: 'ts', VideoCodec: 'h264', AudioCodec: 'aac,ac3' }],
  CodecProfiles: [],
}
const setting = (value) => [{ Type: 'VideoAudio', Conditions: [{ Condition: 'LessThanEqual', Property: 'AudioChannels', Value: value }] }]
const caps = (p) => siloCapabilitiesFromDeviceProfile(p, undefined, ['codec_channel_ceilings_v1']).deliveries
const NAMES = ['original_http', 'progressive', 'hls']

for (const value of ['2', '6', '7', '8']) {
  const d = caps({ ...profile, CodecProfiles: setting(value) })
  for (const name of NAMES) assert.equal(d[name].max_channels, Number(value), `${name} gets Max Audio Channels ${value}`)
}
// Auto Detect sets no cap, and none goes to Silo.
const auto = caps(profile)
for (const name of NAMES) assert.equal(auto[name].max_channels, undefined, `${name} has no cap on Auto Detect`)

// Tizen's TS and AV1 fMP4 HLS profiles, both at 5.1, cap HLS and nothing else.
const ts = { Type: 'Video', Container: 'ts', Protocol: 'hls', VideoCodec: 'hevc,h264', AudioCodec: 'eac3,ac3,aac', MaxAudioChannels: '6' }
const fmp4 = { Type: 'Video', Container: 'mp4', Protocol: 'hls', VideoCodec: 'av1', AudioCodec: 'eac3,ac3,aac', MaxAudioChannels: '6' }
const tizen = { ...profile, TranscodingProfiles: [ts, { Type: 'Audio', Container: 'mp3', Protocol: 'http', AudioCodec: 'mp3' }, fmp4] }
const d = caps(tizen)
assert.equal(d.hls.max_channels, 6)
for (const name of ['original_http', 'progressive']) assert.equal(d[name].max_channels, undefined, `${name} isn't capped by HLS`)
// HLS profiles with different caps: the lowest wins, in either order.
for (const order of [[{ ...ts, MaxAudioChannels: '8' }, fmp4], [fmp4, { ...ts, MaxAudioChannels: '8' }]]) {
  assert.equal(caps({ ...tizen, TranscodingProfiles: order }).hls.max_channels, 6)
}
// webOS without native HLS: stereo AAC only.
assert.equal(caps({ ...profile, TranscodingProfiles: [{ ...ts, VideoCodec: 'h264', AudioCodec: 'aac', MaxAudioChannels: '2' }] }).hls.max_channels, 2)
// Whichever is lower wins, the setting or the HLS profile.
assert.equal(caps({ ...tizen, CodecProfiles: setting('2') }).hls.max_channels, 2)
const wide = caps({ ...tizen, CodecProfiles: setting('8') })
assert.equal(wide.hls.max_channels, 6)
assert.equal(wide.original_http.max_channels, 8)
// A per-codec cap still goes by codec beside the HLS cap.
const flac = caps({ ...tizen, CodecProfiles: [{ Type: 'VideoAudio', Codec: 'flac', Conditions: [{ Condition: 'LessThanEqual', Property: 'AudioChannels', Value: '8' }] }] })
assert.deepEqual([flac.hls.max_channels, flac.hls.max_channels_by_codec], [6, { flac: 8 }])
console.log('siloChannelCaps ok')
