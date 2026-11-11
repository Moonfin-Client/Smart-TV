import {planSeekSheetIndexes, trickplayTile} from './trickplaySheets';

// One thumbnail per sheet, a second apart, so a sheet index reads as the second it shows.
const frames = {Width: 100, Height: 60, TileWidth: 1, TileHeight: 1, Interval: 1000, ThumbnailCount: 100};
// Twenty thumbnails ten seconds apart on each sheet.
const sheets = {Width: 100, Height: 60, TileWidth: 5, TileHeight: 4, Interval: 10000, ThumbnailCount: 120};

const plan = (info, seconds, forward) => planSeekSheetIndexes({
	info,
	positionMs: seconds * 1000,
	durationMs: 100000,
	stepMs: 10000,
	forward
});

describe('planSeekSheetIndexes', () => {
	test('follows the scrub step six ahead and two behind', () => {
		expect(plan(frames, 20, true)).toEqual([20, 30, 40, 50, 60, 70, 80, 10, 0]);
		expect(plan(frames, 40, false)).toEqual([40, 30, 20, 10, 0, 50, 60]);
	});

	test('clamps at both ends and collapses shared sheets', () => {
		expect(plan(frames, 0, false)).toEqual([0, 10, 20]);
		expect(plan(frames, 95, true)).toEqual([95, 99, 85, 75]);
		expect(plan(sheets, 20, true)).toEqual([0]);
	});

	test('asks for the next sheet as soon as the scrub enters one', () => {
		const sheetPlan = (seconds, forward) => planSeekSheetIndexes({
			info: sheets, positionMs: seconds * 1000, durationMs: 1200000, stepMs: 10000, forward
		});
		expect(sheetPlan(205, true)).toEqual([1, 0, 2]);
		expect(sheetPlan(395, false)).toEqual([1, 2, 0]);
		expect(sheetPlan(1150, true)).toEqual([5]);
		expect(sheetPlan(1300, true)).toEqual([5]);
		expect(sheetPlan(5, false)).toEqual([0]);
	});

	test('is empty without a manifest or a runtime', () => {
		expect(planSeekSheetIndexes({info: null, positionMs: 0, durationMs: 100000, stepMs: 10000, forward: true})).toEqual([]);
		expect(planSeekSheetIndexes({info: frames, positionMs: 0, durationMs: 0, stepMs: 10000, forward: true})).toEqual([]);
	});
});

describe('trickplayTile', () => {
	test('finds the sheet and the crop for a position', () => {
		expect(trickplayTile(sheets, 270000)).toEqual({
			imageIndex: 1, x: 200, y: 60, width: 100, height: 60, sheetWidth: 500, sheetHeight: 240
		});
	});

	test('is null past the last thumbnail', () => {
		expect(trickplayTile(sheets, 1200000)).toBeNull();
	});
});
