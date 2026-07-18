import {createContext, useContext, useState, useEffect, useCallback, useMemo, useRef} from 'react';
import {getFromStorage, saveToStorage} from '../services/storage';
import {getMoonfinSettings, getMoonfinThemes, saveMoonfinProfile, moonfinPing} from '../services/seerrApi';
import {parseThemeSpec} from '../theme/themeSpec';
import {getAvailableThemeList, getAvailableThemes, isBuiltInThemeId, registerStoreTheme, removeStoreTheme, replaceCustomThemes, resolveThemeById} from '../theme/themeRegistry';
import {
	DEFAULT_HOME_ROWS,
	SERVER_TO_TV_ROW,
	TV_TO_SERVER_ROW,
	hasSeenServerLayout,
	homeRowsFromProfile,
	homeRowsToRowOrder,
	homeRowsToSections,
	mergeHomeRows
} from '../utils/homeLayout';

export {DEFAULT_HOME_ROWS, TV_TO_SERVER_ROW, SERVER_TO_TV_ROW};

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
	// Which rows the music library shows, and how they sort.
	displayAudioLatest: true,
	displayAudioLastPlayed: true,
	displayAudioFavorites: true,
	displayAudioPlaylists: true,
	displayAudioAlbumArtists: true,
	displayAudioArtists: true,
	displayAudioAlbums: true,
	audioSortOption: 'name',
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
	useDetailedSubHeadings: true,
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
	focusColor: 'focusBorderColor',
	watchedIndicator: 'watchedIndicatorBehavior',
	posterSize: 'homeRowsPosterSize',
	homeImageUseSeriesImage: 'useSeriesThumbnails',
	mdblistShowRatingNames: 'showRatingLabels',
	mdblistShowRatingBadges: 'showRatingBadges',
	languageOverride: 'uiLanguage',
	liveTvDirectPlayEnabled: 'liveTvDirect',
	syncPlayEnabled: 'syncplayEnabled',
	syncPlayAutoOpen: 'syncplayAutoOpen',
	clockBehavior: 'showClock',
	stillWatchingBehavior: 'stillWatchingPrompt',
	enableFolderView: 'folderViewMode',
	homeRowInfoOverlay: 'homeRowOverlay'
};
const LOCAL_TO_SERVER = Object.fromEntries(
	Object.entries(SERVER_TO_LOCAL).map(([s, l]) => [l, s])
);

// Synced values are all JSON, so comparing structure is enough to tell a genuinely new
// value from a fresh copy of the one we already have.
const sameSyncedValue = (left, right) => {
	if (left === right) return true;
	if (typeof left !== typeof right) return false;
	if (left === null || right === null) return false;
	if (typeof left !== 'object') return false;
	return JSON.stringify(left) === JSON.stringify(right);
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
	// The clock is a toggle here and a three way choice on the other clients. Anything that
	// isn't "never" shows a clock, so the toggle reads as on.
	showClock: {
		toServer: v => v ? 'always' : 'never',
		fromServer: v => v !== 'never'
	},
	// A toggle here, a duration elsewhere. Turning it off is exact. Turning it on can't say
	// how long, so it picks the middle option rather than overwriting a chosen duration with
	// something arbitrary.
	stillWatchingPrompt: {
		toServer: v => v ? 'medium' : 'disabled',
		fromServer: v => v !== 'disabled'
	},
	// Three states here against a boolean elsewhere. "Per Library" has no equivalent, so it
	// declines to push and leaves whatever the server holds.
	folderViewMode: {
		toServer: v => (v === 'local' ? undefined : v === 'on'),
		fromServer: v => (v ? 'on' : 'off')
	},
	homeRowOverlay: {
		toServer: v => v === 'on',
		fromServer: v => (v ? 'on' : 'off')
	}
	// homeRows is missing on purpose. The home layout is two server fields that have to
	// move together, so it gets resolved whole rather than a key at a time.
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
		if (key === 'homeRows') continue;
		const value = localSettings[key];
		if (value === undefined || value === null) continue;
		const serverKey = LOCAL_TO_SERVER[key] || key;
		const conv = VALUE_CONVERSIONS[key];
		const converted = conv?.toServer ? conv.toServer(value) : value;
		// A converter returns undefined when this client can't express the value. Leave the
		// stored one alone rather than overwriting it with a guess.
		if (converted === undefined) continue;
		profile[serverKey] = converted;
	}
	// Send both views or neither. homeRowOrder on its own makes the server throw away the
	// stored homeSections, whereas sending neither leaves the stored layout alone. That is
	// what we want before we have read it and know which sections to preserve.
	if (Array.isArray(localSettings.homeRows) && hasSeenServerLayout()) {
		profile.homeSections = homeRowsToSections(localSettings.homeRows);
		profile.homeRowOrder = homeRowsToRowOrder(localSettings.homeRows);
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

	// Same precedence as everything else, except the layout moves as one unit. The first
	// profile that has any layout supplies all of it, so admin defaults only reach a user
	// with no layout of their own.
	const homeRows = homeRowsFromProfile(envelope?.tv)
		?? homeRowsFromProfile(envelope?.global)
		?? homeRowsFromProfile(adminDefaults);
	if (homeRows !== undefined) resolved.homeRows = homeRows;
	return resolved;
};

// Every push sends the whole profile, and there are enough synced settings now that doing
// that on each keystroke of a slider is wasteful. Coalesce a burst of changes into one
// request, and keep only the newest state so nothing stale is sent.
const PUSH_DEBOUNCE_MS = 1000;
let pushTimer = null;
let pendingPush = null;

const flushTvProfile = () => {
	pushTimer = null;
	if (!pendingPush) return;
	const {updated, serverUrl, token} = pendingPush;
	pendingPush = null;
	saveMoonfinProfile('tv', localToProfile(updated), serverUrl, token).catch(e =>
		console.warn('[Settings] Failed to push TV profile:', e.message)
	);
};

const pushTvProfile = (updated, credsRef) => {
	if (!credsRef.current) return;
	const {serverUrl, token} = credsRef.current;
	pendingPush = {updated, serverUrl, token};
	if (pushTimer) clearTimeout(pushTimer);
	pushTimer = setTimeout(flushTvProfile, PUSH_DEBOUNCE_MS);
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
// Tracks which servers have already gone through the first plugin-detection sync, so
// a server without the plugin isn't probed on every login and settings are only
// auto-pulled once per server.
const PLUGIN_SYNC_INIT_KEY = 'pluginSyncInitialized';
const normalizeServerKey = (serverUrl) => (serverUrl || '')
	.replace(/^https?:\/\//i, '')
	.replace(/\/+$/, '')
	.toLowerCase();
const isServerSyncInitialized = async (serverUrl) => {
	const key = normalizeServerKey(serverUrl);
	if (!key) return false;
	const map = await getFromStorage(PLUGIN_SYNC_INIT_KEY);
	return Boolean(map && map[key]);
};
const markServerSyncInitialized = async (serverUrl) => {
	const key = normalizeServerKey(serverUrl);
	if (!key) return;
	const map = (await getFromStorage(PLUGIN_SYNC_INIT_KEY)) || {};
	if (map[key]) return;
	map[key] = true;
	await saveToStorage(PLUGIN_SYNC_INIT_KEY, map);
};
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
	// Lets the login-sync path read the current plugin flag without depending on the
	// whole settings object, which would rebuild its callback on every change.
	const settingsRef = useRef(settings);
	settingsRef.current = settings;
	const syncOnLoginRef = useRef({});

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
				return 'empty';
			}

			const resolved = resolveFromEnvelope(serverData, adminDefaults);

			const hasServerValues = resolved.tmdbApiKey !== undefined || SYNCABLE_KEYS.some(key => resolved[key] !== undefined);
			if (!hasServerValues) return 'empty';
			setSettings(prev => {
				const nextValues = {};
				for (const key of SYNCABLE_KEYS) {
					const incoming = resolved[key];
					// Hold on to the previous reference when the value hasn't really changed.
					// An equal but freshly built array still counts as a new identity, which
					// would send Browse off to reload every row on every sync.
					nextValues[key] = incoming === undefined || sameSyncedValue(incoming, prev[key])
						? prev[key]
						: incoming;
				}
				const tmdbApiKey = resolved.tmdbApiKey !== undefined ? resolved.tmdbApiKey : prev.tmdbApiKey;
				const homeRowsStyle = normalizeHomeRowsStyle(nextValues.homeRowsStyle);
				const detailScreenStyle = normalizeDetailScreenStyle(nextValues.detailScreenStyle);

				let customThemeId = nextValues.customThemeId;
				if (customThemeId && !getAvailableThemes()[customThemeId]) {
					customThemeId = '';
				}
				let visualTheme = nextValues.visualTheme;
				if (!isBuiltInThemeId(visualTheme)) {
					visualTheme = 'moonfin';
				}

				// Unchanged values kept their previous reference, so comparing identity is
				// enough here.
				const changed = tmdbApiKey !== prev.tmdbApiKey ||
					homeRowsStyle !== prev.homeRowsStyle ||
					detailScreenStyle !== prev.detailScreenStyle ||
					customThemeId !== prev.customThemeId ||
					visualTheme !== prev.visualTheme ||
					SYNCABLE_KEYS.some((key) => nextValues[key] !== prev[key]);

				if (changed) {
					const updated = {
						...prev,
						...nextValues,
						tmdbApiKey,
						homeRowsStyle,
						detailScreenStyle,
						customThemeId,
						visualTheme
					};
					saveToStorage('settings', updated);
					return updated;
				}
				return prev;
			});
			return 'applied';
		} catch (e) {
			console.warn('[Settings] Server sync failed:', e.message);
			return 'error';
		}
	}, []);

	// Mirrors Moonfin-Core's syncOnLogin. The first time a server is seen it detects
	// the plugin and, if it answers with a profile, turns sync on and pulls it. A
	// reachable server without the plugin is marked so it isn't probed again, and a
	// network failure is left unmarked to retry on the next login. After that first
	// pass the pull only runs while the user keeps the plugin enabled.
	const syncOnLogin = useCallback(async (serverUrl, token) => {
		if (!serverUrl || !token) return;
		const key = normalizeServerKey(serverUrl);
		if (!key || syncOnLoginRef.current[key]) return;
		syncOnLoginRef.current[key] = true;
		try {
			if (await isServerSyncInitialized(serverUrl)) {
				if (settingsRef.current.useMoonfinPlugin) {
					await syncFromServer(serverUrl, token);
				}
				return;
			}
			const outcome = await syncFromServer(serverUrl, token);
			if (outcome === 'applied') {
				updateSetting('useMoonfinPlugin', true);
				await markServerSyncInitialized(serverUrl);
			} else if (outcome === 'empty') {
				await markServerSyncInitialized(serverUrl);
			}
		} finally {
			syncOnLoginRef.current[key] = false;
		}
	}, [syncFromServer, updateSetting]);

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
			syncOnLogin,
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
