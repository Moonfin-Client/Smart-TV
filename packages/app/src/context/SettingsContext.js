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
	backdropBlurHome: 20,
	backdropBlurDetail: 20,
	uiOpacity: 85,
	uiColor: 'dark',
	serverLogging: false,
	featuredContentType: 'both',
	featuredItemCount: 10,
	showFeaturedBar: true,
	featuredTrailerPreview: true,
	featuredTrailerMuted: false,
	unifiedLibraryMode: false,
	useMoonfinPlugin: false,
	mdblistEnabled: true,
	mdblistRatingSources: ['imdb', 'tmdb', 'tomatoes', 'metacritic'],
	mdblistApiKey: '',
	tmdbEpisodeRatingsEnabled: true,
	tmdbApiKey: '',
	autoLogin: true,
	navbarPosition: 'top',
	screensaverEnabled: true,
	screensaverTimeout: 90,
	screensaverDimmingLevel: 50,
	screensaverShowClock: true,
	screensaverMode: 'library'
};

export {DEFAULT_HOME_ROWS};

const SERVER_TO_LOCAL = {
	mediaBarEnabled: 'showFeaturedBar',
	mediaBarContentType: 'featuredContentType',
	mediaBarItemCount: 'featuredItemCount',
	mediaBarTrailerPreview: 'featuredTrailerPreview',
	enableMultiServerLibraries: 'unifiedLibraryMode',
};
const LOCAL_TO_SERVER = Object.fromEntries(
	Object.entries(SERVER_TO_LOCAL).map(([s, l]) => [l, s])
);

const SYNCABLE_KEYS = [
	'showShuffleButton', 'shuffleContentType', 'showGenresButton',
	'showFavoritesButton', 'showLibrariesInToolbar', 'mergeContinueWatchingNextUp',
	'mdblistEnabled', 'mdblistApiKey', 'mdblistRatingSources',
	'tmdbApiKey', 'tmdbEpisodeRatingsEnabled', 'navbarPosition',
	'showFeaturedBar', 'featuredContentType', 'featuredItemCount',
	'featuredTrailerPreview', 'unifiedLibraryMode',
];

const profileToLocal = (serverProfile) => {
	if (!serverProfile) return {};
	const local = {};
	for (const [key, value] of Object.entries(serverProfile)) {
		if (value === null || value === undefined) continue;
		const localKey = SERVER_TO_LOCAL[key] || key;
		if (SYNCABLE_KEYS.includes(localKey)) {
			local[localKey] = value;
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
		profile[serverKey] = value;
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

const deepEqual = (a, b) => {
	if (a === b) return true;
	if (a == null || b == null) return a == b;
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		return a.every((v, i) => deepEqual(v, b[i]));
	}
	if (typeof a === 'object' && typeof b === 'object') {
		const ka = Object.keys(a), kb = Object.keys(b);
		if (ka.length !== kb.length) return false;
		return ka.every(k => deepEqual(a[k], b[k]));
	}
	return false;
};

const threeWayMerge = (local, server, snapshot) => {
	const merged = {};
	for (const key of SYNCABLE_KEYS) {
		const localVal = local[key];
		const serverVal = server[key];
		const snapVal = snapshot[key];

		if (!deepEqual(serverVal, snapVal) && deepEqual(localVal, snapVal) && serverVal !== undefined) {
			merged[key] = serverVal;
		} else if (localVal !== undefined) {
			merged[key] = localVal;
		} else if (serverVal !== undefined) {
			merged[key] = serverVal;
		}
	}
	return merged;
};

const pickSyncable = (source) => {
	const result = {};
	for (const key of SYNCABLE_KEYS) {
		if (source[key] !== undefined) result[key] = source[key];
	}
	return result;
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
				setSettings({...defaultSettings, ...stored});
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

			if (!serverData) {
				console.log('[Settings] No server settings, pushing local TV profile');
				await saveMoonfinProfile('tv', localToProfile(settings), serverUrl, token).catch(() => {});
				await saveToStorage('sync_snapshot', pickSyncable(settings));
				return;
			}

			const isV2 = serverData.schemaVersion === 2 || serverData.global || serverData.tv;
			let resolvedServer;

			if (isV2) {
				resolvedServer = resolveFromEnvelope(serverData, adminDefaults);
				console.log('[Settings] Resolved v2 envelope (tv → global → admin)');
			} else {
				resolvedServer = {};
				for (const [key, value] of Object.entries(serverData)) {
					if (value === null || value === undefined) continue;
					const k = key.charAt(0).toLowerCase() + key.slice(1);
					const localKey = SERVER_TO_LOCAL[k] || k;
					if (SYNCABLE_KEYS.includes(localKey)) {
						resolvedServer[localKey] = value;
					}
				}
				console.log('[Settings] Parsed v1 flat settings');
			}

			const snapshot = await getFromStorage('sync_snapshot') || {};
			const localSyncable = pickSyncable(settings);

			let merged;
			if (Object.keys(snapshot).length > 0) {
				merged = threeWayMerge(localSyncable, resolvedServer, snapshot);
				console.log('[Settings] Three-way merged TV settings');
			} else {
				merged = {...resolvedServer, ...localSyncable};
				console.log('[Settings] First sync — local wins');
			}

			const changed = SYNCABLE_KEYS.some(key =>
				merged[key] !== undefined && !deepEqual(merged[key], settings[key])
			);

			if (changed) {
				setSettings(prev => {
					const updated = {...prev};
					for (const key of SYNCABLE_KEYS) {
						if (merged[key] !== undefined) updated[key] = merged[key];
					}
					saveToStorage('settings', updated);
					return updated;
				});
				console.log('[Settings] Applied synced settings');
			} else {
				console.log('[Settings] Server settings match local');
			}

			await saveMoonfinProfile('tv', localToProfile(merged), serverUrl, token).catch(e =>
				console.warn('[Settings] Failed to push TV profile:', e.message)
			);
			await saveToStorage('sync_snapshot', pickSyncable(merged));

		} catch (e) {
			console.warn('[Settings] Server sync failed:', e.message);
		}
	}, [settings]);

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
