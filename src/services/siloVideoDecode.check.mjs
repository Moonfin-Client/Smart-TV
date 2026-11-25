// The VideoProfile rules that reach Silo as video_decode, so a TV that plays H.264 High but not High 10 isn't sent a
// 10-bit copy.
//   node --conditions=browser src/services/siloVideoDecode.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { siloCapabilitiesFromDeviceProfile } = await import('./siloPlayback.js')

const rule = (codec, value, extra = {}) => ({
  Type: 'Video',
  Codec: codec,
  Conditions: [{ Condition: 'EqualsAny', Property: 'VideoProfile', Value: value, IsRequired: false }],
  ...extra,
})
const profile = (codecProfiles) => ({
  DirectPlayProfiles: [{ Type: 'Video', Container: 'mkv,mp4', VideoCodec: 'h264,hevc', AudioCodec: 'aac' }],
  TranscodingProfiles: [],
  CodecProfiles: codecProfiles,
})
const decode = (p) => siloCapabilitiesFromDeviceProfile(p).clientCapabilities.video_decode

// webOS: H.264 without High 10, HEVC Main and Main 10.
assert.deepEqual(decode(profile([rule('h264', 'high|main|baseline|constrained baseline'), rule('hevc', 'main|main 10')])), [
  { codec: 'h264', profiles: ['high', 'main', 'baseline', 'constrained baseline'], hardware: true },
  { codec: 'hevc', profiles: ['main', 'main 10'], hardware: true },
])
// No profile rule: nothing narrows the codec list.
assert.equal(decode(profile([])), undefined)
// A rule for a codec the TV doesn't direct play, or one that only applies under conditions, isn't sent.
assert.equal(decode(profile([rule('av1', 'main')])), undefined)
assert.equal(decode(profile([rule('h264', 'high', { ApplyConditions: [{ Condition: 'GreaterThan', Property: 'Width', Value: '1920' }] })])), undefined)
console.log('siloVideoDecode ok')
