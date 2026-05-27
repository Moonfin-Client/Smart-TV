import {createContext, useContext, useState, useEffect, useCallback, useMemo, useRef} from 'react';
import {getFromStorage, saveToStorage} from '../services/storage';
import {
	getMoonfinSettings,
	getMoonfinThemes,
	saveMoonfinProfile,
	moonfinPing,
	subscribeMoonfinSettingsStream
} from '../services/jellyseerrApi';
import {parseThemeSpec} from '../theme/themeSpec';
import {getAvailableThemeList, getAvailableThemes, isBuiltInThemeId, replaceCustomThemes, resolveThemeById} from '../theme/themeRegistry';

const DEFAULT_HOME_ROWS = [
	{id: 'resume', name: 'Continue Watching', enabled: true, order: 0},
	{id: 'nextup', name: 'Next Up', enabled: true, order: 1},
	{id: 'latest-media', name: 'Latest Media', enabled: true, order: 2},
	{id: 'collections', name: 'Collections', enabled: false, order: 3},
	{id: 'library-tiles', name: 'My Media', enabled: false, order: 4}
];

const defaultSettings = {
	preferTranscode: false,
	forceDirectPlay: false,
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
	skipIntro: true,
	skipCredits: false,
	autoPlay: true,
	theme: 'dark',
	visualTheme: 'moonfin',
	customThemeId: '',
	homeRows: DEFAULT_HOME_ROWS,
	showShuffleButton: true,
	shuffleContentType: 'both',
	showGenresButton: true,
	showFavoritesButton: true,
	showLibrariesInToolbar: true,
	mergeContinueWatchingNextUp: false,
	showHomeBackdrop: true,
	backdropBlurHome: 20,
	backdropBlurDetail: 20,
	serverLogging: false,
	featuredContentType: 'both',
	featuredItemCount: 10,
	showFeaturedBar: true,
	mediaBarMode: 'moonfin',
	featuredTrailerPreview: true,
	featuredTrailerMuted: false,
	mediaBarAutoAdvance: true,
	mediaBarIntervalMs: 10000,
	mediaBarSourceType: 'library',
	mediaBarLibraryIds: [],
	mediaBarCollectionIds: [],
	mediaBarExcludedGenres: [],
	unifiedLibraryMode: false,
	useMoonfinPlugin: false,
	mdblistEnabled: true,
	mdblistApiKey: '',
	mdblistRatingSources: ['imdb', 'tmdb', 'tomatoes', 'metacritic'],
	mdblistShowRatingBadges: false,
	tmdbApiKey: '',
	tmdbEpisodeRatingsEnabled: true,
	jellyseerrEnabled: false,
	jellyseerrApiKey: '',
	jellyseerrBlockNsfw: false,
	showClock: true,
	clockDisplay: '24-hour',
	autoLogin: true,
	navbarPosition: 'top',
	screensaverEnabled: true,
	screensaverTimeout: 90,
	screensaverDimmingLevel: 50,
	screensaverShowClock: true,
	screensaverMode: 'library',
	watchedIndicatorBehavior: 'always',
	cardFocusZoom: false,
	useSeriesThumbnails: false,
	homeRowsPosterSize: 'default',
	homeRowsImageType: 'poster',
	nextUpBehavior: 'extended',
	nextUpTimeout: 7,
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
	screensaverAgeFilter: false,
	screensaverMaxRating: 13,
	uiScale: 1.0,
	enableFolderView: false,
	episodePreviewEnabled: true,
	previewAudioEnabled: true,
	enablePgsRendering: true,
	showSyncPlayButton: true,
	stereoUpmixEnabled: false,
	blockedRatings: [],
	jellyseerrRows: null,
	focusBorderColor: '',
	navbarOpacity: 100,
	navbarColor: ''
};

export {DEFAULT_HOME_ROWS};

const SERVER_TO_LOCAL = {
	mediaBarEnabled: 'showFeaturedBar',
	mediaBarContentType: 'featuredContentType',
	mediaBarItemCount: 'featuredItemCount',
	mediaBarTrailerPreview: 'featuredTrailerPreview',
	enableMultiServerLibraries: 'unifiedLibraryMode',
	seasonalSurprise: 'seasonalTheme',
	detailsScreenBlur: 'backdropBlurDetail',
	browsingBlur: 'backdropBlurHome',
	watchedIndicator: 'watchedIndicatorBehavior',
	cardFocusExpansion: 'cardFocusZoom',
	backdropEnabled: 'showHomeBackdrop',
	mediaBarTrailerAudio: 'featuredTrailerMuted',
	focusColor: 'focusBorderColor',
	homeImageUseSeriesImage: 'useSeriesThumbnails',
	homeRowOrder: 'homeRows',
};
const LOCAL_TO_SERVER = Object.fromEntries(
	Object.entries(SERVER_TO_LOCAL).map(([s, l]) => [l, s])
);

const TV_TO_SERVER_ROW = {'latest-media': 'latestmedia', 'library-tiles': 'smalllibrarytiles'};
const SERVER_TO_TV_ROW = {'latestmedia': 'latest-media', 'smalllibrarytiles': 'library-tiles'};

const normalizeGuid = (id) => {
	if (!id || typeof id !== 'string') return id;
	const raw = id.replace(/-/g, '');
	if (raw.length !== 32) return id;
	return `${raw.slice(0,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}-${raw.slice(16,20)}-${raw.slice(20)}`;
};
const normalizeGuidArray = (arr) => Array.isArray(arr) ? arr.map(normalizeGuid) : arr;

const VALUE_CONVERSIONS = {
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
	'mdblistEnabled', 'mdblistRatingSources', 'tmdbEpisodeRatingsEnabled',
	'navbarPosition', 'showFeaturedBar', 'featuredContentType', 'featuredItemCount',
	'featuredTrailerPreview', 'unifiedLibraryMode', 'seasonalTheme',
	'visualTheme', 'customThemeId',
	'showRatingLabels',
	'themeMusicEnabled', 'themeMusicVolume', 'themeMusicOnHomeRows',
	'homeRowsImageType',
	'useSeriesThumbnails',
	'watchedIndicatorBehavior',
	'cardFocusZoom',
	'showHomeBackdrop',
	'backdropBlurHome', 'backdropBlurDetail',
	'mediaBarMode', 'mediaBarAutoAdvance', 'mediaBarIntervalMs',
	'featuredTrailerMuted',
	'mediaBarSourceType', 'mediaBarLibraryIds', 'mediaBarCollectionIds', 'mediaBarExcludedGenres',
	'mdblistApiKey', 'mdblistShowRatingBadges', 'tmdbApiKey',
	'jellyseerrEnabled', 'jellyseerrApiKey', 'jellyseerrBlockNsfw',
	'enableFolderView',
	'episodePreviewEnabled', 'previewAudioEnabled',
	'homeRows',
	'showSyncPlayButton',
	'blockedRatings',
	'jellyseerrRows',
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
	return local;
};

const localToProfile = (localSettings) => {
	const profile = {};
	for (const key of SYNCABLE_KEYS) {
		const value = localSettings[key];
		if (value === undefined) continue;
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
	return resolved;
};

const pushTvProfile = (updated, credsRef) => {
	if (!credsRef.current) return;
	const {serverUrl, token} = credsRef.current;
	saveMoonfinProfile('tv', localToProfile(updated), serverUrl, token).catch(() => {});
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

export function SettingsProvider({children}) {
	const [settings, setSettings] = useState(defaultSettings);
	const [serverMessage, setServerMessage] = useState('');
	const [loaded, setLoaded] = useState(false);
	const [themeCatalogVersion, setThemeCatalogVersion] = useState(0);
	const serverCredsRef = useRef(null);
	const pluginEnabledRef = useRef(false);
	const syncFromServerRef = useRef(null);
	const sseControllerRef = useRef(null);
	const sseReconnectTimerRef = useRef(null);
	const sseReconnectAttemptRef = useRef(0);
	const streamSyncInFlightRef = useRef(false);
	const streamSyncQueuedRef = useRef(false);

	useEffect(() => {
		getFromStorage('settings').then((stored) => {
			if (stored) {
				let migrated = false;
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
				const merged = {...defaultSettings, ...stored};
				setSettings(merged);
				if (migrated) saveToStorage('settings', merged);
			}
			setLoaded(true);
		});
	}, []);

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
		setSettings(prev => {
			const updated = {...prev, [key]: value};
			saveToStorage('settings', updated);
			if (SYNCABLE_KEYS.includes(key)) pushTvProfile(updated, serverCredsRef);
			return updated;
		});
	}, []);

	const updateSettings = useCallback((newSettings) => {
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

	const showServerMessage = useCallback((message) => {
		if (typeof message !== 'string') return;
		const trimmed = message.trim();
		if (!trimmed) return;
		setServerMessage(trimmed);
	}, []);

	const clearServerMessage = useCallback(() => {
		setServerMessage('');
	}, []);

	const runStreamSync = useCallback(async (serverUrl, token) => {
		if (streamSyncInFlightRef.current) {
			streamSyncQueuedRef.current = true;
			return;
		}

		streamSyncInFlightRef.current = true;
		try {
			do {
				streamSyncQueuedRef.current = false;
				const sync = syncFromServerRef.current;
				if (!sync) return;
				await sync(serverUrl, token);
			} while (streamSyncQueuedRef.current && pluginEnabledRef.current);
		} finally {
			streamSyncInFlightRef.current = false;
		}
	}, []);

	const stopSettingsStream = useCallback(({resetBackoff = true} = {}) => {
		if (sseReconnectTimerRef.current) {
			clearTimeout(sseReconnectTimerRef.current);
			sseReconnectTimerRef.current = null;
		}

		if (sseControllerRef.current && typeof sseControllerRef.current.abort === 'function') {
			sseControllerRef.current.abort();
		}
		sseControllerRef.current = null;
		if (resetBackoff) {
			sseReconnectAttemptRef.current = 0;
		}
		streamSyncQueuedRef.current = false;
		streamSyncInFlightRef.current = false;
	}, []);

	const connectSettingsStream = useCallback((serverUrl, token) => {
		if (!pluginEnabledRef.current || !serverUrl || !token) return;
		if (sseControllerRef.current) return;

		sseControllerRef.current = subscribeMoonfinSettingsStream(
			serverUrl,
			token,
			(event) => {
				if (event?.type === 'adminMessage') {
					showServerMessage(event?.text);
					return;
				}

				if (event?.type !== 'settingsUpdated') return;
				sseReconnectAttemptRef.current = 0;
				runStreamSync(serverUrl, token).catch(() => {});
			},
			(error) => {
				stopSettingsStream({resetBackoff: false});

				const message = String(error?.message || '');
				if (/not supported/i.test(message)) {
					return;
				}

				if (!pluginEnabledRef.current) return;

				const delayMs = Math.min(
					30000,
					1000 * (2 ** sseReconnectAttemptRef.current),
				);
				sseReconnectAttemptRef.current = Math.min(
					sseReconnectAttemptRef.current + 1,
					6,
				);

				sseReconnectTimerRef.current = setTimeout(() => {
					sseReconnectTimerRef.current = null;
					if (!pluginEnabledRef.current) return;

					const creds = serverCredsRef.current;
					if (!creds) return;

					connectSettingsStream(creds.serverUrl, creds.token);
				}, delayMs);
			}
		);
	}, [runStreamSync, showServerMessage, stopSettingsStream]);

	const syncFromServer = useCallback(async (serverUrl, token) => {
		try {
			serverCredsRef.current = {serverUrl, token};
			sseReconnectAttemptRef.current = 0;
			if (pluginEnabledRef.current) {
				connectSettingsStream(serverUrl, token);
			}

			let adminDefaults = null;
			try {
				const ping = await moonfinPing(serverUrl, token);
				if (ping?.defaultSettings) adminDefaults = ping.defaultSettings;
			} catch (_) {}

			let themesPayload = null;
			try {
				themesPayload = await getMoonfinThemes(serverUrl, token);
			} catch (_) {}

			const specs = [];
			for (const entry of extractThemeObjects(themesPayload)) {
				if (!entry || typeof entry !== 'object') continue;
				try {
					specs.push(parseThemeSpec(entry));
				} catch (_) {}
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

			const hasServerValues = SYNCABLE_KEYS.some(key => resolved[key] !== undefined);
			if (!hasServerValues) return;

			setSettings(prev => {
				const updated = {...prev};
				for (const key of SYNCABLE_KEYS) {
					if (resolved[key] !== undefined) updated[key] = resolved[key];
				}
				if (updated.customThemeId && !getAvailableThemes()[updated.customThemeId]) {
					updated.customThemeId = '';
				}
				if (!isBuiltInThemeId(updated.visualTheme)) {
					updated.visualTheme = 'moonfin';
				}
				saveToStorage('settings', updated);
				return updated;
			});

		} catch (_) {}
	}, [connectSettingsStream]);

	useEffect(() => {
		syncFromServerRef.current = syncFromServer;
	}, [syncFromServer]);

	useEffect(() => {
		pluginEnabledRef.current = settings.useMoonfinPlugin;
	}, [settings.useMoonfinPlugin]);

	useEffect(() => {
		if (!settings.useMoonfinPlugin) {
			stopSettingsStream();
			return;
		}

		const creds = serverCredsRef.current;
		if (creds) {
			connectSettingsStream(creds.serverUrl, creds.token);
		}
	}, [settings.useMoonfinPlugin, connectSettingsStream, stopSettingsStream]);

	useEffect(() => () => {
		stopSettingsStream();
	}, [stopSettingsStream]);

	return (
		<SettingsContext.Provider value={{
			settings,
			serverMessage,
			loaded,
			availableThemes,
			activeThemeId,
			activeTheme,
			updateSetting,
			updateSettings,
			selectThemeById,
			resetSettings,
			showServerMessage,
			clearServerMessage,
			syncFromServer
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
