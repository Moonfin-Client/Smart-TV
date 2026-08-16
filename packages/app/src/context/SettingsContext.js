import {createContext, useContext, useState, useEffect, useCallback, useMemo, useRef} from 'react';
import {getFromStorage, saveToStorage} from '../services/storage';
import {getMoonfinSettings, getMoonfinThemes, saveMoonfinProfile, moonfinPing} from '../services/seerrApi';
import {parseThemeSpec} from '../theme/themeSpec';
import {normalizeOverlayColorKey} from '../theme/overlayColors';
import {getAvailableThemeList, getAvailableThemes, isBuiltInThemeId, registerStoreTheme, removeStoreTheme, replaceCustomThemes, resolveThemeById} from '../theme/themeRegistry';
import {applyOledMode} from '../utils/oledMode';
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

import {defaultSettings} from './defaultSettings';

export {defaultSettings};

const SERVER_TO_LOCAL = {
	mediaBarMode: 'featuredBarStyle',
	mediaBarItemCount: 'featuredItemCount',
	mediaBarTrailerPreview: 'featuredTrailerPreview',
	mediaBarAutoAdvance: 'autoAdvance',
	mediaBarIntervalMs: 'autoAdvanceInterval',
	mediaBarOpacity: 'mediaBarOverlayOpacity',
	mediaBarContentType: 'featuredContentType',
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
	syncPlayEnabled: 'syncplayEnabled',
	syncPlayAutoOpen: 'syncplayAutoOpen',
	clockBehavior: 'showClock',
	enableFolderView: 'folderViewMode',
	homeRowInfoOverlay: 'homeRowOverlay',
	autoplayNextEpisode: 'autoPlay',
	mediaSegmentCountdown: 'nextUpCountdownStyle',
	defaultAudioLanguage: 'audioLanguage',
	defaultSubtitleLanguage: 'subtitleLanguage',
	unpauseRewindDuration: 'unpauseRewind',
	confirmExit: 'exitConfirmation'
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

// This app says tv where the other clients say tvshows. Inverting the one map keeps the
// two directions from drifting apart.
const CONTENT_TYPE_TO_SERVER = {both: 'both', movies: 'movies', tv: 'tvshows'};
const CONTENT_TYPE_FROM_SERVER = Object.fromEntries(
	Object.entries(CONTENT_TYPE_TO_SERVER).map(([local, server]) => [server, local])
);

// Above this an auto advance interval has to be milliseconds, because the slider
// that sets it only reaches 20 seconds.
const MIN_INTERVAL_MS = 100;

const secondsToMs = (v) => (typeof v === 'number' ? Math.round(v * 1000) : undefined);
const msToSeconds = (v) => (typeof v === 'number' ? Math.round(v / 1000) : undefined);

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
	// The item types and the source shared one server key until recently, so a stored
	// profile can hold either setting's value under either name. Mapping through the sets
	// each one actually offers drops whatever landed in the wrong place.
	featuredContentType: {
		toServer: v => CONTENT_TYPE_TO_SERVER[v],
		fromServer: v => CONTENT_TYPE_FROM_SERVER[v]
	},
	mediaBarSourceType: {
		fromServer: v => (v === 'library' || v === 'collection' ? v : undefined)
	},
	// The clock is a toggle here and a three way choice on the other clients. Anything that
	// isn't "never" shows a clock, so the toggle reads as on.
	showClock: {
		toServer: v => v ? 'always' : 'never',
		fromServer: v => v !== 'never'
	},
	// The other clients offer off, logo or library, where this app keeps a separate toggle for
	// turning it off. There is nothing to draw for "off", so leave the mode we already have.
	screensaverMode: {
		fromServer: v => (v === 'off' ? undefined : v)
	},
	// Three states here against a boolean elsewhere. "Per Library" has no equivalent, so it
	// declines to push and leaves whatever the server holds.
	folderViewMode: {
		toServer: v => (v === 'local' ? undefined : v === 'on'),
		fromServer: v => (v ? 'on' : 'off')
	},
	nextUpTimeout: {
		toServer: secondsToMs,
		fromServer: msToSeconds
	},
	// The label both sides show for an empty preference is Auto, but the other
	// clients store the word while this app stores an empty string.
	audioLanguage: {
		toServer: v => (v === '' ? 'auto' : v),
		fromServer: v => (v === 'auto' ? '' : v)
	},
	// This app predates the foreign mode and calls the flagged one default.
	subtitleMode: {
		toServer: v => (v === 'default' ? 'flagged' : v),
		fromServer: v => (v === 'flagged' ? 'default' : v)
	},
	unpauseRewind: {
		toServer: secondsToMs,
		fromServer: msToSeconds
	},
	autoAdvanceInterval: {
		toServer: secondsToMs,
		// A small number is the seconds an older build pushed before this was
		// converted, rather than an interval of a few milliseconds.
		fromServer: (v) => (typeof v === 'number' && v < MIN_INTERVAL_MS ? v : msToSeconds(v))
	}
	// homeRows is missing on purpose. The home layout is two server fields that have to
	// move together, so it gets resolved whole rather than a key at a time.
};

export const SYNCABLE_KEYS = [
	'showShuffleButton', 'shuffleContentType', 'showGenresButton',
	'showFavoritesButton', 'showLibrariesInToolbar', 'mergeContinueWatchingNextUp',
	'nextUpMaxDays',
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
	'displayAudioRows', 'displayRewatchRow', 'playlistsRowShowEpisodes',
	'favoritesRowSortBy', 'collectionsRowSortBy', 'genresRowSortBy', 'genresRowItemFilter', 'collectionsRowShowEpisodes',
	'stillWatchingBehavior', 'watchedIndicatorBehavior',
	// Core stores these as enums and syncs them by name, which is the same string this
	// client stores, so they need no conversion on the way to the server.
	'playbackTimeAboveLeft', 'playbackTimeAboveCenter', 'playbackTimeAboveRight',
	'playbackTimeBelowLeft', 'playbackTimeBelowCenter', 'playbackTimeBelowRight',
	'musicPlaybackTimeDisplay',
	'autoPlay', 'nextUpBehavior', 'nextUpTimeout', 'nextUpCountdownStyle',
	'replaceSkipOutroWithNextUp',
	'backdropBlurHome', 'backdropBlurDetail',
	'mediaBarSourceType', 'mediaBarLibraryIds', 'mediaBarCollectionIds',
	'mediaBarOverlayColor', 'mediaBarOverlayOpacity',
	'homeRows', 'homeRowsStyle', 'detailScreenStyle', 'detailExpandedTabs', 'fullScreenRows', 'homeRowsPosterSize', 'useSeriesThumbnails',
	'hideDetailsMediaDescription', 'detailUseSeriesThumbnails', 'hideHomeMediaDescription',
	'personalRatingStyle',
	'useDetailedSubHeadings', 'showMediaDetailsOnLibraryPage', 'hideBackdropsInLibraries',
	'syncplayEnabled', 'syncplayAutoOpen',
	'showSyncPlayButton',
	'syncPlayAdvancedCorrectionEnabled', 'syncPlayEnableSyncCorrection',
	'syncPlayUseSpeedToSync', 'syncPlayUseSkipToSync',
	'syncPlayMinDelaySpeedToSync', 'syncPlayMaxDelaySpeedToSync',
	'syncPlaySpeedToSyncDuration', 'syncPlayMinDelaySkipToSync', 'syncPlayExtraTimeOffset',
	'videoStartDelay', 'cinemaModeEnabled', 'cinemaModeEpisodesEnabled',
	'audioLanguage', 'fallbackAudioLanguage', 'preferDefaultAudioTrack', 'preferAudioDescription',
	'subtitleLanguage', 'fallbackSubtitleLanguage', 'preferSdhSubtitles', 'subtitleMode',
	'assDirectPlay',
	'resumeSubtractDuration', 'unpauseRewind', 'skipBackLength', 'skipForwardLength',
	'maxVideoResolution', 'playerZoomMode', 'mediaSegmentAutoHide',
	'exitConfirmation',
	'diagnosticLoggingEnabled',
	'uiLanguage',
	'blockedRatings',
	'mergeRadarrSonarrCalendars',
	'radarrCalendarShowCinema', 'radarrCalendarShowDigital', 'radarrCalendarShowPhysical',
	'radarrCalendarShowDate', 'sonarrCalendarShowDate', 'sonarrCalendarShowEpisodeInfo',
	'showSeerrButton',
	'screensaverMode', 'screensaverClockMode',
	'navbarAlwaysExpanded', 'oledMode', 'themeMusicLoop',
	// Settings this app has no screen for. They ride along so a value set on another client
	// survives the profile the TV writes back.
	'showCastButton',
	'classicHomeRowsPadding', 'modernHomeRowsPadding',
	'detailShowTechnicalDetails',
	'recommendationSystemSource', 'recommendationsApplyParentalRatingCap',
	'detailButtonOrderTv', 'hiddenDetailButtonsTv', 'osdButtonOrderTv', 'hiddenOsdButtonsTv',
	'focusBorderColor',
	'navbarOpacity',
	'navbarColor',
];

export const profileToLocal = (serverProfile) => {
	if (!serverProfile) return {};
	const local = {};
	for (const [key, value] of Object.entries(serverProfile)) {
		if (value === null || value === undefined) continue;
		const localKey = SERVER_TO_LOCAL[key] || key;
		if (SYNCABLE_KEYS.includes(localKey)) {
			const conv = VALUE_CONVERSIONS[localKey];
			const converted = conv?.fromServer ? conv.fromServer(value) : value;
			// A converter returns undefined when the stored value makes no sense here,
			// so keep what we already have rather than blanking it.
			if (converted === undefined) continue;
			local[localKey] = converted;
		}
	}
	// The TMDB key is read only. We pull it so online rows can call TMDB, but it
	// stays out of SYNCABLE_KEYS so the client never pushes it back.
	if (serverProfile.tmdbApiKey !== undefined && serverProfile.tmdbApiKey !== null) {
		local.tmdbApiKey = serverProfile.tmdbApiKey;
	}
	return local;
};

export const localToProfile = (localSettings) => {
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
// Keys the viewer has changed that the server hasn't taken yet. A pull landing in
// between would otherwise put the old value straight back.
const unpushedKeys = new Set();

const flushTvProfile = () => {
	pushTimer = null;
	if (!pendingPush) return;
	const {updated, serverUrl, token} = pendingPush;
	pendingPush = null;
	const sent = [...unpushedKeys];
	saveMoonfinProfile('tv', localToProfile(updated), serverUrl, token).then(() => {
		for (const key of sent) unpushedKeys.delete(key);
	}).catch(e =>
		console.warn('[Settings] Failed to push TV profile:', e.message)
	);
};

const pushTvProfile = (updated, credsRef, keys) => {
	for (const key of keys) unpushedKeys.add(key);
	// Before the first sync there is nowhere to send this, but the keys are still
	// marked so the pull that follows leaves them alone.
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
	// Set once a sync has replaced the custom themes with a fresh set from the
	// server, so the boot hydration below never puts a stale cache over it.
	const serverThemesLoadedRef = useRef(false);
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
				if (typeof stored.homeRowOverlay === 'string') {
					// Was an on and off picker stored as strings before it became a switch.
					stored.homeRowOverlay = stored.homeRowOverlay === 'on';
					migrated = true;
				}
				const navbarColorKey = normalizeOverlayColorKey(stored.navbarColor);
				if (navbarColorKey !== stored.navbarColor) {
					// Was stored as a hex before it became a named color.
					stored.navbarColor = navbarColorKey;
					migrated = true;
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
				if ('stillWatchingPrompt' in stored) {
					// Was a toggle that also suppressed the next up prompt. Off keeps the
					// asking off, on takes the middle count the other clients default to.
					stored.stillWatchingBehavior = stored.stillWatchingPrompt === false ? 'disabled' : 'medium';
					delete stored.stillWatchingPrompt;
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
				if (typeof stored.autoAdvanceInterval === 'number' && stored.autoAdvanceInterval >= MIN_INTERVAL_MS) {
					// Came off another client in milliseconds while this key was synced raw.
					stored.autoAdvanceInterval = Math.round(stored.autoAdvanceInterval / 1000);
					migrated = true;
				}
				if (Array.isArray(stored.mdblistRatingSources) && !stored.mdblistRatingSources.includes('stars')) {
					// Community rating was always shown before it became toggleable, so
					// preserve that for existing users by enabling 'stars' once.
					stored.mdblistRatingSources = ['stars', ...stored.mdblistRatingSources];
					migrated = true;
				}
				if (Array.isArray(stored.mdblistRatingSources) &&
					stored.mdblistRatingSources.some((s) => s === 'popcorn' || s === 'rtAudience')) {
					// Stored selections can still hold the old `popcorn` or `rtAudience`
					// ids. Map both to the shared `tomatoes_audience` key so they keep
					// matching what the ratings row filters on.
					stored.mdblistRatingSources = stored.mdblistRatingSources.map(
						(s) => (s === 'popcorn' || s === 'rtAudience' ? 'tomatoes_audience' : s)
					);
					migrated = true;
				}
				if (!stored.screensaverClockMode && 'screensaverShowClock' in stored) {
					// The clock toggle became a mode picker. The logo screensaver always
					// bounced its clock, so that stays what those users see.
					stored.screensaverClockMode = stored.screensaverShowClock === false
						? 'off'
						: (stored.screensaverMode === 'logo' ? 'bouncing' : 'staticCorner');
					migrated = true;
				}
				if (!stored.autoLoginBehavior && 'autoLogin' in stored) {
					stored.autoLoginBehavior = stored.autoLogin === false ? 'disabled' : 'lastUser';
					migrated = true;
				}
				if (typeof stored.skipForwardLength === 'number' && stored.skipForwardLength > 0 && stored.skipForwardLength < 1000) {
					// Stored as seconds before the skip lengths took the other clients'
					// millisecond values.
					stored.skipForwardLength = stored.skipForwardLength * 1000;
					migrated = true;
				}
				if (!stored.audioPassthroughMode) {
					// The master toggle and the per codec switches predate the mode
					// picker, so their stored state keeps its old meaning.
					if (stored.passthroughEnabled === false) {
						stored.audioPassthroughMode = 'disabled';
						migrated = true;
					} else if (['ac3Passthrough', 'eac3Passthrough', 'dtsPassthrough', 'dtshdPassthrough', 'truehdPassthrough']
						.some((key) => stored[key] === false)) {
						stored.audioPassthroughMode = 'manual';
						migrated = true;
					}
				}
				if ('liveTvDirect' in stored) {
					// This key spent time synced to the other clients' live tv direct play
					// toggle, a playback setting, so a stored true usually arrived from
					// there rather than anyone asking to skip the guide. The shortcut
					// restarts from off under its own key, liveTvSkipGuide.
					delete stored.liveTvDirect;
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
		}).catch((err) => {
			// The app shows nothing until this resolves, so a store that fails or a
			// stored value that wont parse has to fall back rather than hang.
			console.warn('[Settings] Could not read stored settings:', err?.message || err);
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

	// Restore plugin-synced custom themes cached from the last successful sync.
	// Without this a selected custom theme falls back to Moonfin on every boot
	// until the server answers, and never comes back while it is unreachable.
	useEffect(() => {
		getFromStorage('customThemes').then((stored) => {
			if (!stored || typeof stored !== 'object') return;
			// A sync that finished before this resolved already holds a fresher set.
			if (serverThemesLoadedRef.current) return;
			const specs = [];
			for (const raw of Object.values(stored)) {
				try {
					specs.push(parseThemeSpec(raw));
				} catch (e) { void e; /* skip malformed */ }
			}
			if (specs.length === 0) return;
			replaceCustomThemes(specs);
			setThemeCatalogVersion((value) => value + 1);
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
	const activeTheme = useMemo(
		() => applyOledMode(resolveThemeById(activeThemeId), settings.oledMode),
		[activeThemeId, settings.oledMode, themeCatalogVersion] // eslint-disable-line react-hooks/exhaustive-deps
	);

	const updateSetting = useCallback((key, value) => {
		if (key === 'uiLanguage') persistBootLocale(value);
		setSettings(prev => {
			const updated = {...prev, [key]: value};
			saveToStorage('settings', updated);
			if (SYNCABLE_KEYS.includes(key)) pushTvProfile(updated, serverCredsRef, [key]);
			return updated;
		});
	}, []);

	const updateSettings = useCallback((newSettings) => {
		if ('uiLanguage' in newSettings) persistBootLocale(newSettings.uiLanguage);
		setSettings(prev => {
			const updated = {...prev, ...newSettings};
			saveToStorage('settings', updated);
			const syncable = Object.keys(newSettings).filter(k => SYNCABLE_KEYS.includes(k));
			if (syncable.length > 0) {
				pushTvProfile(updated, serverCredsRef, syncable);
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
			pushTvProfile(updated, serverCredsRef, ['visualTheme', 'customThemeId']);
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

			// Null means the fetch failed or the endpoint is missing, and only a
			// real answer may replace the cached set.
			const themesSynced = themesPayload != null;
			if (themesSynced) {
				const specs = [];
				const raws = {};
				for (const entry of extractThemeObjects(themesPayload)) {
					if (!entry || typeof entry !== 'object') continue;
					try {
						const spec = parseThemeSpec(entry);
						specs.push(spec);
						raws[spec.id] = entry;
					} catch (e) {
						console.warn('[Settings] Ignoring malformed theme entry:', e.message);
					}
				}
				replaceCustomThemes(specs);
				serverThemesLoadedRef.current = true;
				saveToStorage('customThemes', raws);
				setThemeCatalogVersion((value) => value + 1);
			}

			const serverData = await getMoonfinSettings(serverUrl, token);
			if (!serverData) {
				setSettings((prev) => {
					// Only a synced list can say the selected theme is gone. A missing
					// one may just not have loaded yet, and the fallback while it is
					// unresolved is Moonfin anyway.
					if (!prev.customThemeId || !themesSynced || getAvailableThemes()[prev.customThemeId]) {
						return prev;
					}
					const updated = {...prev, customThemeId: ''};
					saveToStorage('settings', updated);
					return updated;
				});
				// A viewer who has never synced has no envelope of their own, and they are
				// exactly who the admin defaults are there to seed.
				if (!adminDefaults) return 'empty';
			}

			const resolved = resolveFromEnvelope(serverData, adminDefaults);

			const hasServerValues = resolved.tmdbApiKey !== undefined || SYNCABLE_KEYS.some(key => resolved[key] !== undefined);
			if (!hasServerValues) return 'empty';
			// Synced profiles can still contain the old `rtAudience`/`popcorn` ids,
			// which would never match the `tomatoes_audience` key the ratings row
			// filters on.
			if (Array.isArray(resolved.mdblistRatingSources)) {
				resolved.mdblistRatingSources = resolved.mdblistRatingSources.map(
					(s) => (s === 'popcorn' || s === 'rtAudience' ? 'tomatoes_audience' : s)
				);
			}
			setSettings(prev => {
				const nextValues = {};
				for (const key of SYNCABLE_KEYS) {
					const incoming = resolved[key];
					// Hold on to the previous reference when the value hasn't really changed.
					// An equal but freshly built array still counts as a new identity, which
					// would send Browse off to reload every row on every sync.
					// A key the viewer has changed but the server hasn't taken yet keeps the
					// local value, because what came back is the one they just replaced.
					nextValues[key] = incoming === undefined || unpushedKeys.has(key) || sameSyncedValue(incoming, prev[key])
						? prev[key]
						: incoming;
				}
				const tmdbApiKey = resolved.tmdbApiKey !== undefined ? resolved.tmdbApiKey : prev.tmdbApiKey;
				const homeRowsStyle = normalizeHomeRowsStyle(nextValues.homeRowsStyle);
				const detailScreenStyle = normalizeDetailScreenStyle(nextValues.detailScreenStyle);

				let customThemeId = nextValues.customThemeId;
				if (customThemeId && themesSynced && !getAvailableThemes()[customThemeId]) {
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
		// Known before any of the network work below, so a change made while that
		// runs still has somewhere to go. Marks left over from another server were
		// for that server's profile and would only hold this one's values back.
		if (serverCredsRef.current?.serverUrl !== serverUrl) unpushedKeys.clear();
		serverCredsRef.current = {serverUrl, token};
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
