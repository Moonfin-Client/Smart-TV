import {spotlightGridMetrics, focusGap} from './spotlightGridMetrics';

// Every modal grid shares one column and cell computation, so the numbers are pinned here
// and a change meant for one grid cant quietly move the others.
describe('spotlightGridMetrics', () => {
	it('fits six 156px columns into a 1000px poster grid', () => {
		expect(spotlightGridMetrics({maxWidth: 1000, desiredWidth: 150, minColumns: 2, maxColumns: 7, maxCellWidth: 300}))
			.toEqual({columns: 6, cellWidth: 156, spacing: 12, runSpacing: 16});
	});

	it('fits four 138px cells into a 600px people grid at 16px gaps', () => {
		expect(spotlightGridMetrics({maxWidth: 600, desiredWidth: 110, minColumns: 3, maxColumns: 9, minSpacing: 16, minRunSpacing: 16}))
			.toEqual({columns: 4, cellWidth: 138, spacing: 16, runSpacing: 16});
	});

	it('holds the column count inside the allowed range', () => {
		expect(spotlightGridMetrics({maxWidth: 100, desiredWidth: 150, minColumns: 2, maxColumns: 7}).columns).toBe(2);
		expect(spotlightGridMetrics({maxWidth: 5000, desiredWidth: 150, minColumns: 2, maxColumns: 7}).columns).toBe(7);
	});

	it('never grows a cell past its cap', () => {
		expect(spotlightGridMetrics({maxWidth: 5000, desiredWidth: 150, minColumns: 2, maxColumns: 7, maxCellWidth: 300}).cellWidth).toBe(300);
	});

	it('widens the gaps to clear a focused card', () => {
		const metrics = spotlightGridMetrics({maxWidth: 1000, desiredWidth: 150, minColumns: 2, maxColumns: 7, maxCellWidth: 300, focusExpansion: true});
		expect(metrics.columns).toBe(6);
		expect(metrics.spacing).toBe(focusGap(156, 12));
		expect(metrics.cellWidth).toBe(Math.floor((1000 - metrics.spacing * 5) / 6));
		expect(metrics.runSpacing).toBe(focusGap(metrics.cellWidth / (2 / 3), 16));
	});
});

describe('focusGap', () => {
	it('holds the minimum when the growth is smaller than it', () => {
		expect(focusGap(100, 12)).toBe(12);
	});

	it('clears half the growth once that is the larger of the two', () => {
		expect(focusGap(800, 12)).toBeCloseTo(20);
	});
});
