import {createContext, useContext, useState, useEffect, useCallback} from 'react';
import {getFromStorage, saveToStorage} from '../services/storage';
import {getMoonfinSettings, saveMoonfinSettings} from '../services/jellyseerrApi';

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
	subtitleBackground: 75,
	subtitleBackgroundColor: '#000000',
	subtitleColor: '#ffffff',
	subtitleShadowColor: '#000000',
	subtitleShadowOpacity: 50,
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

// Settings keys that the Moonfin plugin syncs across clients
const SYNCABLE_KEYS = [
	'showShuffleButton', 'shuffleContentType', 'showGenresButton',
	'showFavoritesButton', 'showLibrariesInToolbar', 'mergeContinueWatchingNextUp',
	'mdblistEnabled', 'mdblistApiKey', 'mdblistRatingSources',
	'tmdbApiKey', 'tmdbEpisodeRatingsEnabled', 'navbarPosition'
];

const SettingsContext = createContext(null);

export function SettingsProvider({children}) {
	const [settings, setSettings] = useState(defaultSettings);
	const [loaded, setLoaded] = useState(false);

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
			return updated;
		});
	}, []);

	const updateSettings = useCallback((newSettings) => {
		setSettings(prev => {
			const updated = {...prev, ...newSettings};
			saveToStorage('settings', updated);
			return updated;
		});
	}, []);

	const resetSettings = useCallback(() => {
		setSettings(defaultSettings);
		saveToStorage('settings', defaultSettings);
	}, []);

	const syncFromServer = useCallback(async (serverUrl, token) => {
		try {
			const serverSettings = await getMoonfinSettings(serverUrl, token);
			if (!serverSettings) {
				console.log('[Settings] No server settings found, pushing local');
				const toSync = {};
				for (const key of SYNCABLE_KEYS) {
					if (settings[key] !== undefined) {
						toSync[key] = settings[key];
					}
				}
				await saveMoonfinSettings(toSync, serverUrl, token).catch(() => {});
				return;
			}

			const normalized = {};
			for (const key of Object.keys(serverSettings)) {
				const k = key.charAt(0).toLowerCase() + key.slice(1);
				normalized[k] = serverSettings[key];
			}

			const merged = {};
			let changed = false;
			for (const key of SYNCABLE_KEYS) {
				if (normalized[key] !== undefined) {
					merged[key] = normalized[key];
					if (JSON.stringify(merged[key]) !== JSON.stringify(settings[key])) {
						changed = true;
					}
				}
			}

			if (changed) {
				setSettings(prev => {
					const updated = {...prev, ...merged};
					saveToStorage('settings', updated);
					return updated;
				});
				console.log('[Settings] Synced from server:', Object.keys(merged).join(', '));
			} else {
				console.log('[Settings] Server settings match local');
			}
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
