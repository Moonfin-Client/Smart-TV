import {useState, useEffect, useCallback, useRef, useMemo, useReducer} from 'react';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';
import {useAuth} from '../../context/AuthContext';
import {useSettings, TV_TO_SERVER_ROW} from '../../context/SettingsContext';
import {useSeerr} from '../../context/SeerrContext';
import {ClassicMediaRow, ModernMediaRow} from '../../components/MediaRow';
import SeerrTileRow from '../../components/SeerrTileRow';
import {getSeerrHomeRowConfigs, fetchSeerrHomeRow} from '../../utils/seerrHomeRows';
import {mergeRowPreservingRefs} from '../../utils/volatileRows';
import LoadingSpinner from '../../components/LoadingSpinner';
import {getImageUrl, getBackdropId, getLogoUrl} from '../../utils/helpers';
import {getFromStorage, saveToStorage} from '../../services/storage';
import {HOME_ROW_ITEM_FIELDS} from '../../services/jellyfinApi';
import * as connectionPool from '../../services/connectionPool';
import {getMoonfinMediaBar} from '../../services/seerrApi';
import {toCssColor} from '../../theme/themeSpec';
import DetailSection from './DetailSection';
import FeaturedBanner from './FeaturedBanner';
import MakdBanner from './MakdBanner';
import GalleryBanner from './GalleryBanner';
import BannerBar from './BannerBar';
import BookshelfBar from './BookshelfBar';
import BackdropLayer from './BackdropLayer';

import css from './Browse.module.less';

const FOCUS_DELAY_MS = 100;
const TRANSITION_DELAY_MS = 450;

// Cache TTL in milliseconds (5 minutes for volatile data, 30 minutes for libraries)
const CACHE_TTL_VOLATILE = 5 * 60 * 1000;
const CACHE_TTL_LIBRARIES = 30 * 60 * 1000;
const VOLATILE_REFRESH_COOLDOWN_MS = 60 * 1000;
const CACHE_SAVE_DEBOUNCE_MS = 3000;
const STORAGE_KEY_BROWSE = 'browse_cache_v3';

let cachedRowData = null;
let cachedLibraries = null;
let cachedFeaturedItems = null;
let cacheTimestamp = null;

let lastFocusState = null;

const parseHiddenMap = (val) => {
	if (!val) return {};
	try {
		return typeof val === 'string' ? JSON.parse(val) : val;
	} catch (e) {
		return {};
	}
};

// seriesOnly keys on the series id only, otherwise it falls back to the item id.
const isHiddenByMap = (item, hiddenMap, seriesOnly) => {
	const key = seriesOnly ? item.SeriesId : (item.SeriesId || item.Id);
	if (!key || !hiddenMap[key]) return false;
	// Hide timestamps are stored as ISO strings, so parse before comparing.
	const hideTimeMs = Date.parse(hiddenMap[key]);
	// An unparseable hide timestamp can't be reasoned about; treat it as not hidden
	// rather than hiding the item permanently (NaN comparisons below are always false).
	if (!Number.isFinite(hideTimeMs)) return false;
	const lastPlayed = item.UserData?.LastPlayedDate;
	if (lastPlayed) {
		const lastPlayedMs = Date.parse(lastPlayed);
		if (lastPlayedMs > hideTimeMs) return false;
	}
	return true;
};

const EXCLUDED_COLLECTION_TYPES = ['boxsets', 'books', 'musicvideos', 'homevideos', 'photos'];

const FAVORITE_ROW_CONFIGS = [
	{id: 'favoriteMovies', title: $L('Favorite Movies'), includeItemTypes: 'Movie', type: 'portrait'},
	{id: 'favoriteSeries', title: $L('Favorite Series'), includeItemTypes: 'Series', type: 'portrait'},
	{id: 'favoriteEpisodes', title: $L('Favorite Episodes'), includeItemTypes: 'Episode', type: 'landscape'},
	{id: 'favoritePeople', title: $L('Favorite People'), includeItemTypes: 'Person', type: 'portrait'},
	{id: 'favoriteArtists', title: $L('Favorite Artists'), includeItemTypes: 'MusicArtist', type: 'square'},
	{id: 'favoriteMusicVideos', title: $L('Favorite Music Videos'), includeItemTypes: 'MusicVideo', type: 'landscape'},
	{id: 'favoriteAlbums', title: $L('Favorite Albums'), includeItemTypes: 'MusicAlbum', type: 'square'},
	{id: 'favoriteSongs', title: $L('Favorite Songs'), includeItemTypes: 'Audio', type: 'square'}
];

const FAVORITE_ROW_IDS = FAVORITE_ROW_CONFIGS.map((row) => row.id);

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

const getItemGenreNames = (item) => {
	if (!item || typeof item !== 'object') return [];
	const directGenres = Array.isArray(item.Genres) ? item.Genres : [];
	const genreItems = Array.isArray(item.GenreItems)
		? item.GenreItems.map((genreItem) => genreItem?.Name).filter(Boolean)
		: [];
	return [...directGenres, ...genreItems]
		.map((name) => String(name).trim().toLowerCase())
		.filter(Boolean);
};

const filterItemsByExcludedGenres = (items, excludedGenres) => {
	const excluded = Array.isArray(excludedGenres)
		? excludedGenres.map((genre) => String(genre).trim().toLowerCase()).filter(Boolean)
		: [];
	if (excluded.length === 0) return items;
	const excludedSet = new Set(excluded);
	return items.filter((item) => {
		const genres = getItemGenreNames(item);
		if (genres.length === 0) return true;
		return !genres.some((genre) => excludedSet.has(genre));
	});
};

const parsePluginSpec = (specJson) => {
	if (!specJson) return null;
	try {
		return JSON.parse(specJson);
	} catch (e) {
		return null;
	}
};

const browseInitialState = {
	isLoading: true,
	browseMode: 'featured',
	allRowData: [],
	featuredItems: [],
};

function browseReducer(state, action) {
	switch (action.type) {
		case 'SET_INITIAL_DATA':
			return {
				...state,
				isLoading: false,
				allRowData: action.rowData,
				featuredItems: action.featuredItems || state.featuredItems,
			};
		case 'APPEND_ROWS':
			if (action.rows.length === 0) return state;
			return { ...state, allRowData: [...state.allRowData, ...action.rows] };
		case 'REFRESH_VOLATILE': {
			const prevVolatile = new Map();
			state.allRowData.forEach((row) => {
				if (row.id === 'resume' || row.id === 'nextup') prevVolatile.set(row.id, row);
			});
			const mergedVolatile = action.volatileRows.map((row) => mergeRowPreservingRefs(prevVolatile.get(row.id), row));
			const filtered = state.allRowData.filter(r => r.id !== 'resume' && r.id !== 'nextup');
			const next = [...mergedVolatile, ...filtered];
			if (next.length === state.allRowData.length) {
				let unchanged = true;
				for (let i = 0; i < next.length; i++) {
					if (next[i] !== state.allRowData[i]) {
						unchanged = false;
						break;
					}
				}
				if (unchanged) return state;
			}
			return { ...state, allRowData: next };
		}
		case 'SET_ROW_DATA':
			return { ...state, allRowData: action.rowData };
		case 'SET_LOADING':
			if (state.isLoading === action.value) return state;
			return { ...state, isLoading: action.value };
		case 'SET_BROWSE_MODE':
			if (state.browseMode === action.mode) return state;
			return { ...state, browseMode: action.mode };
		case 'SET_FEATURED_ITEMS':
			return { ...state, featuredItems: action.items };
		default:
			return state;
	}
}

const stripItemForCache = (item) => ({
	Id: item.Id,
	Name: item.Name,
	Type: item.Type,
	ImageTags: item.ImageTags,
	SeriesName: item.SeriesName,
	SeriesId: item.SeriesId,
	ParentIndexNumber: item.ParentIndexNumber,
	IndexNumber: item.IndexNumber,
	ParentThumbItemId: item.ParentThumbItemId,
	ParentBackdropItemId: item.ParentBackdropItemId,
	CommunityRating: item.CommunityRating,
	Genres: item.Genres,
	GenreItems: item.GenreItems,
	Overview: item.Overview,
	ProductionYear: item.ProductionYear,
	RunTimeTicks: item.RunTimeTicks,
	AlbumId: item.AlbumId,
	AlbumPrimaryImageTag: item.AlbumPrimaryImageTag,
	AlbumArtist: item.AlbumArtist,
	CollectionType: item.CollectionType,
	UserData: item.UserData ? {
		PlayedPercentage: item.UserData.PlayedPercentage,
		Played: item.UserData.Played,
		LastPlayedDate: item.UserData.LastPlayedDate,
	} : undefined,
	_serverUrl: item._serverUrl,
	_serverType: item._serverType,
	_serverName: item._serverName,
	_serverAccessToken: item._serverAccessToken,
	_serverUserId: item._serverUserId,
	_serverId: item._serverId,
	isLibraryTile: item.isLibraryTile,
});

const Browse = ({
	onSelectItem,
	onSelectLibrary,
	onSelectGenre,
	onSelectSeerrItem,
	onSelectSeerrGenre,
	onSelectSeerrStudio,
	onSelectSeerrNetwork,
	isVisible = true,
	onFocusItemThemeMusic,
	onBlurItemThemeMusic,
	onLeaveThemeMusic
}) => {
	const {api, serverUrl, accessToken, hasMultipleServers, user} = useAuth();
	const {settings, activeTheme} = useSettings();
	const {isEnabled: seerrEnabled, isAuthenticated: seerrAuthenticated, user: seerrUser} = useSeerr();
	const seerrUserId = seerrUser?.seerrUserId;
	const [seerrRows, setSeerrRows] = useState([]);
	const unifiedMode = settings.unifiedLibraryMode && hasMultipleServers;
	const isLegacy = typeof document !== 'undefined' && (' ' + document.documentElement.className + ' ').indexOf(' legacy ') >= 0;
	const [state, dispatch] = useReducer(browseReducer, browseInitialState);
	const {isLoading, browseMode, allRowData, featuredItems} = state;
	const [focusedItemForBackdrop, setFocusedItemForBackdrop] = useState(null);
	const mainContentRef = useRef(null);
	const detailSectionRef = useRef(null);
	const lastFocusedRowRef = useRef(null);
	const wasVisibleRef = useRef(true);
	const lastVolatileRefreshRef = useRef(0);
	const cacheSaveTimerRef = useRef(null);
	const lastCacheSignatureRef = useRef('');
	const prevFilteredRowsRef = useRef([]);
	const filteredRowsLengthRef = useRef(0);
	const filteredRowsRef = useRef([]);
	const rowRefsMap = useRef(new Map());
	const initialFocusSetRef = useRef(false);
	const scrollTimeoutRef = useRef(null);
	const contentRowsRef = useRef(null);

	const showFeaturedBar = (settings.featuredBarStyle !== 'off');

	const registerRowRef = useCallback((rowIndex, element) => {
		if (element) {
			rowRefsMap.current.set(rowIndex, element);
		} else {
			rowRefsMap.current.delete(rowIndex);
		}
	}, []);

	const getItemServerUrl = useCallback((item) => {
		return item?._serverUrl || serverUrl;
	}, [serverUrl]);

	const settingsRef = useRef(settings);
	settingsRef.current = settings;

	const fetchFreshFeaturedItems = useCallback(async (fallbackItems = null) => {
		try {
			let items = [];
			const s = settingsRef.current;

			if (s.useMoonfinPlugin) {
				const mediaBarResult = await getMoonfinMediaBar(serverUrl, accessToken, 'tv');
				if (mediaBarResult?.Items?.length) {
					items = mediaBarResult.Items;
				}
			}

			if (items.length === 0) {
				const sourceType = s.mediaBarSourceType || 'library';
				const libraryIds = s.mediaBarLibraryIds || [];
				const collectionIds = s.mediaBarCollectionIds || [];

				if (sourceType === 'collection' && collectionIds.length > 0) {
					const results = await Promise.all(
						collectionIds.map(cid => api.getCollectionItems(cid, 50).catch(() => null))
					);
					const allItems = [];
					results.forEach(r => { if (r?.Items) allItems.push(...r.Items); });
					items = allItems
						.filter(item => item.Type !== 'BoxSet' && item.BackdropImageTags?.length)
						.sort(() => Math.random() - 0.5)
						.slice(0, s.featuredItemCount);
				} else if (unifiedMode) {
					items = await connectionPool.getRandomItemsFromAllServers(s.featuredContentType, s.featuredItemCount);
				} else if (libraryIds.length > 0) {
					const perLib = Math.ceil((s.featuredItemCount * 2) / libraryIds.length);
					const results = await Promise.all(
						libraryIds.map(lid => api.getRandomItems(s.featuredContentType, perLib, lid).catch(() => null))
					);
					const allItems = [];
					results.forEach(r => { if (r?.Items) allItems.push(...r.Items); });
					items = allItems.sort(() => Math.random() - 0.5).slice(0, s.featuredItemCount);
				} else {
					const randomItems = await api.getRandomItems(s.featuredContentType, s.featuredItemCount);
					items = randomItems?.Items || [];
				}
			}

			if (items.length > 0) {
				const filteredItems = filterItemsByExcludedGenres(
					items.filter(item => item.Type !== 'BoxSet'),
					s.excludedGenres
				);
				const featuredWithLogos = filteredItems.map(item => ({
					...item,
					LogoUrl: getLogoUrl(getItemServerUrl(item), item, {maxWidth: 800, quality: 90})
				}));
				dispatch({type: 'SET_FEATURED_ITEMS', items: featuredWithLogos});
				cachedFeaturedItems = featuredWithLogos;
				return featuredWithLogos;
			} else if (fallbackItems) {
				dispatch({type: 'SET_FEATURED_ITEMS', items: fallbackItems});
				cachedFeaturedItems = fallbackItems;
				return fallbackItems;
			}
		} catch (e) {
			console.warn('[Browse] Failed to fetch fresh featured items:', e);
			if (fallbackItems) {
				dispatch({type: 'SET_FEATURED_ITEMS', items: fallbackItems});
				cachedFeaturedItems = fallbackItems;
				return fallbackItems;
			}
		}
		return null;
	}, [api, serverUrl, accessToken, unifiedMode, getItemServerUrl]);

	const refreshVolatileData = useCallback(async (force = false) => {
		if (!force && Date.now() - lastVolatileRefreshRef.current < VOLATILE_REFRESH_COOLDOWN_MS) return;
		lastVolatileRefreshRef.current = Date.now();
		try {
			let resumeItems, nextUp;

			if (unifiedMode) {
				[resumeItems, nextUp] = await Promise.all([
					connectionPool.getResumeItemsFromAllServers(),
					connectionPool.getNextUpFromAllServers()
				]);
				resumeItems = {Items: resumeItems};
				nextUp = {Items: nextUp};
			} else {
				[resumeItems, nextUp] = await Promise.all([
					api.getResumeItems(),
					api.getNextUp()
				]);
			}

			const volatileRows = [];

			if (resumeItems.Items?.length > 0) {
				volatileRows.push({
					id: 'resume',
					title: $L('Continue Watching'),
					items: resumeItems.Items,
					type: 'landscape'
				});
			}

			if (nextUp.Items?.length > 0) {
				volatileRows.push({
					id: 'nextup',
					title: $L('Next Up'),
					items: nextUp.Items,
					type: 'landscape'
				});
			}

			dispatch({type: 'REFRESH_VOLATILE', volatileRows});
			if (cachedRowData) {
				const filtered = cachedRowData.filter(r => r.id !== 'resume' && r.id !== 'nextup');
				cachedRowData = [...volatileRows, ...filtered];
				cacheTimestamp = Date.now();
				if (!unifiedMode) {
					saveBrowseCache(cachedRowData, cachedLibraries, cachedFeaturedItems); // eslint-disable-line no-use-before-define
				}
			}
		} catch (e) {
			console.warn('[Browse] Background refresh failed:', e);
		}
	}, [api, unifiedMode, saveBrowseCache]); // eslint-disable-line no-use-before-define

	const uiPanelStyle = useMemo(() => {
		return {
			background: toCssColor(activeTheme.colors.surface),
			backdropFilter: 'none',
			WebkitBackdropFilter: 'none',
			border: 'var(--theme-card-border)',
			boxShadow: 'var(--theme-focus-glow)'
		};
	}, [activeTheme]);

	const uiButtonStyle = useMemo(() => {
		return {
			background: toCssColor(activeTheme.colors.buttonNormal),
			color: toCssColor(activeTheme.colors.onButtonNormal),
			backdropFilter: 'none',
			WebkitBackdropFilter: 'none',
			border: 'var(--theme-chip-border)',
			borderRadius: 'var(--theme-chip-radius)'
		};
	}, [activeTheme]);

	const useModernRows = settings.homeRowsStyle !== 'v1';
	const RowComponent = useModernRows ? ModernMediaRow : ClassicMediaRow;
	const showTopInfoArea = !useModernRows;

	const homeRowsConfig = useMemo(() => {
		return [...(settings.homeRows || [])].sort((a, b) => a.order - b.order);
	}, [settings.homeRows]);

	const pluginSectionsConfig = useMemo(() => {
		return [...(settings.pluginSections || [])].sort((a, b) => a.order - b.order);
	}, [settings.pluginSections]);

	const isRowVisibleByGates = useCallback((rowId) => {
		if (FAVORITE_ROW_IDS.includes(rowId)) return settings.displayFavoritesRows;
		if (rowId === 'collections') return settings.displayCollectionsRows;
		if (rowId === 'genres') return settings.displayGenresRows;
		if (rowId === 'imdb-top250-movies') return settings.imdbTop250MoviesEnabled;
		if (rowId === 'imdb-top250-tv') return settings.imdbTop250TvShowsEnabled;
		if (rowId === 'imdb-popular-movies') return settings.imdbMostPopularMoviesEnabled;
		if (rowId === 'imdb-popular-tv') return settings.imdbMostPopularTvShowsEnabled;
		if (rowId === 'imdb-lowest-rated') return settings.imdbLowestRatedMoviesEnabled;
		if (rowId === 'imdb-top-english') return settings.imdbTopEnglishMoviesEnabled;
		return true;
	}, [settings.displayFavoritesRows, settings.displayCollectionsRows, settings.displayGenresRows,
		settings.imdbTop250MoviesEnabled, settings.imdbTop250TvShowsEnabled, settings.imdbMostPopularMoviesEnabled,
		settings.imdbMostPopularTvShowsEnabled, settings.imdbLowestRatedMoviesEnabled, settings.imdbTopEnglishMoviesEnabled]);

	const filteredRows = useMemo(() => {
		const enabledRowIds = homeRowsConfig.filter(r => r.enabled).map(r => r.id);
		const enabledPluginIds = pluginSectionsConfig.filter((section) => section.enabled).map((section) => section.id);
		const rowOrderMap = new Map();
		homeRowsConfig.forEach((row) => rowOrderMap.set(row.id, row.order));
		pluginSectionsConfig.forEach((section, index) => rowOrderMap.set(section.id, (section.order ?? index) + 1000));

		const hiddenCWMap = parseHiddenMap(settings.hiddenContinueWatchingItems);
		const hiddenNUMap = parseHiddenMap(settings.hiddenNextUpSeries);

		let result;

		if (settings.mergeContinueWatchingNextUp) {
			const mergeResumeRow = allRowData.find(r => r.id === 'resume');
			const nextUpRow = allRowData.find(r => r.id === 'nextup');
			const recentlyPlayed = allRowData.find(r => r.id === 'recentlyplayed');

			result = allRowData.filter(r => r.id !== 'resume' && r.id !== 'nextup');

			if (mergeResumeRow || nextUpRow) {
				const resumeItems = (mergeResumeRow?.items || []).filter(item => !isHiddenByMap(item, hiddenCWMap, false));
				const nextUpItems = (nextUpRow?.items || []).filter(item => !isHiddenByMap(item, hiddenNUMap, true));
				const recentlyPlayedItems = recentlyPlayed?.items || [];

				const seriesLastPlayedMap = new Map();
				resumeItems.forEach(item => {
					const seriesId = item.SeriesId;
					const lastPlayed = item.UserData?.LastPlayedDate;
					if (seriesId && lastPlayed) {
						const existing = seriesLastPlayedMap.get(seriesId);
						if (!existing || lastPlayed > existing) {
							seriesLastPlayedMap.set(seriesId, lastPlayed);
						}
					}
				});

				recentlyPlayedItems.forEach(item => {
					const seriesId = item.SeriesId;
					const lastPlayed = item.UserData?.LastPlayedDate;
					if (seriesId && lastPlayed) {
						const existing = seriesLastPlayedMap.get(seriesId);
						if (!existing || lastPlayed > existing) {
							seriesLastPlayedMap.set(seriesId, lastPlayed);
						}
					}
				});

				const mergeResumeItemIds = new Set(resumeItems.map(item => item.Id));

				const filteredNextUp = nextUpItems
					.filter(item => !mergeResumeItemIds.has(item.Id))
					.map(item => {
						const seriesLastPlayed = seriesLastPlayedMap.get(item.SeriesId);
						if (seriesLastPlayed && !item.UserData?.LastPlayedDate) {
							return {
								...item,
								UserData: {
									...item.UserData,
									LastPlayedDate: seriesLastPlayed
								}
							};
						}
						return item;
					});

				const combinedItems = [...resumeItems, ...filteredNextUp].sort((a, b) => {
					const aLastPlayed = a.UserData?.LastPlayedDate;
					const bLastPlayed = b.UserData?.LastPlayedDate;

					if (aLastPlayed && bLastPlayed) {
						return bLastPlayed.localeCompare(aLastPlayed);
					}
					if (aLastPlayed) return -1;
					if (bLastPlayed) return 1;
					return 0;
				});

				if (combinedItems.length > 0) {
					if (enabledRowIds.includes('resume') || enabledRowIds.includes('nextup')) {
						result = [{
							id: 'continue-nextup',
							title: $L('Continue Watching'),
							items: combinedItems,
							type: 'landscape'
						}, ...result];
					}
				}
			}

			result = result.filter((row) => {
				if (row.id === 'continue-nextup') return true;
				if (row.isPluginRow) return enabledPluginIds.includes(row.id);
				if (!isRowVisibleByGates(row.id)) return false;
				if (row.isLatestRow) return enabledRowIds.includes('latest-media');
				if (row.isRecentlyReleasedRow) return enabledRowIds.includes('recently-released');
				return enabledRowIds.includes(row.id);
			});
		} else {
			const resumeRow = allRowData.find(r => r.id === 'resume');
			const resumeItems = (resumeRow?.items || []).filter(item => !isHiddenByMap(item, hiddenCWMap, false));
			const resumeItemIds = new Set(resumeItems.map(item => item.Id));

			result = allRowData
				.map(row => {
					if (row.id === 'resume') {
						return resumeItems.length > 0 ? {...row, items: resumeItems} : null;
					}
					if (row.id === 'nextup') {
						const filteredItems = row.items.filter(item => !resumeItemIds.has(item.Id) && !isHiddenByMap(item, hiddenNUMap, true));
						return filteredItems.length > 0 ? {...row, items: filteredItems} : null;
					}
					return row;
				})
				.filter(row => {
					if (!row) return false;
					if (row.isPluginRow) {
						return enabledPluginIds.includes(row.id);
					}
					if (row.id === 'resume' || row.id === 'nextup') {
						return enabledRowIds.includes(row.id);
					}
					if (row.isLatestRow) {
						return enabledRowIds.includes('latest-media');
					}
					if (row.isRecentlyReleasedRow) {
						return enabledRowIds.includes('recently-released');
					}
					if (!isRowVisibleByGates(row.id)) {
						return false;
					}
					return enabledRowIds.includes(row.id);
				});
		}

		// Re-translate titles so cached rows pick up the current locale
		const favoriteLabelMap = new Map(FAVORITE_ROW_CONFIGS.map((row) => [row.id, $L(row.title)]));
		result = result.map(row => {
			let title;
			if (row.id === 'resume' || row.id === 'continue-nextup') title = $L('Continue Watching');
			else if (row.id === 'nextup') title = $L('Next Up');
			else if (row.id === 'library-tiles') title = $L('My Media');
			else if (row.id === 'collections') title = $L('Collections');
			else if (row.id === 'genres') title = $L('Genres');
			else if (favoriteLabelMap.has(row.id)) title = favoriteLabelMap.get(row.id);
			else if (row.isLatestRow && row.library) {
				const libName = row.library._serverName
					? `${row.library.Name} (${row.library._serverName})`
					: row.library.Name;
				title = $L('Recently Added in {libraryTitle}').replace('{libraryTitle}', libName);
			} else if (row.isRecentlyReleasedRow && row.library) {
				const libName = row.library._serverName
					? `${row.library.Name} (${row.library._serverName})`
					: row.library.Name;
				title = $L('Recently Released in {libraryTitle}').replace('{libraryTitle}', libName);
			}
			return title && title !== row.title ? {...row, title} : row;
		});

		result = [...result, ...seerrRows];

		const resumeOrder = rowOrderMap.get('resume');
		const nextUpOrder = rowOrderMap.get('nextup');
		const continueOrder = Math.min(
			Number.isFinite(resumeOrder) ? resumeOrder : Number.MAX_SAFE_INTEGER,
			Number.isFinite(nextUpOrder) ? nextUpOrder : Number.MAX_SAFE_INTEGER
		);

		result = result
			.map((row, index) => {
				let order = rowOrderMap.get(row.id);
				if (row.id === 'continue-nextup') {
					order = Number.isFinite(continueOrder) ? continueOrder : 0;
				} else if (row.isLatestRow) {
					order = rowOrderMap.get('latest-media');
				} else if (row.isRecentlyReleasedRow) {
					order = rowOrderMap.get('recently-released');
				} else if (row.isSeerrRow) {
					order = 3000 + index;
				}
				if (!Number.isFinite(order)) {
					order = row.isPluginRow ? 2000 + index : 1000 + index;
				}
				return {row, index, order};
			})
			.sort((left, right) => left.order - right.order || left.index - right.index)
			.map((entry) => entry.row);

		const prev = prevFilteredRowsRef.current;
		if (prev.length === result.length) {
			let unchanged = true;
			for (let i = 0; i < result.length; i++) {
				if (result[i].id !== prev[i].id || result[i].items.length !== prev[i].items.length || result[i].title !== prev[i].title) {
					unchanged = false;
					break;
				}
				const rItems = result[i].items;
				const pItems = prev[i].items;
				if (rItems[0]?.Id !== pItems[0]?.Id || rItems[rItems.length - 1]?.Id !== pItems[pItems.length - 1]?.Id) {
					unchanged = false;
					break;
				}
			}
			if (unchanged) return prev;
		}

		prevFilteredRowsRef.current = result;
		return result;
	}, [allRowData, seerrRows, homeRowsConfig, pluginSectionsConfig, settings.mergeContinueWatchingNextUp, settings.hiddenContinueWatchingItems, settings.hiddenNextUpSeries, isRowVisibleByGates]);

	const focusRow = useCallback((rowIndex) => {
		if (Spotlight.focus(`row-${rowIndex}`)) {
			return true;
		}

		const row = filteredRowsRef.current[rowIndex];
		const firstItemId = row?.items?.[0]?.Id;
		const keyPrefix = row?.id || rowIndex;

		if (firstItemId !== undefined && firstItemId !== null) {
			const firstCardSpotlightId = `media-${keyPrefix}-${firstItemId}`;
			if (Spotlight.focus(firstCardSpotlightId)) {
				return true;
			}
		}

		return false;
	}, []);

	const scrollToRow = useCallback((rowIndex, thenFocus) => {
		if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);

		const targetRow = rowRefsMap.current.get(rowIndex);
		const container = contentRowsRef.current;
		if (!targetRow || !container) {
			if (thenFocus) focusRow(rowIndex);
			return;
		}

		container.scrollTop = targetRow.offsetTop;

		if (thenFocus) {
			let attempts = 0;
			const tryFocus = () => {
				attempts += 1;
				if (focusRow(rowIndex)) {
					return;
				}
				if (attempts < 6) {
					scrollTimeoutRef.current = setTimeout(tryFocus, 16);
				}
			};
			scrollTimeoutRef.current = setTimeout(tryFocus, 0);
		}
	}, [focusRow]);

	const handleNavigateUp = useCallback((fromRowIndex) => {
		if (fromRowIndex === 0) {
			if (showFeaturedBar !== false) {
				dispatch({type: 'SET_BROWSE_MODE', mode: 'featured'});
				setTimeout(() => Spotlight.focus('featured-banner'), 50);
			} else if (settings.navbarPosition !== 'left') {
				Spotlight.focus('navbar-home');
			}
			return;
		}
		const targetIndex = fromRowIndex - 1;
		scrollToRow(targetIndex, true);
	}, [showFeaturedBar, settings.navbarPosition, scrollToRow]);

	filteredRowsRef.current = filteredRows;
	filteredRowsLengthRef.current = filteredRows.length;

	const handleNavigateDown = useCallback((fromRowIndex) => {
		const targetIndex = fromRowIndex + 1;
		if (targetIndex >= filteredRowsLengthRef.current) return;
		scrollToRow(targetIndex, true);
	}, [scrollToRow]);

	useEffect(() => {
		if (showFeaturedBar === false) {
			dispatch({type: 'SET_BROWSE_MODE', mode: 'rows'});
		}
	}, [showFeaturedBar]);

	useEffect(() => {
		if (isVisible && !wasVisibleRef.current && !isLoading && filteredRows.length > 0) {
			fetchFreshFeaturedItems();
			refreshVolatileData();

			setTimeout(() => {
				if (lastFocusState && lastFocusState.rowIndex > 0) {
					const {rowIndex} = lastFocusState;
					const targetRowIndex = Math.min(rowIndex, filteredRows.length - 1);
					scrollToRow(targetRowIndex, true);
				} else if (showFeaturedBar !== false && featuredItems.length > 0) {
					dispatch({type: 'SET_BROWSE_MODE', mode: 'featured'});
					setTimeout(() => Spotlight.focus('featured-banner'), 50);
				} else {
					scrollToRow(0, true);
				}
				lastFocusState = null;
			}, FOCUS_DELAY_MS);
		}
		wasVisibleRef.current = isVisible;
	}, [isVisible, isLoading, filteredRows.length, fetchFreshFeaturedItems, refreshVolatileData, showFeaturedBar, featuredItems.length, scrollToRow]);

	useEffect(() => {
		if (!isVisible) return;
		if (!isLoading && !initialFocusSetRef.current) {
			setTimeout(() => {
				if (lastFocusState || initialFocusSetRef.current) {
					return;
				}
				if (showFeaturedBar !== false && featuredItems.length > 0) {
					Spotlight.focus('featured-banner');
					initialFocusSetRef.current = true;
				} else if (filteredRows.length > 0) {
					Spotlight.focus('row-0');
					initialFocusSetRef.current = true;
				}
			}, FOCUS_DELAY_MS);
		}
	}, [isVisible, isLoading, featuredItems.length, filteredRows.length, showFeaturedBar]);

	useEffect(() => {
		cachedRowData = null;
		cachedLibraries = null;
		cachedFeaturedItems = null;
		cacheTimestamp = null;
		initialFocusSetRef.current = false;
	}, [accessToken]);

	useEffect(() => {
		const handleBrowseRefresh = () => {
			cachedRowData = null;
			cachedLibraries = null;
			cachedFeaturedItems = null;
			cacheTimestamp = null;
		};

		window.addEventListener('moonfin:browseRefresh', handleBrowseRefresh);
		return () => {
			window.removeEventListener('moonfin:browseRefresh', handleBrowseRefresh);
		};
	}, []);

	const isCacheValid = useCallback((timestamp, ttl) => {
		if (!timestamp) return false;
		return Date.now() - timestamp < ttl;
	}, []);

	const saveBrowseCache = useCallback((rowData, libs, featured) => {
		const signature = rowData.map((row) => {
			let progressSum = 0;
			if (row.id === 'resume' || row.id === 'nextup') {
				row.items.forEach((item) => {
					progressSum += item.UserData?.PlayedPercentage || 0;
				});
			}
			return `${row.id}:${row.items.length}:${row.items[0]?.Id || ''}:${Math.round(progressSum)}`;
		}).join('|');
		if (signature === lastCacheSignatureRef.current) return;

		if (cacheSaveTimerRef.current) clearTimeout(cacheSaveTimerRef.current);
		cacheSaveTimerRef.current = setTimeout(async () => {
			cacheSaveTimerRef.current = null;
			try {
				const strippedRows = rowData.map(row => ({
					...row,
					items: row.items.map(stripItemForCache)
				}));
				const cacheData = {
					rowData: strippedRows,
					libraries: libs,
					featuredItems: featured,
					timestamp: Date.now(),
					serverUrl,
					userId: user?.Id || null
				};
				await saveToStorage(STORAGE_KEY_BROWSE, cacheData);
				lastCacheSignatureRef.current = signature;
			} catch (e) {
				console.warn('[Browse] Failed to save cache:', e);
			}
		}, CACHE_SAVE_DEBOUNCE_MS);
	}, [serverUrl, user?.Id]);

	useEffect(() => {
		return () => {
			if (cacheSaveTimerRef.current) clearTimeout(cacheSaveTimerRef.current);
		};
	}, []);

	const loadBrowseCache = useCallback(async () => {
		try {
			const cached = await getFromStorage(STORAGE_KEY_BROWSE);
			if (cached && cached.serverUrl === serverUrl && cached.userId === (user?.Id || null)) {
				return cached;
			}
		} catch (e) {
			console.warn('[Browse] Failed to load cache:', e);
		}
		return null;
	}, [serverUrl, user?.Id]);

	useEffect(() => {
		const loadData = async () => {
			// IMDb rows are only fetched by fetchAllData, so treat an enabled IMDb list as
			// dynamic config. Otherwise enabling one shows nothing until the browse cache expires.
			const hasEnabledImdbRow = homeRowsConfig.some(
				(row) => row.enabled && row.id.startsWith('imdb-')
			);
			const hasDynamicRowConfig =
				settings.displayFavoritesRows ||
				settings.displayCollectionsRows ||
				settings.displayGenresRows ||
				hasEnabledImdbRow ||
				(settings.pluginSections || []).some((section) => section?.enabled);

			if (hasDynamicRowConfig || unifiedMode) {
				dispatch({type: 'SET_LOADING', value: true});
				await fetchAllData(); // eslint-disable-line no-use-before-define
				return;
			}

			if (cachedRowData && cachedLibraries && cachedFeaturedItems && isCacheValid(cacheTimestamp, CACHE_TTL_VOLATILE)) {
				dispatch({type: 'SET_ROW_DATA', rowData: cachedRowData});
				await fetchFreshFeaturedItems(cachedFeaturedItems);
				dispatch({type: 'SET_LOADING', value: false});
				return;
			}

			const persistedCache = await loadBrowseCache();
			const hasValidPersistedCache = persistedCache && isCacheValid(persistedCache.timestamp, CACHE_TTL_LIBRARIES);

			if (hasValidPersistedCache) {
				dispatch({type: 'SET_ROW_DATA', rowData: persistedCache.rowData});
				await fetchFreshFeaturedItems(persistedCache.featuredItems);
				cachedLibraries = persistedCache.libraries;
				cachedRowData = persistedCache.rowData;
				cacheTimestamp = persistedCache.timestamp;
				dispatch({type: 'SET_LOADING', value: false});

				if (!isCacheValid(persistedCache.timestamp, CACHE_TTL_VOLATILE)) {
					refreshVolatileData(true);
				}
				return;
			}

			dispatch({type: 'SET_LOADING', value: true});
			await fetchAllData(); // eslint-disable-line no-use-before-define
		};

		const fetchAllData = async () => {
			try {
				let libs, resumeItems, nextUp, userConfig, randomItems, recentlyPlayed, imdbResults = [];

				if (unifiedMode) {
					const [libsArray, resumeArray, nextUpArray, randomArray] = await Promise.all([
						connectionPool.getLibrariesFromAllServers(),
						connectionPool.getResumeItemsFromAllServers(),
						connectionPool.getNextUpFromAllServers(),
						connectionPool.getRandomItemsFromAllServers(settings.featuredContentType, settings.featuredItemCount)
					]);
					libs = libsArray;
					resumeItems = {Items: resumeArray};
					nextUp = {Items: nextUpArray};
					userConfig = null; // Not supported in unified mode
					randomItems = {Items: randomArray};
					recentlyPlayed = null;
					// IMDb custom rows are single-server only, so imdbResults stays empty in unified mode.
				} else {
					const enabledImdbRows = homeRowsConfig.filter(
						(row) => row.enabled && row.id.startsWith('imdb-')
					);
					const [results, imdbListResults] = await Promise.all([
						Promise.all([
							api.getLibraries(),
							api.getResumeItems(),
							api.getNextUp(),
							api.getUserConfiguration().catch(() => null),
							api.getRandomItems(settings.featuredContentType, settings.featuredItemCount),
							settings.mergeContinueWatchingNextUp ? api.getItems({
								IncludeItemTypes: 'Episode',
								Filters: 'IsPlayed',
								Recursive: true,
								SortBy: 'DatePlayed',
								SortOrder: 'Descending',
								Limit: 100,
								Fields: 'UserData,SeriesId'
							}) : Promise.resolve(null)
						]),
						Promise.all(
							enabledImdbRows.map((row) => {
								const serverId = TV_TO_SERVER_ROW[row.id] || row.id;
								return api.getCustomRow('imdb', serverId)
									.then((res) => {
										if (!res || res.success !== true || !Array.isArray(res.items)) {
											return { row, items: [] };
										}
										// These are external discovery items (no library Id / ImageTags),
										// so map them to what the media card can render via _externalPosterUrl.
										const items = res.items.map((it) => {
											const imdbId = it.providerIds?.Imdb || null;
											return {
												Id: `imdb-${imdbId || `${serverId}-${it.rank}`}`,
												Name: it.name,
												Type: it.type,
												ProductionYear: it.productionYear,
												ProviderIds: {Imdb: imdbId},
												_externalPosterUrl: it.posterUrl || null
											};
										});
										return { row, items };
									})
									.catch(() => ({ row, items: [] }));
							})
						)
					]);
					libs = results[0].Items || [];
					resumeItems = results[1];
					nextUp = results[2];
					userConfig = results[3];
					randomItems = results[4];
					recentlyPlayed = results[5];
					imdbResults = imdbListResults;
				}

				cachedLibraries = libs;

				const latestItemsExcludes = userConfig?.Configuration?.LatestItemsExcludes || [];

				const rowData = [];

				if (resumeItems.Items?.length > 0) {
					rowData.push({
						id: 'resume',
						title: $L('Continue Watching'),
						items: resumeItems.Items,
						type: 'landscape'
					});
				}

				if (nextUp.Items?.length > 0) {
					rowData.push({
						id: 'nextup',
						title: $L('Next Up'),
						items: nextUp.Items,
						type: 'landscape'
					});
				}

				if (libs.length > 0) {
					const visibleLibs = libs.filter(lib => !EXCLUDED_COLLECTION_TYPES.includes(lib.CollectionType?.toLowerCase()));
					if (visibleLibs.length > 0) {
						rowData.push({
							id: 'library-tiles',
							title: $L('My Media'),
							items: visibleLibs.map(lib => ({
								...lib,
								Type: 'CollectionFolder',
								isLibraryTile: true
							})),
							type: 'landscape',
							isLibraryRow: true
						});
					}
				}

				if (randomItems?.Items?.length > 0) {
					const filteredItems = randomItems.Items.filter(item => item.Type !== 'BoxSet');
					const shuffled = [...filteredItems].sort(() => Math.random() - 0.5);
					const featuredWithLogos = shuffled.map(item => ({
						...item,
						LogoUrl: getLogoUrl(getItemServerUrl(item), item, {maxWidth: 800, quality: 90})
					}));
					cachedFeaturedItems = featuredWithLogos;
				}

				if (recentlyPlayed?.Items?.length > 0) {
					rowData.push({
						id: 'recentlyplayed',
						items: recentlyPlayed.Items
					});
				}

				dispatch({type: 'SET_INITIAL_DATA', rowData});
				// Populate the Mediabar via the settings-aware loader so it honors
				// the selected libraries; the server-wide random items are only a
				// fallback (otherwise excluded libraries leak in).
				fetchFreshFeaturedItems(cachedFeaturedItems);

				const eligibleLibraries = libs.filter(lib => {
					if (EXCLUDED_COLLECTION_TYPES.includes(lib.CollectionType?.toLowerCase())) {
						return false;
					}
					if (latestItemsExcludes.includes(lib.Id)) {
						return false;
					}
					return true;
				});

				let latestResults;
				let recentlyReleasedResults;
				let collectionsResult = null;
				let favoriteResults = [];
				let genresResult = null;
				let pluginRows = [];

				const fetchPluginSectionRow = async (section) => {
					if (!section?.enabled) return null;
					const spec = parsePluginSpec(section.specJson);
					if (!spec || typeof spec !== 'object') return null;
					const limit = Number.isFinite(Number(spec.limit)) ? Number(spec.limit) : 20;
					const title = section.name || section.displayText || $L('Plugin Section');
					const fields = HOME_ROW_ITEM_FIELDS;

					try {
						let items = [];
						switch (spec.kind) {
							case 'recentlyReleasedMovies': {
								const result = await api.getItems({
									IncludeItemTypes: 'Movie',
									SortBy: 'PremiereDate',
									SortOrder: 'Descending',
									Recursive: true,
									Limit: limit,
									Fields: fields
								});
								items = result?.Items || [];
								break;
							}
							case 'recentlyReleasedEpisodes': {
								const result = await api.getItems({
									IncludeItemTypes: 'Episode',
									SortBy: 'PremiereDate',
									SortOrder: 'Descending',
									Recursive: true,
									Limit: limit,
									Fields: fields
								});
								items = result?.Items || [];
								break;
							}
							case 'watchAgain': {
								const result = await api.getItems({
									IncludeItemTypes: 'Movie,Series',
									Filters: 'IsPlayed',
									SortBy: 'DatePlayed',
									SortOrder: 'Descending',
									Recursive: true,
									Limit: limit,
									Fields: fields
								});
								items = result?.Items || [];
								break;
							}
							case 'recentlyAddedInLibrary': {
								const libraryIds = Array.isArray(spec.libraryIds) ? spec.libraryIds : [];
								const responses = await Promise.all(
									libraryIds.map((libraryId) => api.getItems({
										ParentId: libraryId,
										IncludeItemTypes: 'Movie,Series',
										SortBy: 'DateCreated',
										SortOrder: 'Descending',
										Recursive: true,
										Limit: limit,
										Fields: fields
									}).catch(() => null))
								);
								items = responses.flatMap((response) => response?.Items || []).slice(0, limit);
								break;
							}
							case 'custom': {
								const includeItemTypes = Array.isArray(spec.includeItemTypes)
									? spec.includeItemTypes.join(',')
									: 'Movie,Series';
								const sortBy = spec.sortBy || 'Random';
								const sortOrder = spec.sortOrderDirection || 'Ascending';
								const params = {
									IncludeItemTypes: includeItemTypes,
									SortBy: sortBy,
									SortOrder: sortOrder,
									Recursive: true,
									Limit: limit,
									Fields: fields
								};
								if (spec.type === 'genre' && spec.source) params.Genres = spec.source;
								if (spec.type === 'person' && spec.source) params.PersonIds = spec.source;
								if (spec.type === 'studio' && spec.source) params.StudioIds = spec.source;
								if (spec.type === 'collection' && spec.source) params.ParentId = spec.source;
								const result = await api.getItems(params);
								items = result?.Items || [];
								break;
							}
							case 'collection': {
								const collectionId = spec.collectionId || null;
								if (!collectionId) {
									items = [];
									break;
								}
								const result = await api.getCollectionItems(collectionId, limit);
								items = result?.Items || [];
								break;
							}
							case 'genre': {
								const params = {
									IncludeItemTypes: spec.includeItemTypes || 'Movie,Series',
									SortBy: spec.sortBy || 'SortName',
									SortOrder: spec.sortOrder || 'Ascending',
									Recursive: true,
									Limit: limit,
									Fields: fields
								};
								if (spec.genreId) {
									params.GenreIds = spec.genreId;
								} else if (spec.genreName) {
									params.Genres = spec.genreName;
								}
								const result = await api.getItems(params);
								items = result?.Items || [];
								break;
							}
							default:
								items = [];
						}

						if (items.length === 0) return null;
						const cardTypeHint = spec.cardType || spec.section?.CardType || spec.section?.cardType || spec.section?.Layout || spec.section?.layout;
						const normalizedCardType = typeof cardTypeHint === 'string' ? cardTypeHint.toLowerCase() : '';
						const viewModeHint = spec.viewMode || spec.section?.ViewMode || spec.section?.viewMode || '';
						const normalizedViewMode = typeof viewModeHint === 'string' ? viewModeHint.toLowerCase() : '';
						let rowType = 'portrait';
						if (normalizedViewMode.includes('portrait')) {
							rowType = 'portrait';
						} else if (normalizedViewMode.includes('square')) {
							rowType = 'square';
						} else if (
							normalizedViewMode.includes('landscape') ||
							normalizedViewMode.includes('small') ||
							normalizedViewMode.includes('backdrop') ||
							normalizedCardType.includes('landscape') ||
							normalizedCardType.includes('thumb') ||
							spec.kind === 'recentlyReleasedEpisodes'
						) {
							rowType = 'landscape';
						}
						return {
							id: section.id,
							title,
							items,
							type: rowType,
							isPluginRow: true,
							pluginSource: section.source
						};
					} catch (_error) {
						return null;
					}
				};

				if (unifiedMode) {
					latestResults = await connectionPool.getLatestPerLibraryFromAllServers(
						latestItemsExcludes,
						EXCLUDED_COLLECTION_TYPES
					);
				} else {
					const favoriteSortBy = settings.favoritesRowSortBy || 'SortName';
					const favoriteSortOrder = getSortOrderFromSortBy(favoriteSortBy);
					const collectionsSortBy = settings.collectionsRowSortBy || 'SortName';
					const collectionsSortOrder = getSortOrderFromSortBy(collectionsSortBy);
					const genresSortBy = settings.genresRowSortBy || 'SortName';
					const genresSortOrder = getSortOrderFromSortBy(genresSortBy);
					const genresIncludeTypes = getGenresIncludeTypes(settings.genresRowItemFilter);
					const enabledPluginSections = (settings.pluginSections || []).filter((section) => section.enabled);

					[latestResults, recentlyReleasedResults, collectionsResult, favoriteResults, genresResult, pluginRows] = await Promise.all([
						Promise.all(
							eligibleLibraries.map(lib =>
								api.getLatest(lib.Id, 16)
									.then(latest => ({lib, latest}))
									.catch(() => null)
							)
						),
						Promise.all(
							eligibleLibraries.map(lib =>
								api.getRecentlyReleased(lib.Id, 16)
									.then(latest => ({lib, latest}))
									.catch(() => null)
							)
						),
						settings.displayCollectionsRows
							? api.getCollections(20, collectionsSortBy, collectionsSortOrder).catch(() => null)
							: Promise.resolve(null),
						settings.displayFavoritesRows
							? Promise.all(
								FAVORITE_ROW_CONFIGS.map((rowConfig) =>
									api.getItems({
										IncludeItemTypes: rowConfig.includeItemTypes,
										Filters: 'IsFavorite',
										SortBy: favoriteSortBy,
										SortOrder: favoriteSortOrder,
										Recursive: true,
										Limit: 20,
										Fields: HOME_ROW_ITEM_FIELDS
									})
										.then((result) => ({rowConfig, result}))
										.catch(() => null)
								)
							)
							: Promise.resolve([]),
						settings.displayGenresRows
							? api.getGenres(undefined, genresIncludeTypes, genresSortBy, genresSortOrder).catch(() => null)
							: Promise.resolve(null),
						Promise.all(enabledPluginSections.map((section) => fetchPluginSectionRow(section)))
					]);
				}

				const newRows = [];

				for (const result of latestResults) {
					if (result && result.latest?.length > 0) {
						const libraryTitle = unifiedMode && result.lib._serverName
							? `${result.lib.Name} (${result.lib._serverName})`
							: result.lib.Name;
						const rowId = `latest-${result.lib.Id}${result.lib._serverName ? '-' + result.lib._serverName : ''}`;

						newRows.push({
							id: rowId,
							title: $L('Recently Added in {libraryTitle}').replace('{libraryTitle}', libraryTitle),
							items: result.latest,
							library: result.lib,
							type: result.lib.CollectionType?.toLowerCase() === 'music' ? 'square' : 'portrait',
							isLatestRow: true
						});
					}
				}

				for (const result of recentlyReleasedResults) {
					if (result && result.latest.Items?.length > 0) {
						const libraryTitle = unifiedMode && result.lib._serverName
							? `${result.lib.Name} (${result.lib._serverName})`
							: result.lib.Name;
						const rowId = `recently-released-${result.lib.Id}${result.lib._serverName ? '-' + result.lib._serverName : ''}`;

						newRows.push({
							id: rowId,
							title: $L('Recently Released in {libraryTitle}').replace('{libraryTitle}', libraryTitle),
							items: result.latest.Items,
							library: result.lib,
							type: result.lib.CollectionType?.toLowerCase() === 'music' ? 'square' : 'portrait',
							isRecentlyReleasedRow: true
						});
					}
				}

				if (collectionsResult?.Items?.length > 0) {
					newRows.push({
						id: 'collections',
						title: $L('Collections'),
						items: collectionsResult.Items,
						type: 'portrait'
					});
				}

				favoriteResults
					.filter(Boolean)
					.forEach((favoriteResult) => {
						const items = favoriteResult?.result?.Items || [];
						if (items.length === 0) return;
						newRows.push({
							id: favoriteResult.rowConfig.id,
							title: $L(favoriteResult.rowConfig.title),
							items,
							type: favoriteResult.rowConfig.type
						});
					});

				if (genresResult?.Items?.length > 0) {
					newRows.push({
						id: 'genres',
						title: $L('Genres'),
						items: genresResult.Items,
						type: 'portrait',
						isGenreRow: true
					});
				}

				imdbResults.forEach((res) => {
					if (res.items?.length > 0) {
						newRows.push({
							id: res.row.id,
							title: $L(res.row.name),
							items: res.items,
							type: 'portrait'
						});
					}
				});

				pluginRows.filter(Boolean).forEach((pluginRow) => newRows.push(pluginRow));

				dispatch({type: 'APPEND_ROWS', rows: newRows});
				cachedRowData = [...rowData, ...newRows];
				cacheTimestamp = Date.now();

				if (!unifiedMode && newRows.length > 0) {
					saveBrowseCache(cachedRowData, libs, cachedFeaturedItems);
				}

			} catch (err) {
				console.error('Failed to load browse data:', err);
			} finally {
				dispatch({type: 'SET_LOADING', value: false});
			}
		};

		loadData();
	}, [
		api,
		serverUrl,
		accessToken,
		settings.featuredContentType,
		settings.featuredItemCount,
		settings.displayFavoritesRows,
		settings.displayCollectionsRows,
		settings.displayGenresRows,
		settings.favoritesRowSortBy,
		settings.collectionsRowSortBy,
		settings.genresRowSortBy,
		settings.genresRowItemFilter,
		settings.uiLanguage,
		settings.pluginSections,
		settings.mergeContinueWatchingNextUp,
		isCacheValid,
		loadBrowseCache,
		saveBrowseCache,
		fetchFreshFeaturedItems,
		unifiedMode,
		getItemServerUrl,
		refreshVolatileData,
		homeRowsConfig
	]); // eslint-disable-line no-use-before-define

	const targetBackdropUrl = useMemo(() => {
		if (browseMode === 'featured') return '';
		if (!focusedItemForBackdrop || isLegacy || settings.showHomeBackdrop === false) return '';

		const backdropId = getBackdropId(focusedItemForBackdrop);
		if (!backdropId) return '';
		const itemUrl = getItemServerUrl(focusedItemForBackdrop);
		return getImageUrl(itemUrl, backdropId, 'Backdrop', {maxWidth: 1280, quality: 80});
	}, [browseMode, focusedItemForBackdrop, isLegacy, settings.showHomeBackdrop, getItemServerUrl]);

	const handleSelectItem = useCallback((item) => {
		onBlurItemThemeMusic?.();
		onLeaveThemeMusic?.();
		if (lastFocusedRowRef.current !== null) {
			lastFocusState = {
				rowIndex: lastFocusedRowRef.current
			};
		}
		if (item.isLibraryTile) {
			onSelectLibrary?.(item);
		} else {
			onSelectItem?.(item);
		}
	}, [onSelectItem, onSelectLibrary, onBlurItemThemeMusic, onLeaveThemeMusic]);

	const handleSelectGenreItem = useCallback((item) => {
		onBlurItemThemeMusic?.();
		onLeaveThemeMusic?.();
		if (lastFocusedRowRef.current !== null) {
			lastFocusState = {
				rowIndex: lastFocusedRowRef.current
			};
		}
		onSelectGenre?.({
			id: item.Id,
			name: item.Name,
			_serverUrl: item._serverUrl,
			_serverType: item._serverType,
			_serverName: item._serverName,
			_serverAccessToken: item._serverAccessToken,
			_serverUserId: item._serverUserId,
			_serverId: item._serverId
		});
	}, [onSelectGenre, onBlurItemThemeMusic, onLeaveThemeMusic]);

	const handleSelectSeerrItem = useCallback((item) => {
		const raw = item._seerrRaw || {};
		switch (item._seerrType) {
			case 'genre':
				onSelectSeerrGenre?.(raw.genreId, raw.genreName, raw.mediaType);
				break;
			case 'studio':
				onSelectSeerrStudio?.(raw.studioId, raw.studioName);
				break;
			case 'network':
				onSelectSeerrNetwork?.(raw.networkId, raw.networkName);
				break;
			default:
				onSelectSeerrItem?.(raw);
				break;
		}
	}, [onSelectSeerrItem, onSelectSeerrGenre, onSelectSeerrStudio, onSelectSeerrNetwork]);

	useEffect(() => {
		if (!seerrEnabled || !seerrAuthenticated || !settings.displaySeerrRows) {
			setSeerrRows([]);
			return;
		}
		const enabledIds = (settings.seerrHomeRows || []).filter((r) => r.enabled).map((r) => r.id);
		if (enabledIds.length === 0) {
			setSeerrRows([]);
			return;
		}

		let cancelled = false;
		const configs = getSeerrHomeRowConfigs();

		(async () => {
			const built = await Promise.all(enabledIds.map(async (id) => {
				const cfg = configs.find((c) => c.id === id);
				if (!cfg) return null;
				const items = await fetchSeerrHomeRow(id, {userId: seerrUserId});
				if (!items.length) return null;
				return {
					id: `seerr-${id}`,
					title: cfg.title,
					items,
					type: cfg.cardType,
					isSeerrRow: true,
					isTileRow: cfg.type === 'genre' || cfg.type === 'studio' || cfg.type === 'network'
				};
			}));
			if (!cancelled) setSeerrRows(built.filter(Boolean));
		})();

		return () => {
			cancelled = true;
		};
	}, [seerrEnabled, seerrAuthenticated, seerrUserId, settings.seerrHomeRows, settings.displaySeerrRows]);

	const handleNavigateDownFromFeatured = useCallback(() => {
		dispatch({type: 'SET_BROWSE_MODE', mode: 'rows'});
		setTimeout(() => {
			scrollToRow(0, true);
		}, TRANSITION_DELAY_MS);
	}, [scrollToRow]);

	const handleFeaturedFocusCallback = useCallback(() => {
		dispatch({type: 'SET_BROWSE_MODE', mode: 'featured'});
		detailSectionRef.current?.clearFocusedItem();
	}, []);

	const handleRowFocus = useCallback((rowIndex) => {
		if (browseMode !== 'rows') {
			dispatch({type: 'SET_BROWSE_MODE', mode: 'rows'});
		}
		if (typeof rowIndex === 'number') {
			lastFocusedRowRef.current = rowIndex;
		}
	}, [browseMode]);

	const handleFocusItem = useCallback((item) => {
		if (showTopInfoArea) {
			detailSectionRef.current?.handleFocusItem(item);
		}
		if (item?.Id && (item.Type === 'Movie' || item.Type === 'Series')) {
			onFocusItemThemeMusic?.(item.Id);
		} else {
			onBlurItemThemeMusic?.();
		}
	}, [onFocusItemThemeMusic, onBlurItemThemeMusic, showTopInfoArea]);

	if (isLoading) {
		return (
			<div className={css.page}>
				<div className={css.loadingContainer}>
					<LoadingSpinner />
					<p>{$L('Loading your library...')}</p>
				</div>
			</div>
		);
	}

	return (
		<div className={css.page}>
			<div className={`${css.mainContent} ${settings.navbarPosition === 'left' ? css.sidebarOffset : css.topbarOffset}`} ref={mainContentRef}>
				<BackdropLayer
					targetUrl={targetBackdropUrl}
					blurAmount={settings.backdropBlurHome}
				/>

				{featuredItems.length > 0 && showFeaturedBar !== false && (
					settings.featuredBarStyle === 'gallery' ? (
						<GalleryBanner
							isVisible={browseMode === 'featured'}
							featuredItems={featuredItems}
							api={api}
							settings={settings}
							getItemServerUrl={getItemServerUrl}
							onSelectItem={handleSelectItem}
							onNavigateDown={handleNavigateDownFromFeatured}
							onFeaturedFocus={handleFeaturedFocusCallback}
						/>
					) : settings.featuredBarStyle === 'banner' ? (
						<BannerBar
							isVisible={browseMode === 'featured'}
							featuredItems={featuredItems}
							settings={settings}
							getItemServerUrl={getItemServerUrl}
							onSelectItem={handleSelectItem}
							onNavigateDown={handleNavigateDownFromFeatured}
							onFeaturedFocus={handleFeaturedFocusCallback}
						/>
					) : settings.featuredBarStyle === 'bookshelf' ? (
						<BookshelfBar
							isVisible={browseMode === 'featured'}
							featuredItems={featuredItems}
							settings={settings}
							getItemServerUrl={getItemServerUrl}
							onSelectItem={handleSelectItem}
							onNavigateDown={handleNavigateDownFromFeatured}
							onFeaturedFocus={handleFeaturedFocusCallback}
						/>
					) : settings.featuredBarStyle === 'makd' ? (
						<MakdBanner
							isVisible={browseMode === 'featured'}
							featuredItems={featuredItems}
							serverUrl={serverUrl}
							settings={settings}
							getItemServerUrl={getItemServerUrl}
							onSelectItem={handleSelectItem}
							onNavigateDown={handleNavigateDownFromFeatured}
							onFeaturedFocus={handleFeaturedFocusCallback}
						/>
					) : (
						<FeaturedBanner
							isVisible={browseMode === 'featured'}
							featuredItems={featuredItems}
							serverUrl={serverUrl}
							api={api}
							settings={settings}
							getItemServerUrl={getItemServerUrl}
							onSelectItem={handleSelectItem}
							onNavigateDown={handleNavigateDownFromFeatured}
							onFeaturedFocus={handleFeaturedFocusCallback}
							uiPanelStyle={uiPanelStyle}
							uiButtonStyle={uiButtonStyle}
						/>
					)
				)}

				{showTopInfoArea && (
					<DetailSection
						ref={detailSectionRef}
						browseMode={browseMode}
						api={api}
						getItemServerUrl={getItemServerUrl}
						settings={settings}
						onFocusedItemChange={setFocusedItemForBackdrop}
					/>
				)}

				<div
					ref={contentRowsRef}
					className={`${css.contentRows} ${browseMode === 'rows' ? css.rowsMode : ''}`}
				>
					{filteredRows.map((row, index) => {
						if (row.isTileRow) {
							return (
								<SeerrTileRow
									key={row.id}
									rowId={row.id}
									title={row.title}
									items={row.items}
									cardType={row.type}
									onSelectItem={handleSelectSeerrItem}
									onFocus={handleRowFocus}
									onFocusItem={handleFocusItem}
									rowIndex={index}
									onNavigateUp={handleNavigateUp}
									onNavigateDown={handleNavigateDown}
									registerRowRef={registerRowRef}
								/>
							);
						}
						let selectHandler = handleSelectItem;
						if (row.isSeerrRow) selectHandler = handleSelectSeerrItem;
						else if (row.isGenreRow) selectHandler = handleSelectGenreItem;
						return (
							<RowComponent
								key={row.id}
								rowId={row.id}
								title={row.title}
								items={row.items}
								serverUrl={serverUrl}
								cardType={row.type}
								onSelectItem={selectHandler}
								onFocus={handleRowFocus}
								onFocusItem={handleFocusItem}
								rowIndex={index}
								onNavigateUp={handleNavigateUp}
								onNavigateDown={handleNavigateDown}
								showServerBadge={unifiedMode}
								showOverview={settings.homeRowOverlay === 'on'}
								registerRowRef={registerRowRef}
							/>
						);
					})}
					{filteredRows.length === 0 && (
						<div className={css.empty}>{$L('No content found')}</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default Browse;
