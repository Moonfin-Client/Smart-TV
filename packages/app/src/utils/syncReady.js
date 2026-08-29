import {TICKS_PER_MS} from './syncDrift';

// The server holds the whole group until every member reports Ready, so a
// report sent while the decoder is still catching up starts everyone else
// without this set. A television reports PLAYING well before it is actually
// moving, which is why readiness has to be measured rather than taken on trust.

export const READY_DEBOUNCE_MS = 900;
export const STABILITY_WINDOW_MS = 400;
// After this many unconvincing samples the report goes out regardless. Some
// sets report position too coarsely to ever look like it is moving, and a Ready
// that never arrives leaves the group waiting forever.
export const MAX_STABILITY_CHECKS = 4;
// While the pipeline is still buffering the gate looks again this often,
// rather than waiting for a canplay or playing event that a television does
// not always raise after a seek.
export const BUFFERING_POLL_MS = 500;
// After this many looks the report goes out regardless, as Core's watchdog
// does. The server holds the whole group on a Ready that never comes, and a
// set that then stalls on unpause reports Buffering like any other stall.
export const MAX_BUFFERING_POLLS = 24;

// Playing at normal speed the position should advance by roughly the window
// itself. Well under that means the decoder is still stalled, well over means a
// seek landed part way through and the reading cant be trusted.
const MIN_ADVANCE_MS = 80;
const MAX_ADVANCE_MS = 1200;
// Paused it should not be moving at all, give or take a frame.
const MAX_PAUSED_DRIFT_MS = 120;

export const isPositionStable = (beforeTicks, afterTicks, isPlaying) => {
	if (beforeTicks == null || afterTicks == null) return false;
	const delta = (afterTicks - beforeTicks) / TICKS_PER_MS;
	if (isPlaying) return delta >= MIN_ADVANCE_MS && delta <= MAX_ADVANCE_MS;
	return Math.abs(delta) <= MAX_PAUSED_DRIFT_MS;
};

// Buffering holds a waiting report rather than dropping it: the gate keeps
// looking until the stall clears, and a canplay or playing event only brings
// the report forward.
export const createReadyGate = ({sample, isBuffering, report}) => {
	let timer = null;
	let checks = 0;
	let polls = 0;

	const cancel = () => {
		clearTimeout(timer);
		timer = null;
	};

	const send = () => {
		timer = null;
		report();
	};

	const measure = () => {
		if (isBuffering()) {
			polls += 1;
			if (polls >= MAX_BUFFERING_POLLS) {
				send();
				return;
			}
			timer = setTimeout(measure, BUFFERING_POLL_MS);
			return;
		}
		const before = sample().positionTicks;
		timer = setTimeout(() => {
			timer = null;
			if (isBuffering()) {
				measure();
				return;
			}
			const {isPlaying, positionTicks} = sample();
			checks += 1;
			if (isPositionStable(before, positionTicks, isPlaying) || checks >= MAX_STABILITY_CHECKS) {
				send();
				return;
			}
			measure();
		}, STABILITY_WINDOW_MS);
	};

	const request = () => {
		cancel();
		checks = 0;
		polls = 0;
		timer = setTimeout(measure, READY_DEBOUNCE_MS);
	};

	return {request, cancel};
};
