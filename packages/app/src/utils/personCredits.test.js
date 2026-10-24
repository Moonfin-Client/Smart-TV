jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

import {
	formatPersonDate,
	personAge,
	personDateLines,
	sortFilmography,
	splitFilmography,
	withPersonRoles,
	usableCredits,
	groupCredits,
	sortCredits,
	sortFilmography,
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

	test('nothing to split is four empty rows', () => {
		expect(splitFilmography(null)).toEqual({movies: [], series: [], guestAppearances: [], musicVideos: []});
	});

	test('leaves out a kind of work the viewer switched off', () => {
		const hidden = new Set(['guestAppearances', 'musicVideos']);
		const {guestAppearances, musicVideos, movies} = splitFilmography([
			item({Id: 'm1', Type: 'Movie'}),
			item({Id: 'v1', Type: 'MusicVideo'}),
			item({Id: 'e1', Type: 'Episode', SeriesId: 'other'})
		], (id) => !hidden.has(id));
		expect(movies.map((m) => m.Id)).toEqual(['m1']);
		expect(guestAppearances).toEqual([]);
		expect(musicVideos).toEqual([]);
	});

	test('sorts filmography rows using the requested sort option', () => {
		const items = [
			item({Id: 'm1', Type: 'Movie', Name: 'Beta', PremiereDate: '2020-01-01'}),
			item({Id: 'm2', Type: 'Movie', Name: 'Alpha', PremiereDate: '2022-01-01'}),
			item({Id: 'm3', Type: 'Movie', Name: 'Charlie', PremiereDate: '2018-01-01'})
		];

		const alpha = splitFilmography(items, undefined, 'alphabetical');
		expect(alpha.movies.map((m) => m.Id)).toEqual(['m2', 'm1', 'm3']);

		const desc = splitFilmography(items, undefined, 'releaseDateDesc');
		expect(desc.movies.map((m) => m.Id)).toEqual(['m2', 'm1', 'm3']);

		const asc = splitFilmography(items, undefined, 'releaseDateAsc');
		expect(asc.movies.map((m) => m.Id)).toEqual(['m3', 'm1', 'm2']);
	});
});

describe('sortFilmography', () => {
	const item = (over) => ({Id: 'i', Name: 'Title', ...over});

	test('sorts alphabetically by name', () => {
		const items = [
			item({Id: '1', Name: 'Zulu'}),
			item({Id: '2', Name: 'Alpha'}),
			item({Id: '3', Name: 'Bravo'})
		];
		expect(sortFilmography(items, 'alphabetical').map((i) => i.Id)).toEqual(['2', '3', '1']);
	});

	test('sorts by release date ascending and descending with tie-breaker', () => {
		const items = [
			item({Id: '1', Name: 'Zulu', PremiereDate: '2020-01-01'}),
			item({Id: '2', Name: 'Alpha', PremiereDate: '2020-01-01'}),
			item({Id: '3', Name: 'Bravo', PremiereDate: '2022-01-01'}),
			item({Id: '4', Name: 'Delta', PremiereDate: '2010-01-01'})
		];
		expect(sortFilmography(items, 'releaseDateAsc').map((i) => i.Id)).toEqual(['4', '2', '1', '3']);
		expect(sortFilmography(items, 'releaseDateDesc').map((i) => i.Id)).toEqual(['3', '2', '1', '4']);
	});

	test('falls back to ProductionYear when PremiereDate is absent', () => {
		const items = [
			item({Id: '1', Name: 'Zulu', ProductionYear: 2021}),
			item({Id: '2', Name: 'Alpha', PremiereDate: '2019-05-01'})
		];
		expect(sortFilmography(items, 'releaseDateAsc').map((i) => i.Id)).toEqual(['2', '1']);
		expect(sortFilmography(items, 'releaseDateDesc').map((i) => i.Id)).toEqual(['1', '2']);
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

	test('does not collide same ID between movie and tv credits', () => {
		const credits = groupCredits([
			credit({id: 10, media_type: 'movie', character: 'Hero Movie'}),
			credit({id: 10, media_type: 'tv', character: 'Hero Show'})
		]);
		expect(credits).toHaveLength(2);
		expect(credits[0].character).toBe('Hero Movie');
		expect(credits[1].character).toBe('Hero Show');
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

	test('breaks ties by title when dates are identical', () => {
		const list = [
			credit({id: 1, title: 'Zebra', releaseDate: '2020-01-01'}),
			credit({id: 2, title: 'Alpha', releaseDate: '2020-01-01'})
		];
		expect(sortCredits(list, 'releaseDateAsc').map((c) => c.id)).toEqual([2, 1]);
		expect(sortCredits(list, 'releaseDateDesc').map((c) => c.id)).toEqual([2, 1]);
	});

	test('a title with no date sorts to the end whichever way the rest go', () => {
		const list = [credit({id: 1, title: 'No date'}), credit({id: 2, title: 'Dated', releaseDate: '2001-01-01'})];

		expect(sortCredits(list, 'releaseDateAsc').map((c) => c.id)).toEqual([2, 1]);
		expect(sortCredits(list, 'releaseDateDesc').map((c) => c.id)).toEqual([2, 1]);
	});

	test('a shared date falls back to the title, reversed with the dates', () => {
		const list = [
			credit({id: 1, title: 'Beta', releaseDate: '2001-01-01'}),
			credit({id: 2, title: 'Alpha', releaseDate: '2001-01-01'})
		];

		expect(sortCredits(list, 'releaseDateAsc').map((c) => c.id)).toEqual([2, 1]);
		expect(sortCredits(list, 'releaseDateDesc').map((c) => c.id)).toEqual([1, 2]);
	});

	test('a movie and a show sharing an id are not joined', () => {
		const list = [credit({id: 7, mediaType: 'movie'}), credit({id: 7, mediaType: 'tv', title: 'A Show'})];

		expect(groupCredits(list)).toHaveLength(2);
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

describe('sortFilmography', () => {
	const items = [
		{Id: 'a', Name: 'Zebra', PremiereDate: '2001-05-01T00:00:00Z'},
		{Id: 'b', Name: 'apple', ProductionYear: 2010},
		{Id: 'c', Name: 'Middle'}
	];

	test('sorted by name, or by premiere date or year with undated titles last', () => {
		expect(sortFilmography(items, 'alphabetical').map((i) => i.Id)).toEqual(['b', 'c', 'a']);
		expect(sortFilmography(items, 'releaseDateAsc').map((i) => i.Id)).toEqual(['a', 'b', 'c']);
		expect(sortFilmography(items, 'releaseDateDesc').map((i) => i.Id)).toEqual(['b', 'a', 'c']);
	});

	test('splitting the filmography keeps the order asked for', () => {
		const movies = [{Id: 'm1', Type: 'Movie', Name: 'B', ProductionYear: 2000}, {Id: 'm2', Type: 'Movie', Name: 'A', ProductionYear: 2020}];

		expect(splitFilmography(movies, undefined, 'releaseDateDesc').movies.map((i) => i.Id)).toEqual(['m2', 'm1']);
		expect(splitFilmography(movies).movies.map((i) => i.Id)).toEqual(['m2', 'm1']);
	});
});

describe('withPersonRoles', () => {
	test('the role they play becomes the subtitle and the cast is let go', () => {
		// Someone who directed and acted in a title is listed once per credit.
		const [item] = withPersonRoles([{Id: 'm1', People: [
			{Id: 'p2', Role: 'Fry'},
			{Id: 'p1', Role: '', Type: 'Director'},
			{Id: 'p1', Role: ' Bender (voice) ', Type: 'Actor'}
		]}], 'p1');

		expect(item).toEqual({Id: 'm1', Subtitle: 'Bender (voice)'});
	});

	test('several roles read as one', () => {
		const [item] = withPersonRoles([{Id: 'm1', People: [{Id: 'p1', Role: 'Wakka\nKimahri\n'}]}], 'p1');
		expect(item.Subtitle).toBe('Wakka, Kimahri');
	});

	test('no role leaves the title without a subtitle', () => {
		expect(withPersonRoles([{Id: 'm1', People: [{Id: 'p2', Role: 'Fry'}]}, {Id: 'm2'}], 'p1')).toEqual([{Id: 'm1'}, {Id: 'm2'}]);
	});
});
