// The HLS transcoding profile's MaxAudioChannels caps the HLS delivery, and only that delivery.
//   node --conditions=browser src/services/siloHlsChannels.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { siloCapabilitiesFromDeviceProfile } = await import('./siloPlayback.js')

// Tizen's TS and AV1 fMP4 HLS profiles, both at 5.1.
const ts = { Type: 'Video', Container: 'ts', Protocol: 'hls', VideoCodec: 'hevc,h264', AudioCodec: 'eac3,ac3,aac', MaxAudioChannels: '6' }
const fmp4 = { Type: 'Video', Container: 'mp4', Protocol: 'hls', VideoCodec: 'av1', AudioCodec: 'eac3,ac3,aac', MaxAudioChannels: '6' }
const profile = {
  DirectPlayProfiles: [{ Type: 'Video', Container: 'mkv,mp4', VideoCodec: 'hevc,h264', AudioCodec: 'aac,ac3,eac3' }],
  TranscodingProfiles: [ts, { Type: 'Audio', Container: 'mp3', Protocol: 'http', AudioCodec: 'mp3' }, fmp4],
}
const caps = (p) => siloCapabilitiesFromDeviceProfile(p).deliveries

const d = caps(profile)
assert.equal(d.hls.max_channels, 6)
for (const name of ['original_http', 'progressive']) assert.equal(d[name].max_channels, undefined, `${name} isn't capped by HLS`)

// HLS profiles with different caps: the lowest wins, in either order.
for (const order of [[{ ...ts, MaxAudioChannels: '8' }, fmp4], [fmp4, { ...ts, MaxAudioChannels: '8' }]]) {
  assert.equal(caps({ ...profile, TranscodingProfiles: order }).hls.max_channels, 6)
}

// webOS without native HLS: stereo AAC only.
const stereo = caps({ ...profile, TranscodingProfiles: [{ Type: 'Video', Container: 'ts', Protocol: 'hls', VideoCodec: 'h264', AudioCodec: 'aac', MaxAudioChannels: '2' }] })
assert.equal(stereo.hls.max_channels, 2)

// A lower cap for every codec (the Max Audio Channels setting) still wins.
const setting = caps({ ...profile, CodecProfiles: [{ Type: 'VideoAudio', Conditions: [{ Condition: 'LessThanEqual', Property: 'AudioChannels', Value: '2' }] }] })
assert.equal(setting.hls.max_channels, 2)

// A profile with no cap sends none.
assert.equal(caps({ ...profile, TranscodingProfiles: [{ Type: 'Video', Protocol: 'hls', VideoCodec: 'h264', AudioCodec: 'aac' }] }).hls.max_channels, undefined)
console.log('siloHlsChannels ok')
