// Self-check for a merged library holding other servers' copies back for the signed-in server's card:
//   node --conditions=browser src/utils/mergedCopies.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// The app's modules lean on Vite for imports without an extension.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { PreferredCopies, copiesOf, foldCopies, indexCopies, joinIndexedCopies } = await import('./mergedCopies.js')
const { mergedReadersDrained } = await import('./mergedBrowse.js')

const movie = (id, serverId, providerIds) => ({ Id: id, Type: 'Movie', Name: id, _serverId: serverId, ProviderIds: providerIds })
const servers = (card) => copiesOf(card).map((c) => c._serverId)

// Another server's copy waits for the preferred server's card, which then carries it.
{
  const preferred = new PreferredCopies('a', new Set(['Movie:tmdb:5003']))
  const holders = new Map()
  const other = movie('9', 'b', { Tmdb: '5003' })
  assert.deepEqual(foldCopies([other], holders, preferred), [])
  const own = movie('1', 'a', { Tmdb: '5003' })
  assert.deepEqual(foldCopies([own], holders, preferred), [own])
  assert.deepEqual(servers(own), ['a', 'b'])
  assert.deepEqual(preferred.takeAllWaiting(), [])
}

// A copy whose preferred card never came is handed back once the list runs out, and gets its own card then.
{
  const preferred = new PreferredCopies('a', new Set(['Movie:tmdb:5003']))
  const holders = new Map()
  const other = movie('9', 'b', { Tmdb: '5003' })
  foldCopies([other], holders, preferred)
  const waiting = preferred.takeAllWaiting()
  assert.deepEqual(waiting, [other])
  assert.deepEqual(foldCopies(waiting, holders, null), [other])
}

// A title the preferred server doesn't hold isn't held back.
{
  const preferred = new PreferredCopies('a', new Set(['Movie:tmdb:1']))
  const other = movie('9', 'b', { Tmdb: '5003' })
  assert.deepEqual(foldCopies([other], new Map(), preferred), [other])
}

// The preferred server's card keeps a title two cards turn out to share, and the other one is folded into it.
{
  const preferred = new PreferredCopies('p', new Set())
  const q = movie('1', 'q', { Tmdb: '5003' })
  const p = movie('2', 'p', { Imdb: 'tt0000101' })
  const folded = []
  const kept = foldCopies([q, p, movie('3', 'r', { Tmdb: '5003', Imdb: 'tt0000101' })], new Map(), preferred, (holder, card) => card && folded.push(card))
  assert.deepEqual(kept, [p])
  assert.deepEqual(folded, [q])
  assert.deepEqual(servers(p), ['p', 'q', 'r'])
}

// The title index gives a card the copies paging hasn't reached, and those copies fold into it later.
{
  const holders = new Map()
  const card = movie('1', 'a', { Tmdb: '5003' })
  foldCopies([card], holders)
  const later = movie('9', 'b', { Tmdb: '5003' })
  assert.equal(joinIndexedCopies(card, indexCopies([card, later]), holders, () => false), true)
  assert.deepEqual(servers(card), ['a', 'b'])
  assert.deepEqual(foldCopies([later], holders), [])
  assert.deepEqual(servers(card), ['a', 'b'])
}

assert.equal(mergedReadersDrained([{ done: true, buffer: [] }, { done: true, buffer: [] }]), true)
assert.equal(mergedReadersDrained([{ done: true, buffer: [] }, { done: true, buffer: [{}] }]), false)
assert.equal(mergedReadersDrained([{ done: false, buffer: [] }]), false)
console.log('mergedCopies ok')
