import {FAVORITE_ROW_IDS, isExternalRowAvailable, isPluginSourcedRow, isRowEnabledBySetting} from './homeRowGates';

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
	...over
});

describe('isRowEnabledBySetting', () => {
	test('every favourite row answers to the one favourites setting', () => {
		FAVORITE_ROW_IDS.forEach((id) => {
			expect(isRowEnabledBySetting(id, settings())).toBe(true);
			expect(isRowEnabledBySetting(id, settings({displayFavoritesRows: false}))).toBe(false);
		});
	});

	test('collections, genres and playlists each answer to their own setting', () => {
		expect(isRowEnabledBySetting('collections', settings({displayCollectionsRows: false}))).toBe(false);
		expect(isRowEnabledBySetting('genres', settings({displayGenresRows: false}))).toBe(false);
		expect(isRowEnabledBySetting('playlists', settings({displayPlaylistsRows: false}))).toBe(false);
	});

	test('the external rows no longer answer to the old switches', () => {
		const off = settings({
			imdbTop250MoviesEnabled: false,
			imdbTop250TvShowsEnabled: false,
			imdbMostPopularMoviesEnabled: false,
			imdbMostPopularTvShowsEnabled: false,
			imdbLowestRatedMoviesEnabled: false,
			imdbTopEnglishMoviesEnabled: false,
			seasonalRowEnabled: false,
			mdblistWatchingNowEnabled: false
		});
		['imdb-top250-movies', 'imdb-top250-tv', 'imdb-popular-movies', 'imdb-popular-tv', 'imdb-lowest-rated',
			'imdb-top-english', 'seasonal', 'mdblist_watching_now'].forEach((rowId) => {
			expect(isRowEnabledBySetting(rowId, off)).toBe(true);
		});
	});

	test('a row with no setting of its own is always allowed through', () => {
		expect(isRowEnabledBySetting('resume', settings())).toBe(true);
		expect(isRowEnabledBySetting('latest-abc123', settings())).toBe(true);
		expect(isRowEnabledBySetting('seerr_trending', settings())).toBe(true);
	});
});

describe('isPluginSourcedRow', () => {
	test('matches the Seerr rows', () => {
		expect(isPluginSourcedRow('seerr_trending')).toBe(true);
	});

	test('leaves the external rows to isExternalRowAvailable', () => {
		['tmdb_popular_movies', 'radarr_calendar', 'seasonal', 'mdblist_watching_now', 'imdb-top250-movies'].forEach((rowId) => {
			expect(isPluginSourcedRow(rowId)).toBe(false);
		});
		expect(isPluginSourcedRow('collections')).toBe(false);
		expect(isPluginSourcedRow('resume')).toBe(false);
	});

	// The two groups have to stay disjoint, otherwise which one is asked first starts to
	// matter and the two callers would answer differently.
	test('no row answers to both a setting and the plugin', () => {
		const gated = [...FAVORITE_ROW_IDS, 'collections', 'genres', 'playlists'];

		expect(gated.filter(isPluginSourcedRow)).toEqual([]);
	});
});

describe('isExternalRowAvailable', () => {
	const ping = (over = {}) => ({tmdbAvailable: false, mdblistAvailable: false, calendarAvailable: false, ...over});
	const avail = (rowId, {useMoonfinPlugin = true, pluginInfo = ping(), serverType = 'jellyfin', ...keys} = {}) =>
		isExternalRowAvailable(rowId, {settings: {useMoonfinPlugin, ...keys}, pluginInfo, serverType});

	test('the IMDb rows need only the plugin', () => {
		expect(avail('imdb-top250-movies')).toBe(true);
		expect(avail('imdb-top250-movies', {pluginInfo: null})).toBe(false);
		expect(avail('imdb-top250-movies', {useMoonfinPlugin: false})).toBe(false);
	});

	test("the TMDB rows need a TMDB key, the admin's or the viewer's own", () => {
		expect(avail('tmdb_popular_movies')).toBe(false);
		expect(avail('tmdb_popular_movies', {pluginInfo: ping({tmdbAvailable: true})})).toBe(true);
		expect(avail('tmdb_popular_movies', {tmdbApiKey: 'abc'})).toBe(true);
		expect(avail('tmdb_popular_movies', {tmdbApiKey: '  '})).toBe(false);
		expect(avail('tmdb_popular_movies', {pluginInfo: null, tmdbApiKey: 'abc'})).toBe(false);
	});

	test("Watching Now needs an MDBList key, the admin's or the viewer's own", () => {
		expect(avail('mdblist_watching_now')).toBe(false);
		expect(avail('mdblist_watching_now', {pluginInfo: ping({mdblistAvailable: true})})).toBe(true);
		expect(avail('mdblist_watching_now', {mdblistApiKey: 'abc'})).toBe(true);
	});

	test('the seasonal row needs the plugin, except on Silo, which makes its own', () => {
		expect(avail('seasonal')).toBe(true);
		expect(avail('seasonal', {pluginInfo: null})).toBe(false);
		expect(avail('seasonal', {pluginInfo: null, serverType: 'silo'})).toBe(true);
	});

	test('the calendars need the plugin to offer them', () => {
		expect(avail('radarr_calendar')).toBe(false);
		expect(avail('sonarr_calendar', {pluginInfo: ping({calendarAvailable: true})})).toBe(true);
	});

	test("every other row isn't an external one", () => {
		expect(avail('resume')).toBeNull();
		expect(avail('seerr_trending')).toBeNull();
	});
});
