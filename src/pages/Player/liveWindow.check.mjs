// Self-check for liveWindow.js: node src/pages/Player/liveWindow.check.mjs
import assert from 'node:assert/strict'
import { AT_LIVE_SECONDS, isAtLive, liveWindowFor, nextLiveWindow } from './liveWindow.js'

// Under a minute of range is no window, and the live point sits as far behind the end as playback started.
assert.equal(liveWindowFor({ start: 0, end: 50 }, 5), null)
assert.equal(liveWindowFor(null, 5), null)
assert.equal(liveWindowFor({ start: 0, end: 300 }, null), null)
assert.deepEqual(liveWindowFor({ start: 100, end: 400 }, 12), { start: 100, edge: 388 })
// Ten seconds from the edge still reads as live, and no window reads as live too.
assert.equal(isAtLive({ start: 0, edge: 300 }, 300 - AT_LIVE_SECONDS), true)
assert.equal(isAtLive({ start: 0, edge: 300 }, 250), false)
assert.equal(isAtLive(null, 0), true)
// The window held stays the same object while nothing moved.
const w = { start: 1, edge: 90 }
assert.equal(nextLiveWindow(w, { start: 1, edge: 90 }), w)
assert.deepEqual(nextLiveWindow(w, { start: 1, edge: 91 }), { start: 1, edge: 91 })
console.log('liveWindow ok')
