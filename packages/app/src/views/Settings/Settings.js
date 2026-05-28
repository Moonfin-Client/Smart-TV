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
import SpottableInput from '../../components/SpottableInput';
import {clearAllStorage} from '../../services/storage';
import {getMoonfinSettings} from '../../services/jellyseerrApi';
import {
	refreshPluginCapabilities as refreshPluginCapabilitiesService,
	clearPluginProbeCache,
	getPluginProbeCacheState,
	loadDiscoveredPluginRows
} from '../../services/pluginIntegrationService';

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

const USER_OPACITY_OPTIONS = [
	{ value: 0, label: '0%' },
	{ value: 50, label: '50%' },
	{ value: 65, label: '65%' },
	{ value: 75, label: '75%' },
	{ value: 85, label: '85%' },
	{ value: 95, label: '95%' }
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

const ACCENT_COLOR_OPTIONS = [
	{ value: '', label: $L('Theme Default') },
	{ value: '#ffffff', label: $L('White') },
	{ value: '#000000', label: $L('Black') },
	{ value: '#808080', label: $L('Gray') },
	{ value: '#003366', label: $L('Dark Blue') },
	{ value: '#6a0dad', label: $L('Purple') },
	{ value: '#008080', label: $L('Teal') },
	{ value: '#000080', label: $L('Navy') },
	{ value: '#36454f', label: $L('Charcoal') },
	{ value: '#8b4513', label: $L('Brown') },
	{ value: '#8b0000', label: $L('Dark Red') },
	{ value: '#006400', label: $L('Dark Green') },
	{ value: '#708090', label: $L('Slate') },
	{ value: '#4b0082', label: $L('Indigo') },
	{ value: '#00a4dc', label: $L('Moonfin Cyan') },
	{ value: '#ff2e92', label: $L('Neon Magenta') }
];

const hexToRgba = (hex) => {
	const clean = hex.replace('#', '');
	const a = parseInt(clean.slice(0, 2), 16) / 255;
	const r = parseInt(clean.slice(2, 4), 16);
	const g = parseInt(clean.slice(4, 6), 16);
	const b = parseInt(clean.slice(6, 8), 16);
	if (a >= 0.999) return `rgb(${r}, ${g}, ${b})`;
	return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
};

const AGE_RATING_OPTIONS = [
	{ value: 0, label: 'G' },
	{ value: 7, label: 'PG' },
	{ value: 13, label: 'PG-13' },
	{ value: 17, label: 'R' },
	{ value: 18, label: 'NC-17' }
];

const MDBLIST_RATING_SOURCE_OPTIONS = [
	{ value: 'imdb', label: 'IMDb' },
	{ value: 'tmdb', label: 'TMDB' },
	{ value: 'tomatoes', label: 'Rotten Tomatoes' },
	{ value: 'metacritic', label: 'Metacritic' }
];

const DEFAULT_JELLYSEERR_ROWS = {
	trendingMovies: true,
	trendingTv: true,
	popularMovies: true,
	popularTv: true,
	upcomingMovies: true,
	upcomingTv: true,
	rowOrder: ['trendingMovies', 'trendingTv', 'popularMovies', 'popularTv', 'upcomingMovies', 'upcomingTv']
};

const JELLYSEERR_ROW_OPTIONS = [
	{ key: 'trendingMovies', label: $L('Trending Movies') },
	{ key: 'trendingTv', label: $L('Trending TV') },
	{ key: 'popularMovies', label: $L('Popular Movies') },
	{ key: 'popularTv', label: $L('Popular TV') },
	{ key: 'upcomingMovies', label: $L('Upcoming Movies') },
	{ key: 'upcomingTv', label: $L('Upcoming TV') }
];

const normalizeJellyseerrRows = (config) => {
	const base = { ...DEFAULT_JELLYSEERR_ROWS, ...(config || {}) };
	const order = Array.isArray(base.rowOrder) ? base.rowOrder : DEFAULT_JELLYSEERR_ROWS.rowOrder;
	const dedupedOrder = [];
	order.forEach((key) => {
		if (!DEFAULT_JELLYSEERR_ROWS.rowOrder.includes(key)) return;
		if (!dedupedOrder.includes(key)) dedupedOrder.push(key);
	});
	DEFAULT_JELLYSEERR_ROWS.rowOrder.forEach((key) => {
		if (!dedupedOrder.includes(key)) dedupedOrder.push(key);
	});
	return {
		...base,
		rowOrder: dedupedOrder
	};
};

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
	const {
		settings,
		updateSetting,
		resetSettings,
		availableThemes,
		activeThemeId,
		selectThemeById,
		syncFromServer,
		syncToServer
	} = useSettings();
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
	const [, setMoonfinConnecting] = useState(false);
	const [moonfinStatus, setMoonfinStatus] = useState('');
	const [tempHomeRows, setTempHomeRows] = useState([]);
	const [tempPluginRows, setTempPluginRows] = useState([]);
	const [pluginRowsLoading, setPluginRowsLoading] = useState(false);
	const [pluginRowsLoaded, setPluginRowsLoaded] = useState(false);
	const [pluginRowsError, setPluginRowsError] = useState('');
	const [allLibraries, setAllLibraries] = useState([]);
	const [hiddenLibraries, setHiddenLibraries] = useState([]);
	const [libraryLoading, setLibraryLoading] = useState(false);
	const [librarySaving, setLibrarySaving] = useState(false);
	const [serverConfigs, setServerConfigs] = useState([]);
	const [clearDataDialogOpen, setClearDataDialogOpen] = useState(false);
	const [tempJellyseerrRows, setTempJellyseerrRows] = useState(normalizeJellyseerrRows(settings.jellyseerrRows));
	const [profileEnvelope, setProfileEnvelope] = useState(null);
	const [profileLoading, setProfileLoading] = useState(false);
	const [profileSaving, setProfileSaving] = useState(false);
	const [integrationProbeLoading, setIntegrationProbeLoading] = useState(false);
	const [integrationProbeStatus, setIntegrationProbeStatus] = useState('');
	const [homeSectionsCapabilities, setHomeSectionsCapabilities] = useState([]);
	const [kefinCapabilities, setKefinCapabilities] = useState([]);
	const [homeProbeMeta, setHomeProbeMeta] = useState(null);
	const [kefinProbeMeta, setKefinProbeMeta] = useState(null);
	const [probeCacheInfo, setProbeCacheInfo] = useState(() => getPluginProbeCacheState());
	const integrationProbeLoadingRef = useRef(false);
	const homeRowsEditorLoadIdRef = useRef(0);

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
			} else if (cv.view === 'themes') {
				const selectedId = availableThemes.find((t) => t.id === activeThemeId)?.id;
				Spotlight.focus(selectedId ? `theme-card-${selectedId}` : 'themes-view');
			} else if (cv.view === 'homeRows') {
				Spotlight.focus('homerows-view');
			} else if (cv.view === 'libraries') {
				Spotlight.focus('libraries-view');
			} else if (cv.view === 'jellyseerrRows') {
				Spotlight.focus('jellyseerr-rows-view');
			} else if (cv.view === 'integrationDetails') {
				Spotlight.focus('setting-integration-details-refresh');
			}
		}, 50);
		return () => clearTimeout(timer);
	}, [navStack]); // eslint-disable-line react-hooks/exhaustive-deps

	const refreshProfileEnvelope = useCallback(async () => {
		if (!settings.useMoonfinPlugin || !serverUrl || !accessToken) {
			setProfileEnvelope(null);
			return;
		}
		try {
			const data = await getMoonfinSettings(serverUrl, accessToken);
			setProfileEnvelope(data);
		} catch (_) {
			setProfileEnvelope(null);
		}
	}, [settings.useMoonfinPlugin, serverUrl, accessToken]);

	useEffect(() => {
		refreshProfileEnvelope();
	}, [refreshProfileEnvelope]);

	const updateProbeCacheInfo = useCallback(() => {
		setProbeCacheInfo(getPluginProbeCacheState());
	}, []);

	const refreshPluginCapabilities = useCallback(async (focusTarget, options = {}) => {
		const targetSpotlightId = typeof focusTarget === 'string' ? focusTarget : null;
		if (integrationProbeLoadingRef.current) return;

		integrationProbeLoadingRef.current = true;
		setIntegrationProbeLoading(true);
		setIntegrationProbeStatus($L('Refreshing plugin capabilities...'));

		try {
			const probeResult = await refreshPluginCapabilitiesService(options);
			const hssCapabilities = probeResult.homeSectionsCapabilities || [];
			const kefinProbeCapabilities = probeResult.kefinCapabilities || [];
			const homeMeta = probeResult.meta?.home || null;
			const kefinMeta = probeResult.meta?.kefin || null;

			setHomeSectionsCapabilities(hssCapabilities);
			setKefinCapabilities(kefinProbeCapabilities);
			setHomeProbeMeta(homeMeta);
			setKefinProbeMeta(kefinMeta);
			updateProbeCacheInfo();

			const availableHssCount = hssCapabilities.filter((entry) => entry.available).length;
			const availableKefinCount = kefinProbeCapabilities.filter((entry) => entry.available).length;
			const source = homeMeta?.source || kefinMeta?.source || 'network';
			const summary = $L('Detected {hssCount} Home Screen Sections and {kefinCount} KefinTweaks integrations ({source}).')
				.replace('{hssCount}', String(availableHssCount))
				.replace('{kefinCount}', String(availableKefinCount))
				.replace('{source}', source);
			setIntegrationProbeStatus(summary);
		} catch (error) {
			setIntegrationProbeStatus(`${$L('Plugin capability refresh failed:')} ${error.message || $L('Unknown error')}`);
			updateProbeCacheInfo();
		} finally {
			integrationProbeLoadingRef.current = false;
			setIntegrationProbeLoading(false);
			if (targetSpotlightId) {
				setTimeout(() => Spotlight.focus(targetSpotlightId), 50);
			}
		}
	}, [updateProbeCacheInfo]);

	const forceRetryPluginCapabilities = useCallback((focusTarget) => {
		refreshPluginCapabilities(focusTarget, {forceRefresh: true, bypassBackoff: true});
	}, [refreshPluginCapabilities]);

	const handleClearProbeCache = useCallback(async (focusTarget) => {
		clearPluginProbeCache();
		setHomeSectionsCapabilities([]);
		setKefinCapabilities([]);
		setHomeProbeMeta(null);
		setKefinProbeMeta(null);
		setIntegrationProbeStatus($L('Plugin probe cache cleared'));
		updateProbeCacheInfo();
		await refreshPluginCapabilities(focusTarget, {forceRefresh: true, bypassBackoff: true});
	}, [refreshPluginCapabilities, updateProbeCacheInfo]);

	useEffect(() => {
		refreshPluginCapabilities();
	}, [refreshPluginCapabilities, serverUrl, accessToken]);

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
			if (settingKey === '__themeSelection') {
				selectThemeById(value);
				popView();
				return;
			}
			updateSetting(settingKey, value);
			popView();
		},
		[updateSetting, popView, selectThemeById]
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

	const handleLoadProfile = useCallback(async (focusTarget) => {
		const targetSpotlightId = typeof focusTarget === 'string' ? focusTarget : 'setting-load-profile';
		if (profileLoading) return;
		if (!serverUrl || !accessToken) {
			setMoonfinStatus($L('Not connected to a Jellyfin server'));
			return;
		}
		setProfileLoading(true);
		setMoonfinStatus($L('Loading profile...'));
		try {
			await syncFromServer(serverUrl, accessToken);
			await refreshProfileEnvelope();
			setMoonfinStatus($L('Profile loaded'));
		} catch (err) {
			setMoonfinStatus(`${$L('Profile load failed:')} ${err.message}`);
		} finally {
			setProfileLoading(false);
			setTimeout(() => Spotlight.focus(targetSpotlightId), 50);
		}
	}, [profileLoading, serverUrl, accessToken, syncFromServer, refreshProfileEnvelope]);

	const handleSaveProfile = useCallback(async (focusTarget) => {
		const targetSpotlightId = typeof focusTarget === 'string' ? focusTarget : 'setting-save-profile';
		if (profileSaving) return;
		if (!settings.useMoonfinPlugin) {
			setMoonfinStatus($L('Enable Plugin Sync first'));
			return;
		}
		setProfileSaving(true);
		setMoonfinStatus($L('Saving profile...'));
		try {
			await syncToServer(serverUrl, accessToken);
			await refreshProfileEnvelope();
			setMoonfinStatus($L('Profile saved'));
		} catch (err) {
			setMoonfinStatus(`${$L('Profile save failed:')} ${err.message}`);
		} finally {
			setProfileSaving(false);
			setTimeout(() => Spotlight.focus(targetSpotlightId), 50);
		}
	}, [profileSaving, settings.useMoonfinPlugin, syncToServer, serverUrl, accessToken, refreshProfileEnvelope]);

	const toggleRatingSource = useCallback((source) => {
		const current = Array.isArray(settings.mdblistRatingSources) ? settings.mdblistRatingSources : [];
		const next = current.includes(source)
			? current.filter((entry) => entry !== source)
			: [...current, source];
		updateSetting('mdblistRatingSources', next);
	}, [settings.mdblistRatingSources, updateSetting]);

	const openThemes = useCallback(() => {
		pushView({ view: 'themes', returnFocusTo: 'setting-themeSelection' });
	}, [pushView]);

	const openHomeRowsEditor = useCallback((returnFocusTo = 'setting-homeRows') => {
		setTempHomeRows([...(settings.homeRows || DEFAULT_HOME_ROWS)].sort((a, b) => a.order - b.order));
		setTempPluginRows([]);
		setPluginRowsLoading(true);
		setPluginRowsLoaded(false);
		setPluginRowsError('');
		pushView({ view: 'homeRows', returnFocusTo });

		const visibilityMap = settings.pluginRowsVisibility || {};
		const pluginOrderMap = settings.pluginRowsOrder || {};
		const loadId = homeRowsEditorLoadIdRef.current + 1;
		homeRowsEditorLoadIdRef.current = loadId;

		loadDiscoveredPluginRows()
			.then((rows) => {
				if (homeRowsEditorLoadIdRef.current !== loadId) return;
				const seenIds = new Set();
				const normalizedRows = (Array.isArray(rows) ? rows : [])
					.filter((row) => {
						if (!row?.id || seenIds.has(row.id)) return false;
						seenIds.add(row.id);
						return true;
					})
					.map((row) => ({
						id: row.id,
						title: row.title || row.id,
						source: row.pluginSource || 'plugin',
						enabled: visibilityMap[row.id] !== false,
						defaultOrder: Number.isFinite(Number(row.pluginOrder)) ? Number(row.pluginOrder) : 0,
						order: Number.isFinite(Number(pluginOrderMap[row.id]))
							? Number(pluginOrderMap[row.id])
							: (Number.isFinite(Number(row.pluginOrder)) ? Number(row.pluginOrder) : Number.MAX_SAFE_INTEGER)
					}))
					.sort((a, b) => {
						if (a.order !== b.order) return a.order - b.order;
						if (a.defaultOrder !== b.defaultOrder) return a.defaultOrder - b.defaultOrder;
						return a.title.localeCompare(b.title);
					})
					.map((row, index) => ({
						...row,
						order: index,
						defaultOrder: Number.isFinite(row.defaultOrder) ? row.defaultOrder : index
					}));
				setTempPluginRows(normalizedRows);
				setPluginRowsLoaded(true);
			})
			.catch((error) => {
				if (homeRowsEditorLoadIdRef.current !== loadId) return;
				setTempPluginRows([]);
				setPluginRowsLoaded(false);
				setPluginRowsError(`${$L('Plugin rows failed to load:')} ${error.message || $L('Unknown error')}`);
			})
			.finally(() => {
				if (homeRowsEditorLoadIdRef.current !== loadId) return;
				setPluginRowsLoading(false);
			});
	}, [settings.homeRows, settings.pluginRowsVisibility, settings.pluginRowsOrder, pushView]);

	const openJellyseerrRows = useCallback((returnFocusTo = 'setting-jellyseerr-rows') => {
		setTempJellyseerrRows(normalizeJellyseerrRows(settings.jellyseerrRows));
		pushView({ view: 'jellyseerrRows', returnFocusTo });
	}, [settings.jellyseerrRows, pushView]);

	const openIntegrationDetails = useCallback((mode, returnFocusTo) => {
		pushView({ view: 'integrationDetails', mode, returnFocusTo });
	}, [pushView]);

	const saveHomeRows = useCallback(() => {
		updateSetting('homeRows', tempHomeRows);
		if (pluginRowsLoaded) {
			const pluginRowsVisibility = {};
			const pluginRowsOrder = {};
			tempPluginRows.forEach((row) => {
				if (!row.enabled) {
					pluginRowsVisibility[row.id] = false;
				}
				pluginRowsOrder[row.id] = Number.isFinite(Number(row.order)) ? Number(row.order) : 0;
			});
			updateSetting('pluginRowsVisibility', pluginRowsVisibility);
			updateSetting('pluginRowsOrder', pluginRowsOrder);
		}
		popView();
	}, [tempHomeRows, tempPluginRows, pluginRowsLoaded, updateSetting, popView]);

	const saveJellyseerrRows = useCallback(() => {
		updateSetting('jellyseerrRows', tempJellyseerrRows);
		popView();
	}, [tempJellyseerrRows, updateSetting, popView]);

	const resetHomeRows = useCallback(() => {
		setTempHomeRows([...DEFAULT_HOME_ROWS]);
		setTempPluginRows((prev) => {
			const ordered = [...prev]
				.sort((a, b) => {
					if (a.defaultOrder !== b.defaultOrder) return a.defaultOrder - b.defaultOrder;
					return a.title.localeCompare(b.title);
				})
				.map((row, index) => ({
					...row,
					enabled: true,
					order: index
				}));
			return ordered;
		});
	}, []);

	const resetJellyseerrRows = useCallback(() => {
		setTempJellyseerrRows({ ...DEFAULT_JELLYSEERR_ROWS, rowOrder: [...DEFAULT_JELLYSEERR_ROWS.rowOrder] });
	}, []);

	const toggleHomeRow = useCallback((rowId) => {
		setTempHomeRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, enabled: !row.enabled } : row)));
	}, []);

	const togglePluginRow = useCallback((rowId) => {
		setTempPluginRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, enabled: !row.enabled } : row)));
	}, []);

	const movePluginRowUp = useCallback((rowId) => {
		setTempPluginRows((prev) => {
			const index = prev.findIndex((row) => row.id === rowId);
			if (index <= 0) return prev;
			const next = [...prev];
			const temp = next[index - 1];
			next[index - 1] = next[index];
			next[index] = temp;
			return next.map((row, idx) => ({ ...row, order: idx }));
		});
	}, []);

	const movePluginRowDown = useCallback((rowId) => {
		setTempPluginRows((prev) => {
			const index = prev.findIndex((row) => row.id === rowId);
			if (index < 0 || index >= prev.length - 1) return prev;
			const next = [...prev];
			const temp = next[index + 1];
			next[index + 1] = next[index];
			next[index] = temp;
			return next.map((row, idx) => ({ ...row, order: idx }));
		});
	}, []);

	const toggleJellyseerrRow = useCallback((rowKey) => {
		setTempJellyseerrRows((prev) => ({
			...prev,
			[rowKey]: !prev[rowKey]
		}));
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

	const renderActionItem = (id, title, desc, onClick, value) => (
		<SpottableDiv className={css.listItem} onClick={onClick} spotlightId={`setting-${id}`}>
			<div className={css.listItemBody}>
				<div className={css.listItemHeading}>{title}</div>
				{desc && <div className={css.listItemCaption}>{desc}</div>}
			</div>
			<div className={css.listItemTrailing}>
				{value ? <div className={css.listItemValue}>{value}</div> : renderChevron()}
			</div>
		</SpottableDiv>
	);

	const renderInputItem = (settingKey, title, desc, placeholder) => (
		<div className={css.inputGroup}>
			<label htmlFor={`input-${settingKey}`}>{title}</label>
			{desc && <div className={css.listItemCaption}>{desc}</div>}
			<SpottableInput
				spotlightId={`setting-${settingKey}`}
				data-spotlight-id={`setting-${settingKey}`}
				className={css.input}
				id={`input-${settingKey}`}
				type='text'
				placeholder={placeholder}
				value={settings[settingKey] || ''}
				onChange={(event) => updateSetting(settingKey, event.target.value)}
			/>
		</div>
	);

	const renderThemePreviewCards = () => (
		<div className={css.themeCardList}>
			{availableThemes.map((theme) => {
				const isSelected = theme.id === activeThemeId;
				const bg = hexToRgba(theme.colors.background);
				const surface = hexToRgba(theme.colors.surface);
				const accent = hexToRgba(theme.colors.accent);
				const progress = hexToRgba(theme.colors.rangeProgress);
				return (
					<SpottableDiv
						key={theme.id}
						className={`${css.themeCard}${isSelected ? ` ${css.themeCardSelected}` : ''}`}
						onClick={() => selectThemeById(theme.id)}
						spotlightId={`theme-card-${theme.id}`}
					>
						<div className={css.themeCardHeader}>
							<div className={css.themeCardName}>{theme.displayName}</div>
							{isSelected && <div className={css.themeCardCheck}>✓</div>}
						</div>
						<div
							className={css.themeCardStripe}
							style={{background: `linear-gradient(to right, ${bg}, ${surface}, ${accent}, ${progress})`}}
						/>
					</SpottableDiv>
				);
			})}
		</div>
	);

	const renderInfoItem = (id, label, value) => (
		<SpottableDiv className={css.listItem} spotlightId={`info-${id}`}>
			<div className={css.listItemBody}>
				<div className={css.listItemHeading}>{label}</div>
			</div>
			<div className={css.listItemValue}>{value}</div>
		</SpottableDiv>
	);

	const formatCapabilityLabel = (capability, fallbackLabel) => {
		if (!capability) return fallbackLabel;
		if (capability.serverLabel) return capability.serverLabel;
		const serverName = capability.serverName || fallbackLabel;
		return capability.username ? `${serverName} (${capability.username})` : serverName;
	};

	const formatHomeSectionsCapabilityValue = (capability) => {
		if (!capability?.installed) {
			return $L('Not installed');
		}
		if (!capability.enabled) {
			return $L('Installed but disabled');
		}
		let status = `${$L('Enabled')} - ${String(capability.sectionCount || 0)} ${$L('sections')}`;
		if (capability.pluginVersion) {
			status += ` - v${capability.pluginVersion}`;
		}
		if (capability.lastError) {
			status += ` - ${capability.lastError}`;
		}
		return status;
	};

	const formatKefinCapabilityValue = (capability) => {
		if (!capability?.installed) {
			return capability?.lastError
				? `${$L('Not detected')} - ${capability.lastError}`
				: $L('Not detected');
		}
		if (!capability.enabled) {
			return $L('Installed but Home Screen disabled');
		}
		let status = `${$L('Enabled')} - ${String(capability.sectionCount || 0)} ${$L('sections')}`;
		if (capability.version) {
			status += ` - v${capability.version}`;
		}
		if (capability.endpointUsed) {
			status += ` - ${capability.endpointUsed}`;
		}
		if (capability.lastError) {
			status += ` - ${capability.lastError}`;
		}
		return status;
	};

	const formatPluginRowSource = (source) => {
		if (source === 'hss') return $L('Home Screen Sections');
		if (source === 'kefin') return $L('KefinTweaks');
		return $L('Plugin Row');
	};

	const formatDuration = (ms) => {
		if (typeof ms !== 'number' || ms < 0) return $L('n/a');
		const totalSeconds = Math.floor(ms / 1000);
		if (totalSeconds < 60) return `${totalSeconds}s`;
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}m ${seconds}s`;
	};

	const formatProbeMetaValue = (meta) => {
		if (!meta) return $L('No probe yet');
		const source = String(meta.source || 'unknown');
		return `${source} | ${$L('Age')}: ${formatDuration(meta.cacheAgeMs)} | ${$L('Failures')}: ${String(meta.failureCount || 0)}`;
	};

	const formatProbeBackoffValue = (meta) => {
		if (!meta?.nextRetryAt || meta.nextRetryAt <= Date.now()) {
			return $L('Ready');
		}
		return `${$L('Retry in')} ${formatDuration(meta.nextRetryAt - Date.now())}`;
	};

	const formatRowsCacheValue = () => {
		const rowsMeta = probeCacheInfo?.rows;
		if (!rowsMeta) return $L('No cache');
		return `${String(rowsMeta.rowCount || 0)} ${$L('rows')} | ${$L('Age')}: ${formatDuration(rowsMeta.cacheAgeMs)}`;
	};

	const formatKefinSpec = (spec) => {
		if (!spec || typeof spec !== 'object') return '';
		const serialized = JSON.stringify(spec);
		if (!serialized) return '';
		if (serialized.length <= 220) return serialized;
		return `${serialized.slice(0, 217)}...`;
	};

	const renderMissingItem = (id, title, desc = $L('Not available on Smart-TV yet')) => (
		<SpottableDiv className={css.listItem} spotlightId={`missing-${id}`}>
			<div className={css.listItemBody}>
				<div className={css.listItemHeading}>{title}</div>
				<div className={css.listItemCaption}>{desc}</div>
			</div>
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

	const renderGeneralApplication = () => ( // eslint-disable-line no-unused-vars
		<>
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

	const renderGeneralMultiServer = () => ( // eslint-disable-line no-unused-vars
		<>
			{renderToggleItem(
				'unifiedLibraryMode',
				$L('Unified Library Mode'),
				$L('Combine content from all servers into a single view')
			)}
		</>
	);

	const renderGeneralNavbar = () => ( // eslint-disable-line no-unused-vars
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

	const renderGeneralHomeScreen = () => ( // eslint-disable-line no-unused-vars
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
			{renderNavItem('homeRows', $L('Configure Home Rows'), $L('Customize which rows appear on home screen'), () => openHomeRowsEditor('setting-homeRows'))}
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
			{renderOptionItem('maxBitrate', $L('Maximum Bitrate'), getBitrateOptions(), $L('Auto (Recommended)'))}
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

	const renderDisplayBackdrop = () => ( // eslint-disable-line no-unused-vars
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

	const renderDisplayUI = () => ( // eslint-disable-line no-unused-vars
		<>
			{renderOptionItem('uiScale', $L('UI Scale'), getUiScaleOptions(), $L('Default'))}
			{renderOptionItem('userOpacity', $L('User Avatar Opacity'), USER_OPACITY_OPTIONS, '85%')}
			{renderToggleItem('cardFocusZoom', $L('Card Focus Zoom'), $L('Slightly enlarge cards when focused'))}
		</>
	);

	const renderDisplayFeatured = () => ( // eslint-disable-line no-unused-vars
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

	const renderPlaybackNextUp = () => ( // eslint-disable-line no-unused-vars
		<>
			{renderOptionItem('nextUpBehavior', $L('Next Up Behavior'), getNextUpBehaviorOptions(), $L('Extended'))}
			{settings.nextUpBehavior !== 'disabled' &&
				renderSliderItem('nextUpTimeout', $L('Countdown Timer'), 0, 30, 1, (v) => (v === 0 ? $L('Instant') : `${v}s`))}
		</>
	);

	const renderDisplayThemes = () => ( // eslint-disable-line no-unused-vars
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

	const renderDisplayScreensaver = () => ( // eslint-disable-line no-unused-vars
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

	const renderAccountAuthentication = () => (
		<>
			{renderToggleItem('autoLogin', $L('Auto Sign In'), $L('Automatically sign in on app launch'))}
		</>
	);

	const renderAccountPrivacySafety = () => (
		<>
			{renderMissingItem('blocked-ratings', $L('Blocked Ratings'))}
			{renderToggleItem('confirmExit', $L('Exit Confirmation'), $L('Show confirmation dialog before exiting'))}
		</>
	);

	const renderPersonalizationGeneralStyle = () => (
		<>
			{renderNavItem(
				'themeSelection',
				$L('Theme'),
				availableThemes.find((t) => t.id === activeThemeId)?.displayName || $L('Default'),
				openThemes
			)}
			{renderOptionItem('focusBorderColor', $L('Focus Border Color'), ACCENT_COLOR_OPTIONS, $L('Theme Default'))}
			{renderOptionItem('clockDisplay', $L('Clock Display'), getClockDisplayOptions(), $L('24-Hour'))}
			{renderToggleItem('cardFocusZoom', $L('Card Focus Expansion'), $L('Slightly enlarge cards when focused'))}
			{renderToggleItem('showHomeBackdrop', $L('Show Backdrops'), $L('Show background art while browsing'))}
			{renderOptionItem('backdropBlurHome', $L('Browsing Blur'), getBlurOptions(), $L('Medium'))}
			{renderOptionItem('backdropBlurDetail', $L('Details Blur'), getBlurOptions(), $L('Medium'))}
			{renderOptionItem('watchedIndicatorBehavior', $L('Watched Indicators'), getWatchedIndicatorOptions(), $L('Always'))}
			{renderToggleItem('themeMusicEnabled', $L('Theme Music'), $L('Play background music on detail pages'))}
			{settings.themeMusicEnabled &&
				renderSliderItem('themeMusicVolume', $L('Theme Music Volume'), 0, 100, 5, (v) => `${v}%`)}
		</>
	);

	const renderPersonalizationNavigation = () => (
		<>
			{renderOptionItem('navbarPosition', $L('Navbar Position'), getNavPositionOptions(), $L('Top Bar'))}
			{renderSliderItem('navbarOpacity', $L('Navbar Opacity'), 0, 100, 5, (v) => `${v}%`)}
			{renderOptionItem('navbarColor', $L('Navbar Color'), ACCENT_COLOR_OPTIONS, $L('Theme Default'))}
			{renderToggleItem('showShuffleButton', $L('Shuffle Button'), $L('Show shuffle button in navigation bar'))}
			{settings.showShuffleButton &&
				renderOptionItem('shuffleContentType', $L('Shuffle Content Type'), getContentTypeOptions(), $L('Movies & TV Shows'))}
			{renderToggleItem('showGenresButton', $L('Genres Button'), $L('Show genres button in navigation bar'))}
			{renderToggleItem('showFavoritesButton', $L('Favorites Button'), $L('Show favorites button in navigation bar'))}
			{renderToggleItem('showLibrariesInToolbar', $L('Libraries Button'), $L('Show library shortcuts in navigation bar'))}
			{renderToggleItem('showSyncPlayButton', $L('SyncPlay Button'), $L('Show SyncPlay button in navigation bar'))}
		</>
	);

	const renderPersonalizationHomePage = () => (
		<>
			{renderNavItem('homeRows', $L('Home Sections'), $L('Configure which rows appear on home screen'), () => openHomeRowsEditor('setting-homeRows'))}
			{renderToggleItem('mergeContinueWatchingNextUp', $L('Merge Continue Watching'), $L('Combine Continue Watching and Next Up'))}
			{renderOptionItem('homeRowsImageType', $L('Home Row Image Type'), getImageTypeOptions(), $L('Poster'))}
			{renderToggleItem('useSeriesThumbnails', $L('Series Thumbnails'), $L('Use series artwork instead of episode images'))}
			{renderOptionItem('homeRowsPosterSize', $L('Image Size'), getPosterSizeOptions(), $L('Default'))}
			{renderToggleItem('homeRowOverlay', $L('Home Row Overlay'), $L('Show info overlay text on home row cards'))}
			{renderToggleItem('themeMusicOnHomeRows', $L('Play Theme Music on Home Page'), $L('Play theme music while browsing home rows'))}
		</>
	);

	const renderPersonalizationLibraries = () => (
		<>
			{renderNavItem('hideLibraries', $L('Library Visibility'), $L('Choose which libraries are hidden'), openLibraries)}
			{renderToggleItem('enableFolderView', $L('Folder View'), $L('Browse library content in folder layout'))}
			{renderToggleItem('unifiedLibraryMode', $L('Multi-Server Libraries'), $L('Combine content from all servers into a single view'))}
		</>
	);

	const renderDynamicVisualOverlays = () => (
		<>
			{renderOptionItem('seasonalTheme', $L('Seasonal Surprise'), getSeasonalThemeOptions(), $L('None'))}
			{renderToggleItem('screensaverEnabled', $L('In-App Screensaver'), $L('Reduce brightness after inactivity'))}
			{settings.screensaverEnabled &&
				renderOptionItem('screensaverMode', $L('Screensaver Mode'), getScreensaverModeOptions(), $L('Library Backdrops'))}
			{settings.screensaverEnabled &&
				renderOptionItem('screensaverTimeout', $L('Screensaver Timeout'), getScreensaverTimeoutOptions(), $L('90 seconds'))}
			{settings.screensaverEnabled &&
				renderOptionItem('screensaverDimmingLevel', $L('Screensaver Dimming Level'), getScreensaverDimmingOptions(), '50%')}
			{settings.screensaverEnabled &&
				renderOptionItem('screensaverMaxRating', $L('Screensaver Max Age Rating'), AGE_RATING_OPTIONS, 'PG-13')}
			{settings.screensaverEnabled &&
				renderToggleItem('screensaverAgeFilter', $L('Screensaver Rating Requirement'), $L('Only show content with a rating'))}
			{settings.screensaverEnabled &&
				renderToggleItem('screensaverShowClock', $L('Screensaver Clock'), $L('Display clock during screensaver'))}
		</>
	);

	const renderDynamicMediaBar = () => (
		<>
			{renderToggleItem('showFeaturedBar', $L('Media Bar Mode'), $L('Toggle media bar visibility'))}
			{renderOptionItem('featuredContentType', $L('Content Type'), getContentTypeOptions(), $L('Movies & TV Shows'))}
			{renderOptionItem('featuredItemCount', $L('Item Count'), getFeaturedItemCountOptions(), $L('10 items'))}
			{renderNavItem('sourceLibraries', $L('Source Libraries'), $L('Choose source libraries for media bar'), () => {})}
			{renderNavItem('sourceCollections', $L('Source Collections'), $L('Choose source collections for media bar'), () => {})}
			{renderMissingItem('excluded-genres', $L('Excluded Genres'))}
			{renderMissingItem('auto-advance', $L('Auto Advance'))}
			{renderMissingItem('auto-advance-interval', $L('Auto Advance Interval'))}
			{renderToggleItem('featuredTrailerPreview', $L('Trailer Preview'), $L('Automatically play trailer previews in media bar'))}
			{renderMissingItem('media-preview', $L('Media Preview'))}
			{renderMissingItem('preview-audio', $L('Preview Audio'))}
		</>
	);

	const renderIntegrationsPlugin = () => {
		const rawUpdated = Number(profileEnvelope?.lastUpdated || 0);
		const timestamp = rawUpdated > 9999999999 ? rawUpdated : rawUpdated > 0 ? rawUpdated * 1000 : 0;
		const updatedAt = timestamp > 0 ? new Date(timestamp).toLocaleString() : $L('Never');
		const updatedBy = profileEnvelope?.lastUpdatedBy || $L('Unknown');
		const profileValue = timestamp > 0
			? `${updatedAt} | ${updatedBy}`
			: $L('Never synced');

		return (
			<>
				<SpottableDiv className={css.listItem} onClick={handleMoonfinToggle} spotlightId='setting-useMoonfinPlugin'>
					<div className={css.listItemBody}>
						<div className={css.listItemHeading}>{$L('Plugin Sync Enabled')}</div>
						<div className={css.listItemCaption}>{$L('Enable Moonfin plugin integration')}</div>
					</div>
					<div className={css.listItemTrailing}>{renderToggle(settings.useMoonfinPlugin)}</div>
				</SpottableDiv>
				{renderInfoItem('customization-profile', $L('Customization Profile'), profileValue)}
				{renderActionItem(
					'load-profile',
					$L('Load Profile'),
					$L('Pull TV settings profile from Moonfin plugin'),
					() => handleLoadProfile('setting-load-profile'),
					profileLoading ? $L('Loading...') : null
				)}
				{settings.useMoonfinPlugin &&
					renderActionItem(
						'save-profile',
						$L('Save Profile'),
						$L('Push current TV settings to Moonfin plugin'),
						() => handleSaveProfile('setting-save-profile'),
						profileSaving ? $L('Saving...') : null
					)}
				{moonfinStatus && <div className={css.statusMessage}>{moonfinStatus}</div>}
			</>
		);
	};

	const renderIntegrationsMetadataRatings = () => (
		<>
			{renderToggleItem('mdblistEnabled', $L('Fetch Additional Ratings'), $L('Enable MDBList ratings'))}
			{settings.mdblistEnabled &&
				renderInputItem('mdblistApiKey', $L('MDBList API Key'), $L('Required for custom MDBList ratings'), $L('Enter MDBList API key'))}
			{settings.mdblistEnabled &&
				MDBLIST_RATING_SOURCE_OPTIONS.map((source) => {
					const enabledSources = Array.isArray(settings.mdblistRatingSources) ? settings.mdblistRatingSources : [];
					const isEnabled = enabledSources.includes(source.value);
					return (
						<SpottableDiv
							key={source.value}
							className={css.listItem}
							onClick={() => toggleRatingSource(source.value)}
							spotlightId={`rating-source-${source.value}`}
						>
							<div className={css.listItemBody}>
								<div className={css.listItemHeading}>{source.label}</div>
								<div className={css.listItemCaption}>{$L('Enabled Rating Sources')}</div>
							</div>
							<div className={css.listItemTrailing}>{renderToggle(isEnabled)}</div>
						</SpottableDiv>
					);
				})}
			{renderToggleItem('tmdbEpisodeRatingsEnabled', $L('Show Episode Ratings'), $L('Show episode ratings from TMDB'))}
			{renderInputItem('tmdbApiKey', $L('TMDB API Key'), $L('Optional override for TMDB requests'), $L('Enter TMDB API key'))}
			{renderToggleItem('showRatingLabels', $L('Show Rating Text Labels'), $L('Display source labels under scores'))}
			{renderToggleItem('mdblistShowRatingBadges', $L('Show Rating Badges'), $L('Display badge-style rating chips'))}
		</>
	);

	const renderIntegrationsSeerr = () => (
		<>
			{renderToggleItem('jellyseerrEnabled', $L('Enable Seerr'), $L('Enable Jellyseerr request integration'))}
			{settings.jellyseerrEnabled &&
				renderInputItem('jellyseerrApiKey', $L('Seerr API Key'), $L('Optional API key override'), $L('Enter Seerr API key'))}
			{renderToggleItem('jellyseerrBlockNsfw', $L('NSFW Filter'), $L('Hide adult content in Seerr results'))}
			{renderInfoItem('logged-in-as', $L('Logged In As'), jellyseerr.user?.displayName || $L('Not connected'))}
			{renderNavItem('jellyseerr-rows', $L('Discover Rows'), $L('Choose which Seerr discover rows are visible'), openJellyseerrRows)}
		</>
	);

	const renderIntegrationsHomeScreenSections = () => (
		(() => {
			const enabledRowsCount = (settings.homeRows || []).filter((row) => row.enabled).length;
			const availableCapabilities = homeSectionsCapabilities.filter((capability) => capability.available).length;
			const installedCapabilities = homeSectionsCapabilities.filter((capability) => capability.installed).length;
			return (
				<>
					{renderInfoItem('home-sections-sync', $L('Sync Source'), settings.useMoonfinPlugin ? $L('Moonfin Plugin') : $L('Local Settings'))}
					{renderInfoItem('home-sections-enabled', $L('Enabled Sections'), String(enabledRowsCount))}
					{renderInfoItem('home-sections-detected', $L('Detected Servers'), `${availableCapabilities}/${Math.max(homeSectionsCapabilities.length, 0)}`)}
					{renderInfoItem('home-sections-installed', $L('Plugin Installed'), `${installedCapabilities}/${Math.max(homeSectionsCapabilities.length, 0)}`)}
					{renderInfoItem('home-sections-probe-cache', $L('Probe Cache'), formatProbeMetaValue(homeProbeMeta))}
					{renderInfoItem('home-sections-backoff', $L('Backoff'), formatProbeBackoffValue(homeProbeMeta))}
					{renderInfoItem('home-sections-row-cache', $L('Row Cache'), formatRowsCacheValue())}
					{renderActionItem(
						'home-sections-refresh-capabilities',
						$L('Refresh Plugin Detection'),
						$L('Probe all logged-in servers for Home Screen Sections plugin endpoints'),
						() => refreshPluginCapabilities('setting-home-sections-refresh-capabilities'),
						integrationProbeLoading ? $L('Refreshing...') : null
					)}
					{renderActionItem(
						'home-sections-force-refresh',
						$L('Force Retry Now'),
						$L('Bypass cache and backoff for immediate re-probe'),
						() => forceRetryPluginCapabilities('setting-home-sections-force-refresh'),
						integrationProbeLoading ? $L('Refreshing...') : null
					)}
					{renderActionItem(
						'home-sections-clear-cache',
						$L('Clear Probe Cache'),
						$L('Reset probe cache and backoff counters'),
						() => handleClearProbeCache('setting-home-sections-clear-cache')
					)}
					{homeSectionsCapabilities.length === 0 &&
						renderInfoItem('home-sections-no-servers', $L('Server Probe'), $L('No logged-in servers found'))}
					{homeSectionsCapabilities.map((capability) =>
						renderInfoItem(
							`home-sections-cap-${capability.serverId}-${capability.userId}`,
							formatCapabilityLabel(capability, $L('Server')),
							formatHomeSectionsCapabilityValue(capability)
						)
					)}
					{renderNavItem(
						'home-sections-details',
						$L('View Discovered Sections'),
						$L('Inspect server sections, keys, and metadata'),
						() => openIntegrationDetails('homeScreenSections', 'setting-home-sections-details')
					)}
					{renderActionItem(
						'home-sections-editor',
						$L('Edit Home Sections'),
						$L('Open section toggle and ordering editor'),
						() => openHomeRowsEditor('setting-home-sections-editor')
					)}
					{renderNavItem(
						'home-sections-nav',
						$L('Open Home Page Settings'),
						$L('Configure rows and image behavior'),
						() =>
							pushView({
								view: 'subcategory',
								categoryId: 'personalization',
								subcategoryId: 'homePage',
								label: $L('Home Page'),
								returnFocusTo: 'setting-home-sections-nav'
							})
					)}
					{settings.useMoonfinPlugin &&
						renderActionItem(
							'home-sections-load',
							$L('Load Sections From Server'),
							$L('Pull latest section profile from Moonfin plugin'),
							() => handleLoadProfile('setting-home-sections-load'),
							profileLoading ? $L('Loading...') : null
						)}
					{settings.useMoonfinPlugin &&
						renderActionItem(
							'home-sections-save',
							$L('Save Sections To Server'),
							$L('Push current section layout to Moonfin plugin'),
							() => handleSaveProfile('setting-home-sections-save'),
							profileSaving ? $L('Saving...') : null
						)}
					{integrationProbeStatus && <div className={css.statusMessage}>{integrationProbeStatus}</div>}
					{moonfinStatus && <div className={css.statusMessage}>{moonfinStatus}</div>}
					<div className={css.viewDescription}>
						{$L('Capability detection mirrors Mobile-Desktop plugin probing while keeping cross-platform profile sync controls for Tizen and webOS.')}
					</div>
				</>
			);
		})()
	);

	const renderIntegrationsKefinTweaks = () => (
		(() => {
			const rowsConfig = normalizeJellyseerrRows(settings.jellyseerrRows);
			const enabledDiscoverRows = rowsConfig.rowOrder.filter((key) => rowsConfig[key]).length;
			const availableCapabilities = kefinCapabilities.filter((capability) => capability.available).length;
			const installedCapabilities = kefinCapabilities.filter((capability) => capability.installed).length;
			return (
				<>
					{renderInfoItem('kefin-status', $L('KefinTweaks'), $L('JavaScript Injector probe'))}
					{renderInfoItem('kefin-home-sections', $L('Enabled Home Sections'), String((settings.homeRows || []).filter((row) => row.enabled).length))}
					{renderInfoItem('kefin-discover-sections', $L('Enabled Discover Rows'), String(enabledDiscoverRows))}
					{renderInfoItem('kefin-detected', $L('Detected Servers'), `${availableCapabilities}/${Math.max(kefinCapabilities.length, 0)}`)}
					{renderInfoItem('kefin-installed', $L('KefinTweaks Found'), `${installedCapabilities}/${Math.max(kefinCapabilities.length, 0)}`)}
					{renderInfoItem('kefin-probe-cache', $L('Probe Cache'), formatProbeMetaValue(kefinProbeMeta))}
					{renderInfoItem('kefin-backoff', $L('Backoff'), formatProbeBackoffValue(kefinProbeMeta))}
					{renderInfoItem('kefin-row-cache', $L('Row Cache'), formatRowsCacheValue())}
					{renderActionItem(
						'kefin-refresh-capabilities',
						$L('Refresh Plugin Detection'),
						$L('Probe JavaScript Injector private/public endpoints on all logged-in servers'),
						() => refreshPluginCapabilities('setting-kefin-refresh-capabilities'),
						integrationProbeLoading ? $L('Refreshing...') : null
					)}
					{renderActionItem(
						'kefin-force-refresh',
						$L('Force Retry Now'),
						$L('Bypass cache and backoff for immediate re-probe'),
						() => forceRetryPluginCapabilities('setting-kefin-force-refresh'),
						integrationProbeLoading ? $L('Refreshing...') : null
					)}
					{renderActionItem(
						'kefin-clear-cache',
						$L('Clear Probe Cache'),
						$L('Reset probe cache and backoff counters'),
						() => handleClearProbeCache('setting-kefin-clear-cache')
					)}
					{kefinCapabilities.length === 0 &&
						renderInfoItem('kefin-no-servers', $L('Server Probe'), $L('No logged-in servers found'))}
					{kefinCapabilities.map((capability) =>
						renderInfoItem(
							`kefin-cap-${capability.serverId}-${capability.userId}`,
							formatCapabilityLabel(capability, $L('Server')),
							formatKefinCapabilityValue(capability)
						)
					)}
					{renderNavItem(
						'kefin-details',
						$L('View Discovered Sections'),
						$L('Inspect server sections and parsed specs'),
						() => openIntegrationDetails('kefinTweaks', 'setting-kefin-details')
					)}
					{renderActionItem(
						'kefin-home-rows',
						$L('Manage Home Sections'),
						$L('Open local section editor used by both TV platforms'),
						() => openHomeRowsEditor('setting-kefin-home-rows')
					)}
					{renderActionItem(
						'kefin-discover-rows',
						$L('Manage Discover Rows'),
						$L('Configure Seerr discover row visibility'),
						() => openJellyseerrRows('setting-kefin-discover-rows')
					)}
					{settings.useMoonfinPlugin &&
						renderActionItem(
							'kefin-load-profile',
							$L('Load Server Tweaks'),
							$L('Pull server-managed profile tweaks into this device'),
							() => handleLoadProfile('setting-kefin-load-profile'),
							profileLoading ? $L('Loading...') : null
						)}
					{settings.useMoonfinPlugin &&
						renderActionItem(
							'kefin-save-profile',
							$L('Save Device Tweaks'),
							$L('Push current tweaks to server profile for cross-platform use'),
							() => handleSaveProfile('setting-kefin-save-profile'),
							profileSaving ? $L('Saving...') : null
						)}
					{integrationProbeStatus && <div className={css.statusMessage}>{integrationProbeStatus}</div>}
					{moonfinStatus && <div className={css.statusMessage}>{moonfinStatus}</div>}
					<div className={css.viewDescription}>
						{$L('Detection now follows Mobile-Desktop: read JavaScript Injector config, parse window.KefinTweaksConfig, then keep profile-compatible controls for cross-platform management.')}
					</div>
				</>
			);
		})()
	);

	const renderPlaybackAudio = () => (
		<>
			{renderMissingItem('audio-night-mode', $L('Audio Night Mode'))}
			{renderMissingItem('default-audio-language', $L('Default Audio Language'))}
			{renderMissingItem('audio-behavior', $L('Audio Behavior'))}
			{renderMissingItem('ac3-passthrough', $L('AC3 Passthrough'))}
			{renderMissingItem('truehd-support', $L('TrueHD Support'))}
		</>
	);

	const renderPlaybackSubtitleCustomization = () => (
		<>
			{renderOptionItem('subtitleSize', $L('Subtitle Size'), getSubtitleSizeOptions(), $L('Medium'))}
			{renderOptionItem('subtitleColor', $L('Text Fill Color'), getSubtitleColorOptions(), $L('White'))}
			{renderOptionItem('subtitleShadowColor', $L('Text Stroke Color'), getSubtitleShadowColorOptions(), $L('Black'))}
			{renderOptionItem('subtitleBackgroundColor', $L('Background Color'), getSubtitleBackgroundColorOptions(), $L('Black'))}
			{renderOptionItem('subtitlePosition', $L('Vertical Offset'), getSubtitlePositionOptions(), $L('Bottom'))}
		</>
	);

	const renderPlaybackAutomationQueue = () => (
		<>
			{renderMissingItem('cinema-mode', $L('Cinema Mode'))}
			{renderToggleItem('autoPlay', $L('Episode Queuing'), $L('Automatically play the next episode'))}
			{renderOptionItem('nextUpBehavior', $L('Next Up Prompt'), getNextUpBehaviorOptions(), $L('Extended'))}
			{settings.nextUpBehavior !== 'disabled' &&
				renderSliderItem('nextUpTimeout', $L('Next Up Prompt Timeout'), 0, 30, 1, (v) => (v === 0 ? $L('Instant') : `${v}s`))}
		</>
	);

	const renderPlaybackSyncPlay = () => (
		<>
			{renderMissingItem('syncplay-enabled', $L('SyncPlay Enabled'))}
			{renderToggleItem('showSyncPlayButton', $L('SyncPlay Button'), $L('Show SyncPlay button in navigation bar'))}
			{renderMissingItem('open-syncplay', $L('Open SyncPlay'))}
			{renderMissingItem('advanced-correction', $L('Advanced Correction'))}
			{renderMissingItem('sync-correction', $L('Sync Correction'))}
			{renderMissingItem('speed-to-sync', $L('Speed to Sync'))}
			{renderMissingItem('skip-to-sync', $L('Skip to Sync'))}
			{renderMissingItem('minimum-speed-delay', $L('Minimum Speed Delay'))}
			{renderMissingItem('maximum-speed-delay', $L('Maximum Speed Delay'))}
			{renderMissingItem('speed-duration', $L('Speed Duration'))}
			{renderMissingItem('minimum-skip-delay', $L('Minimum Skip Delay'))}
			{renderMissingItem('syncplay-extra-offset', $L('SyncPlay Extra Offset'))}
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

	const renderAboutAppInfo = () => renderAboutApp();

	const renderPluginMoonfin = () => ( // eslint-disable-line no-unused-vars
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

	const renderPluginStatus = () => { // eslint-disable-line no-unused-vars
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

	const renderPluginMDBList = () => ( // eslint-disable-line no-unused-vars
		<>
			{renderToggleItem('mdblistEnabled', $L('Enable Ratings'), $L('Show MDBList ratings on media details and featured bar'))}
			{settings.mdblistEnabled &&
				renderToggleItem('showRatingLabels', $L('Show Rating Labels'), $L('Display source names below rating scores'))}
		</>
	);

	const renderPluginTMDB = () => ( // eslint-disable-line no-unused-vars
		<>{renderToggleItem('tmdbEpisodeRatingsEnabled', $L('Episode Ratings'), $L('Show TMDB ratings on individual episodes'))}</>
	);

	const renderPluginSeerr = () => ( // eslint-disable-line no-unused-vars
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
					{ id: 'homeScreenSections', label: $L('Home Screen Sections'), description: $L('Section sync and management info') },
					{ id: 'kefinTweaks', label: $L('KefinTweaks'), description: $L('Server-side integration info') }
				];
			case 'playbackSyncPlay':
				return [
					{ id: 'video', label: $L('Video'), description: $L('Playback quality, seeking, and behavior') },
					{ id: 'audio', label: $L('Audio'), description: $L('Audio language and passthrough options') },
					{ id: 'subtitles', label: $L('Subtitles'), description: $L('Subtitle defaults and direct-play options') },
					{ id: 'subtitleCustomization', label: $L('Subtitle Customization'), description: $L('Text color, size, and position styling') },
					{ id: 'automationQueue', label: $L('Automation & Queue'), description: $L('Next up, queueing, and prompt behavior') },
					{ id: 'syncPlay', label: $L('SyncPlay'), description: $L('Group playback sync controls') }
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
				return renderIntegrationsHomeScreenSections();
			case 'integrations.kefinTweaks':
				return renderIntegrationsKefinTweaks();
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
			case 'playbackSyncPlay.syncPlay':
				return renderPlaybackSyncPlay();
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
		const currentValue = settingKey === '__themeSelection' ? activeThemeId : settings[settingKey];
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

	const renderThemesView = () => (
		<ViewContainer className={css.viewContainer} spotlightId='themes-view'>
			<div className={css.listContent} onFocus={handleListFocus}>
				<div className={css.listInner}>
					{renderSectionTitle($L('Theme'))}
					{renderThemePreviewCards()}
				</div>
			</div>
		</ViewContainer>
	);

	const renderHomeRowsView = () => (
		<ViewContainer className={css.viewContainer} spotlightId='homerows-view'>
			<div className={css.listContent} onFocus={handleListFocus}>
				<div className={css.listInner}>
					{renderSectionTitle($L('Configure Home Rows'))}
					<div className={css.viewDescription}>
						{$L('Enable/disable and reorder the rows that appear on your home screen using the arrow buttons.')}
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
					{pluginRowsLoading && (
						<div className={css.loadingMessage}>{$L('Loading discovered plugin rows...')}</div>
					)}
					{pluginRowsError && <div className={css.statusMessage}>{pluginRowsError}</div>}
					{!pluginRowsLoading && tempPluginRows.length > 0 && (
						<>
							<div className={css.viewDescription}>
								{$L('Discovered plugin rows can be toggled and reordered with the same arrow controls.')}
							</div>
							{tempPluginRows.map((row, index) => (
								<div key={row.id} className={css.homeRowItem}>
									<SpottableDiv
										className={css.listItem}
										onClick={() => togglePluginRow(row.id)}
										spotlightId={`plugin-row-${index}`}
									>
										<div className={css.listItemBody}>
											<div className={css.listItemHeading}>{row.title}</div>
											<div className={css.listItemCaption}>{formatPluginRowSource(row.source)}</div>
										</div>
										<div className={css.listItemTrailing}>{renderToggle(row.enabled)}</div>
									</SpottableDiv>
									<div className={css.homeRowControls}>
										<Button
											onClick={() => movePluginRowUp(row.id)}
											disabled={index === 0}
											size='small'
											icon='arrowlargeup'
											spotlightId={`plugin-row-up-${row.id}`}
										/>
										<Button
											onClick={() => movePluginRowDown(row.id)}
											disabled={index === tempPluginRows.length - 1}
											size='small'
											icon='arrowlargedown'
											spotlightId={`plugin-row-down-${row.id}`}
										/>
									</div>
								</div>
							))}
						</>
					)}
					{!pluginRowsLoading && pluginRowsLoaded && !pluginRowsError && tempPluginRows.length === 0 && (
						<div className={css.viewDescription}>{$L('No discovered plugin rows are currently available.')}</div>
					)}
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

	const renderJellyseerrRowsView = () => {
		const config = normalizeJellyseerrRows(tempJellyseerrRows);
		const orderedRows = config.rowOrder
			.map((key) => ({ key, option: JELLYSEERR_ROW_OPTIONS.find((entry) => entry.key === key) }))
			.filter((entry) => !!entry.option);

		return (
			<ViewContainer className={css.viewContainer} spotlightId='jellyseerr-rows-view'>
				<div className={css.listContent} onFocus={handleListFocus}>
					<div className={css.listInner}>
						{renderSectionTitle($L('Discover Rows'))}
						<div className={css.viewDescription}>
							{$L('Choose which Seerr discovery rows are visible in the app.')}
						</div>
						{orderedRows.map(({ key, option }) => (
							<SpottableDiv
								key={key}
								className={css.listItem}
								onClick={() => toggleJellyseerrRow(key)}
								spotlightId={`jellyseerr-row-${key}`}
							>
								<div className={css.listItemBody}>
									<div className={css.listItemHeading}>{option.label}</div>
								</div>
								<div className={css.listItemTrailing}>{renderToggle(!!config[key])}</div>
							</SpottableDiv>
						))}
						<div className={css.actionBar}>
							<Button onClick={resetJellyseerrRows} size='small' spotlightId='jellyseerr-rows-reset'>
								{$L('Reset to Default')}
							</Button>
							<Button onClick={saveJellyseerrRows} size='small' spotlightId='jellyseerr-rows-save'>
								{$L('Save')}
							</Button>
						</div>
					</div>
				</div>
			</ViewContainer>
		);
	};

	const renderIntegrationDetailsView = () => {
		const mode = currentView.mode;
		const isHomeSections = mode === 'homeScreenSections';
		const integrationCapabilities = isHomeSections ? homeSectionsCapabilities : kefinCapabilities;
		const title = isHomeSections ? $L('Home Screen Sections Details') : $L('KefinTweaks Details');

		return (
			<ViewContainer className={css.viewContainer} spotlightId='integration-details-view'>
				<div className={css.listContent} onFocus={handleListFocus}>
					<div className={css.listInner}>
						{renderSectionTitle(title)}
						<div className={css.viewDescription}>
							{isHomeSections
								? $L('Per-server Home Screen plugin sections and endpoint keys discovered from active sessions.')
								: $L('Per-server KefinTweaks sections discovered from JavaScript Injector configuration.')}
						</div>
						{renderActionItem(
							'integration-details-refresh',
							$L('Refresh Detection'),
							$L('Run standard probe using cache and backoff policy'),
							() => refreshPluginCapabilities('setting-integration-details-refresh'),
							integrationProbeLoading ? $L('Refreshing...') : null
						)}
						{renderActionItem(
							'integration-details-force-refresh',
							$L('Force Retry Now'),
							$L('Bypass cache and backoff for immediate re-probe'),
							() => forceRetryPluginCapabilities('setting-integration-details-force-refresh'),
							integrationProbeLoading ? $L('Refreshing...') : null
						)}
						{integrationCapabilities.length === 0 && (
							<div className={css.loadingMessage}>{$L('No discovered sections for current servers')}</div>
						)}
						{integrationCapabilities.map((capability, capabilityIndex) => {
							const sections = Array.isArray(capability.sections) ? capability.sections : [];
							return (
								<div
									key={`integration-detail-${capability.serverId}-${capability.userId}-${capabilityIndex}`}
									className={css.integrationServerBlock}
								>
									{renderInfoItem(
										`integration-cap-${mode}-${capability.serverId}-${capability.userId}`,
										formatCapabilityLabel(capability, $L('Server')),
										isHomeSections ? formatHomeSectionsCapabilityValue(capability) : formatKefinCapabilityValue(capability)
									)}
									{sections.length === 0 &&
										renderInfoItem(
											`integration-cap-empty-${mode}-${capability.serverId}-${capability.userId}`,
											$L('Discovered Sections'),
											$L('None')
										)}
									{sections.map((section, sectionIndex) => {
										const heading = section.displayText || section.section || section.id || $L('Section');
										const keyText = isHomeSections
											? `${$L('Section Key')}: ${section.section || $L('Unknown')}`
											: `${$L('Section Id')}: ${section.id || $L('Unknown')}`;
										const additionalText = isHomeSections
											? (section.additionalData ? `${$L('Additional Data')}: ${section.additionalData}` : null)
											: (section.spec ? formatKefinSpec(section.spec) : null);
										return (
											<SpottableDiv
												key={`integration-sec-${mode}-${capability.serverId}-${capability.userId}-${sectionIndex}`}
												className={css.listItem}
												spotlightId={`integration-sec-${mode}-${capabilityIndex}-${sectionIndex}`}
											>
												<div className={css.listItemBody}>
													<div className={css.listItemHeading}>{heading}</div>
													<div className={css.listItemCaption}>{keyText}</div>
													{additionalText && <div className={css.integrationSpec}>{additionalText}</div>}
												</div>
											</SpottableDiv>
										);
									})}
								</div>
							);
						})}
					</div>
				</div>
			</ViewContainer>
		);
	};

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
			{currentView.view === 'themes' && renderThemesView()}
			{currentView.view === 'homeRows' && renderHomeRowsView()}
			{currentView.view === 'jellyseerrRows' && renderJellyseerrRowsView()}
			{currentView.view === 'integrationDetails' && renderIntegrationDetailsView()}
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
