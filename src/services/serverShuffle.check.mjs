// A server's shuffle grows the player's queue one item at a time, and only from the item it handed out next.
//   node --conditions=browser src/services/serverShuffle.check.mjs
import assert from 'node:assert/strict'
import { extendServerShuffleQueue, startServerShuffle } from './serverShuffle.js'

const picks = { a: 'b', b: 'c', c: 'a' }
const api = {
  canShuffle: async () => true,
  startShuffle: async () => ({ id: 's1', current: { Id: 'a' }, next: { Id: 'b' } }),
  advanceShuffle: async (id, from) => ({ id, current: { Id: picks[from] }, next: { Id: picks[picks[from]] } }),
}

const first = await startServerShuffle(api, { Id: 'show' })
assert.deepEqual(first.map((x) => x.Id), ['a', 'b'])
assert.equal(first[0]._serverShuffle, 's1')

assert.equal(await extendServerShuffleQueue(['a', 'b'], 'a', 's1'), null, 'the first item moves nothing on')
assert.equal(await extendServerShuffleQueue(['a', 'b'], 'b', 'other'), null, 'another shuffle moves nothing on')
assert.deepEqual(await extendServerShuffleQueue(['a', 'b'], 'b', 's1'), ['a', 'b', 'c'])
// Silo comes around to a again, which keeps only its latest place.
assert.deepEqual(await extendServerShuffleQueue(['a', 'b', 'c'], 'c', 's1'), ['b', 'c', 'a'])
console.log('serverShuffle ok')
