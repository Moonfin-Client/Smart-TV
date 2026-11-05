// A Watch Party stream that arrives slower than it plays. A Silo copy is produced as it plays, and over a slow route
// it can come in under real time, so the set stalls every few seconds on its own and falls behind the room. Seeking
// ahead to catch up only lands it where the stream hasn't arrived yet, which stalls it again. So once it stalls
// repeatedly it stops chasing for a while, and on each stall it waits for some of the stream to build up before it
// plays on. A wait that lasts is a real stall, and Silo pauses the room for it once (its buffering rule), so the room
// and this set start again together.

// Stalls this close together say the stream isn't keeping up.
export const STARVE_STALLS = 2;
export const STARVE_WINDOW_MS = 30000;
// How long it stays that way after the last such stall.
export const STARVE_HOLD_MS = 60000;
// How much stream a wait builds up, and the longest it waits for it.
export const CUSHION_SECONDS = 6;
export const CUSHION_MAX_MS = 10000;

export const createStarveWatch = () => {
	let stalls = [];
	let starvingUntil = 0;
	return {
		// A stall while playing; true when it makes the stream one that isn't keeping up.
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

// Seconds of stream buffered past the playhead, from the element's buffered ranges.
export const bufferedAheadSeconds = (buffered, currentTime) => {
	if (!buffered) return 0;
	for (let i = 0; i < buffered.length; i++) {
		if (currentTime >= buffered.start(i) - 0.25 && currentTime <= buffered.end(i)) return buffered.end(i) - currentTime;
	}
	return 0;
};
