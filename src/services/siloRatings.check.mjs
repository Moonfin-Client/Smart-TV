// Silo rates 1 to 10 (silo-server#4398): the app's rating out of 10 goes to Silo as a whole number from 1 to 10 and
// comes back as it is.   node --conditions=browser src/services/siloRatings.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { createSiloItems } = await import('./siloItems.js')
const { siloItemToBaseItem } = await import('./siloMapper.js')

const memoryImages = () => {
  const kept = {}
  return {
    register: (itemId, type, url, index = 0) => (url ? ((kept[`${itemId}|${type}|${index}`] = url), `tag:${url}`) : null),
    tagFor: (itemId, type, index = 0) => (kept[`${itemId}|${type}|${index}`] ? `tag:${kept[`${itemId}|${type}|${index}`]}` : null),
  }
}
const setup = (answers = {}) => {
  const calls = []
  const published = []
  const call = async (path, options = {}) => {
    const key = `${options.method || 'GET'} ${path}`
    calls.push(`${key}${options.body ? ' ' + JSON.stringify(options.body) : ''}`)
    return answers[key]
  }
  const items = createSiloItems({
    call, images: memoryImages(), getConfiguration: async () => ({}), getUserId: () => 'p1',
    publishUserData: (id, patch) => published.push([id, patch]),
  })
  return { items, calls, published }
}

const { items, calls, published } = setup({
  'GET /api/v2/ratings': { items: [{ item_id: 'movie:heat-1995', rating: 7, rated_at: '2026-01-02T03:04:05.000Z' }] },
})
await items.setRating('movie-1', true)
await items.setRating('movie-1', false)
await items.setNumericRating('movie-1', 7.5)
await items.setNumericRating('movie-1', 0)
await items.setNumericRating('movie-1', 12)
assert.deepEqual(calls.filter((c) => c.startsWith('PUT')), [
  'PUT /api/v2/ratings/movie-1 {"rating":10}',
  'PUT /api/v2/ratings/movie-1 {"rating":2}',
  'PUT /api/v2/ratings/movie-1 {"rating":8}',
  'PUT /api/v2/ratings/movie-1 {"rating":1}',
  'PUT /api/v2/ratings/movie-1 {"rating":10}',
])
// The rating published to the rest of the app is the one Silo stored.
assert.deepEqual(published[0], ['movie-1', { Likes: true, Rating: 10 }])
assert.deepEqual(published[1], ['movie-1', { Likes: false, Rating: 2 }])
assert.deepEqual(published[2], ['movie-1', { Rating: 8 }])
// The My Rating sort reads Silo's values without doubling them.
assert.deepEqual((await items.getMyUserRatings()).Items, [{ ItemId: 'movie:heat-1995', Rating: 7 }])
// An item's own rating reads as it is.
const movie = siloItemToBaseItem({ content_id: 'movie-tmdb-1', type: 'movie', title: 'A', user_rating: 8 }, { images: memoryImages() })
assert.equal(movie.UserData.Rating, 8)
console.log('siloRatings ok')
