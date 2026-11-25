// Self-check for deepLink.js: node --conditions=browser src/state/shell/deepLink.check.mjs
import assert from 'node:assert/strict'
import { deepLinkItem } from './deepLink.js'

const user = { Id: 'u1', ServerId: 's1' }
assert.equal(deepLinkItem(null, user), null)
assert.equal(deepLinkItem({}, user), null)
assert.deepEqual(deepLinkItem({ id: 'e1', type: 'episode', serverId: 's1', seriesId: 'x' }, user), { Id: 'e1', Type: 'Episode' })
assert.deepEqual(deepLinkItem({ id: 'm1', type: 'movie', serverId: 's1' }, user), { Id: 'm1', Type: 'Movie' })
// Another server's tile is dropped, and a tile or user without a server id isn't checked.
assert.equal(deepLinkItem({ id: 'm1', type: 'movie', serverId: 's2' }, user), null)
assert.deepEqual(deepLinkItem({ id: 'm1', type: 'movie' }, user), { Id: 'm1', Type: 'Movie' })
assert.deepEqual(deepLinkItem({ id: 'm1', serverId: 's2' }, { Id: 'u1' }), { Id: 'm1', Type: 'Movie' })
console.log('deepLink ok')
