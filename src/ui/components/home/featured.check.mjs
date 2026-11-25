import assert from 'node:assert/strict'
import { stubUnloadable } from '../../../../scripts/stubUnloadable.mjs'

stubUnloadable()
const { readFeaturedSources, sortFeaturedItems } = await import('./featured.js')
const { MEDIA_BAR_SORT_ORDERS } = await import('../../../utils/mediaBarNewRelease.js')

assert.deepEqual(MEDIA_BAR_SORT_ORDERS, ['default', 'random', 'dateAddedDesc', 'dateAddedAsc', 'releaseDateDesc', 'releaseDateAsc'])

// Dated sources interleave round-robin deterministically without pre-shuffling
const sources = {
  libA: { Items: [{ Id: 'a1' }, { Id: 'shared' }, { Id: 'a2' }] },
  libB: { Items: [{ Id: 'b1' }, { Id: 'shared' }, { Id: 'b2' }] },
}
const interleaved = await readFeaturedSources(['libA', 'libB'], async (id) => sources[id], () => true, 10, { dated: true })
assert.deepEqual(interleaved.map((x) => x.Id), ['a1', 'b1', 'shared', 'b2', 'a2'])

// sortFeaturedItems
const items = [
  { Id: '1', Name: 'Old Added, New Release', DateCreated: '2024-01-01T00:00:00Z', PremiereDate: '2026-05-01T00:00:00Z' },
  { Id: '2', Name: 'New Added, Old Release', DateCreated: '2026-01-01T00:00:00Z', PremiereDate: '2020-01-01T00:00:00Z' },
  { Id: '3', Name: 'No Dates' },
]

assert.deepEqual(sortFeaturedItems(items, 'default').map((x) => x.Id), ['1', '2', '3'])
assert.deepEqual(sortFeaturedItems(items, 'dateAddedDesc').map((x) => x.Id), ['2', '1', '3'])
assert.deepEqual(sortFeaturedItems(items, 'dateAddedAsc').map((x) => x.Id), ['1', '2', '3'])
assert.deepEqual(sortFeaturedItems(items, 'releaseDateDesc').map((x) => x.Id), ['1', '2', '3'])
assert.deepEqual(sortFeaturedItems(items, 'releaseDateAsc').map((x) => x.Id), ['2', '1', '3'])
assert.deepEqual(sortFeaturedItems(items, 'random').map((x) => x.Id).sort(), ['1', '2', '3'])
