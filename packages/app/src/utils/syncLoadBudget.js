// A Watch Party correction this set can only reach by loading new media lands late by however long the load took, so
// a set that loads straight to the room's position every time it is corrected never catches up: it chases the room
// round and round. Silo's rule for that (docs/architecture/watch-party-synchronization.md, "Catching up is bounded"):
// one load at a time, the next not until 10 s after the previous one started playing, doubling to 60 s until the set
// converges, each aimed ahead of the room by the time the previous one took, up to 10 s. A set that can land a seek
// short of its target (on the keyframe before it) misses by more than its load time, so a catch-up's own miss moves the
// aim for the next one as well: by half of it, since where a seek lands varies by seconds from one to the next, and
// following each miss in full swings the aim from one side of the room to the other. A catch-up that landed behind
// never aims shorter than its own load took, though: from no lead at all, half a miss at a time took five catch-ups
// and two minutes to close a gap one aim at the load time would have.

export const MAX_LOAD_LEAD_MS = 10000;
export const FIRST_LOAD_WAIT_MS = 10000;
// How much of a catch-up's miss the next one's aim takes up.
export const MISS_GAIN = 0.5;
export const MAX_LOAD_WAIT_MS = 60000;
// A load that never reports playing doesn't hold the next one back for ever.
export const LOAD_GIVE_UP_MS = 30000;
// Within this of the room, the set has caught up.
export const CONVERGED_MS = 1000;

export const createLoadBudget = () => {
	let leadMs = 0;
	let loads = 0;
	let startedAt = null;
	let playingAt = null;

	const waitMs = () => Math.min(MAX_LOAD_WAIT_MS, FIRST_LOAD_WAIT_MS * 2 ** Math.max(0, loads - 1));

	return {
		// How far ahead of the room the next load aims.
		leadMs: () => leadMs,
		allows: (nowMs) => {
			if (startedAt == null || loads === 0) return true;
			if (playingAt == null) return nowMs - startedAt >= LOAD_GIVE_UP_MS;
			return nowMs - playingAt >= waitMs();
		},
		// `counted` false times a load the room itself asked for (a seek it waits on), which is never held back but
		// says how long the next catch-up will take.
		onStart: (nowMs, counted = true) => {
			if (counted) loads++;
			startedAt = nowMs;
			playingAt = null;
		},
		// The load is playing. A catch-up passes how far from the room it landed (`missedMs`, negative behind), which
		// moves the aim by half that; a load the room asked for passes nothing, and how long it took is the aim.
		onPlaying: (nowMs, missedMs = null) => {
			if (startedAt == null || playingAt != null) return;
			playingAt = nowMs;
			const tookMs = nowMs - startedAt;
			let next = tookMs;
			if (missedMs != null) {
				next = leadMs - missedMs * MISS_GAIN;
				if (missedMs < 0) next = Math.max(next, tookMs);
			}
			leadMs = Math.min(MAX_LOAD_LEAD_MS, Math.max(0, Math.round(next)));
		},
		// Caught up: the next load the room asks for runs at once. The lead is kept, since the media loads no faster.
		onConverged: () => {
			loads = 0;
		},
		reset: () => {
			leadMs = 0;
			loads = 0;
			startedAt = null;
			playingAt = null;
		}
	};
};
