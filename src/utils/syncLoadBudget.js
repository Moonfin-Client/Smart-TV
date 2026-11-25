// A Watch Party correction this set can only reach by loading new media lands late by however long the load took, so
// loading straight to the room's position every time chases the room round and round. Catch-up loads go one at a time
// with a growing wait between them, each aimed ahead of the room by what the last one took, and a miss moves the next
// aim by only half of it, since following each miss in full swings the aim from one side of the room to the other.
// One that landed behind never aims shorter than its own load took, since closing that gap half a miss at a time takes minutes.

const MAX_LOAD_LEAD_MS = 10000;
const FIRST_LOAD_WAIT_MS = 10000;
// How much of a catch-up's miss the next one's aim takes up.
const MISS_GAIN = 0.5;
const MAX_LOAD_WAIT_MS = 60000;
// A load that never reports playing doesn't hold the next one back forever.
const LOAD_GIVE_UP_MS = 30000;
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
		// moves the aim by half that. A load the room asked for passes nothing, and how long it took is the aim.
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
