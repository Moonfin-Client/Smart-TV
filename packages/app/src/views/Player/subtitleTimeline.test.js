import {buildSubtitleTimeline, formatTimeMarker, TIMELINE_WINDOW_SECONDS} from './subtitleTimeline';

const TICKS_PER_SECOND = 10000000;
const event = (start, end, text = 'line') => ({
	StartPositionTicks: start * TICKS_PER_SECOND,
	EndPositionTicks: end * TICKS_PER_SECOND,
	Text: text
});

describe('formatTimeMarker', () => {
	it('pads the seconds', () => {
		expect(formatTimeMarker(65)).toBe('1:05');
		expect(formatTimeMarker(0)).toBe('0:00');
	});
});

describe('buildSubtitleTimeline', () => {
	it('returns null when there are no events to draw', () => {
		expect(buildSubtitleTimeline(null, 10)).toBeNull();
		expect(buildSubtitleTimeline([], 10)).toBeNull();
	});

	it('drops events outside the window', () => {
		const events = [event(0, 1), event(59, 61), event(200, 202)];

		const {bars} = buildSubtitleTimeline(events, 60);

		expect(bars).toHaveLength(1);
		expect(bars[0].text).toBe('line');
	});

	it('centres the playhead once the window clears the start of the file', () => {
		expect(buildSubtitleTimeline([event(59, 61)], 60).playheadLeft).toBe(50);
	});

	it('keeps the playhead against the real time near the start of the file', () => {
		// The window cannot start before 0, so the playhead sits where it lands.
		expect(buildSubtitleTimeline([event(0, 2)], 1).playheadLeft).toBe(10);
	});

	it('shifts the bars by the offset and leaves the playhead alone', () => {
		const withoutOffset = buildSubtitleTimeline([event(59, 61)], 60);
		const withOffset = buildSubtitleTimeline([event(59, 61)], 60, 1);

		expect(withOffset.bars[0].left - withoutOffset.bars[0].left).toBeCloseTo(10);
		expect(withOffset.playheadLeft).toBe(withoutOffset.playheadLeft);
	});

	it('marks the event under the playhead as active, offset included', () => {
		expect(buildSubtitleTimeline([event(59, 61)], 60).bars[0].isActive).toBe(true);
		expect(buildSubtitleTimeline([event(59, 61)], 60, 5).bars[0].isActive).toBe(false);
	});

	it('clips a bar that runs past either edge of the window', () => {
		const {bars} = buildSubtitleTimeline([event(0, 120)], 60);

		expect(bars[0].left).toBe(0);
		expect(bars[0].width).toBe(100);
	});

	it('gives a zero-length event enough width to stay visible', () => {
		expect(buildSubtitleTimeline([event(60, 60)], 60).bars[0].width).toBeGreaterThan(0);
	});

	it('strips ASS override blocks and markup from the bar text', () => {
		const events = [event(59, 61, '{\\an8}<i>Hello</i>\nthere')];

		expect(buildSubtitleTimeline(events, 60).bars[0].text).toBe('Hello there');
	});

	it('spans the window with one marker a second', () => {
		const {markers} = buildSubtitleTimeline([event(59, 61)], 60);

		expect(markers).toHaveLength(TIMELINE_WINDOW_SECONDS + 1);
		expect(markers[0].label).toBe('0:55');
		expect(markers[0].left).toBe(0);
	});
});
