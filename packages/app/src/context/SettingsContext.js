import {createContext, useContext, useState, useEffect, useCallback, useRef} from 'react';
import {getFromStorage, saveToStorage} from '../services/storage';
import {getMoonfinSettings, saveMoonfinProfile, moonfinPing} from '../services/jellyseerrApi';

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
	uiOpacity: 85,
	uiColor: 'gray',
	serverLogging: false,
	featuredContentType: 'both',
	featuredItemCount: 10,
	showFeaturedBar: true,
	featuredTrailerPreview: true,
	featuredTrailerMuted: false,
	mediaBarSourceType: 'library',
	mediaBarLibraryIds: [],
	mediaBarCollectionIds: [],
	unifiedLibraryMode: false,
	useMoonfinPlugin: false,
	mdblistEnabled: true,
	mdblistRatingSources: ['imdb', 'tmdb', 'tomatoes', 'metacritic'],
	tmdbEpisodeRatingsEnabled: true,
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
	focusColor: '#00a4dc',
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
	enablePgsRendering: true
};

export {DEFAULT_HOME_ROWS};

const SERVER_TO_LOCAL = {
	mediaBarEnabled: 'showFeaturedBar',
	mediaBarContentType: 'featuredContentType',
	mediaBarItemCount: 'featuredItemCount',
	mediaBarTrailerPreview: 'featuredTrailerPreview',
	enableMultiServerLibraries: 'unifiedLibraryMode',
	seasonalSurprise: 'seasonalTheme',
	mediaBarOverlayColor: 'uiColor',
	mediaBarOpacity: 'uiOpacity',
	detailsScreenBlur: 'backdropBlurDetail',
	browsingBlur: 'backdropBlurHome',
	use24HourClock: 'clockDisplay',
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
	clockDisplay: {
		toServer: v => v === '24-hour',
		fromServer: v => v ? '24-hour' : '12-hour'
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
			if (!Array.isArray(serverIds)) return undefined;
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
	'uiColor', 'uiOpacity', 'focusColor', 'showRatingLabels',
	'themeMusicEnabled', 'themeMusicVolume', 'themeMusicOnHomeRows',
	'homeRowsImageType', 'showClock', 'clockDisplay',
	'backdropBlurHome', 'backdropBlurDetail',
	'mediaBarSourceType', 'mediaBarLibraryIds', 'mediaBarCollectionIds',
	'homeRows',
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
	saveMoonfinProfile('tv', localToProfile(updated), serverUrl, token).catch(e =>
		console.warn('[Settings] Failed to push TV profile:', e.message)
	);
};

const SettingsContext = createContext(null);

export function SettingsProvider({children}) {
	const [settings, setSettings] = useState(defaultSettings);
	const [loaded, setLoaded] = useState(false);
	const serverCredsRef = useRef(null);

	useEffect(() => {
		getFromStorage('settings').then((stored) => {
			if (stored) {
				let migrated = false;
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

	const resetSettings = useCallback(() => {
		setSettings(defaultSettings);
		saveToStorage('settings', defaultSettings);
	}, []);

	const syncFromServer = useCallback(async (serverUrl, token) => {
		try {
			serverCredsRef.current = {serverUrl, token};

			let adminDefaults = null;
			try {
				const ping = await moonfinPing(serverUrl, token);
				if (ping?.defaultSettings) adminDefaults = ping.defaultSettings;
			} catch (e) { /* non-critical */ }

			const serverData = await getMoonfinSettings(serverUrl, token);
			if (!serverData) return;

			const resolved = resolveFromEnvelope(serverData, adminDefaults);

			const hasServerValues = SYNCABLE_KEYS.some(key => resolved[key] !== undefined);
			if (!hasServerValues) return;

			setSettings(prev => {
				const updated = {...prev};
				for (const key of SYNCABLE_KEYS) {
					if (resolved[key] !== undefined) updated[key] = resolved[key];
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
			updateSetting,
			updateSettings,
			resetSettings,
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
