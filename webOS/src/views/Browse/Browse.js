import {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import Spotlight from '@enact/spotlight';
import {useAuth} from '../../context/AuthContext';
import {useSettings} from '../../context/SettingsContext';
import MediaRow from '../../components/MediaRow';
import LoadingSpinner from '../../components/LoadingSpinner';
import {getImageUrl, getBackdropId, getLogoUrl} from '../../utils/helpers';
import {getFromStorage, saveToStorage} from '../../services/storage';
import * as connectionPool from '../../services/connectionPool';

import css from './Browse.module.less';

const FOCUS_DELAY_MS = 100;
const BACKDROP_DEBOUNCE_MS = 500;
const FOCUS_ITEM_DEBOUNCE_MS = 150;
const FEATURED_GENRES_LIMIT = 3;
const DETAIL_GENRES_LIMIT = 2;
const TRANSITION_DELAY_MS = 450;
const PRELOAD_ADJACENT_SLIDES = 2;

// Cache TTL in milliseconds (5 minutes for volatile data, 30 minutes for libraries)
const CACHE_TTL_VOLATILE = 5 * 60 * 1000;
const CACHE_TTL_LIBRARIES = 30 * 60 * 1000;
const STORAGE_KEY_BROWSE = 'browse_cache';

// In-memory cache for instant access
let cachedRowData = null;
let cachedLibraries = null;
let cachedFeaturedItems = null;
let cacheTimestamp = null;

let lastFocusState = null;

const EXCLUDED_COLLECTION_TYPES = ['playlists', 'livetv', 'boxsets', 'books', 'musicvideos', 'homevideos', 'photos'];

const SpottableDiv = Spottable('div');
const SpottableButton = Spottable('button');

const Browse = ({
	onSelectItem,
	onSelectLibrary,
	isVisible = true
}) => {
	const {api, serverUrl, accessToken, hasMultipleServers} = useAuth();
	const {settings} = useSettings();
	const unifiedMode = settings.unifiedLibraryMode && hasMultipleServers;
	const [isLoading, setIsLoading] = useState(true);
	const [featuredItems, setFeaturedItems] = useState([]);
	const [currentFeaturedIndex, setCurrentFeaturedIndex] = useState(0);
	const [backdropUrl, setBackdropUrl] = useState('');
	const [backdropOpacity, setBackdropOpacity] = useState(1);
	const [prevBackdropUrl, setPrevBackdropUrl] = useState(null);
	const [prevBackdropOpacity, setPrevBackdropOpacity] = useState(0);
	const [browseMode, setBrowseMode] = useState('featured');
	const [featuredFocused, setFeaturedFocused] = useState(false);
	const [focusedItem, setFocusedItem] = useState(null);
	const [allRowData, setAllRowData] = useState([]);
	const mainContentRef = useRef(null);
	const backdropTimeoutRef = useRef(null);
	const backdropFadeIntervalRef = useRef(null);
	const pendingBackdropRef = useRef(null);
	const preloadedImagesRef = useRef(new Set());
	const focusItemTimeoutRef = useRef(null);
	const lastFocusedRowRef = useRef(null);
	const wasVisibleRef = useRef(true);

	// Helper to get the correct server URL for an item (supports cross-server items)
	const getItemServerUrl = useCallback((item) => {
		return item?._serverUrl || serverUrl;
	}, [serverUrl]);

	const fetchFreshFeaturedItems = useCallback(async (fallbackItems = null) => {
		try {
			let items = [];
			if (unifiedMode) {
				// Fetch from all servers
				items = await connectionPool.getRandomItemsFromAllServers(settings.featuredContentType, settings.featuredItemCount);
			} else {
				const randomItems = await api.getRandomItems(settings.featuredContentType, settings.featuredItemCount);
				items = randomItems?.Items || [];
			}

			if (items.length > 0) {
				const filteredItems = items.filter(item => item.Type !== 'BoxSet');
				const featuredWithLogos = filteredItems.map(item => ({
					...item,
					LogoUrl: getLogoUrl(getItemServerUrl(item), item, {maxWidth: 800, quality: 90})
				}));
				setFeaturedItems(featuredWithLogos);
				setCurrentFeaturedIndex(0);
				cachedFeaturedItems = featuredWithLogos;
				return featuredWithLogos;
			} else if (fallbackItems) {
				setFeaturedItems(fallbackItems);
				cachedFeaturedItems = fallbackItems;
				return fallbackItems;
			}
		} catch (e) {
			console.warn('[Browse] Failed to fetch fresh featured items:', e);
			if (fallbackItems) {
				setFeaturedItems(fallbackItems);
				cachedFeaturedItems = fallbackItems;
				return fallbackItems;
			}
		}
		return null;
	}, [api, settings.featuredContentType, settings.featuredItemCount, unifiedMode, getItemServerUrl]);

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
		return {
			background: `rgba(${rgb}, ${(settings.uiOpacity || 85) / 100 * 0.6})`,
			backdropFilter: settings.uiBlur > 0 ? `blur(${settings.uiBlur / 2}px)` : 'none',
			WebkitBackdropFilter: settings.uiBlur > 0 ? `blur(${settings.uiBlur / 2}px)` : 'none'
		};
	}, [settings.uiBlur, settings.uiOpacity, settings.uiColor, getUiColorRgb]);

	const uiButtonStyle = useMemo(() => {
		const rgb = getUiColorRgb(settings.uiColor);
		return {
			background: `rgba(${rgb}, ${(settings.uiOpacity || 85) / 100 * 0.7})`,
			backdropFilter: settings.uiBlur > 0 ? `blur(${settings.uiBlur / 2}px)` : 'none',
			WebkitBackdropFilter: settings.uiBlur > 0 ? `blur(${settings.uiBlur / 2}px)` : 'none'
		};
	}, [settings.uiBlur, settings.uiOpacity, settings.uiColor, getUiColorRgb]);

	const homeRowsConfig = useMemo(() => {
		return [...(settings.homeRows || [])].sort((a, b) => a.order - b.order);
	}, [settings.homeRows]);

	const filteredRows = useMemo(() => {
		const enabledRowIds = homeRowsConfig.filter(r => r.enabled).map(r => r.id);

		if (settings.mergeContinueWatchingNextUp) {
			const mergeResumeRow = allRowData.find(r => r.id === 'resume');
			const nextUpRow = allRowData.find(r => r.id === 'nextup');

			let result = allRowData.filter(r => r.id !== 'resume' && r.id !== 'nextup');

			if (mergeResumeRow || nextUpRow) {
				const resumeItems = mergeResumeRow?.items || [];
				const nextUpItems = nextUpRow?.items || [];

				// Track series lastPlayedDate from resume items
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

				// Create set of resume item IDs to avoid duplicates
				const mergeResumeItemIds = new Set(resumeItems.map(item => item.Id));

				// Filter next up items that aren't already in resume and inherit lastPlayedDate
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

				// Combine and sort by lastPlayedDate (most recent first)
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
							title: 'Continue Watching',
							items: combinedItems,
							type: 'landscape'
						}, ...result];
					}
				}
			}

			return result.filter(row =>
				row.id === 'continue-nextup' ||
				enabledRowIds.includes(row.id) ||
				(row.isLatestRow && enabledRowIds.includes('latest-media'))
			);
		}

		// Filter out Next Up items that are in Continue Watching
		const resumeRow = allRowData.find(r => r.id === 'resume');
		const resumeItemIds = new Set((resumeRow?.items || []).map(item => item.Id));

		return allRowData
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
	}, [allRowData, homeRowsConfig, settings.mergeContinueWatchingNextUp]);

	const handleNavigateUp = useCallback((fromRowIndex) => {
		if (fromRowIndex === 0) {
			if (settings.showFeaturedBar !== false) {
				Spotlight.focus('featured-banner');
			} else {
				Spotlight.focus('navbar-home');
			}
			return;
		}
		const targetIndex = fromRowIndex - 1;
		Spotlight.focus(`row-${targetIndex}`);
		const targetRow = document.querySelector(`[data-row-index="${targetIndex}"]`);
		if (targetRow) {
			targetRow.scrollIntoView({block: 'start'});
		}
	}, [settings.showFeaturedBar]);

	const handleNavigateDown = useCallback((fromRowIndex) => {
		const targetIndex = fromRowIndex + 1;
		if (targetIndex >= filteredRows.length) return;
		Spotlight.focus(`row-${targetIndex}`);
		const targetRow = document.querySelector(`[data-row-index="${targetIndex}"]`);
		if (targetRow) {
			targetRow.scrollIntoView({block: 'center'});
		}
	}, [filteredRows.length]);

	useEffect(() => {
		if (settings.showFeaturedBar === false) {
			setBrowseMode('rows');
		}
	}, [settings.showFeaturedBar]);

	useEffect(() => {
		return () => {
			if (focusItemTimeoutRef.current) {
				clearTimeout(focusItemTimeoutRef.current);
			}
		};
	}, []);

	useEffect(() => {
		if (isVisible && !wasVisibleRef.current && !isLoading && filteredRows.length > 0) {
			fetchFreshFeaturedItems();

			setTimeout(() => {
				if (lastFocusState) {
					const {rowIndex} = lastFocusState;
					const targetRowIndex = Math.min(rowIndex, filteredRows.length - 1);
					Spotlight.focus(`row-${targetRowIndex}`);

					const targetRow = document.querySelector(`[data-row-index="${targetRowIndex}"]`);
					if (targetRow) {
						targetRow.scrollIntoView({block: 'center'});
					}
					lastFocusState = null;
				}
			}, FOCUS_DELAY_MS);
		}
		wasVisibleRef.current = isVisible;
	}, [isVisible, isLoading, filteredRows.length, fetchFreshFeaturedItems]);

	useEffect(() => {
		if (!isLoading) {
			setTimeout(() => {
				if (lastFocusState) {
					return;
				}
				if (settings.showFeaturedBar !== false && featuredItems.length > 0) {
					Spotlight.focus('featured-banner');
				} else if (filteredRows.length > 0) {
					Spotlight.focus('row-0');
				}
			}, FOCUS_DELAY_MS);
		}
	}, [isLoading, featuredItems.length, filteredRows.length, settings.showFeaturedBar]);

	useEffect(() => {
		cachedRowData = null;
		cachedLibraries = null;
		cachedFeaturedItems = null;
		cacheTimestamp = null;
	}, [accessToken]);

	// Listen for browse refresh events to clear caches and reload data
	// This helps reduce memory pressure when navigating back to Browse
	useEffect(() => {
		const handleBrowseRefresh = () => {
			console.log('[Browse] Received refresh event - clearing caches');
			cachedRowData = null;
			cachedLibraries = null;
			cachedFeaturedItems = null;
			cacheTimestamp = null;
			preloadedImagesRef.current.clear();
		};

		window.addEventListener('moonfin:browseRefresh', handleBrowseRefresh);
		return () => {
			window.removeEventListener('moonfin:browseRefresh', handleBrowseRefresh);
		};
	}, []);

	// Helper to check if cache is still valid
	const isCacheValid = useCallback((timestamp, ttl) => {
		if (!timestamp) return false;
		return Date.now() - timestamp < ttl;
	}, []);

	// Save browse data to persistent storage
	const saveBrowseCache = useCallback(async (rowData, libs, featured) => {
		try {
			const cacheData = {
				rowData,
				libraries: libs,
				featuredItems: featured,
				timestamp: Date.now(),
				serverUrl
			};
			await saveToStorage(STORAGE_KEY_BROWSE, cacheData);
		} catch (e) {
			console.warn('[Browse] Failed to save cache:', e);
		}
	}, [serverUrl]);

	// Load browse data from persistent storage
	const loadBrowseCache = useCallback(async () => {
		try {
			const cached = await getFromStorage(STORAGE_KEY_BROWSE);
			if (cached && cached.serverUrl === serverUrl) {
				return cached;
			}
		} catch (e) {
			console.warn('[Browse] Failed to load cache:', e);
		}
		return null;
	}, [serverUrl]);

	useEffect(() => {
		const loadData = async () => {
			// In unified mode, skip cache and always fetch fresh from all servers
			if (unifiedMode) {
				setIsLoading(true);
				await fetchAllData(); // eslint-disable-line no-use-before-define
				return;
			}

			if (cachedRowData && cachedLibraries && cachedFeaturedItems && isCacheValid(cacheTimestamp, CACHE_TTL_VOLATILE)) {
				console.log('[Browse] Using in-memory cache');
				setAllRowData(cachedRowData);
				await fetchFreshFeaturedItems(cachedFeaturedItems);
				setIsLoading(false);
				return;
			}

			const persistedCache = await loadBrowseCache();
			const hasValidPersistedCache = persistedCache && isCacheValid(persistedCache.timestamp, CACHE_TTL_LIBRARIES);

			// If we have valid persisted cache, show it immediately
			if (hasValidPersistedCache) {
				console.log('[Browse] Using persisted cache, will refresh in background');
				setAllRowData(persistedCache.rowData);
				await fetchFreshFeaturedItems(persistedCache.featuredItems);
				cachedLibraries = persistedCache.libraries;
				cachedRowData = persistedCache.rowData;
				cacheTimestamp = persistedCache.timestamp;
				setIsLoading(false);

				// If volatile data is stale, refresh in background
				if (!isCacheValid(persistedCache.timestamp, CACHE_TTL_VOLATILE)) {
					console.log('[Browse] Volatile cache stale, refreshing in background');
					refreshVolatileData(); // eslint-disable-line no-use-before-define
				}
				return;
			}

			// No valid cache - show loading and fetch everything
			setIsLoading(true);
			await fetchAllData(); // eslint-disable-line no-use-before-define
		};

		// Fetch volatile data (resume, next up) in background without showing loading
		const refreshVolatileData = async () => {
			try {
				let resumeItems, nextUp;

				if (unifiedMode) {
					// Fetch from all servers
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

				// Update just the volatile rows while preserving the rest
				setAllRowData(prev => {
					const filtered = prev.filter(r => r.id !== 'resume' && r.id !== 'nextup');
					const newRows = [];

					if (resumeItems.Items?.length > 0) {
						newRows.push({
							id: 'resume',
							title: 'Continue Watching',
							items: resumeItems.Items,
							type: 'landscape'
						});
					}

					if (nextUp.Items?.length > 0) {
						newRows.push({
							id: 'nextup',
							title: 'Next Up',
							items: nextUp.Items,
							type: 'landscape'
						});
					}

					const updated = [...newRows, ...filtered];
					cachedRowData = updated;
					cacheTimestamp = Date.now();
					if (!unifiedMode) {
						saveBrowseCache(updated, cachedLibraries, cachedFeaturedItems);
					}
					return updated;
				});
			} catch (e) {
				console.warn('[Browse] Background refresh failed:', e);
			}
		};

		// Full data fetch
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
					// Fetch from single server
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
						title: 'Continue Watching',
						items: resumeItems.Items,
						type: 'landscape'
					});
				}

				if (nextUp.Items?.length > 0) {
					rowData.push({
						id: 'nextup',
						title: 'Next Up',
						items: nextUp.Items,
						type: 'landscape'
					});
				}

				if (libs.length > 0) {
					const visibleLibs = libs.filter(lib => !EXCLUDED_COLLECTION_TYPES.includes(lib.CollectionType?.toLowerCase()));
					if (visibleLibs.length > 0) {
						rowData.push({
							id: 'library-tiles',
							title: 'My Media',
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
					setFeaturedItems(featuredWithLogos);
					cachedFeaturedItems = featuredWithLogos;
				}

				setAllRowData(rowData);
				setIsLoading(false);

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
					// In unified mode, fetch latest per library from all servers
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

				const completeRowData = [];

				if (resumeItems.Items?.length > 0) {
					completeRowData.push({
						id: 'resume',
						title: 'Continue Watching',
						items: resumeItems.Items,
						type: 'landscape'
					});
				}

				if (nextUp.Items?.length > 0) {
					completeRowData.push({
						id: 'nextup',
						title: 'Next Up',
						items: nextUp.Items,
						type: 'landscape'
					});
				}

				for (const result of latestResults) {
					if (result && result.latest?.length > 0) {
						// In unified mode, append server name to library title
						const libraryTitle = unifiedMode && result.lib._serverName
							? `${result.lib.Name} (${result.lib._serverName})`
							: result.lib.Name;
						completeRowData.push({
							id: `latest-${result.lib.Id}${result.lib._serverName ? '-' + result.lib._serverName : ''}`,
							title: `Latest in ${libraryTitle}`,
							items: result.latest,
							library: result.lib,
							type: result.lib.CollectionType?.toLowerCase() === 'music' ? 'square' : 'portrait',
							isLatestRow: true
						});
					}
				}

				if (collectionsResult?.Items?.length > 0) {
					completeRowData.push({
						id: 'collections',
						title: 'Collections',
						items: collectionsResult.Items,
						type: 'portrait'
					});
				}

				if (libs.length > 0) {
					const visibleLibs = libs.filter(lib => !EXCLUDED_COLLECTION_TYPES.includes(lib.CollectionType?.toLowerCase()));
					if (visibleLibs.length > 0) {
						completeRowData.push({
							id: 'library-tiles',
							title: 'My Media',
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

				setAllRowData(completeRowData);
				cachedRowData = completeRowData;
				cacheTimestamp = Date.now();

				if (!unifiedMode) {
					saveBrowseCache(completeRowData, libs, cachedFeaturedItems);
				}

			} catch (err) {
				console.error('Failed to load browse data:', err);
			} finally {
				setIsLoading(false);
			}
		};

		loadData();
	}, [api, serverUrl, accessToken, settings.featuredContentType, settings.featuredItemCount, isCacheValid, loadBrowseCache, saveBrowseCache, fetchFreshFeaturedItems, unifiedMode, getItemServerUrl]);

	useEffect(() => {
		if (featuredItems.length === 0) return;

		const preloadImage = (url) => {
			if (!url || preloadedImagesRef.current.has(url)) return;
			const img = new window.Image();
			img.src = url;
			preloadedImagesRef.current.add(url);
		};

		for (let offset = -PRELOAD_ADJACENT_SLIDES; offset <= PRELOAD_ADJACENT_SLIDES; offset++) {
			const index = (currentFeaturedIndex + offset + featuredItems.length) % featuredItems.length;
			const item = featuredItems[index];
			if (item) {
				const backdropId = getBackdropId(item);
				if (backdropId) {
					preloadImage(getImageUrl(serverUrl, backdropId, 'Backdrop', {maxWidth: 1920, quality: 100}));
				}
				if (item.LogoUrl) {
					preloadImage(item.LogoUrl);
				}
			}
		}
	}, [currentFeaturedIndex, featuredItems, serverUrl]);

	useEffect(() => {
		const carouselSpeed = settings.carouselSpeed || 8000;
		if (settings.showFeaturedBar === false || featuredItems.length <= 1 || !featuredFocused || browseMode !== 'featured' || carouselSpeed === 0) return;

		const interval = setInterval(() => {
			setCurrentFeaturedIndex((prev) => (prev + 1) % featuredItems.length);
		}, carouselSpeed);

		return () => clearInterval(interval);
	}, [featuredItems.length, featuredFocused, browseMode, settings.carouselSpeed, settings.showFeaturedBar]);

	const crossFadeBackdrop = useCallback(() => {
		if (backdropFadeIntervalRef.current) {
			clearInterval(backdropFadeIntervalRef.current);
		}

		let inValue = 0;
		let outValue = 1;

		setBackdropOpacity(0);
		setPrevBackdropOpacity(1);

		backdropFadeIntervalRef.current = setInterval(() => {
			inValue = Math.min(1, inValue + 0.1);
			outValue = Math.max(0, outValue - 0.1);

			setBackdropOpacity(inValue);
			setPrevBackdropOpacity(outValue);

			if (inValue >= 1 && outValue <= 0) {
				clearInterval(backdropFadeIntervalRef.current);
				backdropFadeIntervalRef.current = null;
				setPrevBackdropUrl(null);
			}
		}, 45); // ca. 450ms
	}, []);

	useEffect(() => {
		let backdropId = null;
		let itemForBackdrop = null;

		if (browseMode === 'featured') {
			itemForBackdrop = featuredItems[currentFeaturedIndex];
			backdropId = getBackdropId(itemForBackdrop);
		} else if (focusedItem) {
			itemForBackdrop = focusedItem;
			backdropId = getBackdropId(focusedItem);
		} else {
			itemForBackdrop = featuredItems[currentFeaturedIndex];
			backdropId = getBackdropId(itemForBackdrop);
		}

		if (backdropId) {
			const itemUrl = getItemServerUrl(itemForBackdrop);
			const url = getImageUrl(itemUrl, backdropId, 'Backdrop', {maxWidth: 1280, quality: 80});
			if (pendingBackdropRef.current === url) return;

			if (backdropTimeoutRef.current) {
				clearTimeout(backdropTimeoutRef.current);
			}
			pendingBackdropRef.current = url;
			backdropTimeoutRef.current = setTimeout(() => {
				window.requestAnimationFrame(() => {
					setPrevBackdropUrl(backdropUrl);
					setBackdropUrl(pendingBackdropRef.current);
					crossFadeBackdrop();
				});
			}, BACKDROP_DEBOUNCE_MS);
		}

		return () => {
			if (backdropTimeoutRef.current) {
				clearTimeout(backdropTimeoutRef.current);
			}
		};
	}, [focusedItem, browseMode, backdropUrl, crossFadeBackdrop, currentFeaturedIndex, featuredItems, getItemServerUrl]);

	const handleSelectItem = useCallback((item) => {
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
	}, [onSelectItem, onSelectLibrary]);

	const handleFeaturedPrev = useCallback(() => {
		if (featuredItems.length <= 1) return;
		setCurrentFeaturedIndex((prev) =>
			prev === 0 ? featuredItems.length - 1 : prev - 1
		);
	}, [featuredItems.length]);

	const handleFeaturedNext = useCallback(() => {
		if (featuredItems.length <= 1) return;
		setCurrentFeaturedIndex((prev) =>
			(prev + 1) % featuredItems.length
		);
	}, [featuredItems.length]);

	const handleFeaturedKeyDown = useCallback((e) => {
		if (e.keyCode === 37) {
			e.preventDefault();
			e.stopPropagation();
			handleFeaturedPrev();
		} else if (e.keyCode === 39) {
			e.preventDefault();
			e.stopPropagation();
			handleFeaturedNext();
		} else if (e.keyCode === 38) {
			e.preventDefault();
			e.stopPropagation();
			Spotlight.focus('navbar-home');
		} else if (e.keyCode === 40) {
			e.preventDefault();
			e.stopPropagation();
			setBrowseMode('rows');
			setTimeout(() => {
				const contentRows = document.querySelector('[data-element="content-rows"]');
				if (contentRows) contentRows.scrollTop = 0;
				Spotlight.focus('row-0');
			}, TRANSITION_DELAY_MS);
		}
	}, [handleFeaturedPrev, handleFeaturedNext]);

	const handleRowFocus = useCallback((rowIndex) => {
		if (browseMode !== 'rows') {
			setBrowseMode('rows');
		}
		if (typeof rowIndex === 'number') {
			lastFocusedRowRef.current = rowIndex;
		}
	}, [browseMode]);

	const handleFocusItem = useCallback((item) => {
		if (focusItemTimeoutRef.current) {
			clearTimeout(focusItemTimeoutRef.current);
		}
		focusItemTimeoutRef.current = setTimeout(() => {
			setFocusedItem(item);
			if (!item.BackdropImageTags?.length && !item.ParentBackdropImageTags?.length) {
				api.getItem(item.Id).then(fullItem => {
					setFocusedItem(fullItem);
				}).catch(() => {});
			}
		}, FOCUS_ITEM_DEBOUNCE_MS);
	}, [api]);

	const handleFeaturedClick = useCallback(() => {
		const item = featuredItems[currentFeaturedIndex];
		if (item) handleSelectItem(item);
	}, [featuredItems, currentFeaturedIndex, handleSelectItem]);

	const handleFeaturedFocus = useCallback(() => {
		setFeaturedFocused(true);
		setFocusedItem(null);
		setBrowseMode('featured');
	}, []);

	const handleFeaturedBlur = useCallback(() => {
		setFeaturedFocused(false);
	}, []);

	const handleCarouselPrevClick = useCallback((e) => {
		e.stopPropagation();
		handleFeaturedPrev();
	}, [handleFeaturedPrev]);

	const handleCarouselNextClick = useCallback((e) => {
		e.stopPropagation();
		handleFeaturedNext();
	}, [handleFeaturedNext]);

	const formatRuntime = (ticks) => {
		if (!ticks) return '';
		const minutes = Math.round(ticks / 600000000);
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
	};

	const currentFeatured = featuredItems[currentFeaturedIndex];

	if (isLoading) {
		return (
			<div className={css.page}>
				<div className={css.loadingContainer}>
					<LoadingSpinner />
					<p>Loading your library...</p>
				</div>
			</div>
		);
	}

	return (
		<div className={css.page}>
			<div className={css.globalBackdrop}>
				{prevBackdropUrl && (
					<img
						className={css.globalBackdropImage}
						src={prevBackdropUrl}
						alt=""
						style={{
							filter: settings.backdropBlurHome > 0
								? `blur(${settings.backdropBlurHome}px)`
								: 'none',
							opacity: prevBackdropOpacity,
							transition: 'none'
						}}
					/>
				)}

				{backdropUrl && (
					<img
						className={css.globalBackdropImage}
						src={backdropUrl}
						alt=""
						style={{
							filter: settings.backdropBlurHome > 0
								? `blur(${settings.backdropBlurHome}px)`
								: 'none',
							opacity: backdropOpacity,
							transition: 'none'
						}}
					/>
				)}
				<div className={css.globalBackdropOverlay} />
			</div>

			<div className={css.mainContent} ref={mainContentRef}>
				{currentFeatured && settings.showFeaturedBar !== false && (
					<div
						className={`${css.featuredBanner} ${browseMode === 'rows' ? css.featuredHidden : ''}`}
					>
						<SpottableDiv
							className={css.featuredInner}
							spotlightId="featured-banner"
							onClick={handleFeaturedClick}
							onKeyDown={handleFeaturedKeyDown}
							onFocus={handleFeaturedFocus}
							onBlur={handleFeaturedBlur}
						>
							<div className={css.featuredBackdrop}>
								<img
									src={getImageUrl(getItemServerUrl(currentFeatured), getBackdropId(currentFeatured), 'Backdrop', {maxWidth: 1920, quality: 100})}
									alt=""
								/>
							</div>

							{featuredItems.length > 1 && (
								<>
									<SpottableButton
										className={`${css.carouselNav} ${css.carouselNavLeft}`}
										onClick={handleCarouselPrevClick}
										style={uiButtonStyle}
									>
										<svg viewBox="0 0 24 24" width="32" height="32">
											<path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
										</svg>
									</SpottableButton>
									<SpottableButton
										className={`${css.carouselNav} ${css.carouselNavRight}`}
										onClick={handleCarouselNextClick}
										style={uiButtonStyle}
									>
										<svg viewBox="0 0 24 24" width="32" height="32">
											<path fill="currentColor" d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z" />
										</svg>
									</SpottableButton>
								</>
							)}

							<div className={css.featuredContent}>
								<div className={css.featuredInfoBox} style={uiPanelStyle}>
									<h1 className={css.featuredTitle}>{currentFeatured.Name}</h1>
									<div className={css.featuredMeta}>
										{currentFeatured.ProductionYear && (
											<span className={css.metaItem}>{currentFeatured.ProductionYear}</span>
										)}
										{currentFeatured.OfficialRating && (
											<span className={css.metaItem}>{currentFeatured.OfficialRating}</span>
										)}
										{currentFeatured.RunTimeTicks && (
											<span className={css.metaItem}>{formatRuntime(currentFeatured.RunTimeTicks)}</span>
										)}
										{currentFeatured.Genres?.slice(0, FEATURED_GENRES_LIMIT).map((g, i) => (
											<span key={i} className={css.metaItem}>{g}</span>
										))}
									</div>
									<p className={css.featuredOverview}>
										{currentFeatured.Overview || 'No description available.'}
									</p>
								</div>

								<div className={css.featuredLogoContainer}>
									{currentFeatured.LogoUrl && (
										<img
											src={currentFeatured.LogoUrl}
											alt={`${currentFeatured.Name} logo`}
										/>
									)}
								</div>
							</div>

							{featuredItems.length > 1 && (
								<div className={css.featuredIndicators}>
									{featuredItems.map((_, idx) => (
										<div
											key={idx}
											className={`${css.indicatorDot} ${idx === currentFeaturedIndex ? css.active : ''}`}
										/>
									))}
								</div>
							)}
						</SpottableDiv>
					</div>
				)}

				<div
					className={`${css.detailSection} ${browseMode === 'rows' ? css.detailVisible : css.detailHidden}`}
				>
					{focusedItem ? (
						<>
							<h2 className={css.detailTitle}>
								{focusedItem.Type === 'Episode' ? focusedItem.SeriesName : focusedItem.Name}
							</h2>
							<div className={css.detailInfoRow}>
								{focusedItem.ProductionYear && (
									<span className={css.infoBadge}>{focusedItem.ProductionYear}</span>
								)}
								{focusedItem.OfficialRating && (
									<span className={css.infoBadge}>{focusedItem.OfficialRating}</span>
								)}
								{focusedItem.RunTimeTicks && (
									<span className={css.infoBadge}>{formatRuntime(focusedItem.RunTimeTicks)}</span>
								)}
								{focusedItem.Type === 'Episode' && focusedItem.ParentIndexNumber !== undefined && (
									<span className={css.infoBadge}>
										S{focusedItem.ParentIndexNumber} E{focusedItem.IndexNumber}
									</span>
								)}
								{focusedItem.Genres?.slice(0, DETAIL_GENRES_LIMIT).map((g, i) => (
									<span key={i} className={css.infoBadge}>{g}</span>
								))}
							</div>
							<p className={css.detailSummary}>
								{focusedItem.Overview || 'No description available.'}
							</p>
						</>
					) : (
						<div className={css.detailPlaceholder}>
							<p>Navigate to an item to see details</p>
						</div>
					)}
				</div>

				<div
					className={`${css.contentRows} ${browseMode === 'rows' ? css.rowsMode : ''}`}
					data-element="content-rows"
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
						/>
					))}
					{filteredRows.length === 0 && (
						<div className={css.empty}>No content found</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default Browse;
