// A rewatch of a watched Silo episode keeps its position, so it resumes instead of starting at 0.
//   node --conditions=browser src/services/siloWatchedResume.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { siloItemToBaseItem, siloProgressToUserData, TICKS_PER_SECOND } = await import('./siloMapper.js')
const images = { register: () => null, tagFor: () => null }

// What Silo's season episode list returns for a watched episode being rewatched.
const episode = {
  content_id: 'episode-imdb-tt1-1-2', type: 'episode', title: 'Two', season_number: 1, episode_number: 2,
  user_data: { position_seconds: 600, duration_seconds: 1500, is_in_progress: true, played: true },
}
const ud = siloItemToBaseItem(episode, { type: 'episode', images }).UserData
assert.equal(ud.Played, true)
assert.equal(ud.PlaybackPositionTicks, 600 * TICKS_PER_SECOND)
assert.equal(Math.round(ud.PlayedPercentage), 40)

// Watched and not rewatched: no position.
const done = siloItemToBaseItem({ ...episode, user_data: { position_seconds: 0, duration_seconds: 1500, played: true } }, { type: 'episode', images }).UserData
assert.equal(done.Played, true)
assert.equal(done.PlaybackPositionTicks, 0)

// The progress list's completed entry with a rewatch position.
const progress = siloProgressToUserData({ position_seconds: 600, duration_seconds: 1500, completed: true })
assert.equal(progress.Played, true)
assert.equal(progress.PlaybackPositionTicks, 600 * TICKS_PER_SECOND)

console.log('siloWatchedResume ok')
