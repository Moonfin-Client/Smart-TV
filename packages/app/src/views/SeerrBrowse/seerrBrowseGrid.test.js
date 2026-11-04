import {browseGridMetrics, cardSubtitle, matchesBrowseFilters} from './seerrBrowseGrid';

jest.mock('@enact/i18n/$L', () => (text) => text);

describe('browseGridMetrics', () => {
	const art = ({cellWidth, inset}) => cellWidth - 2 * inset;

	test('lays Medium out the way Core does at 1920', () => {
		const medium = browseGridMetrics('medium');
		expect(medium).toEqual({columns: 8, spacing: 18, inset: 6, cellWidth: 199, imageHeight: 281, headroom: 43, gridTop: 24, cellHeight: 394});
		// Core's 189 wide posters sit 30 apart across and 61 apart down, the art 67 under the header.
		expect(art(medium)).toBe(187);
		expect(medium.spacing + 2 * medium.inset).toBe(30);
		expect(medium.spacing + medium.headroom).toBe(61);
		expect(medium.gridTop + medium.headroom).toBe(67);
	});

	test('without focus expansion the gaps are Core\'s plain 12 and 16 points and nothing grows', () => {
		const medium = browseGridMetrics('medium', false);
		expect(medium.columns).toBe(9);
		expect(art(medium)).toBe(173);
		expect(medium.spacing + 2 * medium.inset).toBe(20);
		expect(medium.spacing + medium.headroom).toBe(27);
		expect(medium.gridTop + medium.headroom).toBe(33);
	});

	test.each([
		[true, {small: 10, medium: 8, large: 7, extraLarge: 6}],
		[false, {small: 11, medium: 9, large: 7, extraLarge: 6}]
	])('every size keeps Core\'s columns and fills the 1720px between the margins, expansion %s', (expansion, expected) => {
		for (const size of Object.keys(expected)) {
			const metrics = browseGridMetrics(size, expansion);
			const {columns, spacing, cellWidth} = metrics;
			expect(columns).toBe(expected[size]);
			const used = columns * cellWidth + (columns - 1) * spacing;
			expect(1720 - used).toBeGreaterThanOrEqual(0);
			expect(1720 - used).toBeLessThan(columns);
			// Sandstone's own column count from the minimum width it's handed comes out the same.
			expect(Math.floor((1720 + spacing) / (cellWidth - 4 + spacing))).toBe(columns);
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
