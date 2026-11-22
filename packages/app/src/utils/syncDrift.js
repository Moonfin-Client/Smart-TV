// A television decoder runs a little slow and loses wall clock time on every
// rebuffer, so a group that only corrects on commands drifts further behind for
// as long as it plays. These work out what to do about a measured drift.

export const TICKS_PER_MS = 10000;

// Anything smaller than this is not worth the rebuffer a seek costs.
export const SKIP_THRESHOLD_MS = 2000;
// How often playback is measured against the group.
export const DRIFT_CHECK_MS = 2000;

// Half the server's own 500ms MaxPlaybackOffset, so skipping a seek this small
// still leaves us inside what it would accept, and avoids a rebuffer that costs
// these sets far more than the drift did.
export const SEEK_TOLERANCE_MS = 250;

const numberOr = (value, fallback) => (typeof value === 'number' && isFinite(value) ? value : fallback);

// What the user asked for in settings, with the constants above standing in for
// anything unset. Correction runs at all only with both the advanced gate and the
// correction toggle on.
export const correctionOptions = (settings = {}) => {
	const advanced = settings.syncPlayAdvancedCorrectionEnabled !== false;
	const correction = settings.syncPlayEnableSyncCorrection !== false;
	return {
		enabled: advanced && correction,
		useSkip: settings.syncPlayUseSkipToSync !== false,
		skipThresholdMs: numberOr(settings.syncPlayMinDelaySkipToSync, SKIP_THRESHOLD_MS),
		extraOffsetMs: numberOr(settings.syncPlayExtraTimeOffset, 0)
	};
};

// Where the group should be now, given the position and server time it was last
// known to be at.
export const expectedPositionTicks = (reference, serverNowMs, extraOffsetMs = 0) => {
	if (!reference) return null;
	const elapsed = Math.max(0, serverNowMs - reference.serverTimeMs);
	return reference.positionTicks + (elapsed + extraOffsetMs) * TICKS_PER_MS;
};

// Positive means this player is ahead of the group.
export const driftMs = (currentTicks, expectedTicks) => {
	if (expectedTicks == null || currentTicks == null) return null;
	return Math.round((currentTicks - expectedTicks) / TICKS_PER_MS);
};

export const driftAction = (drift, options = {}) => {
	const {enabled = true, useSkip = true, skipThresholdMs = SKIP_THRESHOLD_MS} = options;
	if (!enabled || drift == null) return {type: 'none'};
	if (useSkip && Math.abs(drift) > skipThresholdMs) return {type: 'seek'};
	return {type: 'none'};
};

export const needsSeek = (currentTicks, targetTicks, toleranceMs = SEEK_TOLERANCE_MS) => {
	if (targetTicks == null || currentTicks == null) return true;
	return Math.abs(currentTicks - targetTicks) / TICKS_PER_MS > toleranceMs;
};

// A Samsung seek lands on a keyframe, which can be seconds past a target a fraction of a second away. In a watch
// party that corrects itself, a smaller gap is left to the drift check, which waits it out without seeking.
export const PARTY_SEEK_TOLERANCE_MS = 1000;

// Ahead of the group by up to this much, such a set holds back by the gap rather than seeking back, which is exact.
export const PARTY_HOLD_BACK_MAX_MS = 10000;
// How long after a seek lands while the room plays such a set reads how far ahead it came down.
export const PARTY_LANDING_READ_MS = 1000;
export const partyHoldBackMs = (currentTicks, targetTicks) => {
	if (currentTicks == null || targetTicks == null) return 0;
	const aheadMs = (currentTicks - targetTicks) / TICKS_PER_MS;
	return aheadMs > SEEK_TOLERANCE_MS && aheadMs <= PARTY_HOLD_BACK_MAX_MS ? Math.round(aheadMs) : 0;
};

// A television keeps playing the old buffer, and reporting the old position,
// while its pipeline works through a seek, so a seek only counts as landed
// once the position sits within this of the target and nearer to it than to
// where the seek started. The second test stops a short skip from passing
// on the stale reading alone.
export const SEEK_LANDED_MS = 1000;
// How long a seek the group commanded gets to land before the set reports
// itself as it stands. The honest position lets the server correct a seek the
// pipeline quietly dropped, instead of the group waiting on it forever.
export const GROUP_SEEK_SETTLE_TIMEOUT_MS = 8000;

export const seekLanded = (fromTicks, targetTicks, currentTicks) => {
	if (targetTicks == null || currentTicks == null) return false;
	const toTarget = Math.abs(currentTicks - targetTicks);
	if (toTarget / TICKS_PER_MS > SEEK_LANDED_MS) return false;
	if (fromTicks == null) return true;
	return toTarget <= Math.abs(currentTicks - fromTicks);
};
