import {TICKS_PER_MS} from './syncDrift';

// Whether a corrective skip is worth making. A television that has just been
// seeked keeps reporting the old position, then a frozen one while it
// rebuffers, and either reads as far behind the group. Skipping on that
// reading stalls the pipeline again: the loop that leaves one set scrubbing
// in place at a frame a second while the rest of the group plays on. So a
// skip is an attempt that has to land and render before the drift is
// measured again, and skips that do not close the gap are given up on.
// Mirrors Core's SyncCorrectionPolicy.

// A landed seek sits within this of its target, allowing for a keyframe snap.
export const LANDING_TOLERANCE_MS = 1500;
// Settled means the position advanced at roughly real time for this long.
export const SETTLE_WINDOW_MS = 500;
export const MIN_SETTLE_RATE = 0.5;
export const MAX_SETTLE_RATE = 1.5;
// An attempt still not settled this long after it was issued is abandoned.
export const ATTEMPT_DEADLINE_MS = 13000;
// A skip must leave the gap at most this fraction of what it was, or it failed.
export const IMPROVEMENT_RATIO = 0.6;
// Consecutive failed skips before the set stops jumping at the gap.
export const MAX_FAILED_ATTEMPTS = 3;
// Skips per item, never handed back, so no sequence of events can jump forever.
export const MAX_SKIPS_PER_ITEM = 10;

export const createSkipGovernor = () => {
	let attempt = null;
	let skips = 0;
	let failed = 0;
	let gaveUp = false;

	const observe = ({nowMs, positionMs, isPlaying, isBuffering}) => {
		if (!attempt || attempt.settled) return;
		if (isBuffering) {
			// Had the position before it had the frames. Start over.
			attempt.landedAtMs = null;
			attempt.anchor = null;
			return;
		}
		if (attempt.landedAtMs == null) {
			const toTarget = Math.abs(positionMs - attempt.targetMs);
			const toOrigin = Math.abs(positionMs - attempt.fromMs);
			if (toTarget > LANDING_TOLERANCE_MS && toTarget >= toOrigin) return;
			attempt.landedAtMs = nowMs;
		}
		if (!isPlaying) {
			attempt.anchor = null;
			return;
		}
		if (!attempt.anchor) {
			attempt.anchor = {nowMs, positionMs};
			return;
		}
		const elapsed = nowMs - attempt.anchor.nowMs;
		if (elapsed < SETTLE_WINDOW_MS) return;
		const rate = (positionMs - attempt.anchor.positionMs) / elapsed;
		if (rate >= MIN_SETTLE_RATE && rate <= MAX_SETTLE_RATE) {
			attempt.settled = true;
		} else {
			attempt.anchor = {nowMs, positionMs};
		}
	};

	const noteFailure = () => {
		failed += 1;
		if (failed >= MAX_FAILED_ATTEMPTS) gaveUp = true;
	};

	// 'defer': nothing should be done this tick, the reading cannot be
	// trusted. 'nudge': only a rate change is allowed. 'skip': anything.
	const evaluate = ({nowMs, positionMs, driftMs, isPlaying, isBuffering}) => {
		observe({nowMs, positionMs, isPlaying, isBuffering});
		if (isBuffering || !isPlaying) return 'defer';
		if (attempt) {
			if (!attempt.settled) {
				if (nowMs < attempt.deadlineMs) return 'defer';
				// Never came back. Seeking at a set in this state pins it there.
				attempt = null;
				noteFailure();
				return 'defer';
			}
			const pre = attempt.preResidualMs;
			attempt = null;
			if (Math.abs(driftMs) <= Math.round(pre * IMPROVEMENT_RATIO)) {
				failed = 0;
			} else {
				noteFailure();
			}
		}
		if (gaveUp || skips >= MAX_SKIPS_PER_ITEM) return 'nudge';
		return 'skip';
	};

	const onSkip = ({nowMs, fromMs, targetMs, driftMs}) => {
		skips += 1;
		attempt = {
			issuedAtMs: nowMs,
			deadlineMs: nowMs + ATTEMPT_DEADLINE_MS,
			fromMs,
			targetMs,
			preResidualMs: Math.abs(driftMs),
			landedAtMs: null,
			anchor: null,
			settled: false
		};
	};

	// The position moved for another reason, a group command or a user seek,
	// so whatever the open attempt would have measured is meaningless.
	const cancel = () => {
		attempt = null;
	};

	const reset = () => {
		attempt = null;
		skips = 0;
		failed = 0;
		gaveUp = false;
	};

	return {
		evaluate,
		onSkip,
		cancel,
		reset,
		hasGivenUp: () => gaveUp,
		skipsUsed: () => skips
	};
};

export const ticksToMs = (ticks) => (ticks == null ? null : ticks / TICKS_PER_MS);
