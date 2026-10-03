jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

import {
	formatPersonDate,
	personAge,
	personDateLines,
	splitFilmography,
	usableCredits,
	groupCredits,
	popularBackdropPath,
	sortCredits,
	prepareCredits
} from './personCredits';

describe('person dates', () => {
	test('a date reads as a month, a day and a year', () => {
		expect(formatPersonDate('1975-01-05T00:00:00.0000000Z')).toBe('January 5, 1975');
		expect(formatPersonDate('1962-11-30')).toBe('November 30, 1962');
	});

	test('nothing usable is nothing at all', () => {
		expect(formatPersonDate(null)).toBeNull();
		expect(formatPersonDate('')).toBeNull();
		expect(formatPersonDate('not a date')).toBeNull();
	});

	test('age counts to the day they died, or to today', () => {
		expect(personAge('1950-06-01', '2000-05-31')).toBe(49);
		expect(personAge('1950-06-01', '2000-06-01')).toBe(50);
		expect(personAge(null)).toBeNull();
	});

	test('someone still alive is given their age, someone who died is given the date', () => {
		expect(personDateLines('1975-01-05', '2020-03-02'))
			.toEqual(['Born January 5, 1975', 'Died March 2, 2020']);

		const living = personDateLines('1975-01-05', null);
		expect(living[0]).toBe('Born January 5, 1975');
		expect(living[1]).toMatch(/^Age \d+$/);
	});

	test('no dates on file means no lines', () => {
		expect(personDateLines(null, null)).toEqual([]);
	});
});

describe('splitFilmography', () => {
	const item = (over) => ({Id: 'i', Type: 'Movie', ...over});

	test('each kind of work lands in its own row', () => {
		const {movies, series, musicVideos} = splitFilmography([
			item({Id: 'm1', Type: 'Movie'}),
			item({Id: 's1', Type: 'Series'}),
			item({Id: 'v1', Type: 'MusicVideo'})
		]);

		expect(movies.map((i) => i.Id)).toEqual(['m1']);
		expect(series.map((i) => i.Id)).toEqual(['s1']);
		expect(musicVideos.map((i) => i.Id)).toEqual(['v1']);
	});

	test('only an episode outside their own series is a guest appearance', () => {
		const {guestAppearances} = splitFilmography([
			item({Id: 's1', Type: 'Series'}),
			item({Id: 'e1', Type: 'Episode', SeriesId: 's1'}),
			item({Id: 'e2', Type: 'Episode', SeriesId: 'other'}),
			item({Id: 'e3', Type: 'Episode'})
		]);

		expect(guestAppearances.map((i) => i.Id)).toEqual(['e2', 'e3']);
	});

	test('a show or title held twice is one card', () => {
		const {movies, guestAppearances} = splitFilmography([
			item({Id: 'm1', Type: 'Movie', Name: 'Days of Thunder', ProductionYear: 1990}),
			item({Id: 'm2', Type: 'Movie', Name: 'Days of Thunder', ProductionYear: 1990}),
			item({Id: 'm3', Type: 'Movie', Name: 'Days of Thunder', ProductionYear: 2028}),
			item({Id: 'e1', Type: 'Episode', SeriesId: 'a', SeriesName: 'Late Show'}),
			item({Id: 'e2', Type: 'Episode', SeriesId: 'a', SeriesName: 'Late Show'}),
			item({Id: 'e3', Type: 'Episode', SeriesId: 'b', SeriesName: 'Late Show'}),
			item({Id: 'e4', Type: 'Episode', SeriesId: 'c', SeriesName: 'Other'})
		]);

		expect(movies.map((i) => i.Id)).toEqual(['m1', 'm3']);
		expect(guestAppearances.map((i) => i.Id)).toEqual(['e1', 'e4']);
	});

	test('nothing to split is four empty rows', () => {
		expect(splitFilmography(null)).toEqual({movies: [], series: [], guestAppearances: [], musicVideos: []});
	});
});

describe('credits', () => {
	const credit = (over) => ({id: 1, title: 'A Title', posterPath: '/a.jpg', ...over});

	test('a credit with no poster is left out', () => {
		expect(usableCredits([credit(), credit({id: 2, posterPath: null})])).toHaveLength(1);
		expect(usableCredits([credit({poster_path: '/b.jpg', posterPath: undefined})])).toHaveLength(1);
	});

	test('a thanks credit is not work on the title', () => {
		const list = [credit({job: 'Director'}), credit({id: 2, job: 'Thanks'}), credit({id: 3, job: 'Special Thanks'})];

		expect(usableCredits(list, true).map((c) => c.id)).toEqual([1]);
		expect(usableCredits(list, false)).toHaveLength(3);
	});

	test('roles on the same title are joined onto one entry', () => {
		const cast = groupCredits([
			credit({character: 'Pilot'}),
			credit({character: 'Narrator'}),
			credit({id: 2, title: 'Another', character: 'Guard'})
		]);

		expect(cast).toHaveLength(2);
		expect(cast[0].character).toBe('Pilot, Narrator');
		expect(cast[1].character).toBe('Guard');
	});

	test('a repeated role is only named once', () => {
		const crew = groupCredits([credit({job: 'Writer'}), credit({job: 'Writer'}), credit({job: 'Producer'})], true);

		expect(crew).toHaveLength(1);
		expect(crew[0].job).toBe('Writer, Producer');
	});

	test('sorted by title, or by date in either direction', () => {
		const list = [
			credit({id: 1, title: 'Zebra', releaseDate: '2001-01-01'}),
			credit({id: 2, title: 'apple', releaseDate: '2010-01-01'}),
			credit({id: 3, title: 'Middle', firstAirDate: '1995-01-01'})
		];

		expect(sortCredits(list, 'alphabetical').map((c) => c.id)).toEqual([2, 3, 1]);
		expect(sortCredits(list, 'releaseDateAsc').map((c) => c.id)).toEqual([3, 1, 2]);
		expect(sortCredits(list, 'releaseDateDesc').map((c) => c.id)).toEqual([2, 1, 3]);
	});

	test('a title with no date sorts to the end whichever way the rest go', () => {
		const list = [credit({id: 1, title: 'No date'}), credit({id: 2, title: 'Dated', releaseDate: '2001-01-01'})];

		expect(sortCredits(list, 'releaseDateAsc').map((c) => c.id)).toEqual([2, 1]);
		expect(sortCredits(list, 'releaseDateDesc').map((c) => c.id)).toEqual([2, 1]);
	});

	test('preparing a row filters, groups when asked, and sorts', () => {
		const list = [
			credit({id: 1, title: 'Beta', character: 'One'}),
			credit({id: 1, title: 'Beta', character: 'Two'}),
			credit({id: 2, title: 'Alpha', posterPath: null})
		];

		expect(prepareCredits(list).map((c) => c.character)).toEqual(['One', 'Two']);
		expect(prepareCredits(list, {group: true}).map((c) => c.character)).toEqual(['One, Two']);
	});
});

describe('the backdrop they are best known for', () => {
	const c = (extra) => ({backdropPath: '/a.jpg', voteCount: 10, ...extra});

	test('goes to the most voted-on acting credit', () => {
		expect(popularBackdropPath([c({backdropPath: '/low.jpg'}), c({backdropPath: '/top.jpg', voteCount: 9000}), c({backdrop_path: '/mid.jpg', vote_count: 500, backdropPath: undefined})])).toBe('/top.jpg');
	});

	test('skips talk shows, news and appearances as themselves', () => {
		expect(popularBackdropPath([
			c({backdropPath: '/talk.jpg', voteCount: 99999, genre_ids: [10767]}),
			c({backdropPath: '/self.jpg', voteCount: 88888, character: 'Himself'}),
			c({backdropPath: '/film.jpg', voteCount: 5})
		])).toBe('/film.jpg');
	});

	test('is nothing when no credit has one', () => {
		expect(popularBackdropPath([{voteCount: 5}])).toBeNull();
		expect(popularBackdropPath(null)).toBeNull();
	});
});
