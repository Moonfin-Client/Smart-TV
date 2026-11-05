import {bufferedAheadSeconds, createStarveWatch, STARVE_HOLD_MS, STARVE_WINDOW_MS} from './syncStarve';

const ranges = (...pairs) => ({length: pairs.length, start: (i) => pairs[i][0], end: (i) => pairs[i][1]});

describe('createStarveWatch', () => {
	test('one stall is a hiccup; a second close behind it is a stream not keeping up', () => {
		const watch = createStarveWatch();
		expect(watch.onStall(0)).toBe(false);
		expect(watch.onStall(2500)).toBe(true);
		expect(watch.isStarving(2500 + STARVE_HOLD_MS - 1)).toBe(true);
		expect(watch.isStarving(2500 + STARVE_HOLD_MS)).toBe(false);
	});

	test('stalls far apart never add up', () => {
		const watch = createStarveWatch();
		watch.onStall(0);
		expect(watch.onStall(STARVE_WINDOW_MS + 1)).toBe(false);
	});
});

describe('bufferedAheadSeconds', () => {
	test('measures the range the playhead is in', () => {
		expect(bufferedAheadSeconds(ranges([0, 10], [20, 30]), 4)).toBe(6);
		expect(bufferedAheadSeconds(ranges([0, 10], [20, 30]), 15)).toBe(0);
		expect(bufferedAheadSeconds(null, 4)).toBe(0);
	});
});
