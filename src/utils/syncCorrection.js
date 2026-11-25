import {driftAction, SKIP_THRESHOLD_MS} from './syncDrift';

// A TV that was just seeked keeps reporting the old position, then a frozen one
// while it rebuffers, and skipping on that reading leaves it scrubbing in place
// while the group plays on. So a skip has to land and render before the drift is
// measured again, and after enough skips that don't close the gap the set stands
// down until a group command moves it or the gap gets much worse.

// A landed seek sits within this of its target, allowing for a keyframe snap.
const LANDING_TOLERANCE_MS = 1500;
// Settled means the position advanced at roughly real time for this long.
const SETTLE_WINDOW_MS = 500;
const MIN_SETTLE_RATE = 0.5;
const MAX_SETTLE_RATE = 1.5;
// An attempt still not settled this long after it was issued is abandoned.
const ATTEMPT_DEADLINE_MS = 13000;
// A skip must leave the gap at most this fraction of what it was, or it failed.
const IMPROVEMENT_RATIO = 0.6;
// Consecutive failed skips before the set stands down from jumping at the gap.
const MAX_FAILED_ATTEMPTS = 3;
// Stood down, the set tries again only once the gap is worse than the one it
// stood down over by this much.
const RETRY_MARGIN_MS = 5000;
// A gap this large is worth another try whatever it stood down over.
const RETRY_GAP_MS = 3 * SKIP_THRESHOLD_MS;
// Skips per item, never handed back, so no sequence of events can jump forever.
const MAX_SKIPS_PER_ITEM = 10;
// A skip is aimed this far ahead of where the group is, before its cost has
// been measured: landing on the group's position after a seek that took time
// is landing behind it, and a transcode restarts the stream for every seek.
const DEFAULT_SEEK_ALLOWANCE_MS = 1500;
const MAX_SEEK_ALLOWANCE_MS = 8000;
// The allowance decays by this much per skip, so one slow seek doesn't aim
// every later skip too far ahead.
const ALLOWANCE_DECAY_MS = 500;
// Ahead of the group by up to this much, the set pauses for exactly that
// long. It costs no seek, can't overshoot, and is the correction of choice
// on a set where a seek restarts the stream.
export const MAX_WAIT_MS = 10000;
const MIN_WAIT_MS = 1000;
// A stall has to last this long before it's a stall. A TV raises
// waiting for a moment after every seek and start, and reporting each one
// stops the whole group for it.
export const STALL_DEBOUNCE_MS = 350;

export const createSkipGovernor = () => {
	let attempt = null;
	let skips = 0;
	let failed = 0;
	let gaveUp = false;
	let gaveUpResidualMs = 0;
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

	const noteFailure = (residualMs) => {
		failed += 1;
		if (failed >= MAX_FAILED_ATTEMPTS) {
			gaveUp = true;
			gaveUpResidualMs = residualMs;
		}
	};

	// 'defer': nothing should be done this tick, the reading can't be trusted.
	// 'hold': a wait is allowed but not a skip. 'skip': anything.
	const evaluate = ({nowMs, positionMs, driftMs, isPlaying, isBuffering}) => {
		observe({nowMs, positionMs, isPlaying, isBuffering});
		if (isBuffering || !isPlaying) return 'defer';
		const gap = Math.abs(driftMs || 0);
		if (attempt) {
			if (!attempt.settled) {
				if (nowMs < attempt.deadlineMs) return 'defer';
				// Never came back. Seeking at a set in this state pins it there.
				const wasStart = attempt.start;
				attempt = null;
				if (!wasStart) noteFailure(gap);
				return 'defer';
			}
			const {preResidualMs: pre, start, settledAtMs, issuedAtMs} = attempt;
			attempt = null;
			if (!start) {
				learnSeekCost(settledAtMs - issuedAtMs);
				if (gap <= Math.round(pre * IMPROVEMENT_RATIO)) {
					failed = 0;
				} else {
					noteFailure(gap);
				}
			}
		}
		if (gaveUp && gap > Math.max(RETRY_GAP_MS, gaveUpResidualMs + RETRY_MARGIN_MS)) {
			// Whatever the set stood down over, this is worse. Worth one more try.
			gaveUp = false;
			failed = 0;
		}
		if (gaveUp || skips >= MAX_SKIPS_PER_ITEM) return 'hold';
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

	// Playback was started, by an Unpause or a group seek landing. A TV reports
	// playing a second or two before it renders, and the drift read in that time
	// is the start latency, not a gap a skip could close. So the start is an
	// attempt like a skip, held until the set is seen moving, only it's nobody's
	// fault and teaches nothing about seeks.
	const onStart = ({nowMs, fromMs, targetMs = fromMs}) => {
		// A skip in flight is already being watched for the same thing, and
		// it has a cost to learn that a start doesn't.
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
	// so whatever the open attempt would have measured is meaningless, and
	// so are the failures counted up before the group moved the set.
	const cancel = () => {
		attempt = null;
		failed = 0;
		gaveUp = false;
	};

	const reset = () => {
		attempt = null;
		skips = 0;
		failed = 0;
		gaveUp = false;
		gaveUpResidualMs = 0;
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

// A resume in a watch party can come back a keyframe off, under the usual threshold for the rest of the run, so for a
// while after one anything over a second is put right.
const RESUME_WINDOW_MS = 15000;
const RESUME_TOLERANCE_MS = 1000;
export const afterResume = (options, msSinceResume) => (msSinceResume >= 0 && msSinceResume < RESUME_WINDOW_MS
	? {...options, skipThresholdMs: Math.min(options.skipThresholdMs, RESUME_TOLERANCE_MS)}
	: options);

// Behind, only a skip makes up time, aimed ahead by the seek allowance so it lands
// on the group. Ahead, the set waits the gap out, and only a lead too long to sit
// through is worth a skip backwards. Playing at a corrected rate isn't on offer,
// since an LG set freezes for about a second after every playbackRate write and a
// Samsung set loses its audio on one.
//   {type: 'skip', aheadMs} seek to the expected position plus aheadMs
//   {type: 'wait', ms}      pause for ms
//   {type: 'none'}
export const chooseCorrection = (driftMs, verdict, options, allowanceMs) => {
	if (verdict === 'defer' || driftMs == null) return {type: 'none'};
	if (driftAction(driftMs, options).type !== 'seek') return {type: 'none'};
	if (driftMs < 0) {
		return verdict === 'skip' ? {type: 'skip', aheadMs: allowanceMs} : {type: 'none'};
	}
	if (driftMs <= MAX_WAIT_MS) return driftMs >= MIN_WAIT_MS ? {type: 'wait', ms: driftMs} : {type: 'none'};
	return verdict === 'skip' ? {type: 'skip', aheadMs: 0} : {type: 'none'};
};
