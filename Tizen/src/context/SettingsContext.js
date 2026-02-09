import {createContext, useContext, useState, useEffect, useCallback} from 'react';
import {getFromStorage, saveToStorage} from '../services/storage';

const DEFAULT_HOME_ROWS = [
	{id: 'resume', name: 'Continue Watching', enabled: true, order: 0},
	{id: 'nextup', name: 'Next Up', enabled: true, order: 1},
	{id: 'latest-media', name: 'Latest Media', enabled: true, order: 2},
	{id: 'collections', name: 'Collections', enabled: false, order: 3},
	{id: 'library-tiles', name: 'My Media', enabled: false, order: 4}
];

const defaultSettings = {
	preferTranscode: false,
	maxBitrate: 0,
	audioLanguage: '',
	subtitleLanguage: '',
	// Subtitle Settings
	subtitleSize: 'medium', // small, medium, large, xlarge
	subtitlePosition: 'bottom', // bottom, lower, middle, higher
	subtitleOpacity: 100, // 0-100
	subtitleBackground: 75, // 0-100 (opacity of background)
	subtitleBackgroundColor: '#000000', // Hex color
	subtitleColor: '#ffffff', // Hex color
	subtitleShadowColor: '#000000', // Hex color
	subtitleShadowOpacity: 50, // 0-100
	subtitleShadowBlur: 0.1, // em/px size of shadow
	subtitlePositionAbsolute: 90, // 0-100 (from top)
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
	useMoonfinPlugin: false
};

export {DEFAULT_HOME_ROWS};

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

	return (
		<SettingsContext.Provider value={{
			settings,
			loaded,
			updateSetting,
			updateSettings,
			resetSettings
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
