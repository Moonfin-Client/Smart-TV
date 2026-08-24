import {useCallback, useEffect, useMemo, useReducer, useRef} from 'react';
import $L from '@enact/i18n/$L';

import {getLogoUrl} from '../../utils/helpers';
import * as connectionPool from '../../services/connectionPool';
import * as seerrApi from '../../services/seerrApi';
import {deduplicateMediaItems} from '../../utils/mediaDedup';
import browseReducer, {browseInitialState, mergeRowsById} from './browseReducer';
import {BROWSE_ROW_LOADERS, buildLoaderContext} from './browseRowLoaders';
import {genericCollectionLabel, mergeRecentRows} from '../../utils/mergeRecentRows';
import {EXCLUDED_COLLECTION_TYPES, filterItemsByExcludedGenres} from './browseFilters';
import {
	CACHE_TTL_LIBRARIES, CACHE_TTL_VOLATILE, VOLATILE_REFRESH_COOLDOWN_MS,
	cancelPendingCacheSave, clearMemoryCache, isCacheValid, loadBrowseCache, memoryCache, saveBrowseCache
} from './browseCache';

// Everything the home screen shows and how it gets there. Rows come from three places, the
// in memory cache, the stored cache and the server, and each one dispatches as it arrives so
// the screen fills in rather than waiting for the slowest.
const useBrowseData = ({
	api,
	serverUrl,
	accessToken,
	userId,
	settings,
	unifiedMode,
	seerrEnabled,
	seerrAuthenticated,
	getItemServerUrl,
	homeRowsConfig
}) => {
	const [state, dispatch] = useReducer(browseReducer, browseInitialState);

	const cacheOwner = useMemo(() => ({serverUrl, userId}), [serverUrl, userId]);

	const lastVolatileRefreshRef = useRef(0);

	const settingsRef = useRef(settings);
	settingsRef.current = settings;

	const fetchFreshFeaturedItems = useCallback(async (fallbackItems = null) => {
		const s = settingsRef.current;
		const sourceType = s.mediaBarSourceType || 'library';
		const libraryIds = s.mediaBarLibraryIds || [];
		const collectionIds = s.mediaBarCollectionIds || [];
		const hasSourceFilter = (sourceType === 'collection' && collectionIds.length > 0) || libraryIds.length > 0;

		try {
			let items = [];

			if (s.useMoonfinPlugin) {
				const mediaBarResult = await seerrApi.getMoonfinMediaBar(serverUrl, accessToken, 'tv');
				if (mediaBarResult?.Items?.length) {
					items = mediaBarResult.Items;
				}
			}

			if (items.length === 0) {
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
					items = await connectionPool.getRandomItemsFromAllServers(s.featuredContentType, s.featuredItemCount, libraryIds);
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
				memoryCache.featuredItems = featuredWithLogos;
				return featuredWithLogos;
			} else if (fallbackItems && !hasSourceFilter) {
				dispatch({type: 'SET_FEATURED_ITEMS', items: fallbackItems});
				memoryCache.featuredItems = fallbackItems;
				return fallbackItems;
			}
		} catch (e) {
			console.warn('[Browse] Failed to fetch fresh featured items:', e);
			if (fallbackItems && !hasSourceFilter) {
				dispatch({type: 'SET_FEATURED_ITEMS', items: fallbackItems});
				memoryCache.featuredItems = fallbackItems;
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
					connectionPool.getNextUpFromAllServers(settings.nextUpMaxDays)
				]);
				resumeItems = {Items: resumeItems};
				nextUp = {Items: nextUp};
			} else {
				[resumeItems, nextUp] = await Promise.all([
					api.getResumeItems(),
					api.getNextUp(24, null, settings.nextUpMaxDays)
				]);
			}

			const volatileRows = [];

			const dedupeResume = deduplicateMediaItems(resumeItems.Items || []);
			if (dedupeResume.length > 0) {
				volatileRows.push({
					id: 'resume',
					title: $L('Continue Watching'),
					items: dedupeResume,
					type: 'landscape'
				});
			}

			const dedupeNextUp = deduplicateMediaItems(nextUp.Items || []);
			if (dedupeNextUp.length > 0) {
				volatileRows.push({
					id: 'nextup',
					title: $L('Next Up'),
					items: dedupeNextUp,
					type: 'landscape'
				});
			}

			dispatch({type: 'REFRESH_VOLATILE', volatileRows});
			if (memoryCache.rowData) {
				const filtered = memoryCache.rowData.filter(r => r.id !== 'resume' && r.id !== 'nextup');
				memoryCache.rowData = [...volatileRows, ...filtered];
				memoryCache.timestamp = Date.now();
				if (!unifiedMode) {
					saveBrowseCache(memoryCache.rowData, memoryCache.libraries, memoryCache.featuredItems, cacheOwner);
				}
			}
		} catch (e) {
			console.warn('[Browse] Background refresh failed:', e);
		}
	}, [api, unifiedMode, cacheOwner, settings.nextUpMaxDays]);

	// Signing in as someone else has to throw the rows away. Leaving the home screen and
	// coming back must not, and it used to, because an effect runs when it first mounts
	// as well as when what it watches changes, and this screen is built again every time
	// it is returned to. Comparing against who the rows belong to tells the two apart.
	useEffect(() => {
		if (memoryCache.owner === accessToken) return;
		clearMemoryCache();
		memoryCache.owner = accessToken;
	}, [accessToken]);

	useEffect(() => {
		const handleBrowseRefresh = () => {
			clearMemoryCache();
		};

		window.addEventListener('moonfin:browseRefresh', handleBrowseRefresh);
		return () => {
			window.removeEventListener('moonfin:browseRefresh', handleBrowseRefresh);
		};
	}, []);

	useEffect(() => cancelPendingCacheSave, []);

	useEffect(() => {
		let cancelled = false;

		// Loading cant clear until the media bar has something, or the first focus lands
		// on a row rather than on the bar. Items we already remember do that on the spot
		// and the fresh ones then arrive in their own time, so coming back to the home
		// screen no longer waits on a request whose answer is already in hand. With
		// nothing remembered there is still nothing to show until the request answers.
		const primeFeaturedItems = async (remembered) => {
			if (remembered?.length) {
				dispatch({type: 'SET_FEATURED_ITEMS', items: remembered});
				fetchFreshFeaturedItems(remembered);
				return;
			}
			await fetchFreshFeaturedItems(remembered);
		};

		const loadData = async () => {
			// Recommendation rows are only built by fetchAllData, so treat an enabled one
			// as dynamic config. Otherwise enabling it shows nothing until the cache expires.
			const hasEnabledRecommendationRow = homeRowsConfig.some(
				(row) => row.enabled && (row.id.startsWith('sinceyouwatched') || row.id === 'rewatch')
			);
			const hasEnabledMediaSectionRow = homeRowsConfig.some(
				(row) => row.enabled && ['audioartists', 'audioalbums', 'audioplaylists', 'resumeaudio', 'activerecordings'].includes(row.id)
			);
			const hasDynamicRowConfig =
				settings.displayFavoritesRows ||
				settings.displayCollectionsRows ||
				settings.displayGenresRows ||
				settings.displayPlaylistsRows ||
				hasEnabledRecommendationRow ||
				hasEnabledMediaSectionRow ||
				(settings.pluginSections || []).some((section) => section?.enabled);

			// The recent rows come out per library or merged by type, and a cache of
			// one shape must not answer for the other.
			const rowConfigKey = settings.mergeRecentRowsByType ? 'merged-recent' : 'per-library';

			if (hasDynamicRowConfig || unifiedMode) {
				memoryCache.rowConfigKey = rowConfigKey;
				dispatch({type: 'SET_LOADING', value: true});
				await fetchAllData(); // eslint-disable-line no-use-before-define
				return;
			}

			if (memoryCache.rowConfigKey === rowConfigKey && memoryCache.rowData && memoryCache.libraries && memoryCache.featuredItems && isCacheValid(memoryCache.timestamp, CACHE_TTL_VOLATILE)) {
				dispatch({type: 'SET_ROW_DATA', rowData: memoryCache.rowData});
				await primeFeaturedItems(memoryCache.featuredItems);
				dispatch({type: 'SET_LOADING', value: false});
				return;
			}

			const persistedCache = await loadBrowseCache(cacheOwner.serverUrl, cacheOwner.userId);
			const hasValidPersistedCache = persistedCache &&
				(persistedCache.rowConfigKey || 'per-library') === rowConfigKey &&
				isCacheValid(persistedCache.timestamp, CACHE_TTL_LIBRARIES) &&
				Array.isArray(persistedCache.libraries) &&
				persistedCache.libraries.length > 0;

			if (hasValidPersistedCache) {
				dispatch({type: 'SET_ROW_DATA', rowData: persistedCache.rowData});
				await primeFeaturedItems(persistedCache.featuredItems);
				memoryCache.libraries = persistedCache.libraries;
				memoryCache.rowData = persistedCache.rowData;
				memoryCache.timestamp = persistedCache.timestamp;
				memoryCache.rowConfigKey = rowConfigKey;
				dispatch({type: 'SET_LOADING', value: false});

				if (!isCacheValid(persistedCache.timestamp, CACHE_TTL_VOLATILE)) {
					refreshVolatileData(true);
				}
				return;
			}

			memoryCache.rowConfigKey = rowConfigKey;
			dispatch({type: 'SET_LOADING', value: true});
			await fetchAllData(); // eslint-disable-line no-use-before-define
		};

		const fetchAllData = async () => {
			try {
				let libs, resumeItems, nextUp, userConfig, recentlyPlayed;

				if (unifiedMode) {
					const [libsArray, resumeArray, nextUpArray] = await Promise.all([
						connectionPool.getLibrariesFromAllServers(),
						connectionPool.getResumeItemsFromAllServers(),
						connectionPool.getNextUpFromAllServers(settings.nextUpMaxDays)
					]);
					libs = libsArray;
					resumeItems = {Items: resumeArray};
					nextUp = {Items: nextUpArray};
					userConfig = null; // Not supported in unified mode
					recentlyPlayed = null;
					// IMDb custom rows are single-server only, so imdbResults stays empty in unified mode.
				} else {
					const results = await Promise.all([
						api.getLibraries().catch(() => ({Items: []})),
						api.getResumeItems().catch(() => ({Items: []})),
						api.getNextUp(24, null, settings.nextUpMaxDays).catch(() => ({Items: []})),
						api.getUserConfiguration().catch(() => null),
						settings.mergeContinueWatchingNextUp ? api.getItems({
							IncludeItemTypes: 'Episode',
							Filters: 'IsPlayed',
							Recursive: true,
							SortBy: 'DatePlayed',
							SortOrder: 'Descending',
							Limit: 100,
							Fields: 'UserData,SeriesId'
						}).catch(() => null) : Promise.resolve(null)
					]);
					libs = results[0].Items || [];
					resumeItems = results[1];
					nextUp = results[2];
					userConfig = results[3];
					recentlyPlayed = results[4];
				}

				memoryCache.libraries = libs;

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
					const libraryItems = libs.map(lib => ({
						...lib,
						Type: 'CollectionFolder',
						isLibraryTile: true
					}));
					rowData.push({
						id: 'library-tiles',
						title: $L('My Media'),
						items: libraryItems,
						type: 'landscape',
						isLibraryRow: true
					});
					// The same libraries drawn as icon buttons instead of artwork tiles.
					// Like every other row here it is built either way and dropped
					// later if the user has not enabled it.
					rowData.push({
						id: 'librarybuttons',
						title: $L('Library Buttons'),
						items: libraryItems,
						type: 'square',
						isLibraryRow: true,
						isButtonRow: true
					});

					const liveTvLibrary = libs.find(lib => lib.CollectionType?.toLowerCase() === 'livetv');
					if (liveTvLibrary) {
						rowData.push({
							id: 'livetv',
							title: $L('Live TV'),
							items: [
								{...liveTvLibrary, Name: $L('Guide'), Type: 'CollectionFolder', isLibraryTile: true},
								{Id: 'livetv-recordings', Name: $L('Recordings'), Type: 'CollectionFolder', isRecordingsShortcut: true}
							],
							type: 'landscape',
							isLiveTvRow: true
						});
					}
				}

				if (recentlyPlayed?.Items?.length > 0) {
					rowData.push({
						id: 'recentlyplayed',
						items: recentlyPlayed.Items
					});
				}

				dispatch({type: 'SET_ROW_DATA', rowData});
				memoryCache.rowData = [...rowData];
				// The Mediabar is populated only by the settings-aware loader so it can
				// never show a library outside the selected sources. Rows that answer to
				// a setting are rebuilt on every visit rather than read back, but the bar
				// can still open on what it last held while the fresh set is on its way.
				if (settingsRef.current.featuredBarStyle !== 'off') {
					await primeFeaturedItems(memoryCache.featuredItems);
				} else {
					fetchFreshFeaturedItems();
				}
				dispatch({type: 'SET_LOADING', value: false});

				const eligibleLibraries = libs.filter(lib => {
					if (EXCLUDED_COLLECTION_TYPES.includes(lib.CollectionType?.toLowerCase())) {
						return false;
					}
					if (latestItemsExcludes.includes(lib.Id)) {
						return false;
					}
					return true;
				});

				if (unifiedMode) {
					const latestResults = await connectionPool.getLatestPerLibraryFromAllServers(
						latestItemsExcludes,
						EXCLUDED_COLLECTION_TYPES
					);
					const newRows = [];
					if (settings.mergeRecentRowsByType) {
						const entries = latestResults
							.filter((r) => r && r.latest?.length > 0)
							.map((r) => ({lib: r.lib, items: r.latest}));
						for (const merged of mergeRecentRows(entries, 'DateCreated')) {
							newRows.push({
								id: `latest-merged-${merged.collectionType}`,
								title: $L('Recently Added in {libraryTitle}').replace('{libraryTitle}', genericCollectionLabel(merged.collectionType)),
								items: merged.items,
								type: merged.cardType,
								isLatestRow: true
							});
						}
					} else {
						for (const result of latestResults) {
							if (result && result.latest?.length > 0) {
								const libraryTitle = result.lib._serverName
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
					}
					dispatch({type: 'APPEND_ROWS', rows: newRows});
					memoryCache.rowData = [...rowData, ...newRows];
					memoryCache.timestamp = Date.now();
					dispatch({type: 'SET_LOADING', value: false});
					return;
				}

				const appendRows = (rows) => {
					if (cancelled || rows.length === 0) return;
					dispatch({type: 'APPEND_ROWS', rows});
					memoryCache.rowData = mergeRowsById(memoryCache.rowData || [], rows);
					memoryCache.timestamp = Date.now();
					// Unified mode spans several servers, so its rows never go to the disk cache.
					if (!unifiedMode) {
						saveBrowseCache(memoryCache.rowData, libs, memoryCache.featuredItems, cacheOwner);
					}
				};

				dispatch({type: 'SET_LOADING', value: false});
				if (!cancelled) {
					const loaderContext = buildLoaderContext({
						api,
						settings,
						homeRowsConfig,
						eligibleLibraries,
						seerrEnabled,
						seerrAuthenticated,
						appendRows
					});
					BROWSE_ROW_LOADERS.forEach((loader) => loader(loaderContext));
				}

			} catch (err) {
				console.error('[Browse] Failed to load browse data:', err);
			} finally {
				dispatch({type: 'SET_LOADING', value: false});
			}
		};

		loadData();
		return () => {
			cancelled = true;
		};
		// Each settings field the loaders read is listed below. Naming the whole object would
		// rebuild every row whenever any unrelated setting changed.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		api,
		serverUrl,
		accessToken,
		settings.featuredContentType,
		settings.featuredItemCount,
		settings.displayFavoritesRows,
		settings.displayCollectionsRows,
		settings.displayGenresRows,
		settings.displayPlaylistsRows,
		settings.favoritesRowSortBy,
		settings.collectionsRowSortBy,
		settings.genresRowSortBy,
		settings.genresRowItemFilter,
		settings.playlistsRowSortBy,
		settings.audioRowsSortBy,
		settings.favoritesRowSortOrder,
		settings.collectionsRowSortOrder,
		settings.genresRowSortOrder,
		settings.playlistsRowSortOrder,
		settings.audioRowsSortOrder,
		settings.collectionsRowShowEpisodes,
		settings.uiLanguage,
		settings.pluginSections,
		settings.mergeRecentRowsByType,
		settings.mergeContinueWatchingNextUp,
		settings.nextUpMaxDays,
		settings.sinceYouWatchedSource,
		settings.sinceYouWatchedSourceItem,
		settings.sinceYouWatchedSourceType,
		settings.sinceYouWatchedIncludeWatched,
		settings.tmdbApiKey,
		seerrEnabled,
		seerrAuthenticated,
		settings.rewatchIncludeMovies,
		settings.rewatchIncludeShows,
		settings.rewatchIncludeCollections,
		settings.rewatchSortBy,
		cacheOwner,
		fetchFreshFeaturedItems,
		unifiedMode,
		getItemServerUrl,
		refreshVolatileData,
		homeRowsConfig
	]);

	const setBrowseMode = useCallback((mode) => dispatch({type: 'SET_BROWSE_MODE', mode}), []);

	return {
		isLoading: state.isLoading,
		browseMode: state.browseMode,
		allRowData: state.allRowData,
		featuredItems: state.featuredItems,
		setBrowseMode,
		fetchFreshFeaturedItems,
		refreshVolatileData
	};
};

export default useBrowseData;
