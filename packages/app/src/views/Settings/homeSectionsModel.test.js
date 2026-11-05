// $L reaches for ilib, which a plain unit test has no way to load. Every key is its own
// English source string, so handing the string straight back is faithful enough here.
jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

import {isPickedRowShown, makePickedRow} from '../../utils/pickedRows';
import {homeRowGroup, isHomeRowVisibleByGates, mergeFoundRows, pickedRowLabel} from './homeSectionsModel';

const settings = (over = {}) => ({
	displayFavoritesRows: true,
	displayCollectionsRows: true,
	displayGenresRows: true,
	displayPlaylistsRows: true,
	imdbTop250MoviesEnabled: true,
	imdbTop250TvShowsEnabled: true,
	imdbMostPopularMoviesEnabled: true,
	imdbMostPopularTvShowsEnabled: true,
	imdbLowestRatedMoviesEnabled: true,
	imdbTopEnglishMoviesEnabled: true,
	useMoonfinPlugin: true,
	...over
});

describe('isHomeRowVisibleByGates', () => {
	test('applies the settings that gate a whole group of rows', () => {
		expect(isHomeRowVisibleByGates({id: 'collections'}, settings({displayCollectionsRows: false}))).toBe(false);
		expect(isHomeRowVisibleByGates({id: 'favoriteMovies'}, settings({displayFavoritesRows: false}))).toBe(false);
		expect(isHomeRowVisibleByGates({id: 'imdb-top250-movies'}, settings({imdbTop250MoviesEnabled: false}))).toBe(false);
	});

	test('hides the plugin rows when the plugin is off', () => {
		const off = settings({useMoonfinPlugin: false});

		expect(isHomeRowVisibleByGates({id: 'seerr_trending'}, off)).toBe(false);
		expect(isHomeRowVisibleByGates({id: 'tmdb_popular'}, off)).toBe(false);
		expect(isHomeRowVisibleByGates({id: 'radarr_calendar'}, off)).toBe(false);
		expect(isHomeRowVisibleByGates({id: 'sonarr_calendar'}, off)).toBe(false);
	});

	test('shows the plugin rows when it is on', () => {
		expect(isHomeRowVisibleByGates({id: 'seerr_trending'}, settings())).toBe(true);
		expect(isHomeRowVisibleByGates({id: 'radarr_calendar'}, settings())).toBe(true);
	});

	test('leaves anything with no gate of its own alone', () => {
		expect(isHomeRowVisibleByGates({id: 'resume'}, settings())).toBe(true);
		expect(isHomeRowVisibleByGates({id: 'nextup'}, settings({useMoonfinPlugin: false}))).toBe(true);
	});
});

const pick = (source, itemId, name, serverUrl = 'http://server') => makePickedRow({source, serverUrl, itemId, name}, false, 0);

test('a picked row shows under its list switch and its server', () => {
	const collection = pick('collections', 'c1', 'C');
	expect(isHomeRowVisibleByGates(collection, settings(), true, 'http://server/')).toBe(true);
	expect(isHomeRowVisibleByGates(collection, settings({displayCollectionsRows: false}), true, 'http://server')).toBe(false);
	expect(isHomeRowVisibleByGates(pick('collections', 'c1', 'C', 'http://other'), settings(), true, 'http://server')).toBe(false);
});

describe('mergeFoundRows', () => {
	const arranged = (...picks) => [{id: 'resume', enabled: true, order: 0}, ...picks.map((row) => ({...row, enabled: true}))];

	test('a pick still found keeps its place and takes the name its server gives it now', () => {
		const rows = arranged(pick('collections', 'c1', 'Old name'));
		const merged = mergeFoundRows(rows, [pick('collections', 'c1', 'New name'), pick('collections', 'c2', 'Bond')]);

		expect(merged.rows.map((row) => [row.id, row.name, row.enabled])).toEqual([
			['resume', undefined, true],
			[rows[1].id, 'New name', true]
		]);
		expect(merged.added.map((row) => row.itemId)).toEqual(['c2']);
		expect(merged.changed).toBe(true);
	});

	test('a pick its list came back without is gone', () => {
		const merged = mergeFoundRows(arranged(pick('collections', 'gone', 'Gone')), [pick('collections', 'c1', 'C')]);

		expect(merged.rows.map((row) => row.id)).toEqual(['resume']);
		expect(merged.changed).toBe(true);
	});

	test('a pick whose list never came back stays, since that proves nothing', () => {
		const rows = arranged(pick('genres', 'g1', 'G'), pick('collections', 'o1', 'O', 'http://other'));
		const merged = mergeFoundRows(rows, [pick('collections', 'c1', 'C')]);

		expect(merged.rows).toEqual(rows);
		expect(merged.changed).toBe(false);
	});

	test('a pick saved under another spelling of the server is the same row', () => {
		const rows = arranged(pick('collections', 'c1', 'C', 'http://SERVER'));
		const merged = mergeFoundRows(rows, [pick('collections', 'c1', 'C')]);

		expect(merged.rows).toEqual(rows);
		expect(merged.added).toEqual([]);
	});
});

describe('pickedRowLabel', () => {
	test('names the list a row was picked from, and the server when it is another one', () => {
		const servers = [{url: 'http://other/', name: 'Basement'}];
		expect(pickedRowLabel(pick('collections', 'c1', 'C'), 'http://server', servers)).toBe('Collections row');
		expect(pickedRowLabel(pick('genres', 'g1', 'G'), 'http://server', servers)).toBe('Genres row');
		expect(pickedRowLabel(pick('playlists', 'p1', 'P'), 'http://server', servers)).toBe('Playlists row');
		expect(pickedRowLabel(pick('collections', 'c1', 'C', 'http://other'), 'http://server', servers)).toBe('Collections row from Basement');
	});
});

test('the Live TV rows are left out when the server has no Live TV', () => {
	expect(isHomeRowVisibleByGates({id: 'livetv'}, settings(), false)).toBe(false);
	expect(isHomeRowVisibleByGates({id: 'onnow'}, settings(), false)).toBe(false);
	expect(isHomeRowVisibleByGates({id: 'activerecordings'}, settings(), false)).toBe(false);
	expect(isHomeRowVisibleByGates({id: 'resume'}, settings(), false)).toBe(true);
	expect(isHomeRowVisibleByGates({id: 'livetv'}, settings())).toBe(true);
});

describe('homeRowGroup', () => {
	test('puts each row under the kind the editor groups it by', () => {
		expect(homeRowGroup({id: 'resume'})).toBe('general');
		expect(homeRowGroup({id: 'collections'})).toBe('collections');
		expect(homeRowGroup(pick('collections', 'abc', 'C'))).toBe('collections');
		expect(homeRowGroup({id: 'favoriteMovies'})).toBe('favorites');
		expect(homeRowGroup({id: 'studios'})).toBe('genres');
		expect(homeRowGroup(pick('genres', 'abc', 'G'))).toBe('genres');
		expect(homeRowGroup({id: 'playlists'})).toBe('playlists');
		expect(homeRowGroup(pick('playlists', 'abc', 'P'))).toBe('playlists');
		expect(homeRowGroup({id: 'seerr_trending'})).toBe('seerr');
		expect(homeRowGroup({id: 'seerr_shortcuts'})).toBe('seerr');
		expect(homeRowGroup({id: 'radarr_calendar'})).toBe('seerr');
		expect(homeRowGroup({id: 'tmdb_popular_tv'})).toBe('external');
		expect(homeRowGroup({id: 'imdb-top250-movies'})).toBe('external');
	});
});

describe('Silo home section rows', () => {
	const silo = (itemId, name = '') => makePickedRow({source: 'server', serverUrl: 'http://silo', itemId, name}, false, 0);

	test('a section Silo no longer has is dropped, a section-type row stays, and new sections come back off', () => {
		const rows = [silo('1', 'Old'), silo('2', 'Gone'), silo('type:seasonal_themed', 'Seasonal picks')];
		const merged = mergeFoundRows(rows, [silo('1', 'Renamed'), silo('5', 'Hidden gems')]);
		expect(merged.rows.map((row) => [row.itemId, row.name])).toEqual([['1', 'Renamed'], ['type:seasonal_themed', 'Seasonal picks']]);
		expect(merged.added.map((row) => row.itemId)).toEqual(['5']);
	});

	test('show only on Silo, on their own server or any server when Moonbase named none', () => {
		const ownServer = silo('1');
		const anyServer = makePickedRow({source: 'server', serverUrl: '', itemId: 'type:hidden_gems', name: ''}, true, 0);
		expect(isPickedRowShown(ownServer, settings(), 'http://silo/', 'silo')).toBe(true);
		expect(isPickedRowShown(anyServer, settings(), 'http://other', 'silo')).toBe(true);
		expect(isPickedRowShown(ownServer, settings(), 'http://other', 'silo')).toBe(false);
		expect(isPickedRowShown(anyServer, settings(), 'http://jf', 'jellyfin')).toBe(false);
	});
});
