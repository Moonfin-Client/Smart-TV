import {browseGridMetrics, cardSubtitle, matchesBrowseFilters} from './seerrBrowseGrid';

jest.mock('@enact/i18n/$L', () => (text) => text);

describe('browseGridMetrics', () => {
	const art = ({cellWidth, inset}) => cellWidth - 2 * inset;
	// From the bottom of one row's caption to the top of the next row's art.
	const rowGap = ({cellHeight, imageHeight, spacing}) => cellHeight - imageHeight - 70 + spacing;

	test('lays Medium out the way Core does at 1920', () => {
		const medium = browseGridMetrics('medium');
		expect(medium).toEqual({columns: 8, spacing: -12, inset: 21, edge: 85, cellWidth: 229, imageHeight: 281, headroom: 43, gridTop: 24, cellHeight: 424});
		// Core's 189 wide posters start at its 60 point margin, 30 apart across and 61 apart down,
		// the art 67 under the header.
		expect(medium.edge + medium.inset).toBe(106);
		expect(art(medium)).toBe(187);
		expect(medium.spacing + 2 * medium.inset).toBe(30);
		expect(rowGap(medium)).toBe(61);
		expect(medium.gridTop + medium.headroom).toBe(67);
	});

	test('without focus expansion the gaps are Core\'s plain 12 and 16 points and nothing grows', () => {
		const medium = browseGridMetrics('medium', false);
		expect(medium.columns).toBe(9);
		expect(art(medium)).toBe(173);
		expect(medium.spacing + 2 * medium.inset).toBe(20);
		expect(rowGap(medium)).toBe(27);
		expect(medium.gridTop + medium.headroom).toBe(33);
	});

	test.each([true, false])('a focused card in an edge column grows and rings inside the grid, expansion %s', (expansion) => {
		for (const size of ['small', 'medium', 'large', 'extraLarge']) {
			const metrics = browseGridMetrics(size, expansion);
			const growth = expansion ? art(metrics) * 0.06 : 0;
			expect(metrics.inset).toBeGreaterThanOrEqual(growth + 9);
		}
	});

	test.each([
		[true, {small: 10, medium: 8, large: 7, extraLarge: 6}],
		[false, {small: 11, medium: 9, large: 7, extraLarge: 6}]
	])('every size keeps Core\'s columns and fills the grid between its edges, expansion %s', (expansion, expected) => {
		for (const size of Object.keys(expected)) {
			const metrics = browseGridMetrics(size, expansion);
			const {columns, spacing, cellWidth} = metrics;
			const width = 1920 - 2 * metrics.edge;
			expect(columns).toBe(expected[size]);
			const used = columns * cellWidth + (columns - 1) * spacing;
			expect(width - used).toBeGreaterThanOrEqual(0);
			expect(width - used).toBeLessThan(columns);
			// Sandstone's own column count from the minimum width it's handed comes out the same.
			expect(Math.floor((width + spacing) / (cellWidth - 4 + spacing))).toBe(columns);
			expect(Number.isInteger(metrics.inset)).toBe(true);
		}
	});
});

describe('cardSubtitle', () => {
	test('joins the year, rating and status with two spaces', () => {
		expect(cardSubtitle({releaseDate: '2024-03-01', voteAverage: 7.84, mediaInfo: {status: 5}})).toBe('2024  ★ 7.8  Available');
		expect(cardSubtitle({firstAirDate: '2019-01-01', mediaInfo: {status: 3}})).toBe('2019  Requested');
		expect(cardSubtitle({voteAverage: 0})).toBe('');
	});
});

describe('matchesBrowseFilters', () => {
	const entry = (title, status) => ({title, mediaInfo: {status}});

	test('keeps what the status chip asks for and never a blocklisted title', () => {
		expect(matchesBrowseFilters(entry('Up', 4), 'available', '')).toBe(true);
		expect(matchesBrowseFilters(entry('Up', 3), 'available', '')).toBe(false);
		expect(matchesBrowseFilters(entry('Up', 2), 'requested', '')).toBe(true);
		expect(matchesBrowseFilters(entry('Up', undefined), 'all', '')).toBe(true);
		expect(matchesBrowseFilters(entry('Up', 6), 'all', '')).toBe(false);
	});

	test('matches the first letter, with # for anything that isn\'t A to Z', () => {
		expect(matchesBrowseFilters(entry(' up', 1), 'all', 'U')).toBe(true);
		expect(matchesBrowseFilters(entry('Up', 1), 'all', 'A')).toBe(false);
		expect(matchesBrowseFilters(entry('9 to 5', 1), 'all', '#')).toBe(true);
		expect(matchesBrowseFilters({name: 'Ébène'}, 'all', '#')).toBe(true);
		expect(matchesBrowseFilters({name: ''}, 'all', 'A')).toBe(false);
	});
});
