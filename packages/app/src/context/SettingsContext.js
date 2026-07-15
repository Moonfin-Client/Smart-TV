import {createContext, useContext, useState, useEffect, useCallback, useMemo, useRef} from 'react';
import {getFromStorage, saveToStorage} from '../services/storage';
import {getMoonfinSettings, getMoonfinThemes, saveMoonfinProfile, moonfinPing} from '../services/seerrApi';
import {parseThemeSpec} from '../theme/themeSpec';
import {getAvailableThemeList, getAvailableThemes, isBuiltInThemeId, registerStoreTheme, removeStoreTheme, replaceCustomThemes, resolveThemeById} from '../theme/themeRegistry';

const DEFAULT_HOME_ROWS = [
	{id: 'resume', name: 'Continue Watching', enabled: true, order: 0},
	{id: 'nextup', name: 'Next Up', enabled: true, order: 1},
	{id: 'latest-media', name: 'Recently Added Media', enabled: true, order: 2},
	{id: 'collections', name: 'Collections', enabled: false, order: 3},
	{id: 'library-tiles', name: 'My Media', enabled: false, order: 4},
	{id: 'favoriteMovies', name: 'Favorite Movies', enabled: false, order: 5},
	{id: 'favoriteSeries', name: 'Favorite Series', enabled: false, order: 6},
	{id: 'favoriteEpisodes', name: 'Favorite Episodes', enabled: false, order: 7},
	{id: 'favoritePeople', name: 'Favorite People', enabled: false, order: 8},
	{id: 'favoriteArtists', name: 'Favorite Artists', enabled: false, order: 9},
	{id: 'favoriteMusicVideos', name: 'Favorite Music Videos', enabled: false, order: 10},
	{id: 'favoriteAlbums', name: 'Favorite Albums', enabled: false, order: 11},
	{id: 'favoriteSongs', name: 'Favorite Songs', enabled: false, order: 12},
	{id: 'genres', name: 'Genres', enabled: false, order: 13},
	{id: 'recently-released', name: 'Recently Released', enabled: false, order: 14},
	{id: 'imdb-top250-movies', name: 'IMDb Top 250 Movies', enabled: false, order: 15},
	{id: 'imdb-top250-tv', name: 'IMDb Top 250 TV Shows', enabled: false, order: 16},
	{id: 'imdb-popular-movies', name: 'IMDb Most Popular Movies', enabled: false, order: 17},
	{id: 'imdb-popular-tv', name: 'IMDb Most Popular TV Shows', enabled: false, order: 18},
	{id: 'imdb-lowest-rated', name: 'IMDb Lowest Rated Movies', enabled: false, order: 19},
	{id: 'imdb-top-english', name: 'IMDb Top Rated English Movies', enabled: false, order: 20},
	{id: 'since-you-watched-1', name: 'Since You Watched Row 1', enabled: false, order: 21},
	{id: 'since-you-watched-2', name: 'Since You Watched Row 2', enabled: false, order: 22},
	{id: 'since-you-watched-3', name: 'Since You Watched Row 3', enabled: false, order: 23},
	{id: 'since-you-watched-4', name: 'Since You Watched Row 4', enabled: false, order: 24},
	{id: 'since-you-watched-5', name: 'Since You Watched Row 5', enabled: false, order: 25},
	{id: 'rewatch', name: 'Rewatch', enabled: false, order: 26},
	{id: 'playlists', name: 'Playlists', enabled: false, order: 27},
	{id: 'audioartists', name: 'Music Artists', enabled: false, order: 28},
	{id: 'audioalbums', name: 'Music Albums', enabled: false, order: 29},
	{id: 'audioplaylists', name: 'Music Playlists', enabled: false, order: 30},
	{id: 'resumeaudio', name: 'Continue Listening', enabled: false, order: 31},
	{id: 'activerecordings', name: 'Recordings', enabled: false, order: 32},
	{id: 'livetv', name: 'Live TV', enabled: false, order: 33},
	{id: 'seerr_recent_requests', name: 'My Requests', enabled: false, order: 34},
	{id: 'seerr_trending', name: 'Trending Now', enabled: false, order: 35},
	{id: 'seerr_popular_movies', name: 'Popular Movies', enabled: false, order: 36},
	{id: 'seerr_popular_series', name: 'Popular TV Shows', enabled: false, order: 37},
	{id: 'seerr_upcoming_movies', name: 'Upcoming Movies', enabled: false, order: 38},
	{id: 'seerr_upcoming_series', name: 'Upcoming TV Shows', enabled: false, order: 39},
	{id: 'seerr_movie_genres', name: 'Browse Movies by Genre', enabled: false, order: 40},
	{id: 'seerr_series_genres', name: 'Browse TV by Genre', enabled: false, order: 41},
	{id: 'seerr_studios', name: 'Browse by Studio', enabled: false, order: 42},
	{id: 'seerr_networks', name: 'Browse by Network', enabled: false, order: 43},
	{id: 'tmdb_popular_movies', name: 'TMDB Popular Movies', enabled: false, order: 44},
	{id: 'tmdb_top_rated_movies', name: 'TMDB Top Rated Movies', enabled: false, order: 45},
	{id: 'tmdb_now_playing_movies', name: 'TMDB Now Playing Movies', enabled: false, order: 46},
	{id: 'tmdb_upcoming_movies', name: 'TMDB Upcoming Movies', enabled: false, order: 47},
	{id: 'tmdb_popular_tv', name: 'TMDB Popular TV', enabled: false, order: 48},
	{id: 'tmdb_top_rated_tv', name: 'TMDB Top Rated TV', enabled: false, order: 49},
	{id: 'tmdb_airing_today_tv', name: 'TMDB Airing Today TV', enabled: false, order: 50},
	{id: 'tmdb_on_the_air_tv', name: 'TMDB On The Air TV', enabled: false, order: 51},
	{id: 'tmdb_trending_movie_daily', name: 'TMDB Trending Movies (Daily)', enabled: false, order: 52},
	{id: 'tmdb_trending_movie_weekly', name: 'TMDB Trending Movies (Weekly)', enabled: false, order: 53},
	{id: 'tmdb_trending_tv_daily', name: 'TMDB Trending TV (Daily)', enabled: false, order: 54},
	{id: 'tmdb_trending_tv_weekly', name: 'TMDB Trending TV (Weekly)', enabled: false, order: 55},
	{id: 'tmdb_trending_all_weekly', name: 'TMDB Trending All (Weekly)', enabled: false, order: 56},
	{id: 'radarr_calendar', name: 'Radarr Upcoming', enabled: false, order: 57},
	{id: 'sonarr_calendar', name: 'Sonarr Upcoming', enabled: false, order: 58}
];

const defaultSettings = {
	preferTranscode: false,
	forceDirectPlay: false,
	experimentalTruehd: false,
	maxBitrate: 0,
	audioLanguage: '',
	subtitleLanguage: '',
	uiLanguage: 'en-US',
	subtitleMode: 'default',
	subtitleSize: 'medium',
	subtitlePosition: 'bottom',
	subtitleOpacity: 100,
	subtitleBackground: 0,
	subtitleBackgroundColor: '#000000',
	subtitleColor: '#ffffff',
	subtitleShadowColor: '#000000',
	subtitleShadowOpacity: 100,
	subtitleShadowBlur: 0.1,
	subtitlePositionAbsolute: 90,
	seekStep: 10,
	autoPlay: true,
	theme: 'dark',
	visualTheme: 'moonfin',
	customThemeId: '',
	homeRows: DEFAULT_HOME_ROWS,
	pluginSections: [],
	displayFavoritesRows: false,
	displayCollectionsRows: false,
	displayGenresRows: false,
	displayPlaylistsRows: false,
	customHomeRows: [],
	mergeRadarrSonarrCalendars: false,
	radarrCalendarShowCinema: true,
	radarrCalendarShowDigital: true,
	radarrCalendarShowPhysical: true,
	radarrCalendarShowDate: true,
	sonarrCalendarShowDate: true,
	sonarrCalendarShowEpisodeInfo: true,
	favoritesRowSortBy: 'SortName',
	collectionsRowSortBy: 'SortName',
	genresRowSortBy: 'SortName',
	genresRowItemFilter: 'all',
	playlistsRowSortBy: 'SortName',
	audioRowsSortBy: 'SortName',
	fullScreenRows: false,
	showShuffleButton: true,
	shuffleContentType: 'both',
	showGenresButton: true,
	showFavoritesButton: true,
	showLibrariesInToolbar: true,
	mergeContinueWatchingNextUp: false,
	hiddenContinueWatchingItems: null,
	hiddenNextUpSeries: null,
	showHomeBackdrop: true,
	backdropBlurHome: 20,
	backdropBlurDetail: 20,
	serverLogging: false,
	featuredContentType: 'both',
	featuredItemCount: 10,
	featuredBarStyle: 'moonfin',
	featuredTrailerPreview: true,
	featuredTrailerMuted: false,
	mediaBarSourceType: 'library',
	mediaBarLibraryIds: [],
	mediaBarCollectionIds: [],
	unifiedLibraryMode: false,
	useMoonfinPlugin: false,
	mdblistEnabled: true,
	mdblistRatingSources: ['stars', 'imdb', 'tmdb', 'tomatoes', 'metacritic'],
	tmdbEpisodeRatingsEnabled: true,
	imdbTop250MoviesEnabled: false,
	imdbTop250TvShowsEnabled: false,
	imdbMostPopularMoviesEnabled: false,
	imdbMostPopularTvShowsEnabled: false,
	imdbLowestRatedMoviesEnabled: false,
	imdbTopEnglishMoviesEnabled: false,
	sinceYouWatchedSource: 'local',
	sinceYouWatchedSourceItem: 'recentlyWatched',
	sinceYouWatchedSourceType: 'movies',
	sinceYouWatchedIncludeWatched: false,
	// Pulled from the server plugin, never pushed back. Empty until synced.
	tmdbApiKey: '',
	rewatchIncludeMovies: true,
	rewatchIncludeShows: true,
	rewatchIncludeCollections: true,
	rewatchSortBy: 'recentlyWatched',
	showClock: true,
	clockDisplay: '24-hour',
	autoLogin: true,
	alwaysAuthenticate: false,
	pinCodeProtection: false,
	pinCode: '0000',
	serverSortBy: 'name',
	exitConfirmation: true,
	updateNotificationsEnabled: true,
	navbarPosition: 'top',
	screensaverEnabled: true,
	screensaverTimeout: 90,
	screensaverDimmingLevel: 50,
	screensaverShowClock: true,
	screensaverMode: 'library',
	watchedIndicatorBehavior: 'always',
	cardFocusZoom: false,
	useSeriesThumbnails: true,
	homeRowsPosterSize: 'default',
	homeRowsImageType: 'poster',
	homeRowsStyle: 'v2',
	detailScreenStyle: 'v2',
	detailExpandedTabs: true,
	homeRowOverlay: 'off',
	folderViewMode: 'local',
	excludedGenres: [],
	autoAdvance: true,
	autoAdvanceInterval: 8,
	nextUpBehavior: 'extended',
	nextUpCountdownStyle: 'both',
	nextUpTimeout: 7,
	stillWatchingPrompt: true,
	skipForwardLength: 30,
	unpauseRewind: 0,
	showDescriptionOnPause: false,
	introAction: 'ask',
	outroAction: 'ask',
	seasonalTheme: 'none',
	themeMusicEnabled: false,
	themeMusicVolume: 30,
	themeMusicOnHomeRows: false,
	showRatingLabels: true,
	showRatingBadges: true,
	screensaverAgeFilter: false,
	screensaverMaxRating: 13,
	uiScale: 1.0,
	enablePgsRendering: true,
	syncplayEnabled: true,
	syncplayAutoOpen: false,
	showSyncPlayButton: true,
	videoStartDelay: 0,
	liveTvDirect: false,
	stereoUpmixEnabled: false,
	passthroughEnabled: true,
	ac3Passthrough: true,
	eac3Passthrough: true,
	truehdPassthrough: true,
	blockedRatings: [],
	showSeerrButton: true,
	performanceMode: 'auto',
	focusBorderColor: '',
	navbarOpacity: 100,
	navbarColor: '',
	// webOS TLS proxy fallback: when the WebView rejects a server's certificate
	// (net::ERR_INSECURE_RESPONSE), allow the bundled Node service to fetch with
	// certificate validation disabled. Off by default; local-only (not synced).
	allowInsecureCerts: false
};

export {DEFAULT_HOME_ROWS};

const SERVER_TO_LOCAL = {
	mediaBarMode: 'featuredBarStyle',
	mediaBarItemCount: 'featuredItemCount',
	mediaBarTrailerPreview: 'featuredTrailerPreview',
	mediaBarAutoAdvance: 'autoAdvance',
	mediaBarIntervalMs: 'autoAdvanceInterval',
	mediaBarSourceType: 'featuredContentType',
	mediaBarTrailerAudio: 'featuredTrailerMuted',
	mediaBarExcludedGenres: 'excludedGenres',
	enableMultiServerLibraries: 'unifiedLibraryMode',
	seasonalSurprise: 'seasonalTheme',
	detailsScreenBlur: 'backdropBlurDetail',
	detailsBackdropBlur: 'backdropBlurDetail',
	browsingBlur: 'backdropBlurHome',
	use24HourClock: 'clockDisplay',
	homeRowOrder: 'homeRows',
	theme: 'visualTheme',
	focusColor: 'focusBorderColor',
	watchedIndicator: 'watchedIndicatorBehavior',
	posterSize: 'homeRowsPosterSize',
	homeImageUseSeriesImage: 'useSeriesThumbnails'
};
const LOCAL_TO_SERVER = Object.fromEntries(
	Object.entries(SERVER_TO_LOCAL).map(([s, l]) => [l, s])
);

const TV_TO_SERVER_ROW = {
	'latest-media': 'latestmedia',
	'recently-released': 'recentlyreleased',
	'library-tiles': 'smalllibrarytiles',
	'favoriteMovies': 'favoritemovies',
	'favoriteSeries': 'favoriteseries',
	'favoriteEpisodes': 'favoriteepisodes',
	'favoritePeople': 'favoritepeople',
	'favoriteArtists': 'favoriteartists',
	'favoriteMusicVideos': 'favoritemusicvideos',
	'favoriteAlbums': 'favoritealbums',
	'favoriteSongs': 'favoritesongs',
	'genres': 'genres',
	'imdb-top250-movies': 'imdb_top_250_movies',
	'imdb-top250-tv': 'imdb_top_250_tv_shows',
	'imdb-popular-movies': 'imdb_most_popular_movies',
	'imdb-popular-tv': 'imdb_most_popular_tv_shows',
	'imdb-lowest-rated': 'imdb_lowest_rated_movies',
	'imdb-top-english': 'imdb_top_english_movies'
};
const SERVER_TO_TV_ROW = {
	'latestmedia': 'latest-media',
	'recentlyreleased': 'recently-released',
	'smalllibrarytiles': 'library-tiles',
	'favoritemovies': 'favoriteMovies',
	'favoriteseries': 'favoriteSeries',
	'favoriteepisodes': 'favoriteEpisodes',
	'favoritepeople': 'favoritePeople',
	'favoriteartists': 'favoriteArtists',
	'favoriteMusicVideos': 'favoriteMusicVideos',
	'favoritemusicvideos': 'favoriteMusicVideos',
	'favoritealbums': 'favoriteAlbums',
	'favoritesongs': 'favoriteSongs',
	'genres': 'genres',
	'imdb_top_250_movies': 'imdb-top250-movies',
	'imdb_top_250_tv_shows': 'imdb-top250-tv',
	'imdb_most_popular_movies': 'imdb-popular-movies',
	'imdb_most_popular_tv_shows': 'imdb-popular-tv',
	'imdb_lowest_rated_movies': 'imdb-lowest-rated',
	'imdb_top_english_movies': 'imdb-top-english'
};

export {TV_TO_SERVER_ROW};

const mergeHomeRows = (rows) => {
	if (!Array.isArray(rows)) return [...DEFAULT_HOME_ROWS];
	const merged = [...rows];
	let added = false;
	for (const def of DEFAULT_HOME_ROWS) {
		if (!merged.find((row) => row.id === def.id)) {
			merged.push({...def, enabled: false, order: merged.length});
			added = true;
		}
	}
	if (!added) return rows;
	return merged;
};

const normalizeHomeRowsStyle = (value) => {
	if (value === 'classic') return 'v1';
	if (value === 'modern') return 'v2';
	return value === 'v1' || value === 'v2' ? value : 'v2';
};

const normalizeDetailScreenStyle = (value) => {
	if (value === 'classic') return 'v1';
	if (value === 'modern') return 'v2';
	return value === 'v1' || value === 'v2' ? value : 'v2';
};

const normalizeGuid = (id) => {
	if (!id || typeof id !== 'string') return id;
	const raw = id.replace(/-/g, '');
	if (raw.length !== 32) return id;
	return `${raw.slice(0,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${raw.slice(16,20)}-${raw.slice(20)}`;
};
const normalizeGuidArray = (arr) => Array.isArray(arr) ? arr.map(normalizeGuid) : arr;

const VALUE_CONVERSIONS = {
	clockDisplay: {
		toServer: v => v === '24-hour',
		fromServer: v => v ? '24-hour' : '12-hour'
	},
	featuredTrailerMuted: {
		toServer: v => !v,
		fromServer: v => !v
	},
	mediaBarLibraryIds: {
		fromServer: normalizeGuidArray
	},
	mediaBarCollectionIds: {
		fromServer: normalizeGuidArray
	},
	homeRows: {
		toServer: rows => {
			if (!Array.isArray(rows)) return undefined;
			return [...rows]
				.sort((a, b) => a.order - b.order)
				.filter(r => r.enabled)
				.map(r => TV_TO_SERVER_ROW[r.id] || r.id);
		},
		fromServer: serverIds => {
			if (!Array.isArray(serverIds) || serverIds.length === 0) return undefined;
			const rows = [];
			serverIds.forEach((sid, i) => {
				const tvId = SERVER_TO_TV_ROW[sid] || sid;
				const def = DEFAULT_HOME_ROWS.find(r => r.id === tvId);
				if (def) rows.push({...def, enabled: true, order: i});
			});
			DEFAULT_HOME_ROWS.forEach(def => {
				if (!rows.find(r => r.id === def.id)) {
					rows.push({...def, enabled: false, order: rows.length});
				}
			});
			return rows;
		}
	}
};

const SYNCABLE_KEYS = [
	'showShuffleButton', 'shuffleContentType', 'showGenresButton',
	'showFavoritesButton', 'showLibrariesInToolbar', 'mergeContinueWatchingNextUp',
	'hiddenContinueWatchingItems', 'hiddenNextUpSeries',
	'mdblistEnabled', 'mdblistRatingSources', 'tmdbEpisodeRatingsEnabled',
	'imdbTop250MoviesEnabled', 'imdbTop250TvShowsEnabled', 'imdbMostPopularMoviesEnabled',
	'imdbMostPopularTvShowsEnabled', 'imdbLowestRatedMoviesEnabled', 'imdbTopEnglishMoviesEnabled',
	'sinceYouWatchedSource', 'sinceYouWatchedSourceItem', 'sinceYouWatchedSourceType', 'sinceYouWatchedIncludeWatched',
	'rewatchIncludeMovies', 'rewatchIncludeShows', 'rewatchIncludeCollections', 'rewatchSortBy',
	'navbarPosition', 'featuredBarStyle', 'featuredContentType', 'featuredItemCount',
	'featuredTrailerPreview', 'featuredTrailerMuted', 'unifiedLibraryMode', 'seasonalTheme',
	'visualTheme', 'customThemeId',
	'showRatingLabels',
	'showRatingBadges',
	'themeMusicEnabled', 'themeMusicVolume', 'themeMusicOnHomeRows',
	'homeRowsImageType', 'showClock', 'clockDisplay',
	'homeRowOverlay', 'folderViewMode',
	'excludedGenres',
	'autoAdvance', 'autoAdvanceInterval',
	'displayFavoritesRows', 'displayCollectionsRows', 'displayGenresRows', 'displayPlaylistsRows',
	'favoritesRowSortBy', 'collectionsRowSortBy', 'genresRowSortBy', 'genresRowItemFilter',
	'stillWatchingPrompt', 'watchedIndicatorBehavior',
	'backdropBlurHome', 'backdropBlurDetail',
	'mediaBarSourceType', 'mediaBarLibraryIds', 'mediaBarCollectionIds',
	'homeRows', 'homeRowsStyle', 'detailScreenStyle', 'detailExpandedTabs', 'fullScreenRows', 'homeRowsPosterSize', 'useSeriesThumbnails',
	'useDetailedSubHeadings',
	'syncplayEnabled', 'syncplayAutoOpen',
	'showSyncPlayButton',
	'videoStartDelay', 'liveTvDirect',
	'uiLanguage',
	'blockedRatings',
	'customHomeRows',
	'mergeRadarrSonarrCalendars',
	'radarrCalendarShowCinema', 'radarrCalendarShowDigital', 'radarrCalendarShowPhysical',
	'radarrCalendarShowDate', 'sonarrCalendarShowDate', 'sonarrCalendarShowEpisodeInfo',
	'showSeerrButton',
	'focusBorderColor',
	'navbarOpacity',
	'navbarColor',
];

const profileToLocal = (serverProfile) => {
	if (!serverProfile) return {};
	const local = {};
	for (const [key, value] of Object.entries(serverProfile)) {
		if (value === null || value === undefined) continue;
		const localKey = SERVER_TO_LOCAL[key] || key;
		if (SYNCABLE_KEYS.includes(localKey)) {
			const conv = VALUE_CONVERSIONS[localKey];
			local[localKey] = conv?.fromServer ? conv.fromServer(value) : value;
		}
	}
	// The TMDB key is read only. We pull it so online rows can call TMDB, but it
	// stays out of SYNCABLE_KEYS so the client never pushes it back.
	if (serverProfile.tmdbApiKey !== undefined && serverProfile.tmdbApiKey !== null) {
		local.tmdbApiKey = serverProfile.tmdbApiKey;
	}
	return local;
};

const localToProfile = (localSettings) => {
	const profile = {};
	for (const key of SYNCABLE_KEYS) {
		const value = localSettings[key];
		if (value === undefined || value === null) continue;
		const serverKey = LOCAL_TO_SERVER[key] || key;
		const conv = VALUE_CONVERSIONS[key];
		profile[serverKey] = conv?.toServer ? conv.toServer(value) : value;
	}
	return profile;
};

const resolveFromEnvelope = (envelope, adminDefaults) => {
	const globalProfile = profileToLocal(envelope?.global);
	const tvProfile = profileToLocal(envelope?.tv);
	const adminProfile = profileToLocal(adminDefaults);

	const resolved = {};
	for (const key of SYNCABLE_KEYS) {
		if (tvProfile[key] !== undefined) {
			resolved[key] = tvProfile[key];
		} else if (globalProfile[key] !== undefined) {
			resolved[key] = globalProfile[key];
		} else if (adminProfile[key] !== undefined) {
			resolved[key] = adminProfile[key];
		}
	}
	const tmdbKey = tvProfile.tmdbApiKey ?? globalProfile.tmdbApiKey ?? adminProfile.tmdbApiKey;
	if (tmdbKey !== undefined) resolved.tmdbApiKey = tmdbKey;
	return resolved;
};

const pushTvProfile = (updated, credsRef) => {
	if (!credsRef.current) return;
	const {serverUrl, token} = credsRef.current;
	saveMoonfinProfile('tv', localToProfile(updated), serverUrl, token).catch(e =>
		console.warn('[Settings] Failed to push TV profile:', e.message)
	);
};

const extractThemeObjects = (payload) => {
	if (Array.isArray(payload)) return payload;
	if (payload && typeof payload === 'object') {
		if (Array.isArray(payload.themes)) return payload.themes;
		if (Array.isArray(payload.items)) return payload.items;
		const values = Object.values(payload).filter((entry) => entry && typeof entry === 'object');
		if (values.length > 0) return values;
	}
	return [];
};

const SettingsContext = createContext(null);
const EXPERIMENTAL_TRUEHD_KEY = 'moonfin.experimentalTruehd';
// App boots before the async settings store loads, and on webOS that store is
// DB8 which the reload after a language change beats. Mirror the language into
// localStorage synchronously so the next boot reads the chosen one.
const BOOT_LOCALE_KEY = 'moonfin_uiLanguage';
const persistBootLocale = (locale) => {
	try {
		if (locale) window.localStorage?.setItem(BOOT_LOCALE_KEY, locale);
	} catch (e) {
		void e;
	}
};

export function SettingsProvider({children}) {
	const [settings, setSettings] = useState(defaultSettings);
	const [loaded, setLoaded] = useState(false);
	const [themeCatalogVersion, setThemeCatalogVersion] = useState(0);
	const serverCredsRef = useRef(null);

	useEffect(() => {
		getFromStorage('settings').then((stored) => {
			if (stored) {
				let migrated = false;
				const hasExplicitHomeRowsStyle = Object.prototype.hasOwnProperty.call(stored, 'homeRowsStyle');
				const mergedHomeRows = mergeHomeRows(stored.homeRows);
				if (mergedHomeRows !== stored.homeRows) {
					stored.homeRows = mergedHomeRows;
					migrated = true;
				}
				if (!hasExplicitHomeRowsStyle) {
					stored.homeRowsStyle = 'v2';
					migrated = true;
				} else {
					const normalizedStyle = normalizeHomeRowsStyle(stored.homeRowsStyle);
					if (normalizedStyle !== stored.homeRowsStyle) {
						stored.homeRowsStyle = normalizedStyle;
						migrated = true;
					}
				}
				if (stored.detailScreenStyle !== undefined) {
					const normalizedDetailStyle = normalizeDetailScreenStyle(stored.detailScreenStyle);
					if (normalizedDetailStyle !== stored.detailScreenStyle) {
						stored.detailScreenStyle = normalizedDetailStyle;
						migrated = true;
					}
				}
				if (!Array.isArray(stored.pluginSections)) {
					stored.pluginSections = [];
					migrated = true;
				}
				if (!Array.isArray(stored.customHomeRows)) {
					stored.customHomeRows = [];
					migrated = true;
				}
				if (!stored.visualTheme) {
					stored.visualTheme = 'moonfin';
					migrated = true;
				}
				if (typeof stored.customThemeId !== 'string') {
					stored.customThemeId = '';
					migrated = true;
				}
				if ('skipIntro' in stored) {
					stored.introAction = stored.skipIntro === true ? 'auto' : 'ask';
					delete stored.skipIntro;
					migrated = true;
				}
				if ('skipCredits' in stored) {
					stored.outroAction = stored.skipCredits === true ? 'auto' : 'ask';
					delete stored.skipCredits;
					migrated = true;
				}
				if (Array.isArray(stored.mdblistRatingSources) && !stored.mdblistRatingSources.includes('stars')) {
					// Community rating was always shown before it became toggleable, so
					// preserve that for existing users by enabling 'stars' once.
					stored.mdblistRatingSources = ['stars', ...stored.mdblistRatingSources];
					migrated = true;
				}
				if (Array.isArray(stored.mdblistRatingSources) && stored.mdblistRatingSources.includes('popcorn')) {
					// RT audience rating now uses the shared `tomatoes_audience` key
					// (was the MDBList-native `popcorn`); migrate existing selections
					// so they keep matching and sync consistently with the server.
					stored.mdblistRatingSources = stored.mdblistRatingSources.map(
						(s) => (s === 'popcorn' ? 'tomatoes_audience' : s)
					);
					migrated = true;
				}
				const merged = {...defaultSettings, ...stored};
				setSettings(merged);
				if (migrated) saveToStorage('settings', merged);
				// seed the boot key for anyone whose language only lived in the
				// async store, so the next boot picks it up
				persistBootLocale(merged.uiLanguage);
			}
			setLoaded(true);
		});
	}, []);

	// Restore Theme Store themes saved on this device. Kept in a separate
	// registry bucket so server theme sync never clears them.
	useEffect(() => {
		getFromStorage('storeThemes').then((stored) => {
			if (!stored || typeof stored !== 'object') return;
			let registered = false;
			for (const raw of Object.values(stored)) {
				try {
					registerStoreTheme(parseThemeSpec(raw));
					registered = true;
				} catch (e) { void e; /* skip malformed */ }
			}
			if (registered) setThemeCatalogVersion((value) => value + 1);
		});
	}, []);

	useEffect(() => {
		if (!loaded) return;

		try {
			if (settings.experimentalTruehd) {
				window.localStorage?.setItem(EXPERIMENTAL_TRUEHD_KEY, 'true');
			} else {
				window.localStorage?.removeItem(EXPERIMENTAL_TRUEHD_KEY);
			}
		} catch (e) {
			void e;
		}
	}, [loaded, settings.experimentalTruehd]);

	const availableThemes = useMemo(() => getAvailableThemeList(), [themeCatalogVersion]); // eslint-disable-line react-hooks/exhaustive-deps
	const activeThemeId = useMemo(() => {
		const customId = settings.customThemeId;
		if (customId && getAvailableThemes()[customId]) {
			return customId;
		}
		return isBuiltInThemeId(settings.visualTheme) ? settings.visualTheme : 'moonfin';
	}, [settings.customThemeId, settings.visualTheme, themeCatalogVersion]); // eslint-disable-line react-hooks/exhaustive-deps
	const activeTheme = useMemo(() => resolveThemeById(activeThemeId), [activeThemeId, themeCatalogVersion]); // eslint-disable-line react-hooks/exhaustive-deps

	const updateSetting = useCallback((key, value) => {
		if (key === 'uiLanguage') persistBootLocale(value);
		setSettings(prev => {
			const updated = {...prev, [key]: value};
			saveToStorage('settings', updated);
			if (SYNCABLE_KEYS.includes(key)) pushTvProfile(updated, serverCredsRef);
			return updated;
		});
	}, []);

	const updateSettings = useCallback((newSettings) => {
		if ('uiLanguage' in newSettings) persistBootLocale(newSettings.uiLanguage);
		setSettings(prev => {
			const updated = {...prev, ...newSettings};
			saveToStorage('settings', updated);
			if (Object.keys(newSettings).some(k => SYNCABLE_KEYS.includes(k))) {
				pushTvProfile(updated, serverCredsRef);
			}
			return updated;
		});
	}, []);

	const selectThemeById = useCallback((themeId) => {
		setSettings((prev) => {
			if (!getAvailableThemes()[themeId]) return prev;
			const updated = isBuiltInThemeId(themeId)
				? {...prev, visualTheme: themeId, customThemeId: ''}
				: {...prev, visualTheme: prev.visualTheme || 'moonfin', customThemeId: themeId};
			saveToStorage('settings', updated);
			pushTvProfile(updated, serverCredsRef);
			return updated;
		});
	}, []);

	const resetSettings = useCallback(() => {
		setSettings(defaultSettings);
		saveToStorage('settings', defaultSettings);
	}, []);

	// Validate + register + persist a theme saved from the Theme Store. Stores
	// the raw theme JSON so it round-trips through parseThemeSpec on reload.
	const saveStoreTheme = useCallback(async (rawTheme) => {
		const spec = parseThemeSpec(rawTheme); // throws on invalid
		registerStoreTheme(spec);
		setThemeCatalogVersion((value) => value + 1);
		const existing = (await getFromStorage('storeThemes')) || {};
		existing[spec.id] = rawTheme;
		await saveToStorage('storeThemes', existing);
		return spec;
	}, []);

	const deleteStoreTheme = useCallback(async (id) => {
		removeStoreTheme(id);
		setThemeCatalogVersion((value) => value + 1);
		const existing = (await getFromStorage('storeThemes')) || {};
		delete existing[id];
		await saveToStorage('storeThemes', existing);
		setSettings((prev) => {
			if (prev.customThemeId !== id) return prev;
			const updated = {...prev, customThemeId: ''};
			saveToStorage('settings', updated);
			return updated;
		});
	}, []);

	const syncFromServer = useCallback(async (serverUrl, token) => {
		try {
			serverCredsRef.current = {serverUrl, token};

			let adminDefaults = null;
			try {
				const ping = await moonfinPing(serverUrl, token);
				if (ping?.defaultSettings) adminDefaults = ping.defaultSettings;
			} catch (e) { /* non-critical */ }

			let themesPayload = null;
			try {
				themesPayload = await getMoonfinThemes(serverUrl, token);
			} catch (e) {
				console.warn('[Settings] Theme sync failed:', e.message);
			}

			const specs = [];
			for (const entry of extractThemeObjects(themesPayload)) {
				if (!entry || typeof entry !== 'object') continue;
				try {
					specs.push(parseThemeSpec(entry));
				} catch (e) {
					console.warn('[Settings] Ignoring malformed theme entry:', e.message);
				}
			}
			replaceCustomThemes(specs);
			setThemeCatalogVersion((value) => value + 1);

			const serverData = await getMoonfinSettings(serverUrl, token);
			if (!serverData) {
				setSettings((prev) => {
					if (!prev.customThemeId || getAvailableThemes()[prev.customThemeId]) {
						return prev;
					}
					const updated = {...prev, customThemeId: ''};
					saveToStorage('settings', updated);
					return updated;
				});
				return;
			}

			const resolved = resolveFromEnvelope(serverData, adminDefaults);

			const hasServerValues = resolved.tmdbApiKey !== undefined || SYNCABLE_KEYS.some(key => resolved[key] !== undefined);
			if (!hasServerValues) return;

			setSettings(prev => {
				const updated = {...prev};
				for (const key of SYNCABLE_KEYS) {
					if (resolved[key] !== undefined) updated[key] = resolved[key];
				}
				if (resolved.tmdbApiKey !== undefined) updated.tmdbApiKey = resolved.tmdbApiKey;
				updated.homeRowsStyle = normalizeHomeRowsStyle(updated.homeRowsStyle);
				updated.detailScreenStyle = normalizeDetailScreenStyle(updated.detailScreenStyle);
				if (updated.customThemeId && !getAvailableThemes()[updated.customThemeId]) {
					updated.customThemeId = '';
				}
				if (!isBuiltInThemeId(updated.visualTheme)) {
					updated.visualTheme = 'moonfin';
				}
				saveToStorage('settings', updated);
				return updated;
			});

		} catch (e) {
			console.warn('[Settings] Server sync failed:', e.message);
		}
	}, []);

	return (
		<SettingsContext.Provider value={{
			settings,
			loaded,
			availableThemes,
			activeThemeId,
			activeTheme,
			updateSetting,
			updateSettings,
			selectThemeById,
			resetSettings,
			syncFromServer,
			saveStoreTheme,
			deleteStoreTheme
		}}>
			{children}
		</SettingsContext.Provider>
	);
}

export function useSettings() {
	const context = useContext(SettingsContext);
	if (!context) {
		throw new Error('useSettings must be used within SettingsProvider');
	}
	return context;
}
