// A Silo copy is produced as it plays, and over a slow route it can arrive slower than real time, so seeking ahead to
// catch up only lands the set where the stream hasn't arrived yet. So once it stalls repeatedly it stops chasing for a
// while and lets some of the stream build up on each stall. Silo pauses the room for a wait that lasts, so both start again together.

// Stalls this close together say the stream isn't keeping up.
const STARVE_STALLS = 2;
const STARVE_WINDOW_MS = 30000;
// How long it stays that way after the last such stall.
const STARVE_HOLD_MS = 60000;
// How much stream a wait builds up, and the longest it waits for it.
export const CUSHION_SECONDS = 6;
export const CUSHION_MAX_MS = 10000;

export const createStarveWatch = () => {
	let stalls = [];
	let starvingUntil = 0;
	return {
		// A stall while playing. True when it makes the stream one that isn't keeping up.
		onStall: (nowMs) => {
			stalls = stalls.filter((at) => nowMs - at < STARVE_WINDOW_MS).concat(nowMs);
			if (stalls.length >= STARVE_STALLS) starvingUntil = nowMs + STARVE_HOLD_MS;
			return nowMs < starvingUntil;
		},
		isStarving: (nowMs) => nowMs < starvingUntil,
		reset: () => {
			stalls = [];
			starvingUntil = 0;
		}
	};
};

export const bufferedAheadSeconds = (buffered, currentTime) => {
	if (!buffered) return 0;
	for (let i = 0; i < buffered.length; i++) {
		if (currentTime >= buffered.start(i) - 0.25 && currentTime <= buffered.end(i)) return buffered.end(i) - currentTime;
	}
	return 0;
};
