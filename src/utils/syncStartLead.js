// How long this set takes from play() to its position moving, learned from its starts. A group start from paused calls
// play() that much before the command's time, so the set is moving when the group's timeline says it is. Started on
// time, the start's own delay comes out as drift, and a set that doesn't correct by playback rate keeps anything under
// a second of it for the whole title.

// The most a start is begun ahead of its command's time.
const MAX_START_LEAD_MS = 2000;
// A start not moving within this is a stall, not one to learn from.
export const START_STALL_MS = 5000;
// A sample a hair past the start can be the pipeline settling.
const MIN_PLAYED_MS = 100;

// How long a start took to move: the sample's time less the media it has played since. Null until it has moved, for a
// sample that went backwards (a seek), or for one more than START_STALL_MS after play() (a stall, even if it moved).
export const startDelayMs = ({calledAtMs, fromMs, positionMs, atMs}) => {
	if (atMs - calledAtMs > START_STALL_MS) return null;
	const played = positionMs - fromMs;
	if (played < MIN_PLAYED_MS || played > START_STALL_MS) return null;
	return Math.max(0, atMs - played - calledAtMs);
};

// The first measurement is taken as is, then evenly averaged with what came before.
export const nextStartLeadMs = (leadMs, measuredMs) => {
	const measured = Math.min(measuredMs, MAX_START_LEAD_MS);
	if (leadMs === 0) return measured;
	return Math.round((leadMs + measured) / 2);
};

// A set paused near where a group start begins, as one is after a seek that landed on the keyframe before its target,
// takes up the difference in when it starts rather than in another seek. Behind it starts that much earlier, and ahead
// that much later. Further off than this, it seeks.
const MAX_START_GAP_MS = 2000;

// How far `positionTicks` is behind `targetTicks` in ms (negative ahead), or null when it's too far to start from.
export const startGapMs = (positionTicks, targetTicks) => {
	if (positionTicks == null || targetTicks == null) return null;
	const gap = (targetTicks - positionTicks) / 10000;
	return Math.abs(gap) <= MAX_START_GAP_MS ? Math.round(gap) : null;
};

// The lead is the set's own, so it's kept across launches and the first start after one leads too.
const STORAGE_KEY = 'moonfin_sync_start_lead_ms';

export const loadStartLeadMs = () => {
	try {
		const stored = Number(localStorage.getItem(STORAGE_KEY));
		return stored > 0 ? Math.min(stored, MAX_START_LEAD_MS) : 0;
	} catch (e) {
		return 0;
	}
};

export const saveStartLeadMs = (leadMs) => {
	try {
		localStorage.setItem(STORAGE_KEY, String(leadMs));
	} catch (e) {
		// Without storage the lead is learned again next launch.
	}
};
