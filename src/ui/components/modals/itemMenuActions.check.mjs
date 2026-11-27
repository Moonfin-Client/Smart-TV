// node src/ui/components/modals/itemMenuActions.check.mjs
import assert from 'node:assert/strict'

const { itemMenuActions } = await import('./itemMenuActions.js')

const hides = (item, opts) => itemMenuActions(item, opts).some((a) => a.id === 'hideContinueWatching')
const rewatch = { Id: 'e1', Type: 'Episode', SeriesId: 's1', UserData: { Played: true, PlaybackPositionTicks: 5 } }
const inProgress = { ...rewatch, UserData: { Played: false, PlaybackPositionTicks: 5 } }

// A first watch in progress can be hidden on every server.
assert.equal(hides(inProgress, { isJellyfin: true }), true)
assert.equal(hides(inProgress, { isJellyfin: false }), true)

// A rewatch (Played with a position) can be hidden where the server keeps it watched.
assert.equal(hides(rewatch, { isSilo: true, isJellyfin: false }), true)
assert.equal(hides(rewatch, { isJellyfin: false }), true)
assert.equal(hides({ ...rewatch, Type: 'Audio' }, { isSilo: true, isJellyfin: false }), true)

// Jellyfin, and audio outside Silo, can only clear the play state, which would unwatch it.
assert.equal(hides(rewatch, { isJellyfin: true }), false)
assert.equal(hides({ ...rewatch, Type: 'Audio' }, { isJellyfin: false }), false)

// No position, nothing to hide.
assert.equal(hides({ ...rewatch, UserData: { Played: true } }, { isSilo: true, isJellyfin: false }), false)

console.log('itemMenuActions ok')
