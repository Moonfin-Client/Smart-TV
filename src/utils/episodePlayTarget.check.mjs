// Series and season Play while rewatching: a watched episode with a position again resumes there instead of
// the run restarting at S1E1.   node src/utils/episodePlayTarget.check.mjs
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/\.m?js$/.test(spec)) spec += '.js'
    return next(spec, ctx)
  },
})
const { pickEpisodePlayTarget, shouldResumeTarget } = await import('./episodePlayTarget.js')
const { collectionPlayTarget } = await import('./collectionPlayback.js')

const ep = (s, e, played, ticks = 0, at) => ({ Id: `s${s}e${e}`, ParentIndexNumber: s, IndexNumber: e, UserData: { Played: played, PlaybackPositionTicks: ticks, ...(at ? { LastPlayedDate: at } : {}) } })

// All watched, nothing rewatched: start over.
let run = [ep(1, 1, true), ep(1, 2, true), ep(1, 3, true)]
assert.equal(pickEpisodePlayTarget(run).Id, 's1e1')
assert.equal(shouldResumeTarget(run[0]), false)

// All watched, S1E2 part way through a rewatch: carry on there, at its position.
run = [ep(1, 1, true), ep(1, 2, true, 6e9), ep(1, 3, true)]
assert.equal(pickEpisodePlayTarget(run).Id, 's1e2')
assert.equal(shouldResumeTarget(run[1]), true)

// Untouched run: start clean.
run = [ep(1, 1, false), ep(1, 2, false)]
assert.equal(pickEpisodePlayTarget(run).Id, 's1e1')
assert.equal(shouldResumeTarget(run[0]), false)

// First watch in progress still resumes.
run = [ep(1, 1, true), ep(1, 2, false, 3e9), ep(1, 3, false)]
assert.equal(pickEpisodePlayTarget(run).Id, 's1e2')
assert.equal(shouldResumeTarget(run[1]), true)

// Two rewatches in a watched run: the one played last.
run = [ep(1, 1, true, 3e9, '2026-11-01T20:00:00Z'), ep(3, 4, true, 12e9, '2026-11-20T20:00:00Z'), ep(3, 5, true)]
assert.equal(pickEpisodePlayTarget(run).Id, 's3e4')

// A first watch in progress beside an older rewatch: without dates the first watch wins, with dates the latest.
run = [ep(1, 1, true), ep(1, 2, true, 6e9), ep(1, 3, true), ep(1, 4, false, 3e9), ep(1, 5, false)]
assert.equal(pickEpisodePlayTarget(run).Id, 's1e4')
run[1].UserData.LastPlayedDate = '2026-11-20T20:00:00Z'
run[3].UserData.LastPlayedDate = '2026-11-01T20:00:00Z'
assert.equal(pickEpisodePlayTarget(run).Id, 's1e2')

// An old dated rewatch beside an undated first watch: the first watch.
run = [ep(1, 1, true), ep(1, 2, true, 6e9, '2026-06-01T20:00:00Z'), ep(1, 3, true), ep(1, 4, false, 3e9), ep(1, 5, false)]
assert.equal(pickEpisodePlayTarget(run).Id, 's1e4')

// A watched Next Up with a position is a rewatch, not stale; one without is stale.
run = [ep(1, 1, true), ep(1, 2, true, 6e9), ep(1, 3, false)]
assert.equal(pickEpisodePlayTarget(run, run[1]).Id, 's1e2')
run = [ep(1, 1, true), ep(1, 2, true), ep(1, 3, false)]
assert.equal(pickEpisodePlayTarget(run, run[1]).Id, 's1e3')

// Box set: a first watch in progress goes before a short rewatch of a watched film.
const movie = (id, played, ticks = 0) => ({ Id: id, Type: 'Movie', UserData: { Played: played, PlaybackPositionTicks: ticks } })
assert.equal(collectionPlayTarget([movie('m1', true, 2e9), movie('m2', true), movie('m3', false, 9e9)]).Id, 'm3')
assert.equal(collectionPlayTarget([movie('m1', true, 2e9), movie('m2', true), movie('m3', true)]).Id, 'm1')

console.log('episodePlayTarget ok')
