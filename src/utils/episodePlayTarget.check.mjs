// Series and season Play while rewatching: a watched episode with a position again resumes there instead of
// the run restarting at S1E1.   node src/utils/episodePlayTarget.check.mjs
import assert from 'node:assert/strict'
import { pickEpisodePlayTarget, shouldResumeTarget } from './episodePlayTarget.js'

const ep = (s, e, played, ticks = 0) => ({ Id: `s${s}e${e}`, ParentIndexNumber: s, IndexNumber: e, UserData: { Played: played, PlaybackPositionTicks: ticks } })

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

console.log('episodePlayTarget ok')
