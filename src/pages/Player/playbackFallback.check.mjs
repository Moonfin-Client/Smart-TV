// Self-check for playbackFallback.js and the Silo stream helpers: node src/pages/Player/playbackFallback.check.mjs
import assert from 'node:assert/strict'
import { errorMessage, errorStep } from './playbackFallback.js'
import { copyBufferSeconds } from './copyBuffer.js'
import { copyReaches } from './copySeek.js'
import { createServerSeek } from './serverSeek.js'

const web = (c) => errorStep({ tizen: false, playMethod: 'DirectPlay', hlsSupported: true, ...c }).step
const tz = (c) => errorStep({ tizen: true, playMethod: 'DirectPlay', ...c }).step

// webOS: Silo reconnects a network error, or a source error once it played, unless paused.
assert.equal(web({ canReconnect: true, code: 2 }), 'reconnect')
assert.equal(web({ canReconnect: true, code: 4, played: true }), 'reconnect')
assert.equal(web({ canReconnect: true, code: 4, played: false }), 'transcode')
assert.equal(web({ canReconnect: true, code: 3, played: true }), 'transcode', 'a decode error is the file')
assert.equal(web({ canReconnect: true, code: 2, paused: true, readyState: 0 }), 'transcode')
assert.equal(web({ canReconnect: false, code: 2 }), 'transcode', 'only Silo reconnects')
assert.equal(web({ canReconnect: true, reconnecting: true, code: 3 }), 'reconnect')
// Paused errors wait, except a start that timed out or one before the source opened.
assert.equal(web({ paused: true, readyState: 2 }), 'ignore')
assert.equal(web({ elementPaused: true, readyState: 2 }), 'ignore')
assert.equal(web({ elementPaused: true, readyState: 2, isLive: true }), 'transcode', 'a channel that fails reads as paused')
assert.equal(web({ paused: true, readyState: 0 }), 'transcode')
assert.equal(web({ elementPaused: true, readyState: 2, startTimedOut: true }), 'transcode')
// Live recovery, the trailer skip and audio-only.
assert.equal(web({ liveEngaged: true }), 'recover')
assert.equal(web({ skipTo: 'feature' }), 'skip')
assert.deepEqual(errorStep({ tizen: false, audioOnly: true, playMethod: 'DirectPlay' }), { step: 'fail', message: 'Audio playback failed for this track on this device.' })
// Tiers: direct to transcode, then hls.js H.264 (tier 2), one retry (tier 3), then the code's message.
assert.deepEqual(errorStep({ tizen: false, code: 3, playMethod: 'DirectStream' }), {
  step: 'transcode',
  message: 'Transcoding failed. The server may not support this format.',
  plain: 'The video format is not supported by this TV.',
})
assert.equal(web({ triedTranscode: true }), 'fail', 'a direct stream that already tried')
const t2 = errorStep({ tizen: false, playMethod: 'Transcode', hlsSupported: true, code: 4 })
assert.equal(t2.step, 'h264')
assert.equal(t2.tier2, true)
assert.equal(t2.message, 'H.264 transcoding fallback failed.')
const t3 = errorStep({ tizen: false, playMethod: 'Transcode', hlsSupported: true, forceHlsJs: true, hlsRetries: 0 })
assert.equal(t3.step, 'h264')
assert.equal(t3.tier2, false)
assert.equal(t3.message, 'Transcoding failed after retry. Try restarting the app.')
assert.equal(web({ playMethod: 'Transcode', forceHlsJs: true, hlsRetries: 1 }), 'fail')
assert.equal(web({ playMethod: 'Transcode', hlsSupported: false }), 'fail')
assert.equal(errorMessage(1), 'Playback was aborted.')
assert.equal(errorMessage(2), 'A network error occurred. Check your connection.')
assert.equal(errorMessage(9), 'An unknown playback error occurred.')
assert.equal(errorMessage(null), 'Playback failed.')

// Tizen: Silo reconnects what played unless the set can't play it, a stream that ran reopens once, then the
// transcode, then the one message.
assert.equal(tz({ canReconnect: true, played: true, type: 'PLAYER_ERROR_CONNECTION_FAILED' }), 'reconnect')
assert.equal(tz({ canReconnect: true, played: true, type: 'PLAYER_ERROR_NOT_SUPPORTED_FILE' }), 'reopen')
assert.equal(tz({ canReconnect: true, played: true, paused: true }), 'reopen')
assert.equal(tz({ liveEngaged: true }), 'recover')
assert.equal(tz({ skipTo: 'x' }), 'skip')
assert.equal(tz({ played: true, reopened: true }), 'transcode')
assert.equal(tz({ played: false }), 'transcode')
assert.equal(tz({ triedTranscode: true }), 'fail')
assert.equal(tz({ playMethod: 'Transcode', played: true }), 'fail')
assert.equal(errorStep({ tizen: true, playMethod: 'Transcode' }).message, 'Playback failed. The file format may not be supported.')

// A Silo copy's buffer comes from a 100 MB budget, three quarters ahead.
assert.deepEqual(copyBufferSeconds(0), { ahead: 30, behind: 30 })
assert.deepEqual(copyBufferSeconds(66000000), { ahead: 9, behind: 3 })
assert.deepEqual(copyBufferSeconds(400000000), { ahead: 6, behind: 2 })
// A copy seeks itself only inside what its playlist lists, a second short of the end.
const details = { fragments: [{ start: 10, duration: 6 }, { start: 16, duration: 6 }] }
assert.equal(copyReaches(details, 12), true)
assert.equal(copyReaches(details, 21), true)
assert.equal(copyReaches(details, 21.5), false)
assert.equal(copyReaches(details, 5), false)
assert.equal(copyReaches(null, 12), false)

// Seeks asked for while one is served only move its target, and the latest is served next.
{
  const served = []
  let release
  const seek = createServerSeek(async (t) => {
    served.push(t)
    if (served.length === 1) await new Promise((r) => (release = r))
  })
  seek(1)
  seek(2)
  seek(3)
  release()
  await new Promise((r) => setTimeout(r, 0))
  assert.deepEqual(served, [1, 3])
}
console.log('playbackFallback ok')
