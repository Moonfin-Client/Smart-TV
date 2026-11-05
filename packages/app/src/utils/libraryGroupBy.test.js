import {LIBRARY_GROUP_OPTIONS, groupByLabel, groupLibraryItems} from './libraryGroupBy';
import {parentalRatingSeverity, RATING_UNRATED} from './parentalRatingSeverity';

describe('groupLibraryItems', () => {
	it('puts an item in every genre it carries and Other last', () => {
		const groups = groupLibraryItems([
			{Id: 'a', Genres: ['Action', 'Comedy']},
			{Id: 'b', Genres: ['Action']},
			{Id: 'c', Genres: []}
		], 'genre');
		expect(groups.map((g) => g.name)).toEqual(['Action', 'Comedy', 'Other']);
		expect(groups[0].items.map((i) => i.Id)).toEqual(['a', 'b']);
		expect(groups[2].items.map((i) => i.Id)).toEqual(['c']);
	});

	it('orders decades newest first with Unknown last', () => {
		const groups = groupLibraryItems([
			{Id: 'a', ProductionYear: 1994},
			{Id: 'b', ProductionYear: 2021},
			{Id: 'c'},
			{Id: 'd', ProductionYear: 1990}
		], 'decade');
		expect(groups.map((g) => g.name)).toEqual(['2020s', '1990s', 'Unknown']);
		expect(groups[1].items.map((i) => i.Id)).toEqual(['a', 'd']);
	});

	it('orders ratings from mildest to strongest with Unrated last', () => {
		const groups = groupLibraryItems([
			{Id: 'a', OfficialRating: 'R'},
			{Id: 'b', OfficialRating: 'G'},
			{Id: 'c', OfficialRating: ''},
			{Id: 'd', OfficialRating: 'PG-13'}
		], 'parentalRating');
		expect(groups.map((g) => g.name)).toEqual(['G', 'PG-13', 'R', 'Unrated']);
	});

	it('reads studio names and falls back to Unknown', () => {
		const groups = groupLibraryItems([
			{Id: 'a', Studios: [{Name: 'Ghibli'}, {Name: 'A24'}]},
			{Id: 'b', Studios: [{}]}
		], 'studio');
		expect(groups.map((g) => g.name)).toEqual(['A24', 'Ghibli', 'Unknown']);
	});
});

describe('parentalRatingSeverity', () => {
	it('knows the common boards', () => {
		expect(parentalRatingSeverity('G')).toBeLessThan(parentalRatingSeverity('PG'));
		expect(parentalRatingSeverity('PG')).toBeLessThan(parentalRatingSeverity('PG-13'));
		expect(parentalRatingSeverity('PG-13')).toBeLessThan(parentalRatingSeverity('R'));
		expect(parentalRatingSeverity('R')).toBeLessThan(parentalRatingSeverity('NC-17'));
	});

	it('slots numeric boards by the age they name', () => {
		expect(parentalRatingSeverity('FSK-12')).toBeGreaterThan(parentalRatingSeverity('PG'));
		expect(parentalRatingSeverity('FSK-12')).toBeLessThan(parentalRatingSeverity('PG-13'));
		expect(parentalRatingSeverity('FSK-16')).toBeGreaterThan(parentalRatingSeverity('PG-13'));
	});

	it('sends missing and unknown ratings to the back', () => {
		expect(parentalRatingSeverity('')).toBe(RATING_UNRATED);
		expect(parentalRatingSeverity('Not Rated')).toBe(RATING_UNRATED);
		expect(parentalRatingSeverity('WEIRD-BOARD')).toBeGreaterThan(parentalRatingSeverity('NC-17'));
		expect(parentalRatingSeverity('WEIRD-BOARD')).toBeLessThan(RATING_UNRATED);
	});
});

describe('the Group By choices', () => {
	test('list in the order and under the names Core uses', () => {
		expect(LIBRARY_GROUP_OPTIONS.map(groupByLabel)).toEqual(['None', 'Decade (Year)', 'Genres', 'Parental Rating', 'Studio']);
	});

	test('a stored choice it no longer has reads as None', () => {
		expect(groupByLabel('year')).toBe('None');
	});
});
