const TICKS_PER_SECOND = 10000000;
const MARKER_INTERVAL_SECONDS = 1;
const MIN_BAR_WIDTH_PERCENT = 0.4;

export const TIMELINE_WINDOW_SECONDS = 10;

// Bars carry the cue's own words, so ASS override blocks and the markup the
// text overlay renders have to come off before they reach a text node.
const toPlainText = (text) => String(text || '')
	.replace(/\{\\[^}]*\}/g, '')
	.replace(/<[^>]*>/g, '')
	.replace(/\s+/g, ' ')
	.trim();

export const formatTimeMarker = (seconds) => {
	const minutes = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${minutes}:${String(secs).padStart(2, '0')}`;
};

/**
 * Lays out the subtitle events that fall inside a window centred on the
 * playhead, as percentages across that window.
 *
 * The offset moves the cues, not the playhead, so the bars slide under a fixed
 * indicator exactly the way the rendered subtitles shift against the picture.
 */
export const buildSubtitleTimeline = (events, currentTimeSeconds, offsetSeconds = 0) => {
	if (!Array.isArray(events) || events.length === 0) return null;

	const currentTime = Number.isFinite(currentTimeSeconds) ? currentTimeSeconds : 0;
	const windowStart = Math.max(0, currentTime - (TIMELINE_WINDOW_SECONDS / 2));
	const windowEnd = windowStart + TIMELINE_WINDOW_SECONDS;
	const percentOf = (time) => ((time - windowStart) / TIMELINE_WINDOW_SECONDS) * 100;

	const markers = [];
	for (let time = Math.ceil(windowStart); time <= windowEnd; time += MARKER_INTERVAL_SECONDS) {
		markers.push({time, label: formatTimeMarker(time), left: percentOf(time)});
	}

	const bars = [];
	for (const event of events) {
		const start = (event.StartPositionTicks / TICKS_PER_SECOND) + offsetSeconds;
		const end = (event.EndPositionTicks / TICKS_PER_SECOND) + offsetSeconds;
		if (end <= windowStart || start >= windowEnd) continue;

		const left = Math.max(0, percentOf(start));
		const width = Math.min(100, percentOf(end)) - left;
		bars.push({
			key: `${event.StartPositionTicks}-${event.EndPositionTicks}`,
			left,
			width: Math.max(width, MIN_BAR_WIDTH_PERCENT),
			text: toPlainText(event.Text),
			isActive: currentTime >= start && currentTime <= end
		});
	}

	return {markers, bars, playheadLeft: percentOf(currentTime)};
};
