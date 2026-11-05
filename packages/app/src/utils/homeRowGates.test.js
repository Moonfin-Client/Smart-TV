import {FAVORITE_ROW_IDS, isPluginSourcedRow, isRowEnabledBySetting} from './homeRowGates';

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

	test('each IMDb list answers to its own setting', () => {
		const pairs = [
			['imdb-top250-movies', 'imdbTop250MoviesEnabled'],
			['imdb-top250-tv', 'imdbTop250TvShowsEnabled'],
			['imdb-popular-movies', 'imdbMostPopularMoviesEnabled'],
			['imdb-popular-tv', 'imdbMostPopularTvShowsEnabled'],
			['imdb-lowest-rated', 'imdbLowestRatedMoviesEnabled'],
			['imdb-top-english', 'imdbTopEnglishMoviesEnabled']
		];
		pairs.forEach(([rowId, settingKey]) => {
			expect(isRowEnabledBySetting(rowId, settings())).toBe(true);
			expect(isRowEnabledBySetting(rowId, settings({[settingKey]: false}))).toBe(false);
		});
	});

	test('a row with no setting of its own is always allowed through', () => {
		expect(isRowEnabledBySetting('resume', settings())).toBe(true);
		expect(isRowEnabledBySetting('latest-abc123', settings())).toBe(true);
		expect(isRowEnabledBySetting('seerr_trending', settings())).toBe(true);
	});
});

describe('isPluginSourcedRow', () => {
	test('matches the rows whose contents come through the plugin', () => {
		expect(isPluginSourcedRow('seerr_trending')).toBe(true);
		expect(isPluginSourcedRow('tmdb_popular')).toBe(true);
		expect(isPluginSourcedRow('radarr_calendar')).toBe(true);
		expect(isPluginSourcedRow('sonarr_calendar')).toBe(true);
	});

	test('leaves the IMDb rows alone, which are named similarly but are not plugin rows', () => {
		expect(isPluginSourcedRow('imdb-top250-movies')).toBe(false);
		expect(isPluginSourcedRow('collections')).toBe(false);
		expect(isPluginSourcedRow('resume')).toBe(false);
	});

	// The two groups have to stay disjoint, otherwise which one is asked first starts to
	// matter and the two callers would answer differently.
	test('no row answers to both a setting and the plugin', () => {
		const gated = [...FAVORITE_ROW_IDS, 'collections', 'genres', 'playlists',
			'imdb-top250-movies', 'imdb-top250-tv', 'imdb-popular-movies',
			'imdb-popular-tv', 'imdb-lowest-rated', 'imdb-top-english'];

		expect(gated.filter(isPluginSourcedRow)).toEqual([]);
	});
});

describe('the seasonal row', () => {
	test('answers to its own toggle and is off until it is switched on', () => {
		expect(isRowEnabledBySetting('seasonal', settings())).toBe(false);
		expect(isRowEnabledBySetting('seasonal', settings({seasonalRowEnabled: true}))).toBe(true);
	});

	test('comes through the plugin too, so the editor hides it while the plugin is off', () => {
		expect(isPluginSourcedRow('seasonal')).toBe(true);
	});
});

describe('the watching now row', () => {
	test('answers to its own toggle and is off until it is switched on', () => {
		expect(isRowEnabledBySetting('mdblist_watching_now', settings())).toBe(false);
		expect(isRowEnabledBySetting('mdblist_watching_now', settings({mdblistWatchingNowEnabled: true}))).toBe(true);
	});

	test('comes through the plugin too, so the editor hides it while the plugin is off', () => {
		expect(isPluginSourcedRow('mdblist_watching_now')).toBe(true);
	});
});
