import {TICKS_PER_MS, driftAction, SLOW_RATE} from './syncDrift';

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
// A skip is aimed this far ahead of where the group is, before its cost has
// been measured: landing on the group's position after a seek that took time
// is landing behind it, and a transcode restarts the stream for every seek.
export const DEFAULT_SEEK_ALLOWANCE_MS = 1500;
export const MAX_SEEK_ALLOWANCE_MS = 8000;
// The allowance decays by this much per skip, so one slow seek does not aim
// every later skip too far ahead.
export const ALLOWANCE_DECAY_MS = 500;
// Ahead of the group by up to this much, the set pauses for exactly that
// long. It costs no seek, cannot overshoot, and is the correction of choice
// on a set where a seek restarts the stream.
export const MAX_WAIT_MS = 10000;
export const MIN_WAIT_MS = 1000;
// A stall has to last this long before it is a stall. A television raises
// waiting for a moment after every seek and start, and reporting each one
// stops the whole group for it.
export const STALL_DEBOUNCE_MS = 350;

export const createSkipGovernor = () => {
	let attempt = null;
	let skips = 0;
	let failed = 0;
	let gaveUp = false;
	let allowanceMs = null;

	const learnSeekCost = (costMs) => {
		if (costMs == null) return;
		const decayed = allowanceMs == null ? 0 : allowanceMs - ALLOWANCE_DECAY_MS;
		allowanceMs = Math.min(MAX_SEEK_ALLOWANCE_MS, Math.max(0, Math.max(costMs, decayed)));
	};

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
			attempt.settledAtMs = nowMs;
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
				const wasStart = attempt.start;
				attempt = null;
				if (!wasStart) noteFailure();
				return 'defer';
			}
			const {preResidualMs: pre, start, settledAtMs, issuedAtMs} = attempt;
			attempt = null;
			if (!start) {
				learnSeekCost(settledAtMs - issuedAtMs);
				if (Math.abs(driftMs) <= Math.round(pre * IMPROVEMENT_RATIO)) {
					failed = 0;
				} else {
					noteFailure();
				}
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
			settled: false,
			settledAtMs: null
		};
	};

	// Playback was started, by an Unpause or a group seek landing. A television
	// reports playing a second or two before it renders, and the drift read in
	// that time is the start latency, not a gap a skip could close. So the
	// start is an attempt like a skip, held until the set is seen moving, only
	// it is nobody's fault and teaches nothing about seeks.
	const onStart = ({nowMs, fromMs, targetMs = fromMs}) => {
		// A skip in flight is already being watched for the same thing, and
		// it has a cost to learn that a start does not.
		if (attempt) return;
		attempt = {
			start: true,
			issuedAtMs: nowMs,
			deadlineMs: nowMs + ATTEMPT_DEADLINE_MS,
			fromMs,
			targetMs,
			preResidualMs: 0,
			landedAtMs: null,
			anchor: null,
			settled: false,
			settledAtMs: null
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
		allowanceMs = null;
	};

	return {
		evaluate,
		observe,
		onSkip,
		onStart,
		cancel,
		reset,
		hasGivenUp: () => gaveUp,
		skipsUsed: () => skips,
		seekAllowanceMs: () => (allowanceMs == null ? DEFAULT_SEEK_ALLOWANCE_MS : allowanceMs)
	};
};

// What to do about a measured drift, given the governor's verdict. Behind,
// only a skip or a faster rate makes up time; a skip is aimed ahead by the
// seek allowance, so it lands on the group however far behind it started, and
// below the skip threshold a lateness is tolerated. Ahead, a rate nudge if the
// gap is small enough, otherwise a wait; a skip backwards only for a lead too
// long to sit through.
//
// Rate nudges are only for players whose pipeline survives one. An LG set
// freezes for about a second after every playbackRate write, which puts it
// further behind than the nudge was closing, and Core has found the same on
// Samsung and Apple TV, so the television players pass useSpeed false
// whatever the setting says.
//   {type: 'skip', aheadMs} seek to the expected position plus aheadMs
//   {type: 'rate', rate}    play at rate for the configured duration
//   {type: 'wait', ms}      pause for ms
//   {type: 'none'}
export const chooseCorrection = (driftMs, verdict, options, allowanceMs) => {
	if (verdict === 'defer' || driftMs == null) return {type: 'none'};
	const action = driftAction(driftMs, options);
	if (action.type !== 'seek') return action;
	if (driftMs < 0) {
		if (verdict === 'skip') return {type: 'skip', aheadMs: allowanceMs};
		return driftAction(driftMs, {...options, useSkip: false});
	}
	const size = driftMs;
	if (options.useSpeed !== false && size > (options.speedMinMs ?? 0) && size < (options.speedMaxMs ?? Infinity)) {
		return {type: 'rate', rate: SLOW_RATE};
	}
	if (size <= MAX_WAIT_MS) return size >= MIN_WAIT_MS ? {type: 'wait', ms: size} : {type: 'none'};
	return verdict === 'skip' ? {type: 'skip', aheadMs: 0} : {type: 'none'};
};

export const ticksToMs = (ticks) => (ticks == null ? null : ticks / TICKS_PER_MS);
