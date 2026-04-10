import {useCallback, useState, useEffect, useRef} from 'react';
import $L from '@enact/i18n/$L';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import Button from '@enact/sandstone/Button';
import Slider from '@enact/sandstone/Slider';
import {useAuth} from '../../context/AuthContext';
import {useSettings, DEFAULT_HOME_ROWS} from '../../context/SettingsContext';
import {useJellyseerr} from '../../context/JellyseerrContext';
import {useDeviceInfo} from '../../hooks/useDeviceInfo';
import serverLogger from '../../services/serverLogger';
import connectionPool from '../../services/connectionPool';
import {isBackKey} from '../../utils/keys';
import SpottableInput from '../../components/SpottableInput/SpottableInput';
import ClearDataDialog from '../../components/ClearDataDialog';
import {clearAllStorage} from '../../services/storage';

import css from './Settings.module.less';

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');
const ViewContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');

const IconGeneral = () => (
	<svg viewBox='0 0 24 24' fill='currentColor'>
		<path d='M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z' />
	</svg>
);

const IconPlayback = () => (
	<svg viewBox='0 0 24 24' fill='currentColor'>
		<path d='M8 5v14l11-7z' />
	</svg>
);

const IconDisplay = () => (
	<svg viewBox='0 0 24 24' fill='currentColor'>
		<path d='M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z' />
	</svg>
);

const IconAbout = () => (
	<svg viewBox='0 0 24 24' fill='currentColor'>
		<path d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z' />
	</svg>
);

const IconPlugin = () => (
	<svg viewBox='0 0 24 24' fill='currentColor'>
		<path d='M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7s2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z' />
	</svg>
);

const IconChevron = () => (
	<svg viewBox='0 0 24 24' fill='currentColor'>
		<path d='M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z' />
	</svg>
);

const getBaseCategories = () => [
	{ id: 'general', label: $L('General'), description: $L('App behavior, navigation, and home screen'), Icon: IconGeneral },
	{ id: 'playback', label: $L('Playback'), description: $L('Video, audio, and subtitle options'), Icon: IconPlayback },
	{ id: 'display', label: $L('Display'), description: $L('Appearance, theme, and screensaver'), Icon: IconDisplay },
	{ id: 'plugin', label: $L('Plugin'), description: $L('Moonfin plugin and integrations'), Icon: IconPlugin },
	{ id: 'about', label: $L('About'), description: $L('App info and device capabilities'), Icon: IconAbout }
];

const getBitrateOptions = () => [
	{ value: 0, label: $L('Auto (No limit)') },
	{ value: 120000000, label: '120 Mbps' },
	{ value: 80000000, label: '80 Mbps' },
	{ value: 60000000, label: '60 Mbps' },
	{ value: 40000000, label: '40 Mbps' },
	{ value: 20000000, label: '20 Mbps' },
	{ value: 10000000, label: '10 Mbps' },
	{ value: 5000000, label: '5 Mbps' }
];

const getContentTypeOptions = () => [
	{ value: 'both', label: $L('Movies & TV Shows') },
	{ value: 'movies', label: $L('Movies Only') },
	{ value: 'tv', label: $L('TV Shows Only') }
];

const getFeaturedItemCountOptions = () => [
	{ value: 5, label: $L('5 items') },
	{ value: 10, label: $L('10 items') },
	{ value: 15, label: $L('15 items') }
];

const getMediaBarSourceOptions = () => [
	{ value: 'library', label: $L('Libraries') },
	{ value: 'collection', label: $L('Collections') }
];

const getBlurOptions = () => [
	{ value: 0, label: $L('Off') },
	{ value: 10, label: $L('Light') },
	{ value: 20, label: $L('Medium') },
	{ value: 30, label: $L('Strong') },
	{ value: 40, label: $L('Heavy') }
];

const getSubtitleSizeOptions = () => [
	{ value: 'small', label: $L('Small'), fontSize: 36 },
	{ value: 'medium', label: $L('Medium'), fontSize: 44 },
	{ value: 'large', label: $L('Large'), fontSize: 52 },
	{ value: 'xlarge', label: $L('Extra Large'), fontSize: 60 }
];

const getSubtitlePositionOptions = () => [
	{ value: 'bottom', label: $L('Bottom'), offset: 10 },
	{ value: 'lower', label: $L('Lower'), offset: 20 },
	{ value: 'middle', label: $L('Middle'), offset: 30 },
	{ value: 'higher', label: $L('Higher'), offset: 40 },
	{ value: 'absolute', label: $L('Absolute'), offset: 0 }
];

const getSubtitleColorOptions = () => [
	{ value: '#ffffff', label: $L('White') },
	{ value: '#ffff00', label: $L('Yellow') },
	{ value: '#00ffff', label: $L('Cyan') },
	{ value: '#ff00ff', label: $L('Magenta') },
	{ value: '#00ff00', label: $L('Green') },
	{ value: '#ff0000', label: $L('Red') },
	{ value: '#808080', label: $L('Grey') },
	{ value: '#404040', label: $L('Dark Grey') }
];

const getSubtitleShadowColorOptions = () => [
	{ value: '#000000', label: $L('Black') },
	{ value: '#ffffff', label: $L('White') },
	{ value: '#808080', label: $L('Grey') },
	{ value: '#404040', label: $L('Dark Grey') },
	{ value: '#ff0000', label: $L('Red') },
	{ value: '#00ff00', label: $L('Green') },
	{ value: '#0000ff', label: $L('Blue') }
];

const getSubtitleBackgroundColorOptions = () => [
	{ value: '#000000', label: $L('Black') },
	{ value: '#ffffff', label: $L('White') },
	{ value: '#808080', label: $L('Grey') },
	{ value: '#404040', label: $L('Dark Grey') },
	{ value: '#000080', label: $L('Navy') }
];

const getSeekStepOptions = () => [
	{ value: 5, label: $L('5 seconds') },
	{ value: 10, label: $L('10 seconds') },
	{ value: 20, label: $L('20 seconds') },
	{ value: 30, label: $L('30 seconds') }
];

const UI_OPACITY_OPTIONS = [
	{ value: 50, label: '50%' },
	{ value: 65, label: '65%' },
	{ value: 75, label: '75%' },
	{ value: 85, label: '85%' },
	{ value: 95, label: '95%' }
];

const USER_OPACITY_OPTIONS = [
	{ value: 0, label: '0%' },
	{ value: 50, label: '50%' },
	{ value: 65, label: '65%' },
	{ value: 75, label: '75%' },
	{ value: 85, label: '85%' },
	{ value: 95, label: '95%' }
];

const getUiColorOptions = () => [
	{ value: 'gray', label: $L('Gray'), rgb: '128, 128, 128' },
	{ value: 'black', label: $L('Black'), rgb: '0, 0, 0' },
	{ value: 'dark_blue', label: $L('Dark Blue'), rgb: '26, 35, 50' },
	{ value: 'purple', label: $L('Purple'), rgb: '74, 20, 140' },
	{ value: 'teal', label: $L('Teal'), rgb: '0, 105, 92' },
	{ value: 'navy', label: $L('Navy'), rgb: '13, 27, 42' },
	{ value: 'charcoal', label: $L('Charcoal'), rgb: '54, 69, 79' },
	{ value: 'brown', label: $L('Brown'), rgb: '62, 39, 35' },
	{ value: 'dark_red', label: $L('Dark Red'), rgb: '139, 0, 0' },
	{ value: 'dark_green', label: $L('Dark Green'), rgb: '11, 79, 15' },
	{ value: 'slate', label: $L('Slate'), rgb: '71, 85, 105' },
	{ value: 'indigo', label: $L('Indigo'), rgb: '30, 58, 138' }
];

const getScreensaverModeOptions = () => [
	{ value: 'library', label: $L('Library Backdrops') },
	{ value: 'logo', label: $L('Moonfin Logo') }
];

const getScreensaverTimeoutOptions = () => [
	{ value: 30, label: $L('30 seconds') },
	{ value: 60, label: $L('1 minute') },
	{ value: 90, label: $L('90 seconds') },
	{ value: 120, label: $L('2 minutes') },
	{ value: 180, label: $L('3 minutes') },
	{ value: 300, label: $L('5 minutes') }
];

const getScreensaverDimmingOptions = () => [
	{ value: 0, label: $L('Off') },
	{ value: 25, label: '25%' },
	{ value: 50, label: '50%' },
	{ value: 75, label: '75%' },
	{ value: 100, label: '100%' }
];

const getClockDisplayOptions = () => [
	{ value: '12-hour', label: $L('12-Hour') },
	{ value: '24-hour', label: $L('24-Hour') }
];

// Labels intentionally not wrapped with $L() — language names display in their native language regardless of current locale
const LANGUAGE_OPTIONS = [
	{value: 'de', label: 'Deutsch'},
	{value: 'en-US', label: 'English'},
	{value: 'es', label: 'Español'},
	{value: 'fr', label: 'Français'},
	{value: 'pl', label: 'Polski'},
	{value: 'pt-BR', label: 'Português (Brasil)'},
	{value: 'ru', label: 'Русский'}
];

const getNavPositionOptions = () => [
	{ value: 'top', label: $L('Top Bar') },
	{ value: 'left', label: $L('Left Sidebar') }
];

const getWatchedIndicatorOptions = () => [
	{ value: 'always', label: $L('Always') },
	{ value: 'hideCount', label: $L('Hide Unwatched Count') },
	{ value: 'episodesOnly', label: $L('Episodes Only') },
	{ value: 'never', label: $L('Never') }
];

const getPosterSizeOptions = () => [
	{ value: 'small', label: $L('Small') },
	{ value: 'default', label: $L('Default') },
	{ value: 'large', label: $L('Large') },
	{ value: 'xlarge', label: $L('Extra Large') }
];

const getImageTypeOptions = () => [
	{ value: 'poster', label: $L('Poster') },
	{ value: 'backdrop', label: $L('Backdrop') },
	{ value: 'logo', label: $L('Logo') },
	{ value: 'thumb', label: $L('Thumb') }
];

const getUiScaleOptions = () => [
	{ value: 0.85, label: $L('Compact') },
	{ value: 0.9, label: $L('Small') },
	{ value: 0.95, label: $L('Slightly Small') },
	{ value: 1.0, label: $L('Default') },
	{ value: 1.05, label: $L('Slightly Large') },
	{ value: 1.1, label: $L('Large') },
	{ value: 1.15, label: $L('Extra Large') },
	{ value: 1.2, label: $L('Huge') },
	{ value: 1.3, label: $L('Maximum') }
];

const getFocusColorOptions = () => [
	{ value: '#00a4dc', label: $L('Blue') },
	{ value: '#ffffff', label: $L('White') },
	{ value: '#9b59b6', label: $L('Purple') },
	{ value: '#1abc9c', label: $L('Teal') },
	{ value: '#2c3e50', label: $L('Navy') },
	{ value: '#e74c3c', label: $L('Red') },
	{ value: '#2ecc71', label: $L('Green') },
	{ value: '#e67e22', label: $L('Orange') },
	{ value: '#e91e63', label: $L('Pink') },
	{ value: '#f1c40f', label: $L('Yellow') }
];

const getNextUpBehaviorOptions = () => [
	{ value: 'extended', label: $L('Extended') },
	{ value: 'minimal', label: $L('Minimal') },
	{ value: 'disabled', label: $L('Disabled') }
];

const getMediaSegmentActionOptions = () => [
	{ value: 'ask', label: $L('Ask to Skip') },
	{ value: 'auto', label: $L('Auto Skip') },
	{ value: 'none', label: $L("Don't Skip") }
];

const getSeasonalThemeOptions = () => [
	{ value: 'none', label: $L('None') },
	{ value: 'winter', label: $L('Winter') },
	{ value: 'spring', label: $L('Spring') },
	{ value: 'summer', label: $L('Summer') },
	{ value: 'fall', label: $L('Fall') },
	{ value: 'halloween', label: $L('Halloween') }
];

const AGE_RATING_OPTIONS = [
	{ value: 0, label: 'G' },
	{ value: 7, label: 'PG' },
	{ value: 13, label: 'PG-13' },
	{ value: 17, label: 'R' },
	{ value: 18, label: 'NC-17' }
];

const getLabel = (options, value, fallback) => {
	const option = options.find((o) => o.value === value);
	return option?.label || fallback;
};

const renderToggle = (isOn) => (
	<div className={`${css.toggleTrack} ${isOn ? css.toggleOn : ''}`}>
		<div className={css.toggleThumb} />
	</div>
);

const renderRadio = (isSelected) => (
	<div className={`${css.radioOuter} ${isSelected ? css.radioSelected : ''}`}>
		<div className={css.radioInner} />
	</div>
);

const renderChevron = () => (
	<div className={css.chevronIcon}>
		<IconChevron />
	</div>
);

const Settings = ({ onBack, onLibrariesChanged }) => {
	const { api, serverUrl, accessToken, hasMultipleServers, logoutAll } = useAuth();
	const { settings, updateSetting, resetSettings } = useSettings();
	const { capabilities } = useDeviceInfo();
	const jellyseerr = useJellyseerr();
	const isSeerr = jellyseerr.isMoonfin && jellyseerr.variant === 'seerr';
	const seerrLabel = isSeerr ? jellyseerr.displayName || 'Seerr' : 'Jellyseerr';
	const categories = getBaseCategories();

	const [navStack, setNavStack] = useState([{ view: 'categories' }]);
	const currentView = navStack[navStack.length - 1];
	const pendingFocusRef = useRef(null);
	const initialLanguageRef = useRef(settings.uiLanguage || 'en-US');
	const languageChanged = settings.uiLanguage !== initialLanguageRef.current;

	const pushView = useCallback((view) => {
		setNavStack((prev) => [...prev, view]);
	}, []);

	const popView = useCallback(() => {
		setNavStack((prev) => {
			if (prev.length <= 1) {
				onBack?.();
				return prev;
			}
			const popped = prev[prev.length - 1];
			pendingFocusRef.current = popped.returnFocusTo || null;
			return prev.slice(0, -1);
		});
	}, [onBack]);

	const [serverVersion, setServerVersion] = useState(null);
	const [moonfinConnecting, setMoonfinConnecting] = useState(false);
	const [moonfinStatus, setMoonfinStatus] = useState('');
	const [tempHomeRows, setTempHomeRows] = useState([]);
	const [allLibraries, setAllLibraries] = useState([]);
	const [hiddenLibraries, setHiddenLibraries] = useState([]);
	const [libraryLoading, setLibraryLoading] = useState(false);
	const [librarySaving, setLibrarySaving] = useState(false);
	const [serverConfigs, setServerConfigs] = useState([]);
	const [clearDataDialogOpen, setClearDataDialogOpen] = useState(false);

	useEffect(() => {
		const timer = setTimeout(() => {
			if (pendingFocusRef.current) {
				Spotlight.focus(pendingFocusRef.current);
				pendingFocusRef.current = null;
				return;
			}
			const cv = navStack[navStack.length - 1];
			if (cv.view === 'categories') {
				Spotlight.focus('cat-general');
			} else if (cv.view === 'category') {
				const subcats = getSubcategories(cv.id);
				Spotlight.focus(subcats.length > 0 ? `subcat-${subcats[0].id}` : 'category-view');
			} else if (cv.view === 'subcategory') {
				Spotlight.focus('subcategory-view');
			} else if (cv.view === 'options') {
				const idx = cv.options?.findIndex((o) => o.value === settings[cv.settingKey]);
				Spotlight.focus(idx >= 0 ? `opt-${idx}` : 'opt-0');
			} else if (cv.view === 'homeRows') {
				Spotlight.focus('homerows-view');
			} else if (cv.view === 'libraries') {
				Spotlight.focus('libraries-view');
			}
		}, 50);
		return () => clearTimeout(timer);
	}, [navStack]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		const handleKeyDown = (e) => {
			if (isBackKey(e)) {
				if (e.target.tagName === 'INPUT') return;
				e.preventDefault();
				e.stopPropagation();
				popView();
			}
		};
		window.addEventListener('keydown', handleKeyDown, true);
		return () => window.removeEventListener('keydown', handleKeyDown, true);
	}, [popView]);

	useEffect(() => {
		if (serverUrl && accessToken) {
			fetch(`${serverUrl}/System/Info`, {
				headers: { Authorization: `MediaBrowser Token="${accessToken}"` }
			})
				.then((res) => res.json())
				.then((data) => {
					if (data.Version) setServerVersion(data.Version);
				})
				.catch(() => {});
		}
	}, [serverUrl, accessToken]);

	const toggleSetting = useCallback(
		(key) => {
			updateSetting(key, !settings[key]);
			if (key === 'serverLogging') serverLogger.setEnabled(!settings[key]);
		},
		[settings, updateSetting]
	);

	const handleOptionSelect = useCallback(
		(settingKey, value) => {
			updateSetting(settingKey, value);
			popView();
		},
		[updateSetting, popView]
	);

	const handleMoonfinToggle = useCallback(async () => {
		const enabling = !settings.useMoonfinPlugin;
		updateSetting('useMoonfinPlugin', enabling);
		if (enabling) {
			if (!serverUrl || !accessToken) {
				setMoonfinStatus($L('Not connected to a Jellyfin server'));
				return;
			}
			setMoonfinConnecting(true);
			setMoonfinStatus($L('Checking Moonfin plugin...'));
			try {
				const result = await jellyseerr.configureWithMoonfin(serverUrl, accessToken);
				if (result.authenticated) {
					setMoonfinStatus($L('Connected via Moonfin!'));
				} else {
					setMoonfinStatus($L('Moonfin plugin found but no session. Please log in.'));
				}
			} catch (err) {
				setMoonfinStatus(`${$L('Moonfin connection failed:')} ${err.message}`);
			} finally {
				setMoonfinConnecting(false);
			}
		} else {
			jellyseerr.disable();
			setMoonfinStatus('');
		}
	}, [settings.useMoonfinPlugin, updateSetting, serverUrl, accessToken, jellyseerr]);

	const handleJellyseerrDisconnect = useCallback(() => {
		jellyseerr.disable();
		setMoonfinStatus('');
	}, [jellyseerr]);

	const openHomeRows = useCallback(() => {
		setTempHomeRows([...(settings.homeRows || DEFAULT_HOME_ROWS)].sort((a, b) => a.order - b.order));
		pushView({ view: 'homeRows', returnFocusTo: 'setting-homeRows' });
	}, [settings.homeRows, pushView]);

	const saveHomeRows = useCallback(() => {
		updateSetting('homeRows', tempHomeRows);
		popView();
	}, [tempHomeRows, updateSetting, popView]);

	const resetHomeRows = useCallback(() => {
		setTempHomeRows([...DEFAULT_HOME_ROWS]);
	}, []);

	const toggleHomeRow = useCallback((rowId) => {
		setTempHomeRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, enabled: !row.enabled } : row)));
	}, []);

	const moveHomeRowUp = useCallback((rowId) => {
		setTempHomeRows((prev) => {
			const index = prev.findIndex((r) => r.id === rowId);
			if (index <= 0) return prev;
			const newRows = [...prev];
			const temp = newRows[index].order;
			newRows[index].order = newRows[index - 1].order;
			newRows[index - 1].order = temp;
			return newRows.sort((a, b) => a.order - b.order);
		});
	}, []);

	const moveHomeRowDown = useCallback((rowId) => {
		setTempHomeRows((prev) => {
			const index = prev.findIndex((r) => r.id === rowId);
			if (index < 0 || index >= prev.length - 1) return prev;
			const newRows = [...prev];
			const temp = newRows[index].order;
			newRows[index].order = newRows[index + 1].order;
			newRows[index + 1].order = temp;
			return newRows.sort((a, b) => a.order - b.order);
		});
	}, []);

	const openLibraries = useCallback(async () => {
		pushView({ view: 'libraries', returnFocusTo: 'setting-hideLibraries' });
		setLibraryLoading(true);
		try {
			const isUnified = settings.unifiedLibraryMode && hasMultipleServers;
			if (isUnified) {
				const [allLibs, configs] = await Promise.all([
					connectionPool.getAllLibrariesFromAllServers(),
					connectionPool.getUserConfigFromAllServers()
				]);
				const libs = allLibs.filter((lib) => lib.CollectionType);
				setAllLibraries(libs);
				setServerConfigs(configs);
				const allExcludes = configs.reduce((acc, cfg) => acc.concat(cfg.configuration?.MyMediaExcludes || []), []);
				setHiddenLibraries([...new Set(allExcludes)]);
			} else {
				const [viewsResult, userData] = await Promise.all([api.getAllLibraries(), api.getUserConfiguration()]);
				const libs = (viewsResult.Items || []).filter((lib) => lib.CollectionType);
				setAllLibraries(libs);
				setHiddenLibraries([...(userData.Configuration?.MyMediaExcludes || [])]);
			}
		} catch (err) {
			console.error('Failed to load libraries:', err);
		} finally {
			setLibraryLoading(false);
		}
	}, [api, settings.unifiedLibraryMode, hasMultipleServers, pushView]);

	const toggleLibraryVisibility = useCallback((libraryId) => {
		setHiddenLibraries((prev) => {
			if (prev.includes(libraryId)) return prev.filter((id) => id !== libraryId);
			return [...prev, libraryId];
		});
	}, []);

	const saveLibraryVisibility = useCallback(async () => {
		setLibrarySaving(true);
		try {
			const isUnified = settings.unifiedLibraryMode && hasMultipleServers;
			if (isUnified) {
				const serverExcludes = {};
				for (const lib of allLibraries) {
					const key = lib._serverUrl;
					if (!serverExcludes[key]) serverExcludes[key] = [];
					if (hiddenLibraries.includes(lib.Id)) serverExcludes[key].push(lib.Id);
				}
				const savePromises = serverConfigs.map((cfg) => {
					const excludes = serverExcludes[cfg.serverUrl] || [];
					const updatedConfig = { ...cfg.configuration, MyMediaExcludes: excludes };
					return connectionPool.updateUserConfigOnServer(cfg.serverUrl, cfg.accessToken, cfg.userId, updatedConfig);
				});
				await Promise.all(savePromises);
			} else {
				const userData = await api.getUserConfiguration();
				const updatedConfig = { ...userData.Configuration, MyMediaExcludes: hiddenLibraries };
				await api.updateUserConfiguration(updatedConfig);
			}
			popView();
			setAllLibraries([]);
			setHiddenLibraries([]);
			setServerConfigs([]);
			onLibrariesChanged?.();
			window.dispatchEvent(new window.Event('moonfin:browseRefresh'));
		} catch (err) {
			console.error('Failed to save library visibility:', err);
		} finally {
			setLibrarySaving(false);
		}
	}, [
		api,
		hiddenLibraries,
		allLibraries,
		serverConfigs,
		settings.unifiedLibraryMode,
		hasMultipleServers,
		onLibrariesChanged,
		popView
	]);

	const handleListFocus = useCallback((e) => {
		if (e.target) e.target.scrollIntoView({block: 'nearest'});
	}, []);

	const renderSectionTitle = (title) => <div className={css.sectionTitle}>{title}</div>;

	const renderOptionItem = (settingKey, title, options, fallback) => (
		<SpottableDiv
			className={css.listItem}
			onClick={() => pushView({ view: 'options', title, options, settingKey, returnFocusTo: `setting-${settingKey}` })}
			spotlightId={`setting-${settingKey}`}
		>
			<div className={css.listItemBody}>
				<div className={css.listItemHeading}>{title}</div>
				<div className={css.listItemCaption}>{getLabel(options, settings[settingKey], fallback)}</div>
			</div>
			<div className={css.listItemTrailing}>{renderChevron()}</div>
		</SpottableDiv>
	);

	const renderToggleItem = (settingKey, title, desc) => (
		<SpottableDiv
			className={css.listItem}
			onClick={() => toggleSetting(settingKey)}
			spotlightId={`setting-${settingKey}`}
		>
			<div className={css.listItemBody}>
				<div className={css.listItemHeading}>{title}</div>
				{desc && <div className={css.listItemCaption}>{desc}</div>}
			</div>
			<div className={css.listItemTrailing}>{renderToggle(settings[settingKey])}</div>
		</SpottableDiv>
	);

	const renderNavItem = (id, title, desc, onClick) => (
		<SpottableDiv className={css.listItem} onClick={onClick} spotlightId={`setting-${id}`}>
			<div className={css.listItemBody}>
				<div className={css.listItemHeading}>{title}</div>
				{desc && <div className={css.listItemCaption}>{desc}</div>}
			</div>
			<div className={css.listItemTrailing}>{renderChevron()}</div>
		</SpottableDiv>
	);

	const renderInfoItem = (id, label, value) => (
		<SpottableDiv className={css.listItem} spotlightId={`info-${id}`}>
			<div className={css.listItemBody}>
				<div className={css.listItemHeading}>{label}</div>
			</div>
			<div className={css.listItemValue}>{value}</div>
		</SpottableDiv>
	);

	const renderSliderItem = (settingKey, title, min, max, step, format) => (
		<div className={css.sliderContainer}>
			<div className={css.sliderLabel}>
				<span className={css.sliderTitle}>{title}</span>
				<span className={css.sliderValue}>{format ? format(settings[settingKey]) : settings[settingKey]}</span>
			</div>
			<Slider
				min={min}
				max={max}
				step={step}
				value={settings[settingKey]}
				onChange={(e) => updateSetting(settingKey, e.value)}
				className={css.settingsSlider}
				tooltip={false}
				spotlightId={`setting-${settingKey}`}
			/>
		</div>
	);

	const renderGeneralApplication = () => (
		<>
			{/* Fallback 'English' is intentionally not wrapped with $L() — it matches the raw stored value, not a translated display string */}
			{renderOptionItem('uiLanguage', $L('Language'), LANGUAGE_OPTIONS, 'English')}
			{languageChanged && (
				<div className={css.listItem}>
					<div className={css.listItemBody}>
						<div className={css.listItemCaption}>{$L('Restart the app to apply the new language')}</div>
					</div>
				</div>
			)}
			{renderOptionItem('clockDisplay', $L('Clock Display'), getClockDisplayOptions(), $L('24-Hour'))}
			{renderToggleItem('showClock', $L('Show Clock'), $L('Show or hide clock on home screen'))}
			{renderToggleItem('autoLogin', $L('Auto Login'), $L('Automatically sign in on app launch'))}
			{renderOptionItem('watchedIndicatorBehavior', $L('Watched Indicators'), getWatchedIndicatorOptions(), $L('Always'))}
		</>
	);

	const renderGeneralMultiServer = () => (
		<>
			{renderToggleItem(
				'unifiedLibraryMode',
				$L('Unified Library Mode'),
				$L('Combine content from all servers into a single view')
			)}
		</>
	);

	const renderGeneralNavbar = () => (
		<>
			{renderOptionItem('navbarPosition', $L('Navigation Style'), getNavPositionOptions(), $L('Top Bar'))}
			{renderToggleItem('showShuffleButton', $L('Show Shuffle Button'), $L('Show shuffle button in navigation bar'))}
			{settings.showShuffleButton &&
				renderOptionItem('shuffleContentType', $L('Shuffle Content Type'), getContentTypeOptions(), $L('Movies & TV Shows'))}
			{renderToggleItem('showGenresButton', $L('Show Genres Button'), $L('Show genres button in navigation bar'))}
			{renderToggleItem('showFavoritesButton', $L('Show Favorites Button'), $L('Show favorites button in navigation bar'))}
			{renderToggleItem(
				'showLibrariesInToolbar',
				$L('Show Libraries in Toolbar'),
				$L('Show library shortcuts in navigation bar')
			)}
		</>
	);

	const renderGeneralHomeScreen = () => (
		<>
			{renderToggleItem(
				'mergeContinueWatchingNextUp',
				$L('Merge Continue Watching & Next Up'),
				$L('Combine into a single row')
			)}
			{renderToggleItem(
				'useSeriesThumbnails',
				$L('Use Series Thumbnails'),
				$L('Show series artwork instead of individual episode images')
			)}
			{renderOptionItem('homeRowsPosterSize', $L('Poster Size'), getPosterSizeOptions(), $L('Default'))}
			{renderOptionItem('homeRowsImageType', $L('Image Type'), getImageTypeOptions(), $L('Poster'))}
			{renderNavItem('homeRows', $L('Configure Home Rows'), $L('Customize which rows appear on home screen'), openHomeRows)}
			{renderNavItem(
				'hideLibraries',
				$L('Hide Libraries'),
				$L('Choose which libraries to hide (syncs across all clients)'),
				openLibraries
			)}
		</>
	);

	const renderPlaybackVideo = () => (
		<>
			{renderOptionItem('introAction', $L('Intro Action'), getMediaSegmentActionOptions(), $L('Ask to Skip'))}
			{renderOptionItem('outroAction', $L('Outro Action'), getMediaSegmentActionOptions(), $L('Ask to Skip'))}
			{renderToggleItem('autoPlay', $L('Auto Play Next'), $L('Automatically play the next episode'))}
			{renderOptionItem('maxBitrate', $L('Maximum Bitrate'), getBitrateOptions(), $L('Auto (No limit)'))}
			{renderOptionItem('seekStep', $L('Seek Step'), getSeekStepOptions(), $L('10 seconds'))}
			{renderSliderItem('skipForwardLength', $L('Skip Forward Length'), 5, 30, 5, (v) => `${v}s`)}
			{renderSliderItem('unpauseRewind', $L('Unpause Rewind'), 0, 10, 1, (v) => (v === 0 ? $L('Off') : `${v}s`))}
			{renderToggleItem('showDescriptionOnPause', $L('Show Description on Pause'), $L('Display item description when paused'))}
			{renderToggleItem('stereoUpmixEnabled', $L('Stereo to Surround Upmix'), $L('Upmix stereo audio to 5.1 surround via server transcoding'))}
			<div className={css.divider} />
			{renderToggleItem('preferTranscode', $L('Prefer Transcoding'), $L('Request transcoded streams when available'))}
			{renderToggleItem(
				'forceDirectPlay',
				$L('Force Direct Play'),
				$L('Skip codec checks and always attempt DirectPlay (debug)')
			)}
		</>
	);

	const renderPlaybackSubtitles = () => (
		<>
			{renderOptionItem('subtitleSize', $L('Subtitle Size'), getSubtitleSizeOptions(), $L('Medium'))}
			{renderOptionItem('subtitlePosition', $L('Subtitle Position'), getSubtitlePositionOptions(), $L('Bottom'))}
			{settings.subtitlePosition === 'absolute' &&
				renderSliderItem('subtitlePositionAbsolute', $L('Absolute Position'), 0, 100, 5, (v) => `${v}%`)}
			{renderSliderItem('subtitleOpacity', $L('Text Opacity'), 0, 100, 5, (v) => `${v}%`)}
			{renderOptionItem('subtitleColor', $L('Text Color'), getSubtitleColorOptions(), $L('White'))}
			<div className={css.divider} />
			{renderOptionItem('subtitleShadowColor', $L('Shadow Color'), getSubtitleShadowColorOptions(), $L('Black'))}
			{renderSliderItem('subtitleShadowOpacity', $L('Shadow Opacity'), 0, 100, 5, (v) => `${v}%`)}
			{renderSliderItem('subtitleShadowBlur', $L('Shadow Size (Blur)'), 0, 1, 0.1, (v) => (v || 0.1).toFixed(1))}
			<div className={css.divider} />
			{renderOptionItem('subtitleBackgroundColor', $L('Background Color'), getSubtitleBackgroundColorOptions(), $L('Black'))}
			{renderSliderItem('subtitleBackground', $L('Background Opacity'), 0, 100, 5, (v) => `${v}%`)}
			<div className={css.divider} />
			{renderToggleItem('enablePgsRendering', $L('Direct Play PGS Subtitles'), $L('Use client-side rendering for bitmap subtitles (PGS, DVB, DVD)'))}
		</>
	);

	const renderDisplayBackdrop = () => (
		<>
			{renderToggleItem(
				'showHomeBackdrop',
				$L('Home Row Backdrops'),
				$L('Show background art when browsing rows on the home screen')
			)}
			{renderOptionItem('backdropBlurHome', $L('Home Backdrop Blur'), getBlurOptions(), $L('Medium'))}
			{renderOptionItem('backdropBlurDetail', $L('Details Backdrop Blur'), getBlurOptions(), $L('Medium'))}
		</>
	);

	const renderDisplayUI = () => (
		<>
			{renderOptionItem('uiScale', $L('UI Scale'), getUiScaleOptions(), $L('Default'))}
			{renderOptionItem('uiOpacity', $L('UI Opacity'), UI_OPACITY_OPTIONS, '85%')}
			{renderOptionItem('userOpacity', $L('User Avatar Opacity'), USER_OPACITY_OPTIONS, '85%')}
			{renderOptionItem('uiColor', $L('UI Color'), getUiColorOptions(), $L('Gray'))}
			{renderOptionItem('focusColor', $L('Focus Color'), getFocusColorOptions(), $L('Blue'))}
			{renderToggleItem('cardFocusZoom', $L('Card Focus Zoom'), $L('Slightly enlarge cards when focused'))}
		</>
	);

	const renderDisplayFeatured = () => (
		<>
			{renderToggleItem('showFeaturedBar', $L('Show Featured Bar'), $L('Display the featured media bar on home screen'))}
			{renderOptionItem('featuredContentType', $L('Content Type'), getContentTypeOptions(), $L('Movies & TV Shows'))}
			{renderOptionItem('featuredItemCount', $L('Item Count'), getFeaturedItemCountOptions(), $L('10 items'))}
			{renderOptionItem('mediaBarSourceType', $L('Source'), getMediaBarSourceOptions(), $L('Libraries'))}
			{renderToggleItem(
				'featuredTrailerPreview',
				$L('Trailer Preview'),
				$L('Automatically play trailer previews in the featured media bar')
			)}
			{settings.featuredTrailerPreview &&
				renderToggleItem('featuredTrailerMuted', $L('Mute Trailers'), $L('Mute trailer previews in the featured media bar'))}
		</>
	);

	const renderPlaybackNextUp = () => (
		<>
			{renderOptionItem('nextUpBehavior', $L('Next Up Behavior'), getNextUpBehaviorOptions(), $L('Extended'))}
			{settings.nextUpBehavior !== 'disabled' &&
				renderSliderItem('nextUpTimeout', $L('Countdown Timer'), 0, 30, 1, (v) => (v === 0 ? $L('Instant') : `${v}s`))}
		</>
	);

	const renderDisplayThemes = () => (
		<>
			{renderOptionItem('seasonalTheme', $L('Seasonal Effect'), getSeasonalThemeOptions(), $L('None'))}
			{renderToggleItem('themeMusicEnabled', $L('Theme Music'), $L('Play background music on detail pages'))}
			{settings.themeMusicEnabled &&
				renderSliderItem('themeMusicVolume', $L('Theme Music Volume'), 0, 100, 5, (v) => `${v}%`)}
			{settings.themeMusicEnabled &&
				renderToggleItem(
					'themeMusicOnHomeRows',
					$L('Theme Music on Home Rows'),
					$L('Play theme music when browsing home screen items')
				)}
		</>
	);

	const renderDisplayScreensaver = () => (
		<>
			{renderToggleItem(
				'screensaverEnabled',
				$L('Enable Screensaver'),
				$L('Reduce brightness after inactivity to prevent screen burn-in')
			)}
			{settings.screensaverEnabled &&
				renderOptionItem('screensaverMode', $L('Screensaver Type'), getScreensaverModeOptions(), $L('Library Backdrops'))}
			{settings.screensaverEnabled &&
				renderOptionItem('screensaverTimeout', $L('Timeout'), getScreensaverTimeoutOptions(), $L('90 seconds'))}
			{settings.screensaverEnabled &&
				renderOptionItem('screensaverDimmingLevel', $L('Dimming Level'), getScreensaverDimmingOptions(), '50%')}
			{settings.screensaverEnabled &&
				renderToggleItem('screensaverShowClock', $L('Show Clock'), $L('Display a moving clock during screensaver'))}
			{settings.screensaverEnabled &&
				renderToggleItem('screensaverAgeFilter', $L('Age Rating Filter'), $L('Only show age-appropriate backdrops'))}
			{settings.screensaverEnabled &&
				settings.screensaverAgeFilter &&
				renderOptionItem('screensaverMaxRating', $L('Max Rating'), AGE_RATING_OPTIONS, 'PG-13')}
		</>
	);

	const renderPluginMoonfin = () => (
		<>
			<SpottableDiv className={css.listItem} onClick={handleMoonfinToggle} spotlightId='setting-useMoonfinPlugin'>
				<div className={css.listItemBody}>
					<div className={css.listItemHeading}>{$L('Enable Plugin')}</div>
					<div className={css.listItemCaption}>{$L('Connect for ratings, sync, and {seerrLabel} proxy').replace('{seerrLabel}', seerrLabel)}</div>
				</div>
				<div className={css.listItemTrailing}>{renderToggle(settings.useMoonfinPlugin)}</div>
			</SpottableDiv>
			{settings.useMoonfinPlugin && moonfinStatus && <div className={css.statusMessage}>{moonfinStatus}</div>}
			{!settings.useMoonfinPlugin && (
				<div className={css.authHint}>
					{$L('Enable the Moonfin plugin to access ratings, settings sync, and {seerrLabel} proxy features. The plugin must be installed on your Jellyfin server.').replace('{seerrLabel}', seerrLabel)}
				</div>
			)}
		</>
	);

	const renderPluginStatus = () => {
		const info = jellyseerr.pluginInfo;
		return (
			<>
				{renderInfoItem('pluginVersion', $L('Plugin Version'), info?.version || $L('Unknown'))}
				{renderInfoItem('settingsSync', $L('Settings Sync'), info?.settingsSyncEnabled ? $L('Available') : $L('Not Available'))}
				{renderInfoItem('seerrStatus', seerrLabel, info?.jellyseerrEnabled ? $L('Enabled by Admin') : $L('Disabled by Admin'))}
				{isSeerr && renderInfoItem('seerrVariant', $L('Detected Variant'), $L('{seerrLabel} (Seerr v3+)').replace('{seerrLabel}', seerrLabel))}
			</>
		);
	};

	const renderPluginMDBList = () => (
		<>
			{renderToggleItem('mdblistEnabled', $L('Enable Ratings'), $L('Show MDBList ratings on media details and featured bar'))}
			{settings.mdblistEnabled &&
				renderToggleItem('showRatingLabels', $L('Show Rating Labels'), $L('Display source names below rating scores'))}
		</>
	);

	const renderPluginTMDB = () => (
		<>{renderToggleItem('tmdbEpisodeRatingsEnabled', $L('Episode Ratings'), $L('Show TMDB ratings on individual episodes'))}</>
	);

	const renderPluginSeerr = () => (
		<>
			{jellyseerr.isEnabled && jellyseerr.isAuthenticated && jellyseerr.isMoonfin ? (
				<>
					{renderInfoItem('seerrConnStatus', $L('Status'), $L('Connected via Moonfin'))}
					{jellyseerr.serverUrl && renderInfoItem('seerrUrl', $L('{seerrLabel} URL').replace('{seerrLabel}', seerrLabel), jellyseerr.serverUrl)}
					{jellyseerr.user && renderInfoItem('seerrUser', $L('User'), jellyseerr.user.displayName || $L('Moonfin User'))}
					<div className={css.actionBarInline}>
						<SpottableButton
							className={`${css.actionButton} ${css.dangerButton}`}
							onClick={handleJellyseerrDisconnect}
							spotlightId='jellyseerr-disconnect'
						>
							{$L('Disconnect')}
						</SpottableButton>
					</div>
				</>
			) : (
				<div className={css.authHint}>
					{$L('{seerrLabel} connection is managed through the Moonfin plugin. Log in above if prompted.').replace('{seerrLabel}', seerrLabel)}
				</div>
			)}
		</>
	);

	const renderAboutApp = () => (
		<>
			{renderInfoItem('appVersion', $L('App Version'), process.env.REACT_APP_VERSION || '0.0.0')}
			{renderInfoItem(
				'platform',
				$L('Platform'),
				capabilities?.tizenVersionDisplay ? 'Tizen' : capabilities?.webosVersionDisplay ? 'webOS' : $L('Unknown')
			)}
		</>
	);

	const renderAboutServer = () => (
		<>
			{renderInfoItem('serverUrl', $L('Server URL'), serverUrl || $L('Not connected'))}
			{renderInfoItem('serverVersion', $L('Server Version'), serverVersion || $L('Loading...'))}
		</>
	);

	const renderAboutDebugging = () => (
		<>{renderToggleItem('serverLogging', $L('Server Logging'), $L('Send logs to Jellyfin server for troubleshooting'))}</>
	);

	const handleClearAllData = useCallback(async () => {
		setClearDataDialogOpen(false);
		resetSettings();
		await clearAllStorage();
		await logoutAll();
	}, [resetSettings, logoutAll]);

	const renderAboutData = () => (
		<>
			<div className={css.viewDescription}>Remove all saved servers, login sessions, and settings. The app will restart as if freshly installed.</div>
			<div className={css.actionBarInline}>
				<SpottableButton
					className={`${css.actionButton} ${css.dangerButton}`}
					onClick={() => setClearDataDialogOpen(true)}
					spotlightId='clear-all-data'
				>
					Clear All Data
				</SpottableButton>
			</div>
		</>
	);

	const renderAboutDevice = () => (
		<>
			{renderInfoItem('model', $L('Model'), capabilities?.modelName || $L('Unknown'))}
			{(capabilities?.tizenVersionDisplay || capabilities?.webosVersionDisplay) &&
				renderInfoItem(
					'osVersion',
					capabilities.tizenVersionDisplay ? $L('Tizen Version') : $L('webOS Version'),
					capabilities.tizenVersionDisplay || capabilities.webosVersionDisplay
				)}
			{capabilities?.firmwareVersion && renderInfoItem('firmware', $L('Firmware'), capabilities.firmwareVersion)}
			{renderInfoItem(
				'resolution',
				$L('Resolution'),
				`${capabilities?.uhd8K ? '7680x4320 (8K)' : capabilities?.uhd ? '3840x2160 (4K)' : '1920x1080 (HD)'}${capabilities?.oled ? ' OLED' : ''}`
			)}
		</>
	);

	const renderAboutCapabilities = () => (
		<>
			{renderInfoItem(
				'hdr',
				'HDR',
				[
					capabilities?.hdr10 && 'HDR10',
					capabilities?.hdr10Plus && 'HDR10+',
					capabilities?.hlg && 'HLG',
					capabilities?.dolbyVision && 'Dolby Vision'
				]
					.filter(Boolean)
					.join(', ') || $L('Not supported')
			)}
			{renderInfoItem(
				'videoCodecs',
				$L('Video Codecs'),
				['H.264', capabilities?.hevc && 'HEVC', capabilities?.vp9 && 'VP9', capabilities?.av1 && 'AV1']
					.filter(Boolean)
					.join(', ')
			)}
			{renderInfoItem(
				'audioCodecs',
				$L('Audio Codecs'),
				[
					'AAC',
					capabilities?.ac3 && 'AC3',
					capabilities?.eac3 && 'E-AC3',
					capabilities?.dts && 'DTS',
					capabilities?.dolbyAtmos && 'Atmos'
				]
					.filter(Boolean)
					.join(', ')
			)}
			{renderInfoItem(
				'containers',
				$L('Containers'),
				['MP4', capabilities?.mkv && 'MKV', 'TS', capabilities?.webm && 'WebM', capabilities?.asf && 'ASF']
					.filter(Boolean)
					.join(', ')
			)}
		</>
	);

	const getSubcategories = (catId) => {
		const info = jellyseerr.pluginInfo;
		const isConnected = settings.useMoonfinPlugin && info;
		switch (catId) {
			case 'general': {
				const subs = [{ id: 'application', label: $L('Application'), description: $L('Clock, auto login') }];
				if (hasMultipleServers) {
					subs.push({ id: 'multiServer', label: $L('Multi-Server'), description: $L('Unified library settings') });
				}
				subs.push(
					{ id: 'navbar', label: $L('Navigation Bar'), description: $L('Style, buttons, and shortcuts') },
					{ id: 'homeScreen', label: $L('Home Screen'), description: $L('Rows and library visibility') }
				);
				return subs;
			}
			case 'playback':
				return [
					{ id: 'video', label: $L('Video'), description: $L('Playback, bitrate, and seeking') },
					{ id: 'nextUp', label: $L('Next Up'), description: $L('Auto-play and next episode prompt') },
					{ id: 'subtitles', label: $L('Subtitles'), description: $L('Size, position, color, and background') }
				];
			case 'display':
				return [
					{ id: 'backdrop', label: $L('Backdrop'), description: $L('Background art and blur') },
					{ id: 'uiElements', label: $L('UI Elements'), description: $L('Opacity, color, and avatar') },
					{ id: 'featuredBar', label: $L('Featured Media Bar'), description: $L('Featured content and trailers') },
					{ id: 'themes', label: $L('Themes & Effects'), description: $L('Seasonal effects and theme music') },
					{ id: 'screensaver', label: $L('Screensaver'), description: $L('Burn-in protection') }
				];
			case 'plugin': {
				const subs = [{ id: 'moonfinPlugin', label: $L('Moonfin Plugin'), description: $L('Plugin connection and login') }];
				if (isConnected) {
					subs.push(
						{ id: 'pluginStatus', label: $L('Plugin Status'), description: $L('Version and sync info') },
						{ id: 'mdblistRatings', label: $L('MDBList Ratings'), description: $L('Rating display settings') },
						{ id: 'tmdb', label: 'TMDB', description: $L('Episode rating settings') },
						{ id: 'seerr', label: seerrLabel, description: $L('{seerrLabel} connection status').replace('{seerrLabel}', seerrLabel) }
					);
				}
				return subs;
			}
			case 'about': {
				const subs = [
					{ id: 'appInfo', label: $L('Application'), description: $L('Version and platform') },
					{ id: 'serverInfo', label: $L('Server'), description: $L('Connection and version') },
					{ id: 'debugging', label: $L('Debugging'), description: $L('Logging options') }
				];
				if (capabilities) {
					subs.push(
						{ id: 'device', label: $L('Device'), description: $L('Model and hardware info') },
						{ id: 'capabilities', label: $L('Capabilities'), description: $L('Supported formats and codecs') }
					);
				}
				subs.push({ id: 'data', label: 'Data', description: 'Storage and reset' });
				return subs;
			}
			default:
				return [];
		}
	};

	const getSubcategoryContent = (categoryId, subcategoryId) => {
		const key = `${categoryId}.${subcategoryId}`;
		switch (key) {
			case 'general.application':
				return renderGeneralApplication();
			case 'general.multiServer':
				return renderGeneralMultiServer();
			case 'general.navbar':
				return renderGeneralNavbar();
			case 'general.homeScreen':
				return renderGeneralHomeScreen();
			case 'playback.video':
				return renderPlaybackVideo();
			case 'playback.nextUp':
				return renderPlaybackNextUp();
			case 'playback.subtitles':
				return renderPlaybackSubtitles();
			case 'display.backdrop':
				return renderDisplayBackdrop();
			case 'display.uiElements':
				return renderDisplayUI();
			case 'display.featuredBar':
				return renderDisplayFeatured();
			case 'display.themes':
				return renderDisplayThemes();
			case 'display.screensaver':
				return renderDisplayScreensaver();
			case 'plugin.moonfinPlugin':
				return renderPluginMoonfin();
			case 'plugin.pluginStatus':
				return renderPluginStatus();
			case 'plugin.mdblistRatings':
				return renderPluginMDBList();
			case 'plugin.tmdb':
				return renderPluginTMDB();
			case 'plugin.seerr':
				return renderPluginSeerr();
			case 'about.appInfo':
				return renderAboutApp();
			case 'about.serverInfo':
				return renderAboutServer();
			case 'about.debugging':
				return renderAboutDebugging();
			case 'about.device':
				return renderAboutDevice();
			case 'about.capabilities':
				return renderAboutCapabilities();
			case 'about.data':
				return renderAboutData();
			default:
				return null;
		}
	};

	const renderCategoriesView = () => (
		<ViewContainer className={css.viewContainer} spotlightId='categories-view'>
			<div className={css.listContent} onFocus={handleListFocus}>
				<div className={css.listInner}>
					{renderSectionTitle($L('Settings'))}
					{categories.map((cat) => (
						<SpottableDiv
							key={cat.id}
							className={css.listItem}
							onClick={() => pushView({ view: 'category', id: cat.id, returnFocusTo: `cat-${cat.id}` })}
							spotlightId={`cat-${cat.id}`}
						>
							<div className={css.listItemIcon}>
								<cat.Icon />
							</div>
							<div className={css.listItemBody}>
								<div className={css.listItemHeading}>{cat.label}</div>
								<div className={css.listItemCaption}>{cat.description}</div>
							</div>
							<div className={css.listItemTrailing}>{renderChevron()}</div>
						</SpottableDiv>
					))}
				</div>
			</div>
		</ViewContainer>
	);

	const renderCategoryView = () => {
		const catId = currentView.id;
		const cat = categories.find((c) => c.id === catId);
		const subcats = getSubcategories(catId);
		return (
			<ViewContainer className={css.viewContainer} spotlightId='category-view'>
				<div className={css.listContent} onFocus={handleListFocus}>
					<div className={css.listInner}>
						{renderSectionTitle(cat?.label || $L('Settings'))}
						{subcats.map((sub) => (
							<SpottableDiv
								key={sub.id}
								className={css.listItem}
								onClick={() =>
									pushView({
										view: 'subcategory',
										categoryId: catId,
										subcategoryId: sub.id,
										label: sub.label,
										returnFocusTo: `subcat-${sub.id}`
									})
								}
								spotlightId={`subcat-${sub.id}`}
							>
								<div className={css.listItemBody}>
									<div className={css.listItemHeading}>{sub.label}</div>
									{sub.description && <div className={css.listItemCaption}>{sub.description}</div>}
								</div>
								<div className={css.listItemTrailing}>{renderChevron()}</div>
							</SpottableDiv>
						))}
					</div>
				</div>
			</ViewContainer>
		);
	};

	const renderOptionsView = () => {
		const { title, options, settingKey } = currentView;
		const currentValue = settings[settingKey];
		return (
			<ViewContainer className={css.viewContainer} spotlightId='options-view'>
				<div className={css.listContent} onFocus={handleListFocus}>
					<div className={css.listInner}>
						{renderSectionTitle(title)}
						{options.map((opt, idx) => (
							<SpottableDiv
								key={String(opt.value)}
								className={`${css.listItem} ${opt.value === currentValue ? css.listItemSelected : ''}`}
								onClick={() => handleOptionSelect(settingKey, opt.value)}
								spotlightId={`opt-${idx}`}
							>
								<div className={css.listItemBody}>
									<div className={css.listItemHeading}>{opt.label}</div>
								</div>
								<div className={css.listItemTrailing}>{renderRadio(opt.value === currentValue)}</div>
							</SpottableDiv>
						))}
					</div>
				</div>
			</ViewContainer>
		);
	};

	const renderSubcategoryView = () => {
		const { categoryId, subcategoryId, label } = currentView;
		return (
			<ViewContainer className={css.viewContainer} spotlightId='subcategory-view'>
				<div className={css.listContent} onFocus={handleListFocus}>
					<div className={css.listInner}>
						{renderSectionTitle(label || $L('Settings'))}
						{getSubcategoryContent(categoryId, subcategoryId)}
					</div>
				</div>
			</ViewContainer>
		);
	};

	const renderHomeRowsView = () => (
		<ViewContainer className={css.viewContainer} spotlightId='homerows-view'>
			<div className={css.listContent} onFocus={handleListFocus}>
				<div className={css.listInner}>
					{renderSectionTitle($L('Configure Home Rows'))}
					<div className={css.viewDescription}>
						{$L('Enable/disable and reorder the rows that appear on your home screen.')}
					</div>
					{tempHomeRows.map((row, index) => (
						<div key={row.id} className={css.homeRowItem}>
							<SpottableDiv
								className={css.listItem}
								onClick={() => toggleHomeRow(row.id)}
								spotlightId={`homerow-${row.id}`}
							>
								<div className={css.listItemBody}>
									<div className={css.listItemHeading}>{$L(row.name)}</div>
								</div>
								<div className={css.listItemTrailing}>{renderToggle(row.enabled)}</div>
							</SpottableDiv>
							<div className={css.homeRowControls}>
								<Button
									onClick={() => moveHomeRowUp(row.id)}
									disabled={index === 0}
									size='small'
									icon='arrowlargeup'
									spotlightId={`homerow-up-${row.id}`}
								/>
								<Button
									onClick={() => moveHomeRowDown(row.id)}
									disabled={index === tempHomeRows.length - 1}
									size='small'
									icon='arrowlargedown'
									spotlightId={`homerow-down-${row.id}`}
								/>
							</div>
						</div>
					))}
					<div className={css.actionBar}>
						<Button onClick={resetHomeRows} size='small' spotlightId='homerow-reset'>
							{$L('Reset to Default')}
						</Button>
						<Button onClick={saveHomeRows} size='small' spotlightId='homerow-save'>
							{$L('Save')}
						</Button>
					</div>
				</div>
			</div>
		</ViewContainer>
	);

	const isUnifiedModal = settings.unifiedLibraryMode && hasMultipleServers;

	const renderLibrariesView = () => (
		<ViewContainer className={css.viewContainer} spotlightId='libraries-view'>
			<div className={css.listContent} onFocus={handleListFocus}>
				<div className={css.listInner}>
					{renderSectionTitle($L('Hide Libraries'))}
					<div className={css.viewDescription}>
						{$L('Hidden libraries are removed from all Jellyfin clients. This is a server-level setting.')}
					</div>
					{libraryLoading ? (
						<div className={css.loadingMessage}>{$L('Loading libraries...')}</div>
					) : (
						allLibraries.map((lib) => {
							const isHidden = hiddenLibraries.includes(lib.Id);
							return (
								<SpottableDiv
									key={`${lib._serverUrl || 'local'}-${lib.Id}`}
									className={css.listItem}
									onClick={() => toggleLibraryVisibility(lib.Id)}
									spotlightId={`lib-${lib.Id}`}
								>
									<div className={css.listItemBody}>
										<div className={css.listItemHeading}>
											{lib.Name}
											{isUnifiedModal && lib._serverName ? ` (${lib._serverName})` : ''}
										</div>
										<div className={css.listItemCaption}>{isHidden ? $L('Hidden') : $L('Visible')}</div>
									</div>
									<div className={css.listItemTrailing}>{renderToggle(!isHidden)}</div>
								</SpottableDiv>
							);
						})
					)}
					{!libraryLoading && (
						<div className={css.actionBar}>
							<Button onClick={popView} size='small' spotlightId='lib-cancel'>
								{$L('Cancel')}
							</Button>
							<Button onClick={saveLibraryVisibility} size='small' disabled={librarySaving} spotlightId='lib-save'>
								{librarySaving ? $L('Saving...') : $L('Save')}
							</Button>
						</div>
					)}
				</div>
			</div>
		</ViewContainer>
	);

	return (
		<div className={css.page}>
			{currentView.view === 'categories' && renderCategoriesView()}
			{currentView.view === 'category' && renderCategoryView()}
			{currentView.view === 'subcategory' && renderSubcategoryView()}
			{currentView.view === 'options' && renderOptionsView()}
			{currentView.view === 'homeRows' && renderHomeRowsView()}
			{currentView.view === 'libraries' && renderLibrariesView()}
			<ClearDataDialog
				open={clearDataDialogOpen}
				onCancel={() => setClearDataDialogOpen(false)}
				onConfirm={handleClearAllData}
			/>
		</div>
	);
};

export default Settings;
