// Where the seek bar draws a chapter mark, in milliseconds, in order and with duplicates collapsed.
// A mark at either end sits under the thumb where it rests and reads as an artifact rather than a
// chapter, so those are left out.
export const chapterMarkerPositions = (chapters, durationMs) => {
	if (!(durationMs > 0) || !chapters?.length) return [];
	const starts = [];
	for (const chapter of chapters) {
		const ticks = chapter?.startPositionTicks;
		if (typeof ticks !== 'number' || !isFinite(ticks)) continue;
		const ms = Math.floor(ticks / 10000);
		if (ms > 0 && ms < durationMs && starts.indexOf(ms) < 0) starts.push(ms);
	}
	return starts.sort((a, b) => a - b);
};

// Where Channel Up and Down jump to, in ticks, or null once there's no chapter left that way. A seek
// lands on the keyframe at or before its target, so a start just ahead of the position still counts as
// the chapter being played. Down goes back to where the current chapter started, or to the one before
// when it has only just begun.
const LANDING_TICKS = 20000000;
const RESTART_TICKS = 30000000;
export const chapterStep = (chapters, positionTicks, step) => {
	const starts = [0];
	for (const chapter of chapters || []) {
		const ticks = chapter?.startPositionTicks;
		if (typeof ticks === 'number' && isFinite(ticks) && ticks > 0 && starts.indexOf(ticks) < 0) starts.push(ticks);
	}
	starts.sort((a, b) => a - b);
	let current = 0;
	while (current < starts.length - 1 && starts[current + 1] <= positionTicks + LANDING_TICKS) current++;
	if (step > 0) return current < starts.length - 1 ? starts[current + 1] : null;
	if (positionTicks - starts[current] > RESTART_TICKS) return starts[current];
	return current > 0 ? starts[current - 1] : null;
};
