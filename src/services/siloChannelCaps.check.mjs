// The Max Audio Channels setting reaches Silo as max_channels at every value, not only below 5.1.
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
const withSetting = (value) => ({
  ...profile,
  CodecProfiles: [{ Type: 'VideoAudio', Conditions: [{ Condition: 'LessThanEqual', Property: 'AudioChannels', Value: value }] }],
})
const NAMES = ['original_http', 'progressive', 'hls']

for (const value of ['2', '6', '7', '8']) {
  const d = siloCapabilitiesFromDeviceProfile(withSetting(value), undefined, ['codec_channel_ceilings_v1']).deliveries
  for (const name of NAMES) assert.equal(d[name].max_channels, Number(value), `${name} gets Max Audio Channels ${value}`)
}
// Auto Detect sets no cap, and none goes to Silo.
const auto = siloCapabilitiesFromDeviceProfile(profile, undefined, ['codec_channel_ceilings_v1']).deliveries
for (const name of NAMES) assert.equal(auto[name].max_channels, undefined, `${name} has no cap on Auto Detect`)
console.log('siloChannelCaps ok')
