import {sortGenres, titleCount} from './genreSorting';

const names = (items) => items.map((i) => i.Name);

describe('title count', () => {
	it('counts only the types the row shows', () => {
		const genre = {MovieCount: 4, SeriesCount: 3};
		expect(titleCount(genre, 'Movie,Series')).toBe(7);
		expect(titleCount(genre, 'Movie')).toBe(4);
		expect(titleCount(genre, 'Series')).toBe(3);
	});

	it('falls back to the plain total a genre was counted with', () => {
		expect(titleCount({ChildCount: 9}, 'Movie')).toBe(9);
		expect(titleCount({}, 'Movie')).toBe(0);
	});
});

describe('sorting genres', () => {
	const genres = [
		{Name: 'drama', MovieCount: 2},
		{Name: 'Action', MovieCount: 9},
		{Name: 'Comedy', MovieCount: 2}
	];

	it('sorts by name either way, ignoring case', () => {
		expect(names(sortGenres(genres, 'SortName', 'Ascending'))).toEqual(['Action', 'Comedy', 'drama']);
		expect(names(sortGenres(genres, 'SortName', 'Descending'))).toEqual(['drama', 'Comedy', 'Action']);
	});

	it('ranks by item count, ties by name', () => {
		expect(names(sortGenres(genres, 'ItemCount', 'Descending'))).toEqual(['Action', 'Comedy', 'drama']);
		expect(names(sortGenres(genres, 'ItemCount', 'Ascending'))).toEqual(['Comedy', 'drama', 'Action']);
	});

	it('shuffles without losing anything', () => {
		expect(names(sortGenres(genres, 'Random')).sort()).toEqual(['Action', 'Comedy', 'drama']);
	});
});
