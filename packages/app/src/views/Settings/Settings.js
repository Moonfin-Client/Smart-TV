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
import ClearDataDialog from '../../components/ClearDataDialog';
import {clearAllStorage} from '../../services/storage';
import {MATERIAL_ICON_URLS} from './materialIconMap';

import css from './Settings.module.less';

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');
const ViewContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-only'}, 'div');

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

const MATERIAL_ICON_NAME_MAP = {
	alert02: 'warning',
	appscontents: 'view_carousel',
	arrowlargedown: 'vertical_align_bottom',
	arrowupdown: 'swap_vert',
	aspectratio: 'image_aspect_ratio',
	background: 'blur_on',
	browser: 'view_sidebar',
	check: 'check',
	circle: 'circle',
	colorpicker: 'palette',
	contrast: 'opacity',
	dns: 'dns',
	download: 'cloud_download',
	edit: 'border_color',
	exit: 'exit_to_app',
	fifteenforward: 'fast_forward',
	files: 'description',
	folder: 'folder',
	folderupper: 'folder_open',
	fullscreen: 'aspect_ratio',
	gear: 'settings',
	groups: 'groups',
	heart: 'favorite',
	hide: 'visibility_off',
	info: 'info',
	language: 'language',
	light: 'light_mode',
	list: 'list',
	liveplay: 'live_tv',
	lock: 'lock',
	lockcircle: 'shield',
	mediaplayer: 'live_tv',
	movies: 'movie',
	music: 'music_note',
	newfeature: 'star',
	pausecircle: 'pause_circle',
	picture: 'image',
	play: 'play_arrow',
	playcircle: 'play_circle',
	playspeed: 'speed',
	profile: 'account_circle',
	plug: 'extension',
	refresh: 'sync',
	replay: 'replay',
	scheduler: 'schedule',
	screenpower: 'tv',
	shuffle: 'shuffle',
	show: 'visibility',
	skip: 'skip_next',
	sound: 'volume_up',
	speaker: 'speaker',
	spanner: 'tune',
	star: 'star',
	timer: 'timer',
	textinput: 'format_size',
	wifi4: 'wifi',
	zoomin: 'zoom_in'
};

const toMaterialIconName = (iconName) => MATERIAL_ICON_NAME_MAP[iconName] || iconName;

const renderSettingsIcon = (iconName) => {
	if (!iconName) return null;
	const iconUrl = MATERIAL_ICON_URLS[toMaterialIconName(iconName)] || MATERIAL_ICON_URLS.settings;

	return (
		<div className={css.listItemIcon}>
			<img aria-hidden='true' alt='' className={css.materialIconSvg} src={iconUrl} />
		</div>
	);
};

const getBaseCategories = () => [
	{ id: 'accountSecurity', label: $L('Account & Security'), description: $L('Authentication, PIN, and safety controls'), Icon: IconGeneral },
	{ id: 'personalization', label: $L('Personalization'), description: $L('Style, navigation, home, and libraries'), Icon: IconDisplay },
	{ id: 'dynamicContent', label: $L('Dynamic Content'), description: $L('Visual overlays and media bar content'), Icon: IconPlayback },
	{ id: 'integrations', label: $L('Integrations'), description: $L('Plugin sync, ratings, Seerr, and plugin integrations'), Icon: IconPlugin },
	{ id: 'playbackSyncPlay', label: $L('Playback & SyncPlay'), description: $L('Video, audio, subtitles, queue, and sync settings'), Icon: IconPlayback },
	{ id: 'about', label: $L('About'), description: $L('App version, device info, and diagnostics'), Icon: IconAbout }
];

const getBitrateOptions = () => [
	{ value: 0, label: $L('Auto (Recommended)') },
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

const Settings = ({ onBack, onLibrariesChanged, panelMode }) => {
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
				Spotlight.focus(`cat-${categories[0]?.id || 'accountSecurity'}`);
			} else if (cv.view === 'category') {
				const subcats = getSubcategories(cv.id); // eslint-disable-line no-use-before-define
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

	/* eslint-disable react/jsx-no-bind */
	const renderOptionItem = (settingKey, title, options, fallback, iconName) => (
		<SpottableDiv
			className={css.listItem}
			onClick={() => pushView({ view: 'options', title, options, settingKey, returnFocusTo: `setting-${settingKey}` })}
			spotlightId={`setting-${settingKey}`}
		>
			{renderSettingsIcon(iconName)}
			<div className={css.listItemBody}>
				<div className={css.listItemHeading}>{title}</div>
				<div className={css.listItemCaption}>{getLabel(options, settings[settingKey], fallback)}</div>
			</div>
			<div className={css.listItemTrailing}>{renderChevron()}</div>
		</SpottableDiv>
	);

	const renderToggleItem = (settingKey, title, desc, iconName) => (
		<SpottableDiv
			className={css.listItem}
			onClick={() => toggleSetting(settingKey)}
			spotlightId={`setting-${settingKey}`}
		>
			{renderSettingsIcon(iconName)}
			<div className={css.listItemBody}>
				<div className={css.listItemHeading}>{title}</div>
				{desc && <div className={css.listItemCaption}>{desc}</div>}
			</div>
			<div className={css.listItemTrailing}>{renderToggle(settings[settingKey])}</div>
		</SpottableDiv>
	);

	const renderNavItem = (id, title, desc, onClick, iconName) => (
		<SpottableDiv className={css.listItem} onClick={onClick} spotlightId={`setting-${id}`}>
			{renderSettingsIcon(iconName)}
			<div className={css.listItemBody}>
				<div className={css.listItemHeading}>{title}</div>
				{desc && <div className={css.listItemCaption}>{desc}</div>}
			</div>
			<div className={css.listItemTrailing}>{renderChevron()}</div>
		</SpottableDiv>
	);

	const renderInfoItem = (id, label, value, iconName) => (
		<SpottableDiv className={css.listItem} spotlightId={`info-${id}`}>
			{renderSettingsIcon(iconName)}
			<div className={css.listItemBody}>
				<div className={css.listItemHeading}>{label}</div>
			</div>
			<div className={css.listItemValue}>{value}</div>
		</SpottableDiv>
	);

	const renderMissingItem = (id, title, desc = $L('Not available on Smart-TV yet'), iconName) => (
		<SpottableDiv className={css.listItem} spotlightId={`missing-${id}`}>
			{renderSettingsIcon(iconName)}
			<div className={css.listItemBody}>
				<div className={css.listItemHeading}>{title}</div>
				<div className={css.listItemCaption}>{desc}</div>
			</div>
		</SpottableDiv>
	);

	const renderSliderItem = (settingKey, title, min, max, step, format, iconName) => (
		<div className={css.sliderContainer}>
			<div className={css.sliderLabel}>
				<div className={css.sliderTitleGroup}>
					{renderSettingsIcon(iconName)}
					<span className={css.sliderTitle}>{title}</span>
				</div>
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

	const renderPlaybackVideo = () => (
		<>
			{renderOptionItem('introAction', $L('Intro Action'), getMediaSegmentActionOptions(), $L('Ask to Skip'), 'skip')}
			{renderOptionItem('outroAction', $L('Outro Action'), getMediaSegmentActionOptions(), $L('Ask to Skip'), 'skip')}
			{renderToggleItem('autoPlay', $L('Auto Play Next'), $L('Automatically play the next episode'), 'playcircle')}
			{renderOptionItem('maxBitrate', $L('Maximum Bitrate'), getBitrateOptions(), $L('Auto (Recommended)'), 'download')}
			{renderOptionItem('seekStep', $L('Seek Step'), getSeekStepOptions(), $L('10 seconds'), 'skip')}
			{renderSliderItem('skipForwardLength', $L('Skip Forward Length'), 5, 30, 5, (v) => `${v}s`, 'fifteenforward')}
			{renderSliderItem('unpauseRewind', $L('Unpause Rewind'), 0, 10, 1, (v) => (v === 0 ? $L('Off') : `${v}s`), 'replay')}
			{renderToggleItem('showDescriptionOnPause', $L('Show Description on Pause'), $L('Display item description when paused'), 'pausecircle')}
			{renderToggleItem('stereoUpmixEnabled', $L('Stereo to Surround Upmix'), $L('Upmix stereo audio to 5.1 surround via server transcoding'), 'music')}
			<div className={css.divider} />
			{renderToggleItem('preferTranscode', $L('Prefer Transcoding'), $L('Request transcoded streams when available'), 'gear')}
			{renderToggleItem(
				'forceDirectPlay',
				$L('Force Direct Play'),
				$L('Skip codec checks and always attempt DirectPlay (debug)'),
				'play'
			)}
		</>
	);

	const renderPlaybackSubtitles = () => (
		<>
			{renderOptionItem('subtitleSize', $L('Subtitle Size'), getSubtitleSizeOptions(), $L('Medium'), 'textinput')}
			{renderOptionItem('subtitlePosition', $L('Subtitle Position'), getSubtitlePositionOptions(), $L('Bottom'), 'arrowlargedown')}
			{settings.subtitlePosition === 'absolute' &&
				renderSliderItem('subtitlePositionAbsolute', $L('Absolute Position'), 0, 100, 5, (v) => `${v}%`, 'arrowupdown')}
			{renderSliderItem('subtitleOpacity', $L('Text Opacity'), 0, 100, 5, (v) => `${v}%`, 'contrast')}
			{renderOptionItem('subtitleColor', $L('Text Color'), getSubtitleColorOptions(), $L('White'), 'textinput')}
			<div className={css.divider} />
			{renderOptionItem('subtitleShadowColor', $L('Shadow Color'), getSubtitleShadowColorOptions(), $L('Black'), 'edit')}
			{renderSliderItem('subtitleShadowOpacity', $L('Shadow Opacity'), 0, 100, 5, (v) => `${v}%`, 'contrast')}
			{renderSliderItem('subtitleShadowBlur', $L('Shadow Size (Blur)'), 0, 1, 0.1, (v) => (v || 0.1).toFixed(1), 'picture')}
			<div className={css.divider} />
			{renderOptionItem('subtitleBackgroundColor', $L('Background Color'), getSubtitleBackgroundColorOptions(), $L('Black'), 'colorpicker')}
			{renderSliderItem('subtitleBackground', $L('Background Opacity'), 0, 100, 5, (v) => `${v}%`, 'contrast')}
			<div className={css.divider} />
			{renderToggleItem('enablePgsRendering', $L('Direct Play PGS Subtitles'), $L('Use client-side rendering for bitmap subtitles (PGS, DVB, DVD)'), 'picture')}
		</>
	);

	const renderAccountAuthentication = () => (
		<>
			{renderToggleItem('autoLogin', $L('Auto Sign In'), $L('Automatically sign in on app launch'), 'profile')}
			{renderMissingItem('always-authenticate', $L('Always Authenticate'), undefined, 'lock')}
			{renderMissingItem('pin-code-protection', $L('PIN Code Protection'), undefined, 'lockcircle')}
			{renderMissingItem('sort-servers-by', $L('Sort Servers By'), undefined, 'arrowupdown')}
		</>
	);

	const renderAccountPrivacySafety = () => (
		<>
			{renderMissingItem('blocked-ratings', $L('Blocked Ratings'), undefined, 'profile')}
			{renderMissingItem('exit-confirmation', $L('Exit Confirmation'), undefined, 'exit')}
		</>
	);

	const renderPersonalizationGeneralStyle = () => (
		<>
			{renderMissingItem('appearance-theme', $L('Theme'), undefined, 'colorpicker')}
			{renderOptionItem('focusColor', $L('Focus Border Color'), getFocusColorOptions(), $L('Blue'), 'edit')}
			{renderOptionItem('clockDisplay', $L('Clock Display'), getClockDisplayOptions(), $L('24-Hour'), 'timer')}
			{renderMissingItem('24-hour-clock', $L('24-Hour Clock'), $L('Handled via Clock Display on Smart-TV'), 'scheduler')}
			{renderToggleItem('cardFocusZoom', $L('Card Focus Expansion'), $L('Slightly enlarge cards when focused'), 'zoomin')}
			{renderToggleItem('showHomeBackdrop', $L('Show Backdrops'), $L('Show background art while browsing'), 'picture')}
			{renderOptionItem('backdropBlurHome', $L('Browsing Blur'), getBlurOptions(), $L('Medium'), 'background')}
			{renderOptionItem('backdropBlurDetail', $L('Details Blur'), getBlurOptions(), $L('Medium'), 'background')}
			{renderOptionItem('watchedIndicatorBehavior', $L('Watched Indicators'), getWatchedIndicatorOptions(), $L('Always'), 'check')}
			{renderToggleItem('themeMusicEnabled', $L('Theme Music'), $L('Play background music on detail pages'), 'music')}
			{settings.themeMusicEnabled &&
				renderSliderItem('themeMusicVolume', $L('Theme Music Volume'), 0, 100, 5, (v) => `${v}%`, 'sound')}
		</>
	);

	const renderPersonalizationNavigation = () => (
		<>
			{renderOptionItem('navbarPosition', $L('Navbar Position'), getNavPositionOptions(), $L('Top Bar'), 'browser')}
			{renderOptionItem('uiColor', $L('Navbar Color'), getUiColorOptions(), $L('Gray'), 'colorpicker')}
			{renderOptionItem('uiOpacity', $L('Navbar Opacity'), UI_OPACITY_OPTIONS, '85%', 'contrast')}
			{renderToggleItem('showShuffleButton', $L('Shuffle Button'), $L('Show shuffle button in navigation bar'), 'shuffle')}
			{settings.showShuffleButton &&
				renderOptionItem('shuffleContentType', $L('Shuffle Content Type'), getContentTypeOptions(), $L('Movies & TV Shows'), 'shuffle')}
			{renderToggleItem('showGenresButton', $L('Genres Button'), $L('Show genres button in navigation bar'), 'movies')}
			{renderToggleItem('showFavoritesButton', $L('Favorites Button'), $L('Show favorites button in navigation bar'), 'heart')}
			{renderToggleItem('showLibrariesInToolbar', $L('Libraries Button'), $L('Show library shortcuts in navigation bar'), 'folder')}
			{renderToggleItem('showSyncPlayButton', $L('SyncPlay Button'), $L('Show SyncPlay button in navigation bar'), 'check')}
		</>
	);

	const renderPersonalizationHomePage = () => (
		<>
			{renderNavItem('homeRows', $L('Home Sections'), $L('Configure which rows appear on home screen'), openHomeRows, 'list')}
			{renderToggleItem('mergeContinueWatchingNextUp', $L('Merge Continue Watching'), $L('Combine Continue Watching and Next Up'), 'arrowupdown')}
			{renderOptionItem('homeRowsImageType', $L('Home Row Image Type'), getImageTypeOptions(), $L('Poster'), 'picture')}
			{renderToggleItem('useSeriesThumbnails', $L('Series Thumbnails'), $L('Use series artwork instead of episode images'), 'aspectratio')}
			{renderOptionItem('homeRowsPosterSize', $L('Image Size'), getPosterSizeOptions(), $L('Default'), 'aspectratio')}
			{renderMissingItem('home-row-overlay', $L('Home Row Overlay'), undefined, 'info')}
			{renderToggleItem('themeMusicOnHomeRows', $L('Play Theme Music on Home Page'), $L('Play theme music while browsing home rows'), 'music')}
		</>
	);

	const renderPersonalizationLibraries = () => (
		<>
			{renderNavItem('hideLibraries', $L('Library Visibility'), $L('Choose which libraries are hidden'), openLibraries, 'show')}
			{renderMissingItem('folder-view', $L('Folder View'), undefined, 'folder')}
			{renderToggleItem('unifiedLibraryMode', $L('Multi-Server Libraries'), $L('Combine content from all servers into a single view'), 'dns')}
		</>
	);

	const renderDynamicVisualOverlays = () => (
		<>
			{renderOptionItem('seasonalTheme', $L('Seasonal Surprise'), getSeasonalThemeOptions(), $L('None'), 'newfeature')}
			{renderToggleItem('screensaverEnabled', $L('In-App Screensaver'), $L('Reduce brightness after inactivity'), 'screenpower')}
			{settings.screensaverEnabled &&
				renderOptionItem('screensaverMode', $L('Screensaver Mode'), getScreensaverModeOptions(), $L('Library Backdrops'), 'liveplay')}
			{settings.screensaverEnabled &&
				renderOptionItem('screensaverTimeout', $L('Screensaver Timeout'), getScreensaverTimeoutOptions(), $L('90 seconds'), 'timer')}
			{settings.screensaverEnabled &&
				renderOptionItem('screensaverDimmingLevel', $L('Screensaver Dimming Level'), getScreensaverDimmingOptions(), '50%', 'light')}
			{settings.screensaverEnabled &&
				renderOptionItem('screensaverMaxRating', $L('Screensaver Max Age Rating'), AGE_RATING_OPTIONS, 'PG-13', 'lockcircle')}
			{settings.screensaverEnabled &&
				renderToggleItem('screensaverAgeFilter', $L('Screensaver Rating Requirement'), $L('Only show content with a rating'), 'check')}
			{settings.screensaverEnabled &&
				renderToggleItem('screensaverShowClock', $L('Screensaver Clock'), $L('Display clock during screensaver'), 'timer')}
		</>
	);

	const renderDynamicMediaBar = () => (
		<>
			{renderToggleItem('showFeaturedBar', $L('Media Bar Mode'), $L('Toggle media bar visibility'), 'movies')}
			{renderOptionItem('featuredContentType', $L('Content Type'), getContentTypeOptions(), $L('Movies & TV Shows'), 'list')}
			{renderOptionItem('featuredItemCount', $L('Item Count'), getFeaturedItemCountOptions(), $L('10 items'), 'list')}
			{renderNavItem('sourceLibraries', $L('Source Libraries'), $L('Choose source libraries for media bar'), () => {}, 'folder')}
			{renderNavItem('sourceCollections', $L('Source Collections'), $L('Choose source collections for media bar'), () => {}, 'bookmark')}
			{renderMissingItem('excluded-genres', $L('Excluded Genres'), undefined, 'hide')}
			{renderMissingItem('auto-advance', $L('Auto Advance'), undefined, 'skip')}
			{renderMissingItem('auto-advance-interval', $L('Auto Advance Interval'), undefined, 'timer')}
			{renderToggleItem('featuredTrailerPreview', $L('Trailer Preview'), $L('Automatically play trailer previews in media bar'), 'movies')}
			{renderMissingItem('media-preview', $L('Media Preview'), undefined, 'mediaplayer')}
			{renderMissingItem('preview-audio', $L('Preview Audio'), undefined, 'sound')}
		</>
	);

	const renderIntegrationsPlugin = () => (
		<>
			{renderToggleItem('useMoonfinPlugin', $L('Plugin Sync Enabled'), $L('Enable Moonfin plugin integration'), 'refresh')}
			{renderMissingItem('customization-profile', $L('Customization Profile'), undefined, 'circle')}
			{renderMissingItem('load-profile', $L('Load Profile'), undefined, 'download')}
			{renderMissingItem('save-profile', $L('Save Profile'), undefined, 'download')}
		</>
	);

	const renderIntegrationsMetadataRatings = () => (
		<>
			{renderToggleItem('mdblistEnabled', $L('Fetch Additional Ratings'), $L('Enable MDBList ratings'), 'star')}
			{renderMissingItem('enabled-rating-sources', $L('Enabled Rating Sources'), undefined, 'list')}
			{renderToggleItem('tmdbEpisodeRatingsEnabled', $L('Show Episode Ratings'), $L('Show episode ratings from TMDB'), 'star')}
			{renderToggleItem('showRatingLabels', $L('Show Rating Text Labels'), $L('Display source labels under scores'), 'bookmark')}
			{renderMissingItem('show-rating-badges', $L('Show Rating Badges'), undefined, 'colorpicker')}
		</>
	);

	const renderIntegrationsSeerr = () => (
		<>
			{renderMissingItem('enable-seerr', $L('Enable Seerr'), undefined, 'movies')}
			{renderMissingItem('nsfw-filter', $L('NSFW Filter'), undefined, 'hide')}
			{renderMissingItem('logged-in-as', $L('Logged In As'), undefined, 'profile')}
			{renderMissingItem('discover-rows', $L('Discover Rows'), undefined, 'appscontents')}
		</>
	);

	const renderPlaybackAudio = () => (
		<>
			{renderMissingItem('audio-night-mode', $L('Audio Night Mode'), undefined, 'light')}
			{renderMissingItem('default-audio-language', $L('Default Audio Language'), undefined, 'language')}
			{renderMissingItem('audio-behavior', $L('Audio Behavior'), undefined, 'sound')}
			{renderMissingItem('ac3-passthrough', $L('AC3 Passthrough'), undefined, 'speaker')}
			{renderMissingItem('truehd-support', $L('TrueHD Support'), undefined, 'speaker')}
		</>
	);

	const renderPlaybackSubtitleCustomization = () => (
		<>
			{renderOptionItem('subtitleSize', $L('Subtitle Size'), getSubtitleSizeOptions(), $L('Medium'), 'textinput')}
			{renderOptionItem('subtitleColor', $L('Text Fill Color'), getSubtitleColorOptions(), $L('White'), 'textinput')}
			{renderOptionItem('subtitleShadowColor', $L('Text Stroke Color'), getSubtitleShadowColorOptions(), $L('Black'), 'edit')}
			{renderOptionItem('subtitleBackgroundColor', $L('Background Color'), getSubtitleBackgroundColorOptions(), $L('Black'), 'colorpicker')}
			{renderOptionItem('subtitlePosition', $L('Vertical Offset'), getSubtitlePositionOptions(), $L('Bottom'), 'arrowlargedown')}
		</>
	);

	const renderPlaybackAutomationQueue = () => (
		<>
			{renderMissingItem('cinema-mode', $L('Cinema Mode'), undefined, 'movies')}
			{renderToggleItem('autoPlay', $L('Episode Queuing'), $L('Automatically play the next episode'), 'list')}
			{renderOptionItem('nextUpBehavior', $L('Next Up Prompt'), getNextUpBehaviorOptions(), $L('Extended'), 'skip')}
			{settings.nextUpBehavior !== 'disabled' &&
				renderSliderItem('nextUpTimeout', $L('Next Up Prompt Timeout'), 0, 30, 1, (v) => (v === 0 ? $L('Instant') : `${v}s`), 'timer')}
			{renderMissingItem('still-watching', $L('Still Watching Prompt'), undefined, 'show')}
		</>
	);

	const renderPlaybackOfflineDownloads = () => (
		<>
			{renderMissingItem('default-download-quality', $L('Default Download Quality'), undefined, 'picture')}
			{renderMissingItem('wifi-only', $L('WiFi Only'), undefined, 'wifi4')}
			{renderMissingItem('storage-limit', $L('Storage Limit'), undefined, 'folder')}
			{renderMissingItem('download-location', $L('Download Location'), undefined, 'folderupper')}
			{renderMissingItem('save-to-downloads', $L('Save to Downloads Folder'), undefined, 'folderupper')}
			{renderMissingItem('concurrent-downloads', $L('Concurrent Downloads'), undefined, 'list')}
		</>
	);

	const renderPlaybackSyncPlay = () => (
		<>
			{renderMissingItem('syncplay-enabled', $L('SyncPlay Enabled'), undefined, 'groups')}
			{renderToggleItem('showSyncPlayButton', $L('SyncPlay Button'), $L('Show SyncPlay button in navigation bar'), 'check')}
			{renderMissingItem('open-syncplay', $L('Open SyncPlay'), undefined, 'groups')}
			{renderMissingItem('advanced-correction', $L('Advanced Correction'), undefined, 'spanner')}
			{renderMissingItem('sync-correction', $L('Sync Correction'), undefined, 'refresh')}
			{renderMissingItem('speed-to-sync', $L('Speed to Sync'), undefined, 'playspeed')}
			{renderMissingItem('skip-to-sync', $L('Skip to Sync'), undefined, 'skip')}
			{renderMissingItem('minimum-speed-delay', $L('Minimum Speed Delay'), undefined, 'timer')}
			{renderMissingItem('maximum-speed-delay', $L('Maximum Speed Delay'), undefined, 'timer')}
			{renderMissingItem('speed-duration', $L('Speed Duration'), undefined, 'scheduler')}
			{renderMissingItem('minimum-skip-delay', $L('Minimum Skip Delay'), undefined, 'timer')}
			{renderMissingItem('syncplay-extra-offset', $L('SyncPlay Extra Offset'), undefined, 'scheduler')}
		</>
	);

	const renderPlaybackAdvanced = () => (
		<>
			{renderMissingItem('video-start-delay', $L('Video Start Delay'), undefined, 'scheduler')}
			{renderMissingItem('custom-mpv-conf', $L('Custom MPV Conf'), undefined, 'spanner')}
			{renderMissingItem('mpv-conf-path', $L('MPV Conf Path'), undefined, 'files')}
			{renderMissingItem('unsafe-mpv-options', $L('Unsafe MPV Options'), undefined, 'alert02')}
			{renderMissingItem('live-tv-direct', $L('Live TV Direct'), undefined, 'liveplay')}
		</>
	);

	const renderAboutAppInfo = () => (
		<>
			{renderInfoItem('appVersion', $L('App Version'), process.env.REACT_APP_VERSION || '0.0.0', 'info')}
			{renderInfoItem(
				'platform',
				$L('Platform'),
				capabilities?.tizenVersionDisplay ? 'Tizen' : capabilities?.webosVersionDisplay ? 'webOS' : $L('Unknown'),
				'gear'
			)}
			{renderMissingItem('update-notifications', $L('Update Notifications'), undefined, 'download')}
		</>
	);

	const renderAboutServer = () => (
		<>
			{renderInfoItem('serverUrl', $L('Server URL'), serverUrl || $L('Not connected'), 'info')}
			{renderInfoItem('serverVersion', $L('Server Version'), serverVersion || $L('Loading...'), 'info')}
		</>
	);

	const renderAboutDebugging = () => (
		<>{renderToggleItem('serverLogging', $L('Server Logging'), $L('Send logs to Jellyfin server for troubleshooting'), 'info')}</>
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
			{renderInfoItem('model', $L('Model'), capabilities?.modelName || $L('Unknown'), 'info')}
			{(capabilities?.tizenVersionDisplay || capabilities?.webosVersionDisplay) &&
				renderInfoItem(
					'osVersion',
					capabilities.tizenVersionDisplay ? $L('Tizen Version') : $L('webOS Version'),
					capabilities.tizenVersionDisplay || capabilities.webosVersionDisplay,
					'gear'
				)}
			{capabilities?.firmwareVersion && renderInfoItem('firmware', $L('Firmware'), capabilities.firmwareVersion, 'gear')}
			{renderInfoItem(
				'resolution',
				$L('Resolution'),
				`${capabilities?.uhd8K ? '7680x4320 (8K)' : capabilities?.uhd ? '3840x2160 (4K)' : '1920x1080 (HD)'}${capabilities?.oled ? ' OLED' : ''}`,
				'fullscreen'
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
					.join(', ') || $L('Not supported'),
				'picture'
			)}
			{renderInfoItem(
				'videoCodecs',
				$L('Video Codecs'),
				['H.264', capabilities?.hevc && 'HEVC', capabilities?.vp9 && 'VP9', capabilities?.av1 && 'AV1']
					.filter(Boolean)
					.join(', '),
				'liveplay'
			)}
			{renderInfoItem(
				'audioCodecs',
				$L('Audio Codecs'),
				[
					'AAC',
					capabilities?.ac3 && 'AC3',
					capabilities?.eac3 && 'E-AC3',
					capabilities?.dts && 'DTS',
					capabilities?.dtshd && 'DTS-HD',
					capabilities?.dolbyAtmos && 'Atmos',
					capabilities?.opus && 'OPUS'
				]
					.filter(Boolean)
					.join(', '),
				'music'
			)}
			{renderInfoItem(
				'containers',
				$L('Containers'),
				['MP4', capabilities?.mkv && 'MKV', 'TS', capabilities?.webm && 'WebM', capabilities?.asf && 'ASF', capabilities?.nativeHls && 'HLS', capabilities?.nativeHlsFmp4 && 'HLS-fMP4']
					.filter(Boolean)
					.join(', '),
				'folder'
			)}
		</>
	);

	const getSubcategories = (catId) => {
		switch (catId) {
			case 'accountSecurity':
				return [
					{ id: 'authentication', label: $L('Authentication'), description: $L('Sign-in and account protection') },
					{ id: 'privacySafety', label: $L('Privacy & Safety'), description: $L('Content safety and app-exit protections') }
				];
			case 'personalization':
				return [
					{ id: 'generalStyle', label: $L('General Style'), description: $L('Theme, blur, and visual style') },
					{ id: 'navigation', label: $L('Navigation'), description: $L('Navbar layout and shortcut controls') },
					{ id: 'homePage', label: $L('Home Page'), description: $L('Rows and home screen behavior') },
					{ id: 'libraries', label: $L('Libraries'), description: $L('Library visibility and server grouping') }
				];
			case 'dynamicContent':
				return [
					{ id: 'visualOverlays', label: $L('Visual Overlays'), description: $L('Seasonal effects and screensaver controls') },
					{ id: 'mediaBarLocalPreviews', label: $L('Media Bar & Local Previews'), description: $L('Featured media bar content and previews') }
				];
			case 'integrations':
				return [
					{ id: 'plugin', label: $L('Plugin'), description: $L('Plugin sync and profile integration') },
					{ id: 'metadataRatings', label: $L('Metadata & Ratings'), description: $L('Ratings providers and display options') },
					{ id: 'seerr', label: seerrLabel, description: $L('{seerrLabel} settings and status').replace('{seerrLabel}', seerrLabel) },
					{ id: 'homeScreenSections', label: $L('Home Screen Sections'), description: $L('Plugin-backed home sections') },
					{ id: 'kefinTweaks', label: $L('KefinTweaks'), description: $L('KefinTweaks integration and rows') }
				];
			case 'playbackSyncPlay':
				return [
					{ id: 'video', label: $L('Video'), description: $L('Playback quality, seeking, and behavior') },
					{ id: 'audio', label: $L('Audio'), description: $L('Audio language and passthrough options') },
					{ id: 'subtitles', label: $L('Subtitles'), description: $L('Subtitle defaults and direct-play options') },
					{ id: 'subtitleCustomization', label: $L('Subtitle Customization'), description: $L('Text color, size, and position styling') },
					{ id: 'automationQueue', label: $L('Automation & Queue'), description: $L('Next up, queueing, and prompt behavior') },
					{ id: 'offlineDownloads', label: $L('Offline Downloads'), description: $L('Download quality, location, and limits') },
					{ id: 'syncPlay', label: $L('SyncPlay'), description: $L('Group playback sync controls') },
					{ id: 'advanced', label: $L('Advanced'), description: $L('Expert playback and MPV options') }
				];
			case 'about': {
				const subs = [
					{ id: 'appInfo', label: $L('App Info'), description: $L('Version and update settings') },
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
			case 'accountSecurity.authentication':
				return renderAccountAuthentication();
			case 'accountSecurity.privacySafety':
				return renderAccountPrivacySafety();
			case 'personalization.generalStyle':
				return renderPersonalizationGeneralStyle();
			case 'personalization.navigation':
				return renderPersonalizationNavigation();
			case 'personalization.homePage':
				return renderPersonalizationHomePage();
			case 'personalization.libraries':
				return renderPersonalizationLibraries();
			case 'dynamicContent.visualOverlays':
				return renderDynamicVisualOverlays();
			case 'dynamicContent.mediaBarLocalPreviews':
				return renderDynamicMediaBar();
			case 'integrations.plugin':
				return renderIntegrationsPlugin();
			case 'integrations.metadataRatings':
				return renderIntegrationsMetadataRatings();
			case 'integrations.seerr':
				return renderIntegrationsSeerr();
			case 'integrations.homeScreenSections':
				return renderMissingItem('home-screen-sections', $L('Home Screen Sections'), undefined, 'list');
			case 'integrations.kefinTweaks':
				return renderMissingItem('kefin-tweaks', $L('KefinTweaks'), undefined, 'plug');
			case 'playbackSyncPlay.video':
				return renderPlaybackVideo();
			case 'playbackSyncPlay.audio':
				return renderPlaybackAudio();
			case 'playbackSyncPlay.subtitles':
				return renderPlaybackSubtitles();
			case 'playbackSyncPlay.subtitleCustomization':
				return renderPlaybackSubtitleCustomization();
			case 'playbackSyncPlay.automationQueue':
				return renderPlaybackAutomationQueue();
			case 'playbackSyncPlay.offlineDownloads':
				return renderPlaybackOfflineDownloads();
			case 'playbackSyncPlay.syncPlay':
				return renderPlaybackSyncPlay();
			case 'playbackSyncPlay.advanced':
				return renderPlaybackAdvanced();
			case 'about.appInfo':
				return renderAboutAppInfo();
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
	/* eslint-enable react/jsx-no-bind */

	return (
		<div className={`${css.page}${panelMode ? ` ${css.pagePanel}` : ''}`}>
			{currentView.view === 'categories' && renderCategoriesView()}
			{currentView.view === 'category' && renderCategoryView()}
			{currentView.view === 'subcategory' && renderSubcategoryView()}
			{currentView.view === 'options' && renderOptionsView()}
			{currentView.view === 'homeRows' && renderHomeRowsView()}
			{currentView.view === 'libraries' && renderLibrariesView()}
			<ClearDataDialog
				open={clearDataDialogOpen}
				onCancel={() => setClearDataDialogOpen(false)} // eslint-disable-line react/jsx-no-bind
				onConfirm={handleClearAllData}
			/>
		</div>
	);
};

export default Settings;
