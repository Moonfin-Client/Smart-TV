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
import {probeKefinTweaks, kefinSectionToPluginSection} from '../../services/kefinTweaksService';
import {probeHomeScreenSections, hssSectionToPluginSection} from '../../services/homeScreenSectionsService';
import {isBackKey} from '../../utils/keys';
import ClearDataDialog from '../../components/ClearDataDialog';
import SpottableInput from '../../components/SpottableInput/SpottableInput';
import {clearAllStorage} from '../../services/storage';
import {MATERIAL_ICON_PATHS} from './materialIconMap';

import css from './Settings.module.less';

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');
const ViewContainer = SpotlightContainerDecorator({
	enterTo: 'last-focused',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

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
	filter: 'filter_list',
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
	const iconPath = MATERIAL_ICON_PATHS[toMaterialIconName(iconName)] || MATERIAL_ICON_PATHS.settings;

	return (
		<div className={css.listItemIcon}>
			<svg
				className={css.materialIconSvg}
				viewBox='0 -960 960 960'
				fill='currentColor'
				aria-hidden='true'
				focusable='false'
			>
				<path d={iconPath} />
			</svg>
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
	{ value: 120000000, label: $L('120 Mbps') },
	{ value: 80000000, label: $L('80 Mbps') },
	{ value: 60000000, label: $L('60 Mbps') },
	{ value: 40000000, label: $L('40 Mbps') },
	{ value: 20000000, label: $L('20 Mbps') },
	{ value: 10000000, label: $L('10 Mbps') },
	{ value: 5000000, label: $L('5 Mbps') }
];

const getContentTypeOptions = () => [
	{ value: 'both', label: $L('Movies & TV Shows') },
	{ value: 'movies', label: $L('Movies Only') },
	{ value: 'tv', label: $L('TV Shows Only') }
];

const getFeaturedBarStyleOptions = () => [
	{ value: 'moonfin', label: $L('Moonfin') },
	{ value: 'makd', label: $L('MakD') },
	{ value: 'gallery', label: $L('Gallery') },
	{ value: 'banner', label: $L('Banner') },
	{ value: 'bookshelf', label: $L('Bookshelf') }
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
	{ value: 50, label: $L('50%') },
	{ value: 65, label: $L('65%') },
	{ value: 75, label: $L('75%') },
	{ value: 85, label: $L('85%') },
	{ value: 95, label: $L('95%') }
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
	{ value: 25, label: $L('25%') },
	{ value: 50, label: $L('50%') },
	{ value: 75, label: $L('75%') },
	{ value: 100, label: $L('100%') }
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

const getHomeRowsStyleOptions = () => [
	{ value: 'modern', label: $L('Modern') },
	{ value: 'classic', label: $L('Classic') }
];

const getHomeRowSortOptions = () => [
	{ value: 'SortName', label: $L('Name') },
	{ value: 'DateCreated', label: $L('Date Added') },
	{ value: 'PremiereDate', label: $L('Premiere Date') },
	{ value: 'OfficialRating', label: $L('Rating') },
	{ value: 'Runtime', label: $L('Runtime') },
	{ value: 'Random', label: $L('Random') },
	{ value: 'CriticRating', label: $L('Critic Rating') },
	{ value: 'CommunityRating', label: $L('Community Rating') }
];

const getGenresRowItemFilterOptions = () => [
	{ value: 'all', label: $L('Movies & TV Shows') },
	{ value: 'Movie', label: $L('Movies') },
	{ value: 'Series', label: $L('TV Shows') }
];

const getSortOrderFromSortBy = (sortBy) => {
	if (sortBy === 'SortName') return 'Ascending';
	if (sortBy === 'Random') return 'Ascending';
	return 'Descending';
};

const getGenresIncludeTypes = (filter) => {
	if (filter === 'Movie') return 'Movie';
	if (filter === 'Series') return 'Series';
	return 'Movie,Series';
};

const getServerSortOptions = () => [
	{ value: 'name', label: $L('Server Name') },
	{ value: 'recent', label: $L('Recently Used') },
	{ value: 'added', label: $L('Date Added') }
];

const getFolderViewModeOptions = () => [
	{ value: 'local', label: $L('Per Library') },
	{ value: 'on', label: $L('Always On') },
	{ value: 'off', label: $L('Always Off') }
];

const getHomeRowOverlayOptions = () => [
	{ value: 'off', label: $L('Off') },
	{ value: 'on', label: $L('On') }
];

const getAudioLanguageOptions = () => [
	{ value: '', label: $L('Auto') },
	{ value: 'eng', label: $L('English') },
	{ value: 'spa', label: $L('Spanish') },
	{ value: 'fra', label: $L('French') },
	{ value: 'deu', label: $L('German') },
	{ value: 'ita', label: $L('Italian') },
	{ value: 'por', label: $L('Portuguese') },
	{ value: 'jpn', label: $L('Japanese') },
	{ value: 'kor', label: $L('Korean') },
	{ value: 'zho', label: $L('Chinese') }
];

const RATING_SOURCE_OPTIONS = [
	{ value: 'imdb', label: $L('IMDb') },
	{ value: 'tmdb', label: $L('TMDB') },
	{ value: 'tomatoes', label: $L('Rotten Tomatoes') },
	{ value: 'metacritic', label: $L('Metacritic') }
];

const getEnabledRatingSourcesSummary = (sources) => {
	const enabled = Array.isArray(sources) ? sources : [];
	if (enabled.length === 0) return $L('None');
	return RATING_SOURCE_OPTIONS
		.filter((option) => enabled.includes(option.value))
		.map((option) => option.label)
		.join(', ');
};

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
	{ value: 0, label: $L('G') },
	{ value: 7, label: $L('PG') },
	{ value: 13, label: $L('PG-13') },
	{ value: 17, label: $L('R') },
	{ value: 18, label: $L('NC-17') }
];

const getLabel = (options, value, fallback) => {
	const option = options.find((o) => o.value === value);
	return option?.label || fallback;
};

const FAVORITES_ROW_IDS = [
	'favoriteMovies',
	'favoriteSeries',
	'favoriteEpisodes',
	'favoritePeople',
	'favoriteArtists',
	'favoriteMusicVideos',
	'favoriteAlbums',
	'favoriteSongs'
];

const INITIAL_PLUGIN_SECTION_RENDER_COUNT = 60;
const PLUGIN_SECTION_RENDER_STEP = 60;

const isHomeRowVisibleByGates = (rowId, currentSettings) => {
	if (FAVORITES_ROW_IDS.includes(rowId)) return currentSettings.displayFavoritesRows;
	if (rowId === 'collections') return currentSettings.displayCollectionsRows;
	if (rowId === 'genres') return currentSettings.displayGenresRows;
	return true;
};

const mergeDiscoveredPluginSections = (existingSections, discoveredSections, source, toPluginSection) => {
	const existing = Array.isArray(existingSections) ? existingSections : [];
	const discovered = Array.isArray(discoveredSections) ? discoveredSections : [];

	if (discovered.length === 0) {
		return [...existing].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
	}

	const existingMap = new Map(existing.map((section) => [section.id, section]));
	let nextOrder = existing.length;

	const mergedSourceSections = discovered.map((section) => {
		const existingSection = existingMap.get(section.id);
		const fallbackOrder = existingSection?.order ?? nextOrder++;
		return toPluginSection(section, existingSection, fallbackOrder);
	});

	return [...existing.filter((section) => section.source !== source), ...mergedSourceSections]
		.sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
		.map((section, index) => ({...section, order: index}));
};

const COLLECTIONS_SECTION_SOURCE = 'collections';
const GENRES_SECTION_SOURCE = 'genres';

const normalizeSectionToken = (value, fallback) => {
	if (value === undefined || value === null) return fallback;
	const normalized = String(value)
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return normalized || fallback;
};

const buildCollectionPluginSections = (collections, sortBy, sortOrder) => {
	const items = Array.isArray(collections) ? collections : [];
	return items.map((collection, index) => {
		const collectionId = collection?.Id || `collection-${index + 1}`;
		const displayText = collection?.Name || $L('Collection {index}').replace('{index}', String(index + 1));
		return {
			id: `collection:${normalizeSectionToken(collectionId, `collection-${index + 1}`)}`,
			displayText,
			order: index,
			source: COLLECTIONS_SECTION_SOURCE,
			specJson: JSON.stringify({
				kind: 'collection',
				collectionId: String(collectionId),
				collectionName: String(displayText),
				sortBy,
				sortOrder,
				limit: 40
			})
		};
	});
};

const buildGenrePluginSections = (genres, includeItemTypes, sortBy, sortOrder) => {
	const items = Array.isArray(genres) ? genres : [];
	return items.map((genre, index) => {
		const genreId = genre?.Id || genre?.Name || `genre-${index + 1}`;
		const genreName = genre?.Name || $L('Genre {index}').replace('{index}', String(index + 1));
		return {
			id: `genre:${normalizeSectionToken(genreId, normalizeSectionToken(genreName, `genre-${index + 1}`))}`,
			displayText: genreName,
			order: index,
			source: GENRES_SECTION_SOURCE,
			specJson: JSON.stringify({
				kind: 'genre',
				genreId: String(genreId),
				genreName: String(genreName),
				includeItemTypes,
				sortBy,
				sortOrder,
				limit: 40
			})
		};
	});
};

const builtInSectionToPluginSection = (section, existingSection = null, fallbackOrder = 0) => ({
	id: section.id,
	name: section.displayText,
	enabled: existingSection?.enabled ?? false,
	order: existingSection?.order ?? fallbackOrder,
	source: section.source,
	specJson: section.specJson
});

const getPluginSectionSourceLabel = (source) => {
	if (source === 'kefinTweaks') return $L('KefinTweaks');
	if (source === COLLECTIONS_SECTION_SOURCE) return $L('Collections');
	if (source === GENRES_SECTION_SOURCE) return $L('Genres');
	return $L('Home Screen Sections');
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
	const { settings, updateSetting, updateSettings, resetSettings, availableThemes, activeThemeId, selectThemeById } = useSettings();
	const { capabilities } = useDeviceInfo();
	const jellyseerr = useJellyseerr();
	const isSeerr = jellyseerr.isMoonfin && jellyseerr.variant === 'seerr';
	const seerrLabel = isSeerr ? jellyseerr.displayName || $L('Seerr') : $L('Jellyseerr');
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
	const [tempPluginSections, setTempPluginSections] = useState([]);
	const [allLibraries, setAllLibraries] = useState([]);
	const [hiddenLibraries, setHiddenLibraries] = useState([]);
	const [libraryLoading, setLibraryLoading] = useState(false);
	const [librarySaving, setLibrarySaving] = useState(false);
	const [serverConfigs, setServerConfigs] = useState([]);
	const [clearDataDialogOpen, setClearDataDialogOpen] = useState(false);
	const [moonfinStatus, setMoonfinStatus] = useState('');
	const [moonfinConnecting, setMoonfinConnecting] = useState(false);
	const [seerrAuthType, setSeerrAuthType] = useState('jellyfin');
	const [seerrUsername, setSeerrUsername] = useState('');
	const [seerrPassword, setSeerrPassword] = useState('');
	const [seerrAuthSubmitting, setSeerrAuthSubmitting] = useState(false);
	const [seerrAuthMessage, setSeerrAuthMessage] = useState('');
	const [seerrAuthError, setSeerrAuthError] = useState('');
	const [kefinProbeState, setKefinProbeState] = useState({loading: false, data: null, error: ''});
	const [hssProbeState, setHssProbeState] = useState({loading: false, data: null, error: ''});
	const [tempRatingSources, setTempRatingSources] = useState([]);
	const [tempExcludedGenresText, setTempExcludedGenresText] = useState('');
	const [tempPinCode, setTempPinCode] = useState('0000');
	const [pinCodeError, setPinCodeError] = useState('');
	const [pluginSectionRenderLimit, setPluginSectionRenderLimit] = useState(INITIAL_PLUGIN_SECTION_RENDER_COUNT);
	const [mediaBarLibraries, setMediaBarLibraries] = useState([]);
	const [mediaBarCollections, setMediaBarCollections] = useState([]);
	const [tempMediaBarLibraryIds, setTempMediaBarLibraryIds] = useState([]);
	const [tempMediaBarCollectionIds, setTempMediaBarCollectionIds] = useState([]);
	const [mediaBarSourcesLoading, setMediaBarSourcesLoading] = useState(false);

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
			} else if (cv.view === 'ratingSources') {
				Spotlight.focus('rating-sources-view');
			} else if (cv.view === 'excludedGenres') {
				Spotlight.focus('excluded-genres-input');
			} else if (cv.view === 'pinCode') {
				Spotlight.focus('pin-code-input');
			} else if (cv.view === 'mediaBarLibraries') {
				Spotlight.focus('media-bar-libraries-view');
			} else if (cv.view === 'mediaBarCollections') {
				Spotlight.focus('media-bar-collections-view');
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
		const normalizedAuthType = jellyseerr.moonfinAuthType === 'local' ? 'local' : 'jellyfin';
		setSeerrAuthType(normalizedAuthType);
	}, [jellyseerr.moonfinAuthType]);

	useEffect(() => {
		if (!settings.useMoonfinPlugin) {
			setSeerrPassword('');
			setSeerrAuthMessage('');
			setSeerrAuthError('');
		}
	}, [settings.useMoonfinPlugin]);

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
		setSeerrAuthMessage('');
		setSeerrAuthError('');
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
			setSeerrPassword('');
		}
	}, [settings.useMoonfinPlugin, updateSetting, serverUrl, accessToken, jellyseerr]);

	const handleSeerrAuthTypeChange = useCallback((nextAuthType) => {
		const normalizedAuthType = nextAuthType === 'local' ? 'local' : 'jellyfin';
		setSeerrAuthType(normalizedAuthType);
		setSeerrAuthMessage('');
		setSeerrAuthError('');
		jellyseerr.setMoonfinAuthType?.(normalizedAuthType).catch((err) => {
			console.log('[Jellyseerr] Failed to save auth type:', err.message);
		});
	}, [jellyseerr]);

	const handleSeerrLogin = useCallback(async () => {
		const username = seerrUsername.trim();
		if (!username) {
			setSeerrAuthMessage('');
			setSeerrAuthError($L('Enter username/email.'));
			return;
		}

		setSeerrAuthSubmitting(true);
		setSeerrAuthMessage('');
		setSeerrAuthError('');

		try {
			await jellyseerr.loginWithMoonfin(username, seerrPassword, seerrAuthType);
			setSeerrPassword('');
			setSeerrAuthMessage($L('Signed in to {seerrLabel}.').replace('{seerrLabel}', seerrLabel));
			setMoonfinStatus($L('Connected via Moonfin!'));
		} catch (err) {
			const message = typeof err?.message === 'string' && err.message.trim()
				? err.message.trim()
				: $L('Sign-in failed');
			setSeerrAuthError(message);
		} finally {
			setSeerrAuthSubmitting(false);
		}
	}, [jellyseerr, seerrUsername, seerrPassword, seerrAuthType, seerrLabel]);

	const handleSeerrPasswordKeyDown = useCallback((e) => {
		const code = e.keyCode || e.which;
		if ((code === 13 || e.key === 'Enter') && !seerrAuthSubmitting) {
			e.preventDefault();
			handleSeerrLogin();
		}
	}, [handleSeerrLogin, seerrAuthSubmitting]);

	const handleSeerrLogout = useCallback(async () => {
		setSeerrAuthSubmitting(true);
		setSeerrAuthMessage('');
		setSeerrAuthError('');

		try {
			await jellyseerr.logout();
			setSeerrPassword('');
			setSeerrAuthMessage($L('Signed out from {seerrLabel}.').replace('{seerrLabel}', seerrLabel));
			setMoonfinStatus($L('Moonfin plugin found but no session. Please log in.'));
		} catch (err) {
			const message = typeof err?.message === 'string' && err.message.trim()
				? err.message.trim()
				: $L('Sign-out failed');
			setSeerrAuthError(message);
		} finally {
			setSeerrAuthSubmitting(false);
		}
	}, [jellyseerr, seerrLabel]);

	const openThemes = useCallback(() => {
		pushView({ view: 'themes', returnFocusTo: 'setting-themeSelection' });
	}, [pushView]);

	const openRatingSources = useCallback(() => {
		setTempRatingSources(Array.isArray(settings.mdblistRatingSources) ? [...settings.mdblistRatingSources] : []);
		pushView({view: 'ratingSources', returnFocusTo: 'setting-ratingSources'});
	}, [settings.mdblistRatingSources, pushView]);

	const toggleRatingSource = useCallback((sourceValue) => {
		setTempRatingSources((prev) => {
			if (prev.includes(sourceValue)) {
				return prev.filter((value) => value !== sourceValue);
			}
			return [...prev, sourceValue];
		});
	}, []);

	const saveRatingSources = useCallback(() => {
		updateSetting('mdblistRatingSources', tempRatingSources);
		popView();
	}, [tempRatingSources, updateSetting, popView]);

	const openExcludedGenres = useCallback(() => {
		const excluded = Array.isArray(settings.excludedGenres) ? settings.excludedGenres : [];
		setTempExcludedGenresText(excluded.join(', '));
		pushView({view: 'excludedGenres', returnFocusTo: 'setting-excludedGenres'});
	}, [settings.excludedGenres, pushView]);

	const saveExcludedGenres = useCallback(() => {
		const parsed = tempExcludedGenresText
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean);
		const normalized = [...new Set(parsed.map((value) => value.toLowerCase()))];
		updateSetting('excludedGenres', normalized);
		popView();
	}, [tempExcludedGenresText, updateSetting, popView]);

	const openPinCode = useCallback(() => {
		const currentPin = typeof settings.pinCode === 'string' && /^\d{4}$/.test(settings.pinCode)
			? settings.pinCode
			: '0000';
		setTempPinCode(currentPin);
		setPinCodeError('');
		pushView({view: 'pinCode', returnFocusTo: 'setting-pinCode'});
	}, [settings.pinCode, pushView]);

	const savePinCode = useCallback(() => {
		if (!/^\d{4}$/.test(tempPinCode)) {
			setPinCodeError($L('PIN must be exactly 4 digits.'));
			return;
		}
		updateSetting('pinCode', tempPinCode);
		setPinCodeError('');
		popView();
	}, [tempPinCode, updateSetting, popView]);

	const openMediaBarLibraries = useCallback(async () => {
		pushView({view: 'mediaBarLibraries', returnFocusTo: 'setting-sourceLibraries'});
		setMediaBarSourcesLoading(true);
		setTempMediaBarLibraryIds(Array.isArray(settings.mediaBarLibraryIds) ? [...settings.mediaBarLibraryIds] : []);
		try {
			const viewsResult = await api.getAllLibraries();
			const libs = (viewsResult?.Items || []).filter((lib) => lib?.CollectionType === 'movies' || lib?.CollectionType === 'tvshows');
			setMediaBarLibraries(libs);
		} catch (err) {
			void err;
			setMediaBarLibraries([]);
		} finally {
			setMediaBarSourcesLoading(false);
		}
	}, [api, pushView, settings.mediaBarLibraryIds]);

	const openMediaBarCollections = useCallback(async () => {
		pushView({view: 'mediaBarCollections', returnFocusTo: 'setting-sourceCollections'});
		setMediaBarSourcesLoading(true);
		setTempMediaBarCollectionIds(Array.isArray(settings.mediaBarCollectionIds) ? [...settings.mediaBarCollectionIds] : []);
		try {
			const result = await api.getCollections(500, 'SortName', 'Ascending');
			setMediaBarCollections(result?.Items || []);
		} catch (err) {
			void err;
			setMediaBarCollections([]);
		} finally {
			setMediaBarSourcesLoading(false);
		}
	}, [api, pushView, settings.mediaBarCollectionIds]);

	const toggleMediaBarLibrary = useCallback((libraryId) => {
		setTempMediaBarLibraryIds((prev) => {
			if (prev.includes(libraryId)) return prev.filter((id) => id !== libraryId);
			return [...prev, libraryId];
		});
	}, []);

	const toggleMediaBarCollection = useCallback((collectionId) => {
		setTempMediaBarCollectionIds((prev) => {
			if (prev.includes(collectionId)) return prev.filter((id) => id !== collectionId);
			return [...prev, collectionId];
		});
	}, []);

	const saveMediaBarLibraries = useCallback(() => {
		updateSettings({
			mediaBarSourceType: 'library',
			mediaBarLibraryIds: tempMediaBarLibraryIds
		});
		popView();
	}, [tempMediaBarLibraryIds, updateSettings, popView]);

	const saveMediaBarCollections = useCallback(() => {
		updateSettings({
			mediaBarSourceType: 'collection',
			mediaBarCollectionIds: tempMediaBarCollectionIds
		});
		popView();
	}, [tempMediaBarCollectionIds, updateSettings, popView]);

	const refreshBuiltInCollectionGenreSections = useCallback(async () => {
		const collectionsSortBy = settings.collectionsRowSortBy || 'SortName';
		const collectionsSortOrder = getSortOrderFromSortBy(collectionsSortBy);
		const genresSortBy = settings.genresRowSortBy || 'SortName';
		const genresSortOrder = getSortOrderFromSortBy(genresSortBy);
		const genresIncludeTypes = getGenresIncludeTypes(settings.genresRowItemFilter);

		const [collectionsResult, genresResult] = await Promise.all([
			settings.displayCollectionsRows
				? api.getCollections(500, collectionsSortBy, collectionsSortOrder).catch(() => null)
				: Promise.resolve(null),
			settings.displayGenresRows
				? api.getGenres(undefined, genresIncludeTypes, genresSortBy, genresSortOrder).catch(() => null)
				: Promise.resolve(null)
		]);

		return {
			collections: buildCollectionPluginSections(collectionsResult?.Items || [], collectionsSortBy, collectionsSortOrder),
			genres: buildGenrePluginSections(genresResult?.Items || [], genresIncludeTypes, genresSortBy, genresSortOrder)
		};
	}, [
		api,
		settings.collectionsRowSortBy,
		settings.displayCollectionsRows,
		settings.displayGenresRows,
		settings.genresRowItemFilter,
		settings.genresRowSortBy
	]);

	const getMergedPluginSectionsForEditor = useCallback(() => {
		let mergedSections = [...(settings.pluginSections || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

		const kefinSections = kefinProbeState.data?.sections || [];
		if (kefinSections.length > 0) {
			mergedSections = mergeDiscoveredPluginSections(
				mergedSections,
				kefinSections,
				'kefinTweaks',
				kefinSectionToPluginSection
			);
		}

		const hssSections = hssProbeState.data?.sections || [];
		if (hssSections.length > 0) {
			mergedSections = mergeDiscoveredPluginSections(
				mergedSections,
				hssSections,
				'hss',
				hssSectionToPluginSection
			);
		}

		return [...mergedSections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
	}, [settings.pluginSections, kefinProbeState.data, hssProbeState.data]);

	const openHomeRows = useCallback(() => {
		setTempHomeRows([...(settings.homeRows || DEFAULT_HOME_ROWS)].sort((a, b) => a.order - b.order));
		setTempPluginSections(getMergedPluginSectionsForEditor());
		setPluginSectionRenderLimit(INITIAL_PLUGIN_SECTION_RENDER_COUNT);
		pushView({ view: 'homeRows', returnFocusTo: 'setting-homeRows' });

		refreshBuiltInCollectionGenreSections()
			.then((builtInSections) => {
				setTempPluginSections((prev) => {
					let merged = [...prev].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
					if ((builtInSections.collections || []).length > 0) {
						merged = mergeDiscoveredPluginSections(
							merged,
							builtInSections.collections,
							COLLECTIONS_SECTION_SOURCE,
							builtInSectionToPluginSection
						);
					}
					if ((builtInSections.genres || []).length > 0) {
						merged = mergeDiscoveredPluginSections(
							merged,
							builtInSections.genres,
							GENRES_SECTION_SOURCE,
							builtInSectionToPluginSection
						);
					}
					return merged;
				});
			})
			.catch(() => {});
	}, [settings.homeRows, pushView, getMergedPluginSectionsForEditor, refreshBuiltInCollectionGenreSections]);

	const saveHomeRows = useCallback(() => {
		updateSettings({homeRows: tempHomeRows, pluginSections: tempPluginSections});
		popView();
	}, [tempHomeRows, tempPluginSections, updateSettings, popView]);

	const resetHomeRows = useCallback(() => {
		setTempHomeRows([...DEFAULT_HOME_ROWS]);
	}, []);

	const toggleHomeRow = useCallback((rowId) => {
		setTempHomeRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, enabled: !row.enabled } : row)));
	}, []);

	const moveHomeRowUp = useCallback((rowId) => {
		setTempHomeRows((prev) => {
			const visibleRows = prev.filter((row) => isHomeRowVisibleByGates(row.id, settings));
			const visibleIndex = visibleRows.findIndex((row) => row.id === rowId);
			if (visibleIndex <= 0) return prev;
			const targetId = visibleRows[visibleIndex - 1].id;
			const index = prev.findIndex((r) => r.id === rowId);
			const targetIndex = prev.findIndex((r) => r.id === targetId);
			if (index < 0 || targetIndex < 0) return prev;
			const newRows = [...prev];
			const temp = newRows[index].order;
			newRows[index].order = newRows[targetIndex].order;
			newRows[targetIndex].order = temp;
			return newRows.sort((a, b) => a.order - b.order);
		});
	}, [settings]);

	const moveHomeRowDown = useCallback((rowId) => {
		setTempHomeRows((prev) => {
			const visibleRows = prev.filter((row) => isHomeRowVisibleByGates(row.id, settings));
			const visibleIndex = visibleRows.findIndex((row) => row.id === rowId);
			if (visibleIndex < 0 || visibleIndex >= visibleRows.length - 1) return prev;
			const targetId = visibleRows[visibleIndex + 1].id;
			const index = prev.findIndex((r) => r.id === rowId);
			const targetIndex = prev.findIndex((r) => r.id === targetId);
			if (index < 0 || targetIndex < 0) return prev;
			const newRows = [...prev];
			const temp = newRows[index].order;
			newRows[index].order = newRows[targetIndex].order;
			newRows[targetIndex].order = temp;
			return newRows.sort((a, b) => a.order - b.order);
		});
	}, [settings]);

	const togglePluginSection = useCallback((sectionId) => {
		setTempPluginSections((prev) => prev.map((section) => (section.id === sectionId ? {...section, enabled: !section.enabled} : section)));
	}, []);

	const movePluginSectionUp = useCallback((sectionId) => {
		setTempPluginSections((prev) => {
			const index = prev.findIndex((section) => section.id === sectionId);
			if (index <= 0) return prev;
			const next = [...prev];
			const temp = next[index].order;
			next[index].order = next[index - 1].order;
			next[index - 1].order = temp;
			return next.sort((a, b) => a.order - b.order);
		});
	}, []);

	const movePluginSectionDown = useCallback((sectionId) => {
		setTempPluginSections((prev) => {
			const index = prev.findIndex((section) => section.id === sectionId);
			if (index < 0 || index >= prev.length - 1) return prev;
			const next = [...prev];
			const temp = next[index].order;
			next[index].order = next[index + 1].order;
			next[index + 1].order = temp;
			return next.sort((a, b) => a.order - b.order);
		});
	}, []);

	const refreshKefinTweaks = useCallback(async () => {
		setKefinProbeState((prev) => ({...prev, loading: true, error: ''}));
		try {
			const data = await probeKefinTweaks(api);
			const errorMessage = typeof data?.error === 'string'
				? data.error
				: (data?.error?.message || '');
			setKefinProbeState({loading: false, data, error: errorMessage});
		} catch (error) {
			setKefinProbeState({loading: false, data: null, error: error?.message || $L('Failed to refresh KefinTweaks')});
		}
	}, [api]);

	const refreshHomeScreenSections = useCallback(async () => {
		setHssProbeState((prev) => ({...prev, loading: true, error: ''}));
		try {
			const data = await probeHomeScreenSections(api);
			const errorMessage = typeof data?.error === 'string'
				? data.error
				: (data?.error?.message || '');
			setHssProbeState({loading: false, data, error: errorMessage});
		} catch (error) {
			setHssProbeState({loading: false, data: null, error: error?.message || $L('Failed to refresh Home Screen Sections')});
		}
	}, [api]);

	useEffect(() => {
		if (currentView.view !== 'subcategory' || currentView.categoryId !== 'integrations') return;
		if (currentView.subcategoryId === 'kefinTweaks' && !kefinProbeState.loading && !kefinProbeState.data) {
			refreshKefinTweaks();
		}
		if (currentView.subcategoryId === 'homeScreenSections' && !hssProbeState.loading && !hssProbeState.data) {
			refreshHomeScreenSections();
		}
	}, [currentView, kefinProbeState.loading, kefinProbeState.data, hssProbeState.loading, hssProbeState.data, refreshKefinTweaks, refreshHomeScreenSections]);

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

	const renderToggleItem = (settingKey, title, desc, iconName, onToggle) => (
		<SpottableDiv
			className={css.listItem}
			onClick={() => (onToggle ? onToggle() : toggleSetting(settingKey))}
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

	const renderInfoItem = (id, label, value, iconName) => (
		<SpottableDiv className={css.listItem} spotlightId={`info-${id}`}>
			{renderSettingsIcon(iconName)}
			<div className={css.listItemBody}>
				<div className={css.listItemHeading}>{label}</div>
			</div>
			<div className={css.listItemValue}>{value}</div>
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
			{renderToggleItem('alwaysAuthenticate', $L('Always Authenticate'), $L('Require manual authentication after app start'), 'lock')}
			{renderToggleItem('pinCodeProtection', $L('PIN Code Protection'), $L('Require a PIN before opening the app'), 'lockcircle')}
			{renderNavItem(
				'pinCode',
				$L('PIN Code'),
				typeof settings.pinCode === 'string' && /^\d{4}$/.test(settings.pinCode)
					? $L('Configured 4-digit PIN')
					: $L('Default PIN: 0000'),
				openPinCode,
				'lockcircle'
			)}
			{renderOptionItem('serverSortBy', $L('Sort Servers By'), getServerSortOptions(), $L('Server Name'), 'arrowupdown')}
		</>
	);

	const renderAccountPrivacySafety = () => (
		<>
			{renderToggleItem('exitConfirmation', $L('Exit Confirmation'), $L('Ask before exiting the app from home/login screens'), 'exit')}
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
				renderSliderItem('themeMusicVolume', $L('Theme Music Volume'), 0, 100, 5, (v) => `${v}%`, 'sound')}
		</>
	);

	const renderPersonalizationNavigation = () => (
		<>
			{renderOptionItem('navbarPosition', $L('Navbar Position'), getNavPositionOptions(), $L('Top Bar'), 'browser')}
			{renderOptionItem('uiColor', $L('Navbar Color'), getUiColorOptions(), $L('Gray'), 'colorpicker')}
			{renderOptionItem('uiOpacity', $L('Navbar Opacity'), UI_OPACITY_OPTIONS, '85%', 'contrast')}
			{renderSliderItem('navbarOpacity', $L('Navbar Opacity'), 0, 100, 5, (v) => `${v}%`)}
			{renderOptionItem('navbarColor', $L('Navbar Color'), ACCENT_COLOR_OPTIONS, $L('Theme Default'))}
			{renderToggleItem('showShuffleButton', $L('Shuffle Button'), $L('Show shuffle button in navigation bar'))}
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
			{renderToggleItem(
				'displayFavoritesRows',
				$L('Display Favorites Rows'),
				$L('Show Favorite Movies, Series, and other favorite rows in Home Sections.'),
				'heart'
			)}
			{settings.displayFavoritesRows &&
				renderOptionItem('favoritesRowSortBy', $L('Favorites Row Sorting'), getHomeRowSortOptions(), $L('Name'), 'arrowupdown')}
			{renderToggleItem(
				'displayCollectionsRows',
				$L('Display Collections Rows'),
				$L('Show Collections rows in Home Sections.'),
				'bookmark'
			)}
			{settings.displayCollectionsRows &&
				renderOptionItem('collectionsRowSortBy', $L('Collections Row Sorting'), getHomeRowSortOptions(), $L('Name'), 'arrowupdown')}
			{renderToggleItem(
				'displayGenresRows',
				$L('Display Genres Rows'),
				$L('Show Genres rows in Home Sections.'),
				'movies'
			)}
			{settings.displayGenresRows &&
				renderOptionItem('genresRowSortBy', $L('Genres Row Sorting'), getHomeRowSortOptions(), $L('Name'), 'arrowupdown')}
			{settings.displayGenresRows &&
				renderOptionItem('genresRowItemFilter', $L('Genres Row Items'), getGenresRowItemFilterOptions(), $L('Movies & TV Shows'), 'filter')}
			{renderToggleItem('mergeContinueWatchingNextUp', $L('Merge Continue Watching'), $L('Combine Continue Watching and Next Up'), 'arrowupdown')}
			{renderOptionItem('homeRowsStyle', $L('Rows Type'), getHomeRowsStyleOptions(), $L('Modern'), 'appscontents')}
			{renderOptionItem('homeRowsImageType', $L('Home Row Image Type'), getImageTypeOptions(), $L('Poster'), 'picture')}
			{renderToggleItem('useSeriesThumbnails', $L('Series Thumbnails'), $L('Use series artwork instead of episode images'), 'aspectratio')}
			{renderOptionItem('homeRowsPosterSize', $L('Image Size'), getPosterSizeOptions(), $L('Default'), 'aspectratio')}
			{renderOptionItem('homeRowOverlay', $L('Home Row Overlay'), getHomeRowOverlayOptions(), $L('Off'), 'info')}
			{renderToggleItem('themeMusicOnHomeRows', $L('Play Theme Music on Home Page'), $L('Play theme music while browsing home rows'), 'music')}
		</>
	);

	const renderPersonalizationLibraries = () => (
		<>
			{renderNavItem('hideLibraries', $L('Library Visibility'), $L('Choose which libraries are hidden'), openLibraries, 'show')}
			{renderOptionItem('folderViewMode', $L('Folder View'), getFolderViewModeOptions(), $L('Per Library'), 'folder')}
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
			{renderOptionItem('featuredBarStyle', $L('Bar Style'), getFeaturedBarStyleOptions(), $L('Moonfin'), 'appscontents')}
			{renderOptionItem('featuredContentType', $L('Content Type'), getContentTypeOptions(), $L('Movies & TV Shows'), 'list')}
			{renderOptionItem('featuredItemCount', $L('Item Count'), getFeaturedItemCountOptions(), $L('10 items'), 'list')}
			{renderNavItem(
				'sourceLibraries',
				$L('Source Libraries'),
				(Array.isArray(settings.mediaBarLibraryIds) && settings.mediaBarLibraryIds.length > 0)
					? $L('{count} selected').replace('{count}', String(settings.mediaBarLibraryIds.length))
					: $L('All libraries'),
				openMediaBarLibraries,
				'folder'
			)}
			{renderNavItem(
				'sourceCollections',
				$L('Source Collections'),
				(Array.isArray(settings.mediaBarCollectionIds) && settings.mediaBarCollectionIds.length > 0)
					? $L('{count} selected').replace('{count}', String(settings.mediaBarCollectionIds.length))
					: $L('All collections'),
				openMediaBarCollections,
				'bookmark'
			)}
			{renderNavItem(
				'excludedGenres',
				$L('Excluded Genres'),
				(Array.isArray(settings.excludedGenres) && settings.excludedGenres.length > 0)
					? settings.excludedGenres.join(', ')
					: $L('None'),
				openExcludedGenres,
				'hide'
			)}
			{renderToggleItem('autoAdvance', $L('Auto Advance'), $L('Automatically cycle featured media items'), 'skip')}
			{settings.autoAdvance &&
				renderSliderItem('autoAdvanceInterval', $L('Auto Advance Interval'), 2, 20, 1, (v) => `${v}s`, 'timer')}
			{renderToggleItem('featuredTrailerPreview', $L('Trailer Preview'), $L('Automatically play trailer previews in media bar'), 'movies')}
			{settings.featuredTrailerPreview &&
				renderToggleItem('featuredTrailerMuted', $L('Mute Trailer Audio'), $L('Mute trailer previews in the featured media bar and details screen trailer overlay'), 'sound')}
		</>
	);

	const renderIntegrationsPlugin = () => (
		<>
			{/* eslint-disable-next-line no-use-before-define */}
			{renderPluginMoonfin()}
			{/* eslint-disable-next-line no-use-before-define */}
			{renderPluginStatus()}
		</>
	);

	const renderIntegrationsMetadataRatings = () => (
		<>
			{renderToggleItem('mdblistEnabled', $L('Fetch Additional Ratings'), $L('Enable MDBList ratings'), 'star')}
			{renderNavItem(
				'ratingSources',
				$L('Enabled Rating Sources'),
				getEnabledRatingSourcesSummary(settings.mdblistRatingSources),
				openRatingSources,
				'list'
			)}
			{renderToggleItem('tmdbEpisodeRatingsEnabled', $L('Show Episode Ratings'), $L('Show episode ratings from TMDB'), 'star')}
			{renderToggleItem('showRatingLabels', $L('Show Rating Text Labels'), $L('Display source labels under scores'), 'bookmark')}
			{renderToggleItem('showRatingBadges', $L('Show Rating Badges'), $L('Display ratings row on supported media screens'), 'colorpicker')}
		</>
	);

	const renderIntegrationsSeerr = () => (
		<>
			{/* eslint-disable-next-line no-use-before-define */}
			{renderPluginSeerr()}
		</>
	);

	const renderIntegrationsHomeScreenSections = () => {
		const data = hssProbeState.data;
		const mergedSections = mergeDiscoveredPluginSections(
			settings.pluginSections,
			data?.sections || [],
			'hss',
			hssSectionToPluginSection
		);
		const mergedCount = mergedSections.filter((section) => section.source === 'hss').length;
		const hasSections = mergedCount > 0;
		return (
			<>
				{renderInfoItem('hss-installed', $L('Installed'), data ? (data.installed ? $L('Yes') : $L('No')) : $L('Unknown'), 'plug')}
				{renderInfoItem('hss-enabled', $L('Enabled'), data ? (data.enabled ? $L('Yes') : $L('No')) : $L('Unknown'), 'check')}
				{renderInfoItem('hss-version', $L('Version'), data?.version || $L('Unknown'), 'info')}
				{renderInfoItem('hss-sections', $L('Discovered Sections'), String(mergedCount), 'list')}
				{hssProbeState.error && <div className={css.statusMessage}>{hssProbeState.error}</div>}
				<div className={css.actionBarInline}>
					<SpottableButton
						className={css.actionButton}
						onClick={refreshHomeScreenSections}
						disabled={hssProbeState.loading}
						spotlightId='hss-refresh'
					>
						{hssProbeState.loading ? $L('Refreshing...') : $L('Refresh')}
					</SpottableButton>
					{hasSections && (
						<SpottableButton className={css.actionButton} onClick={openHomeRows} spotlightId='hss-configure'>
							{$L('Configure Home Sections')}
						</SpottableButton>
					)}
				</div>
			</>
		);
	};

	const renderIntegrationsKefinTweaks = () => {
		const data = kefinProbeState.data;
		const mergedSections = mergeDiscoveredPluginSections(
			settings.pluginSections,
			data?.sections || [],
			'kefinTweaks',
			kefinSectionToPluginSection
		);
		const mergedCount = mergedSections.filter((section) => section.source === 'kefinTweaks').length;
		const hasSections = mergedCount > 0;
		return (
			<>
				{renderInfoItem('kefin-installed', $L('Installed'), data ? (data.installed ? $L('Yes') : $L('No')) : $L('Unknown'), 'plug')}
				{renderInfoItem('kefin-enabled', $L('Enabled'), data ? (data.enabled ? $L('Yes') : $L('No')) : $L('Unknown'), 'check')}
				{renderInfoItem('kefin-version', $L('Version'), data?.version || $L('Unknown'), 'info')}
				{renderInfoItem('kefin-sections', $L('Discovered Sections'), String(mergedCount), 'list')}
				{kefinProbeState.error && <div className={css.statusMessage}>{kefinProbeState.error}</div>}
				<div className={css.actionBarInline}>
					<SpottableButton
						className={css.actionButton}
						onClick={refreshKefinTweaks}
						disabled={kefinProbeState.loading}
						spotlightId='kefin-refresh'
					>
						{kefinProbeState.loading ? $L('Refreshing...') : $L('Refresh')}
					</SpottableButton>
					{hasSections && (
						<SpottableButton className={css.actionButton} onClick={openHomeRows} spotlightId='kefin-configure'>
							{$L('Configure Home Sections')}
						</SpottableButton>
					)}
				</div>
			</>
		);
	};

	const renderPlaybackAudio = () => (
		<>
			{renderOptionItem('audioLanguage', $L('Default Audio Language'), getAudioLanguageOptions(), $L('Auto'), 'language')}
			{renderToggleItem('passthroughEnabled', $L('Audio Passthrough'), $L('Enable advanced bitstream passthrough for external audio devices'), 'speaker')}
			{renderToggleItem('ac3Passthrough', $L('AC3 Passthrough'), $L('Allow Dolby Digital passthrough when available'), 'speaker')}
			{renderToggleItem('eac3Passthrough', $L('E-AC3 Passthrough'), $L('Allow Dolby Digital Plus passthrough when available'), 'speaker')}
			{renderToggleItem('truehdPassthrough', $L('TrueHD Passthrough (Experimental)'), $L('Allow Dolby TrueHD passthrough when available'), 'speaker')}
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
			{renderToggleItem('autoPlay', $L('Episode Queuing'), $L('Automatically play the next episode'), 'list')}
			{renderOptionItem('nextUpBehavior', $L('Next Up Prompt'), getNextUpBehaviorOptions(), $L('Extended'), 'skip')}
			{settings.nextUpBehavior !== 'disabled' &&
				renderSliderItem('nextUpTimeout', $L('Next Up Prompt Timeout'), 0, 30, 1, (v) => (v === 0 ? $L('Instant') : `${v}s`), 'timer')}
			{renderToggleItem('stillWatchingPrompt', $L('Still Watching Prompt'), $L('Show continuation prompts before auto-playing the next episode'), 'show')}
		</>
	);

	const renderPlaybackOfflineDownloads = () => (
		<></>
	);

	const renderPlaybackSyncPlay = () => (
		<>
			{renderToggleItem('syncplayEnabled', $L('SyncPlay Enabled'), $L('Enable SyncPlay groups and controls'), 'groups')}
			{renderToggleItem('showSyncPlayButton', $L('SyncPlay Button'), $L('Show SyncPlay button in navigation bar'), 'check')}
			{renderToggleItem('syncplayAutoOpen', $L('Open SyncPlay'), $L('Automatically open SyncPlay dialog when starting playback'), 'groups')}
		</>
	);

	const renderPlaybackAdvanced = () => (
		<>
			{renderSliderItem('videoStartDelay', $L('Video Start Delay'), 0, 5, 0.5, (v) => (v === 0 ? $L('Off') : `${Number(v).toFixed(1)}s`), 'scheduler')}
			{renderToggleItem('liveTvDirect', $L('Live TV Direct'), $L('Open the first available live channel directly from library selection'), 'liveplay')}
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

	const renderAboutAppInfo = () => (
		<>
			{renderAboutApp()}
			{renderToggleItem('updateNotificationsEnabled', $L('Update Notifications'), $L('Show app update notifications when a new release is available'), 'download')}
		</>
	);

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
			{moonfinConnecting && <div className={css.authHint}>{$L('Connecting to Moonfin...')}</div>}
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

	const renderPluginSeerr = () => ( // eslint-disable-line no-unused-vars
		<>
			{!settings.useMoonfinPlugin && (
				<div className={css.authHint}>
					{$L('Enable the Moonfin plugin first to sign in to {seerrLabel}.').replace('{seerrLabel}', seerrLabel)}
				</div>
			)}
			{settings.useMoonfinPlugin && jellyseerr.pluginInfo?.jellyseerrEnabled === false && (
				<div className={css.authHint}>
					{$L('{seerrLabel} is disabled by your server administrator.').replace('{seerrLabel}', seerrLabel)}
				</div>
			)}
			{settings.useMoonfinPlugin && jellyseerr.pluginInfo?.jellyseerrEnabled !== false && jellyseerr.isEnabled && jellyseerr.isAuthenticated && jellyseerr.isMoonfin && (
				<>
					{renderInfoItem('seerrConnStatus', $L('Status'), $L('Connected via Moonfin'))}
					{renderInfoItem('seerrAuthType', $L('Sign-In Method'), seerrAuthType === 'local' ? $L('Local Account') : $L('Jellyfin Account'))}
					{jellyseerr.serverUrl && renderInfoItem('seerrUrl', $L('{seerrLabel} URL').replace('{seerrLabel}', seerrLabel), jellyseerr.serverUrl)}
					{jellyseerr.user && renderInfoItem('seerrUser', $L('User'), jellyseerr.user.displayName || $L('Moonfin User'))}
					<div className={css.actionBarInline}>
						<SpottableButton
							className={`${css.actionButton} ${css.dangerButton}`}
							onClick={handleSeerrLogout}
							disabled={seerrAuthSubmitting}
							spotlightId='seerr-signout'
						>
							{seerrAuthSubmitting ? $L('Signing Out...') : $L('Sign Out')}
						</SpottableButton>
					</div>
				</>
			)}
			{settings.useMoonfinPlugin && jellyseerr.pluginInfo?.jellyseerrEnabled !== false && (!jellyseerr.isEnabled || !jellyseerr.isAuthenticated || !jellyseerr.isMoonfin) && (
				<>
					<div className={css.viewDescription}>
						{$L('Sign in directly through the Moonfin plugin. No app backend is required.')}
					</div>
					<SpottableDiv
						className={`${css.listItem} ${seerrAuthType === 'jellyfin' ? css.listItemSelected : ''}`}
						onClick={() => handleSeerrAuthTypeChange('jellyfin')}
						spotlightId='seerr-auth-jellyfin'
					>
						<div className={css.listItemBody}>
							<div className={css.listItemHeading}>{$L('Jellyfin Account')}</div>
							<div className={css.listItemCaption}>{$L('Use your Jellyfin username and password')}</div>
						</div>
						<div className={css.listItemTrailing}>{renderRadio(seerrAuthType === 'jellyfin')}</div>
					</SpottableDiv>
					<SpottableDiv
						className={`${css.listItem} ${seerrAuthType === 'local' ? css.listItemSelected : ''}`}
						onClick={() => handleSeerrAuthTypeChange('local')}
						spotlightId='seerr-auth-local'
					>
						<div className={css.listItemBody}>
							<div className={css.listItemHeading}>{$L('Local Account')}</div>
							<div className={css.listItemCaption}>{$L('Use your local {seerrLabel} account credentials').replace('{seerrLabel}', seerrLabel)}</div>
						</div>
						<div className={css.listItemTrailing}>{renderRadio(seerrAuthType === 'local')}</div>
					</SpottableDiv>

					<div className={css.inputGroup}>
						<label>{$L('Username / Email')}</label>
						<SpottableInput
							className={css.input}
							type='text'
							value={seerrUsername}
							onChange={(e) => {
								setSeerrUsername(e.target.value);
								setSeerrAuthMessage('');
								setSeerrAuthError('');
							}}
							placeholder={seerrAuthType === 'local' ? $L('Local username or email') : $L('Jellyfin username')}
							autoComplete='username'
							disabled={seerrAuthSubmitting}
							spotlightId='seerr-username-input'
						/>
					</div>

					<div className={css.inputGroup}>
						<label>{$L('Password')}</label>
						<SpottableInput
							className={css.input}
							type='password'
							value={seerrPassword}
							onChange={(e) => {
								setSeerrPassword(e.target.value);
								setSeerrAuthMessage('');
								setSeerrAuthError('');
							}}
							onKeyDown={handleSeerrPasswordKeyDown}
							autoComplete='current-password'
							disabled={seerrAuthSubmitting}
							spotlightId='seerr-password-input'
						/>
					</div>

					<div className={css.actionBarInline}>
						<SpottableButton
							className={css.actionButton}
							onClick={handleSeerrLogin}
							disabled={seerrAuthSubmitting || !seerrUsername.trim()}
							spotlightId='seerr-signin'
						>
							{seerrAuthSubmitting ? $L('Signing In...') : $L('Sign In')}
						</SpottableButton>
					</div>
				</>
			)}
			{seerrAuthMessage && <div className={css.statusMessage}>{seerrAuthMessage}</div>}
			{seerrAuthError && <div className={`${css.statusMessage} ${css.statusError}`}>{seerrAuthError}</div>}
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
			<div className={css.viewDescription}>{$L('Remove all saved servers, login sessions, and settings. The app will restart as if freshly installed.')}</div>
			<div className={css.actionBarInline}>
				<SpottableButton
					className={`${css.actionButton} ${css.dangerButton}`}
					onClick={() => setClearDataDialogOpen(true)}
					spotlightId='clear-all-data'
				>
					{$L('Clear All Data')}
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
					capabilities?.truehd && 'TrueHD',
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
				subs.push({ id: 'data', label: $L('Data'), description: $L('Storage and reset') });
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
						{$L('Enable/disable and reorder the rows that appear on your home screen.')}
					</div>
					{renderOptionItem('homeRowsStyle', $L('Rows Type'), getHomeRowsStyleOptions(), $L('Modern'), 'appscontents')}
					{tempHomeRows.filter((row) => isHomeRowVisibleByGates(row.id, settings)).map((row, index, visibleRows) => (
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
									aria-label={$L('Up')}
									spotlightId={`homerow-up-${row.id}`}
								/>
								<Button
									onClick={() => moveHomeRowDown(row.id)}
									disabled={index === visibleRows.length - 1}
									size='small'
									icon='arrowlargedown'
									aria-label={$L('Down')}
									spotlightId={`homerow-down-${row.id}`}
								/>
							</div>
						</div>
					))}
					{tempPluginSections.length > 0 && (
						<>
							{renderSectionTitle($L('Plugin Sections'))}
							{tempPluginSections.slice(0, pluginSectionRenderLimit).map((section, index) => (
								<div key={section.id} className={css.homeRowItem}>
									<SpottableDiv
										className={css.listItem}
										onClick={() => togglePluginSection(section.id)}
										spotlightId={`pluginrow-${section.id}`}
									>
										<div className={css.listItemBody}>
											<div className={css.listItemHeading}>{section.name}</div>
											<div className={css.listItemCaption}>{getPluginSectionSourceLabel(section.source)}</div>
										</div>
										<div className={css.listItemTrailing}>{renderToggle(section.enabled)}</div>
									</SpottableDiv>
									<div className={css.homeRowControls}>
										<Button
											onClick={() => movePluginSectionUp(section.id)}
											disabled={index === 0}
											size='small'
											icon='arrowlargeup'
											aria-label={$L('Up')}
											spotlightId={`pluginrow-up-${section.id}`}
										/>
										<Button
											onClick={() => movePluginSectionDown(section.id)}
											disabled={index === tempPluginSections.length - 1}
											size='small'
											icon='arrowlargedown'
											aria-label={$L('Down')}
											spotlightId={`pluginrow-down-${section.id}`}
										/>
									</div>
								</div>
							))}
							{tempPluginSections.length > pluginSectionRenderLimit && (
								<div className={css.actionBar}>
									<Button
										onClick={() => setPluginSectionRenderLimit((prev) => Math.min(tempPluginSections.length, prev + PLUGIN_SECTION_RENDER_STEP))}
										size='small'
										spotlightId='pluginrow-show-more'
									>
										{$L('Show More')} ({tempPluginSections.length - pluginSectionRenderLimit})
									</Button>
								</div>
							)}
						</>
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

	const renderRatingSourcesView = () => (
		<ViewContainer className={css.viewContainer} spotlightId='rating-sources-view'>
			<div className={css.listContent} onFocus={handleListFocus}>
				<div className={css.listInner}>
					{renderSectionTitle($L('Enabled Rating Sources'))}
					<div className={css.viewDescription}>
						{$L('Choose which rating sources are shown in ratings rows.')}
					</div>
					{RATING_SOURCE_OPTIONS.map((option) => {
						const isEnabled = tempRatingSources.includes(option.value);
						return (
							<SpottableDiv
								key={option.value}
								className={css.listItem}
								onClick={() => toggleRatingSource(option.value)}
								spotlightId={`rating-source-${option.value}`}
							>
								<div className={css.listItemBody}>
									<div className={css.listItemHeading}>{option.label}</div>
								</div>
								<div className={css.listItemTrailing}>{renderToggle(isEnabled)}</div>
							</SpottableDiv>
						);
					})}
					<div className={css.actionBar}>
						<Button onClick={popView} size='small' spotlightId='rating-sources-cancel'>
							{$L('Cancel')}
						</Button>
						<Button onClick={saveRatingSources} size='small' spotlightId='rating-sources-save'>
							{$L('Save')}
						</Button>
					</div>
				</div>
			</div>
		</ViewContainer>
	);

	const renderExcludedGenresView = () => (
		<ViewContainer className={css.viewContainer} spotlightId='excluded-genres-view'>
			<div className={css.listContent} onFocus={handleListFocus}>
				<div className={css.listInner}>
					{renderSectionTitle($L('Excluded Genres'))}
					<div className={css.viewDescription}>
						{$L('Enter a comma-separated list of genre names to hide from the featured media bar.')}
					</div>
					<div className={css.inputGroup}>
						<label>{$L('Genres')}</label>
						<SpottableInput
							className={css.input}
							type='text'
							value={tempExcludedGenresText}
							onChange={(e) => setTempExcludedGenresText(e.target.value)}
							placeholder={$L('Example: horror, reality, documentary')}
							spotlightId='excluded-genres-input'
						/>
					</div>
					<div className={css.actionBar}>
						<Button onClick={popView} size='small' spotlightId='excluded-genres-cancel'>
							{$L('Cancel')}
						</Button>
						<Button onClick={saveExcludedGenres} size='small' spotlightId='excluded-genres-save'>
							{$L('Save')}
						</Button>
					</div>
				</div>
			</div>
		</ViewContainer>
	);

	const renderPinCodeView = () => (
		<ViewContainer className={css.viewContainer} spotlightId='pin-code-view'>
			<div className={css.listContent} onFocus={handleListFocus}>
				<div className={css.listInner}>
					{renderSectionTitle($L('Set PIN Code'))}
					<div className={css.viewDescription}>
						{$L('Enter a 4-digit PIN used to unlock the app when PIN protection is enabled.')}
					</div>
					<div className={css.inputGroup}>
						<label>{$L('PIN')}</label>
						<SpottableInput
							className={css.input}
							type='password'
							value={tempPinCode}
							onChange={(e) => {
								const next = String(e.target.value || '').replace(/\D/g, '').slice(0, 4);
								setTempPinCode(next);
								setPinCodeError('');
							}}
							placeholder={$L('4 digits')}
							maxLength={4}
							spotlightId='pin-code-input'
						/>
					</div>
					{pinCodeError && <div className={`${css.statusMessage} ${css.statusError}`}>{pinCodeError}</div>}
					<div className={css.actionBar}>
						<Button onClick={popView} size='small' spotlightId='pin-code-cancel'>
							{$L('Cancel')}
						</Button>
						<Button onClick={savePinCode} size='small' spotlightId='pin-code-save'>
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

	const renderMediaBarSourceView = ({
		viewSpotlightId,
		title,
		description,
		loadingLabel,
		items,
		itemIdKey,
		itemNameKey,
		selectedIds,
		toggleSelection,
		cancelSpotlightId,
		saveSpotlightId,
		onSave,
		itemSpotlightPrefix
	}) => (
		<ViewContainer className={css.viewContainer} spotlightId={viewSpotlightId}>
			<div className={css.listContent} onFocus={handleListFocus}>
				<div className={css.listInner}>
					{renderSectionTitle(title)}
					<div className={css.viewDescription}>{description}</div>
					{mediaBarSourcesLoading ? (
						<div className={css.loadingMessage}>{loadingLabel}</div>
					) : (
						items.map((item) => {
							const itemId = item[itemIdKey];
							const itemName = item[itemNameKey];
							const isSelected = selectedIds.includes(itemId);
							return (
								<SpottableDiv
									key={itemId}
									className={css.listItem}
									onClick={() => toggleSelection(itemId)}
									spotlightId={`${itemSpotlightPrefix}-${itemId}`}
								>
									<div className={css.listItemBody}>
										<div className={css.listItemHeading}>{itemName}</div>
									</div>
									<div className={css.listItemTrailing}>{renderToggle(isSelected)}</div>
								</SpottableDiv>
							);
						})
					)}
					{!mediaBarSourcesLoading && (
						<div className={css.actionBar}>
							<Button onClick={popView} size='small' spotlightId={cancelSpotlightId}>
								{$L('Cancel')}
							</Button>
							<Button onClick={onSave} size='small' spotlightId={saveSpotlightId}>
								{$L('Save')}
							</Button>
						</div>
					)}
				</div>
			</div>
		</ViewContainer>
	);

	const renderMediaBarLibrariesView = () => (
		renderMediaBarSourceView({
			viewSpotlightId: 'media-bar-libraries-view',
			title: $L('Media Bar Source Libraries'),
			description: $L('Choose which libraries are used for featured media when source type is Libraries.'),
			loadingLabel: $L('Loading libraries...'),
			items: mediaBarLibraries,
			itemIdKey: 'Id',
			itemNameKey: 'Name',
			selectedIds: tempMediaBarLibraryIds,
			toggleSelection: toggleMediaBarLibrary,
			cancelSpotlightId: 'media-bar-lib-cancel',
			saveSpotlightId: 'media-bar-lib-save',
			onSave: saveMediaBarLibraries,
			itemSpotlightPrefix: 'media-bar-lib'
		})
	);

	const renderMediaBarCollectionsView = () => (
		renderMediaBarSourceView({
			viewSpotlightId: 'media-bar-collections-view',
			title: $L('Media Bar Source Collections'),
			description: $L('Choose which collections are used for featured media when source type is Collections.'),
			loadingLabel: $L('Loading collections...'),
			items: mediaBarCollections,
			itemIdKey: 'Id',
			itemNameKey: 'Name',
			selectedIds: tempMediaBarCollectionIds,
			toggleSelection: toggleMediaBarCollection,
			cancelSpotlightId: 'media-bar-collection-cancel',
			saveSpotlightId: 'media-bar-collection-save',
			onSave: saveMediaBarCollections,
			itemSpotlightPrefix: 'media-bar-collection'
		})
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
			{currentView.view === 'ratingSources' && renderRatingSourcesView()}
			{currentView.view === 'excludedGenres' && renderExcludedGenresView()}
			{currentView.view === 'pinCode' && renderPinCodeView()}
			{currentView.view === 'libraries' && renderLibrariesView()}
			{currentView.view === 'mediaBarLibraries' && renderMediaBarLibrariesView()}
			{currentView.view === 'mediaBarCollections' && renderMediaBarCollectionsView()}
			<ClearDataDialog
				open={clearDataDialogOpen}
				onCancel={() => setClearDataDialogOpen(false)} // eslint-disable-line react/jsx-no-bind
				onConfirm={handleClearAllData}
			/>
		</div>
	);
};

export default Settings;
