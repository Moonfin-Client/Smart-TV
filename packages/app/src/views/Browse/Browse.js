import {useState, useEffect, useCallback, useRef, useMemo, useReducer} from 'react';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';
import {useAuth} from '../../context/AuthContext';
import {useSettings} from '../../context/SettingsContext';
import MediaRow from '../../components/MediaRow';
import LoadingSpinner from '../../components/LoadingSpinner';
import {getImageUrl, getBackdropId, getLogoUrl} from '../../utils/helpers';
import {getFromStorage, saveToStorage} from '../../services/storage';
import * as connectionPool from '../../services/connectionPool';
import DetailSection from './DetailSection';
import FeaturedBanner from './FeaturedBanner';
import BackdropLayer from './BackdropLayer';

import css from './Browse.module.less';

const FOCUS_DELAY_MS = 100;
const TRANSITION_DELAY_MS = 450;

// Cache TTL in milliseconds (5 minutes for volatile data, 30 minutes for libraries)
const CACHE_TTL_VOLATILE = 5 * 60 * 1000;
const CACHE_TTL_LIBRARIES = 30 * 60 * 1000;
const STORAGE_KEY_BROWSE = 'browse_cache';

let cachedRowData = null;
let cachedLibraries = null;
let cachedFeaturedItems = null;
let cacheTimestamp = null;

let lastFocusState = null;

const EXCLUDED_COLLECTION_TYPES = ['livetv', 'boxsets', 'books', 'musicvideos', 'homevideos', 'photos'];

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
			const filtered = state.allRowData.filter(r => r.id !== 'resume' && r.id !== 'nextup');
			return { ...state, allRowData: [...action.volatileRows, ...filtered] };
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
	_serverName: item._serverName,
	isLibraryTile: item.isLibraryTile,
});

const Browse = ({
	onSelectItem,
	onSelectLibrary,
	isVisible = true,
	onFocusItemThemeMusic,
	onBlurItemThemeMusic,
	onLeaveThemeMusic
}) => {
	const {api, serverUrl, accessToken, hasMultipleServers, user} = useAuth();
	const {settings} = useSettings();
	const unifiedMode = settings.unifiedLibraryMode && hasMultipleServers;
	const isLegacy = typeof document !== 'undefined' && (' ' + document.documentElement.className + ' ').indexOf(' legacy ') >= 0;
	const [state, dispatch] = useReducer(browseReducer, browseInitialState);
	const {isLoading, browseMode, allRowData, featuredItems} = state;
	const [focusedItemForBackdrop, setFocusedItemForBackdrop] = useState(null);
	const [currentFeaturedItem, setCurrentFeaturedItem] = useState(null);
	const mainContentRef = useRef(null);
	const detailSectionRef = useRef(null);
	const lastFocusedRowRef = useRef(null);
	const wasVisibleRef = useRef(true);
	const prevFilteredRowsRef = useRef([]);
	const filteredRowsLengthRef = useRef(0);
	const rowRefsMap = useRef(new Map());
	const initialFocusSetRef = useRef(false);
	const scrollTimeoutRef = useRef(null);
	const contentRowsRef = useRef(null);

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

			if (items.length > 0) {
				const filteredItems = items.filter(item => item.Type !== 'BoxSet');
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
	}, [api, unifiedMode, getItemServerUrl]);

	const getUiColorRgb = useCallback((colorKey) => {
		const colorMap = {
			dark: '40, 40, 40',
			black: '0, 0, 0',
			charcoal: '54, 54, 54',
			slate: '47, 54, 64',
			navy: '20, 30, 48',
			midnight: '25, 25, 65',
			ocean: '20, 50, 70',
			teal: '0, 60, 60',
			forest: '25, 50, 35',
			olive: '50, 50, 25',
			purple: '48, 25, 52',
			plum: '60, 30, 60',
			wine: '60, 20, 30',
			maroon: '50, 20, 20',
			brown: '50, 35, 25'
		};
		return colorMap[colorKey] || '0, 0, 0';
	}, []);

	const uiPanelStyle = useMemo(() => {
		const rgb = getUiColorRgb(settings.uiColor);
		const opacity = (settings.uiOpacity || 85) / 100 * 0.6;
		const useBlur = !isLegacy && settings.uiBlur > 0;
		return {
			background: `rgba(${rgb}, ${isLegacy ? Math.min(opacity + 0.2, 0.95) : opacity})`,
			backdropFilter: useBlur ? `blur(${settings.uiBlur / 2}px)` : 'none',
			WebkitBackdropFilter: useBlur ? `blur(${settings.uiBlur / 2}px)` : 'none'
		};
	}, [settings.uiBlur, settings.uiOpacity, settings.uiColor, getUiColorRgb, isLegacy]);

	const uiButtonStyle = useMemo(() => {
		const rgb = getUiColorRgb(settings.uiColor);
		const opacity = (settings.uiOpacity || 85) / 100 * 0.7;
		const useBlur = !isLegacy && settings.uiBlur > 0;
		return {
			background: `rgba(${rgb}, ${isLegacy ? Math.min(opacity + 0.2, 0.95) : opacity})`,
			backdropFilter: useBlur ? `blur(${settings.uiBlur / 2}px)` : 'none',
			WebkitBackdropFilter: useBlur ? `blur(${settings.uiBlur / 2}px)` : 'none'
		};
	}, [settings.uiBlur, settings.uiOpacity, settings.uiColor, getUiColorRgb, isLegacy]);

	const homeRowsConfig = useMemo(() => {
		return [...(settings.homeRows || [])].sort((a, b) => a.order - b.order);
	}, [settings.homeRows]);

	const filteredRows = useMemo(() => {
		const enabledRowIds = homeRowsConfig.filter(r => r.enabled).map(r => r.id);

		let result;

		if (settings.mergeContinueWatchingNextUp) {
			const mergeResumeRow = allRowData.find(r => r.id === 'resume');
			const nextUpRow = allRowData.find(r => r.id === 'nextup');

			result = allRowData.filter(r => r.id !== 'resume' && r.id !== 'nextup');

			if (mergeResumeRow || nextUpRow) {
				const resumeItems = mergeResumeRow?.items || [];
				const nextUpItems = nextUpRow?.items || [];

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

			result = result.filter(row =>
				row.id === 'continue-nextup' ||
				enabledRowIds.includes(row.id) ||
				(row.isLatestRow && enabledRowIds.includes('latest-media'))
			);
		} else {
			const resumeRow = allRowData.find(r => r.id === 'resume');
			const resumeItemIds = new Set((resumeRow?.items || []).map(item => item.Id));

			result = allRowData
				.map(row => {
					if (row.id === 'nextup' && resumeItemIds.size > 0) {
						const filteredItems = row.items.filter(item => !resumeItemIds.has(item.Id));
						return filteredItems.length > 0 ? {...row, items: filteredItems} : null;
					}
					return row;
				})
				.filter(row => {
					if (!row) return false;
					if (row.id === 'resume' || row.id === 'nextup') {
						return enabledRowIds.includes(row.id);
					}
					if (row.isLatestRow) {
						return enabledRowIds.includes('latest-media');
					}
					return enabledRowIds.includes(row.id);
				});
		}

		// Re-translate titles so cached rows pick up the current locale
		result = result.map(row => {
			let title;
			if (row.id === 'resume' || row.id === 'continue-nextup') title = $L('Continue Watching');
			else if (row.id === 'nextup') title = $L('Next Up');
			else if (row.id === 'library-tiles') title = $L('My Media');
			else if (row.id === 'collections') title = $L('Collections');
			else if (row.isLatestRow && row.library) {
				const libName = row.library._serverName
					? `${row.library.Name} (${row.library._serverName})`
					: row.library.Name;
				title = $L('Latest in {libraryTitle}').replace('{libraryTitle}', libName);
			}
			return title && title !== row.title ? {...row, title} : row;
		});

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
	}, [allRowData, homeRowsConfig, settings.mergeContinueWatchingNextUp]);

	const scrollToRow = useCallback((rowIndex, thenFocus) => {
		if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);

		const targetRow = rowRefsMap.current.get(rowIndex);
		const container = contentRowsRef.current;
		if (!targetRow || !container) {
			if (thenFocus) Spotlight.focus('row-' + rowIndex);
			return;
		}

		container.scrollTop = targetRow.offsetTop;

		// Focus after scroll so the browser's focus-scroll is a no-op
		if (thenFocus) {
			scrollTimeoutRef.current = setTimeout(function () {
				Spotlight.focus('row-' + rowIndex);
			}, 0);
		}
	}, []);

	const handleNavigateUp = useCallback((fromRowIndex) => {
		if (fromRowIndex === 0) {
			if (settings.showFeaturedBar !== false) {
				dispatch({type: 'SET_BROWSE_MODE', mode: 'featured'});
				setTimeout(() => Spotlight.focus('featured-banner'), 50);
			} else if (settings.navbarPosition !== 'left') {
				Spotlight.focus('navbar-home');
			}
			return;
		}
		const targetIndex = fromRowIndex - 1;
		scrollToRow(targetIndex, true);
	}, [settings.showFeaturedBar, settings.navbarPosition, scrollToRow]);

	filteredRowsLengthRef.current = filteredRows.length;

	const handleNavigateDown = useCallback((fromRowIndex) => {
		const targetIndex = fromRowIndex + 1;
		if (targetIndex >= filteredRowsLengthRef.current) return;
		scrollToRow(targetIndex, true);
	}, [scrollToRow]);

	useEffect(() => {
		if (settings.showFeaturedBar === false) {
			dispatch({type: 'SET_BROWSE_MODE', mode: 'rows'});
		}
	}, [settings.showFeaturedBar]);

	useEffect(() => {
		if (isVisible && !wasVisibleRef.current && !isLoading && filteredRows.length > 0) {
			fetchFreshFeaturedItems();

			setTimeout(() => {
				if (lastFocusState && lastFocusState.rowIndex > 0) {
					const {rowIndex} = lastFocusState;
					const targetRowIndex = Math.min(rowIndex, filteredRows.length - 1);
					scrollToRow(targetRowIndex, true);
				} else if (settings.showFeaturedBar !== false && featuredItems.length > 0) {
					dispatch({type: 'SET_BROWSE_MODE', mode: 'featured'});
					setTimeout(() => Spotlight.focus('featured-banner'), 50);
				} else {
					scrollToRow(0, true);
				}
				lastFocusState = null;
			}, FOCUS_DELAY_MS);
		}
		wasVisibleRef.current = isVisible;
	}, [isVisible, isLoading, filteredRows.length, fetchFreshFeaturedItems, settings.showFeaturedBar, featuredItems.length, scrollToRow]);

	useEffect(() => {
		if (!isLoading && !initialFocusSetRef.current) {
			setTimeout(() => {
				if (lastFocusState || initialFocusSetRef.current) {
					return;
				}
				if (settings.showFeaturedBar !== false && featuredItems.length > 0) {
					Spotlight.focus('featured-banner');
					initialFocusSetRef.current = true;
				} else if (filteredRows.length > 0) {
					Spotlight.focus('row-0');
					initialFocusSetRef.current = true;
				}
			}, FOCUS_DELAY_MS);
		}
	}, [isLoading, featuredItems.length, filteredRows.length, settings.showFeaturedBar]);

	useEffect(() => {
		cachedRowData = null;
		cachedLibraries = null;
		cachedFeaturedItems = null;
		cacheTimestamp = null;
		initialFocusSetRef.current = false;
	}, [accessToken]);

	useEffect(() => {
		const handleBrowseRefresh = () => {
			console.log('[Browse] Received refresh event - clearing caches');
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

	const saveBrowseCache = useCallback(async (rowData, libs, featured) => {
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
		} catch (e) {
			console.warn('[Browse] Failed to save cache:', e);
		}
	}, [serverUrl, user?.Id]);

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
			// In unified mode, skip cache and always fetch fresh from all servers
			if (unifiedMode) {
				dispatch({type: 'SET_LOADING', value: true});
				await fetchAllData(); // eslint-disable-line no-use-before-define
				return;
			}

			if (cachedRowData && cachedLibraries && cachedFeaturedItems && isCacheValid(cacheTimestamp, CACHE_TTL_VOLATILE)) {
				console.log('[Browse] Using in-memory cache');
				dispatch({type: 'SET_ROW_DATA', rowData: cachedRowData});
				await fetchFreshFeaturedItems(cachedFeaturedItems);
				dispatch({type: 'SET_LOADING', value: false});
				return;
			}

			const persistedCache = await loadBrowseCache();
			const hasValidPersistedCache = persistedCache && isCacheValid(persistedCache.timestamp, CACHE_TTL_LIBRARIES);

			if (hasValidPersistedCache) {
				console.log('[Browse] Using persisted cache, will refresh in background');
				dispatch({type: 'SET_ROW_DATA', rowData: persistedCache.rowData});
				await fetchFreshFeaturedItems(persistedCache.featuredItems);
				cachedLibraries = persistedCache.libraries;
				cachedRowData = persistedCache.rowData;
				cacheTimestamp = persistedCache.timestamp;
				dispatch({type: 'SET_LOADING', value: false});

				// If volatile data is stale, refresh in background
				if (!isCacheValid(persistedCache.timestamp, CACHE_TTL_VOLATILE)) {
					console.log('[Browse] Volatile cache stale, refreshing in background');
					refreshVolatileData(); // eslint-disable-line no-use-before-define
				}
				return;
			}

				dispatch({type: 'SET_LOADING', value: true});
			await fetchAllData(); // eslint-disable-line no-use-before-define
		};

		const refreshVolatileData = async () => {
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
						saveBrowseCache(cachedRowData, cachedLibraries, cachedFeaturedItems);
					}
				}
			} catch (e) {
				console.warn('[Browse] Background refresh failed:', e);
			}
		};

		const fetchAllData = async () => {
			try {
				let libs, resumeItems, nextUp, userConfig, randomItems;

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
				} else {
					const results = await Promise.all([
						api.getLibraries(),
						api.getResumeItems(),
						api.getNextUp(),
						api.getUserConfiguration().catch(() => null),
						api.getRandomItems(settings.featuredContentType, settings.featuredItemCount)
					]);
					libs = results[0].Items || [];
					resumeItems = results[1];
					nextUp = results[2];
					userConfig = results[3];
					randomItems = results[4];
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

				dispatch({type: 'SET_INITIAL_DATA', rowData, featuredItems: cachedFeaturedItems});

				const eligibleLibraries = libs.filter(lib => {
					if (EXCLUDED_COLLECTION_TYPES.includes(lib.CollectionType?.toLowerCase())) {
						return false;
					}
					if (latestItemsExcludes.includes(lib.Id)) {
						return false;
					}
					return true;
				});

				let latestResults, collectionsResult;

				if (unifiedMode) {
					latestResults = await connectionPool.getLatestPerLibraryFromAllServers(
						latestItemsExcludes,
						EXCLUDED_COLLECTION_TYPES
					);
					collectionsResult = null;
				} else {
					[latestResults, collectionsResult] = await Promise.all([
						Promise.all(
							eligibleLibraries.map(lib =>
								api.getLatest(lib.Id, 16)
									.then(latest => ({lib, latest}))
									.catch(() => null)
							)
						),
						api.getCollections(20).catch(() => null)
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
							title: $L('Latest in {libraryTitle}').replace('{libraryTitle}', libraryTitle),
							items: result.latest,
							library: result.lib,
							type: result.lib.CollectionType?.toLowerCase() === 'music' ? 'square' : 'portrait',
							isLatestRow: true
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
	}, [api, serverUrl, accessToken, settings.featuredContentType, settings.featuredItemCount, isCacheValid, loadBrowseCache, saveBrowseCache, fetchFreshFeaturedItems, unifiedMode, getItemServerUrl]);

	const targetBackdropUrl = useMemo(() => {
		let itemForBackdrop = null;

		if (browseMode === 'featured') {
			itemForBackdrop = currentFeaturedItem;
		} else if (focusedItemForBackdrop && !isLegacy && settings.showHomeBackdrop !== false) {
			itemForBackdrop = focusedItemForBackdrop;
		}

		if (!itemForBackdrop) return '';
		const backdropId = getBackdropId(itemForBackdrop);
		if (!backdropId) return '';
		const itemUrl = getItemServerUrl(itemForBackdrop);
		return getImageUrl(itemUrl, backdropId, 'Backdrop', {maxWidth: 1280, quality: 80});
	}, [browseMode, currentFeaturedItem, focusedItemForBackdrop, isLegacy, settings.showHomeBackdrop, getItemServerUrl]);

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
		detailSectionRef.current?.handleFocusItem(item);
		if (item?.Id && (item.Type === 'Movie' || item.Type === 'Series')) {
			onFocusItemThemeMusic?.(item.Id);
		} else {
			onBlurItemThemeMusic?.();
		}
	}, [onFocusItemThemeMusic, onBlurItemThemeMusic]);

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
			<div className={`${css.mainContent} ${settings.navbarPosition === 'left' ? css.sidebarOffset : ''}`} ref={mainContentRef}>
				<BackdropLayer
					targetUrl={targetBackdropUrl}
					blurAmount={settings.backdropBlurHome}
				/>

				{featuredItems.length > 0 && settings.showFeaturedBar !== false && (
					<FeaturedBanner
						isVisible={browseMode === 'featured'}
						featuredItems={featuredItems}
						serverUrl={serverUrl}
						settings={settings}
						getItemServerUrl={getItemServerUrl}
						onSelectItem={handleSelectItem}
						onNavigateDown={handleNavigateDownFromFeatured}
						onFeaturedFocus={handleFeaturedFocusCallback}
						uiPanelStyle={uiPanelStyle}
						uiButtonStyle={uiButtonStyle}
						onCurrentItemChange={setCurrentFeaturedItem}
					/>
				)}

				<DetailSection
					ref={detailSectionRef}
					browseMode={browseMode}
					api={api}
					getItemServerUrl={getItemServerUrl}
					settings={settings}
					onFocusedItemChange={setFocusedItemForBackdrop}
				/>

				<div
					ref={contentRowsRef}
					className={`${css.contentRows} ${browseMode === 'rows' ? css.rowsMode : ''}`}
				>
					{filteredRows.map((row, index) => (
						<MediaRow
							key={row.id}
							rowId={row.id}
							title={row.title}
							items={row.items}
							serverUrl={serverUrl}
							cardType={row.type}
							onSelectItem={handleSelectItem}
							onFocus={handleRowFocus}
							onFocusItem={handleFocusItem}
							rowIndex={index}
							onNavigateUp={handleNavigateUp}
							onNavigateDown={handleNavigateDown}
							showServerBadge={unifiedMode}
							registerRowRef={registerRowRef}
						/>
					))}
					{filteredRows.length === 0 && (
						<div className={css.empty}>{$L('No content found')}</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default Browse;
