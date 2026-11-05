import {MUSIC_CATEGORIES, SEE_ALL_TARGET} from './musicLibrary';
import {MUSIC_CHIPS} from './MusicChips';
import {
	OVERVIEW_TAB, SONG_MIXES, gridMove, gridRows, hasGenreCounts, jumpRow, letterOf, mixOrder, mixQuery,
	musicNavFor, musicScreenFor, rowIndexOf, sortGenres, startingTab, stripTarget, tabForScreen
} from './musicScreens';

// The chips and categories come with components, so these stand in as they do in musicLibrary.test.js,
// where the CLI's second copy of React is explained.
jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {
		Fragment: React.Fragment,
		jsxDEV: (type, {children, ...props}, key) => React.createElement(type, key === undefined ? props : {...props, key}, children)
	};
});
jest.mock('@enact/spotlight', () => ({focus: jest.fn(() => true), getPointerMode: () => false}));
jest.mock('@enact/spotlight/Spottable', () => (type) => type);
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => type);
jest.mock('../../platform', () => ({getPlatform: () => 'webos'}));

const named = (...names) => names.map((Name, i) => ({Id: `id${i}`, Name}));

describe('letterOf', () => {
	test('files a name under its first letter, accents folded and case ignored', () => {
		expect(named('Ángel', 'élan', 'zola', 'Öst').map(letterOf)).toEqual(['A', 'E', 'Z', 'O']);
	});

	test('reads the sort name ahead of the name', () => {
		expect(letterOf({Name: 'The Beatles', SortName: 'Beatles, The'})).toBe('B');
	});

	test('puts numbers, symbols and other scripts under #', () => {
		expect(named('2Pac', '!!!', '坂本龍一', '').map(letterOf)).toEqual(['#', '#', '#', '#']);
	});
});

describe('gridRows', () => {
	const letters = (...names) => {
		const items = named(...names);
		return (count, columns) => gridRows(count, columns, (i) => letterOf(items[i]));
	};

	test('starts a row with a heading at each new letter, and wraps a long run without one', () => {
		const rowsFor = letters('Abba', 'Air', 'Alt-J', 'Beck', 'Bjork', 'Blur');
		expect(rowsFor(6, 2)).toEqual([
			{start: 0, end: 2, section: 'A', heading: true},
			{start: 2, end: 3, section: 'A', heading: false},
			{start: 3, end: 5, section: 'B', heading: true},
			{start: 5, end: 6, section: 'B', heading: false}
		]);
	});

	test('gives a letter that comes back later in the list its own heading again', () => {
		const rows = letters('Abba', 'Beck', 'Ångström')(3, 7);
		expect(rows.map((row) => [row.section, row.heading])).toEqual([['A', true], ['B', true], ['A', true]]);
	});

	test('without sections it is plain rows of the column count', () => {
		expect(gridRows(7, 3)).toEqual([
			{start: 0, end: 3, section: null, heading: false},
			{start: 3, end: 6, section: null, heading: false},
			{start: 6, end: 7, section: null, heading: false}
		]);
		expect(rowIndexOf(gridRows(7, 3), 4)).toBe(1);
		expect(rowIndexOf(gridRows(7, 3), 9)).toBe(-1);
	});
});

describe('gridMove', () => {
	// A row of 7, a short row of 2 that starts a new letter, then a row of 7.
	const rows = [{start: 0, end: 7}, {start: 7, end: 9}, {start: 9, end: 16}];

	test('moves along a row and stops at its ends', () => {
		expect(gridMove(rows, 0, 3, 'right')).toBe(4);
		expect(gridMove(rows, 0, 6, 'right')).toBeNull();
		expect(gridMove(rows, 1, 7, 'left')).toBeNull();
	});

	test('keeps the column going up and down, clamped to a shorter row', () => {
		expect(gridMove(rows, 0, 5, 'down')).toBe(8);
		expect(gridMove(rows, 1, 8, 'down')).toBe(10);
		expect(gridMove(rows, 2, 15, 'up')).toBe(8);
		expect(gridMove(rows, 0, 2, 'up')).toBeNull();
		expect(gridMove(rows, 2, 12, 'down')).toBeNull();
	});
});

describe('jumpRow', () => {
	const rowsOf = (...names) => {
		const items = named(...names);
		return gridRows(items.length, 7, (i) => letterOf(items[i]));
	};
	const ascending = rowsOf('2Pac', 'Abba', 'Beck', 'Muse', 'Zola');

	test('lands on the letter, or the next one that has artists', () => {
		expect(ascending[jumpRow(ascending, 'B', false, false)].section).toBe('B');
		expect(ascending[jumpRow(ascending, 'C', false, false)].section).toBe('M');
		expect(ascending[jumpRow(ascending, '#', false, false)].section).toBe('#');
	});

	test('runs the other way when the list is Z to A', () => {
		const descending = rowsOf('Zola', 'Muse', 'Beck', 'Abba');
		expect(descending[jumpRow(descending, 'L', true, false)].section).toBe('B');
		expect(jumpRow(descending, '#', true, false)).toBe(-1);
	});

	test('asks for more until the list is all in, then falls back to the last letter', () => {
		const partial = rowsOf('Abba', 'Beck');
		expect(jumpRow(partial, 'Q', false, false)).toBe(-1);
		expect(partial[jumpRow(partial, 'Q', false, true)].section).toBe('B');
	});
});

describe('sortGenres', () => {
	const genres = [
		{Name: 'Rock', AlbumCount: 12},
		{Name: 'Ambient', AlbumCount: 3},
		{Name: 'Jazz', ChildCount: 12},
		{Name: 'Blues', AlbumCount: 40}
	];

	test('puts the most albums first, ties by name, falling back to the child count', () => {
		expect(sortGenres(genres, 'albums').map((g) => g.Name)).toEqual(['Blues', 'Jazz', 'Rock', 'Ambient']);
	});

	test('sorts A to Z, and leaves the list it was given alone', () => {
		expect(sortGenres(genres, 'name').map((g) => g.Name)).toEqual(['Ambient', 'Blues', 'Jazz', 'Rock']);
		expect(genres[0].Name).toBe('Rock');
	});

	test('knows when the server sent no counts at all', () => {
		expect(hasGenreCounts(genres)).toBe(true);
		expect(hasGenreCounts([{Name: 'Rock'}, {Name: 'Pop'}])).toBe(false);
	});
});

describe('the song mixes', () => {
	const tracks = [{Id: 'a'}, {Id: 'b'}, {Id: 'c'}];
	const reverse = (list) => list.slice().reverse();

	test('only Rediscover is shuffled, the rest play in the order the server sent', () => {
		const shuffled = SONG_MIXES.filter((mix) => mixOrder(mix, tracks, reverse) !== tracks).map((mix) => mix.id);
		expect(shuffled).toEqual(['rediscover']);
		const rediscover = SONG_MIXES.find((mix) => mix.id === 'rediscover');
		expect(mixOrder(rediscover, tracks, reverse).map((t) => t.Id)).toEqual(['c', 'b', 'a']);
	});

	test('Rediscover asks for the favorites played longest ago, from this library', () => {
		const rediscover = SONG_MIXES.find((mix) => mix.id === 'rediscover');
		expect(mixQuery(rediscover, 'lib1')).toEqual({
			ParentId: 'lib1', IncludeItemTypes: 'Audio', Recursive: true,
			IsFavorite: true, SortBy: 'DatePlayed,SortName', SortOrder: 'Ascending', Limit: 100
		});
	});

	test('Everything is the only card without a palette color, so it takes the accent', () => {
		expect(SONG_MIXES.filter((mix) => !mix.color).map((mix) => mix.id)).toEqual(['everything']);
	});
});

describe('musicScreenFor', () => {
	test('every category in every style opens its own screen', () => {
		const ids = [...MUSIC_CHIPS, ...MUSIC_CATEGORIES].map((c) => [c.id, musicScreenFor(c.id)?.id]);
		expect(ids).toEqual([
			['albums', 'albums'], ['artists', 'artists'], ['playlists', 'playlists'], ['genres', 'genres'], ['favorites', 'favorites'],
			['albumArtists', 'artists'], ['albums', 'albums'], ['songs', 'songs'], ['playlists', 'playlists'], ['genres', 'genres'], ['favoriteItems', 'favorites']
		]);
		expect(musicScreenFor('artists')).toEqual({id: 'artists', mode: 'albumArtists'});
	});

	test('a row See All opens the matching screen, artist rows on All Artists and favorites on Albums', () => {
		const screens = Object.fromEntries(Object.entries(SEE_ALL_TARGET).map(([row, target]) => [row, musicScreenFor(target)]));
		expect(screens).toEqual({
			latestMusic: {id: 'albums'},
			favorites: {id: 'favorites', tab: 'albums'},
			playlists: {id: 'playlists'},
			albumArtists: {id: 'artists', mode: 'albumArtists'},
			artists: {id: 'artists', mode: 'artists'},
			albums: {id: 'albums'}
		});
	});

	test('anything else keeps opening the grid', () => {
		expect(musicScreenFor('songsGrid')).toBeNull();
		expect(musicScreenFor(undefined)).toBeNull();
	});
});

describe('the pill strip', () => {
	test('each screen marks its own pill, and the library home marks Overview', () => {
		expect(MUSIC_CATEGORIES.map((c) => tabForScreen(musicScreenFor(c.id)))).toEqual(MUSIC_CATEGORIES.map((c) => c.id));
		expect(tabForScreen(musicScreenFor('allArtists'))).toBe('albumArtists');
		expect(tabForScreen(musicScreenFor('favoriteAlbums'))).toBe('favoriteItems');
		expect(tabForScreen(null)).toBe(OVERVIEW_TAB);
	});

	test('a pill swaps in its screen, Overview goes home, and the current pill does nothing', () => {
		expect(stripTarget('songs', 'albums')).toEqual({id: 'songs'});
		expect(stripTarget('albumArtists', 'songs')).toEqual({id: 'artists', mode: 'albumArtists'});
		expect(stripTarget(OVERVIEW_TAB, 'genres')).toBe('home');
		expect(stripTarget('genres', 'genres')).toBeNull();
	});

	test('Classic gets its chips, Quick Access its rail, and Immersive or anything unknown the strip', () => {
		expect(['classic', 'quickAccess', 'immersive', undefined, 'someNewStyle'].map(musicNavFor))
			.toEqual(['chips', 'rail', 'strip', 'strip', 'strip']);
	});
});

describe('startingTab', () => {
	test('starts on the tab a See All asked for, or the first one with anything in it', () => {
		const counts = {songs: 0, albums: 4, artists: 2, playlists: 0};
		expect(startingTab(counts)).toBe('albums');
		expect(startingTab(counts, 'artists')).toBe('artists');
		expect(startingTab(counts, 'playlists')).toBe('albums');
		expect(startingTab({songs: 0, albums: 0, artists: 0, playlists: 0})).toBeNull();
	});
});
