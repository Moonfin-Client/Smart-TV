import {useCallback, useEffect, useMemo, useReducer, useRef, useState} from 'react';
import {retainPermitted} from '../../services/libraryScope';
import {isKidsMode, mergesContinueWatchingNextUp} from '../../utils/kidsMode';
import {isLiveTvLibrary, librariesForNav} from '../../utils/liveTvLibrary';
import $L from '@enact/i18n/$L';

import {getLogoUrl} from '../../utils/helpers';
import * as connectionPool from '../../services/connectionPool';
import * as seerrApi from '../../services/seerrApi';
import browseReducer, {browseInitialState, mergeRowsById} from './browseReducer';
import {BROWSE_ROW_LOADERS, buildLoaderContext, loadDeferredSections, loadSinceYouWatched} from './browseRowLoaders';
import {genericCollectionLabel, mergeRecentRows} from '../../utils/mergeRecentRows';
import {normalizeLatestMediaItems} from '../../utils/latestMediaRowNormalizer';
import {EXCLUDED_COLLECTION_TYPES, filterItemsByExcludedGenres, matchesContentType} from './browseFilters';
import {featuredConfigKey} from './featuredConfig';
import {withExternalSlides} from './featuredExternal';
import {readFeaturedSources} from './featuredSources';
import {shuffleArray} from '../Details/detailsMedia';
import {withoutBlockedItems} from '../../services/parentalControls';
import {activeSyncProfile} from '../../context/SettingsContext';
import {
	CACHE_TTL_LIBRARIES, CACHE_TTL_VOLATILE, VOLATILE_REFRESH_COOLDOWN_MS,
	cancelPendingCacheSave, clearBrowseCache, clearMemoryCache, isCacheValid, loadBrowseCache, memoryCache, saveBrowseCache
} from './browseCache';

const LOAD_FRESH_MS = 10000;

// A row that quietly loses its source looks the same as a server with nothing to offer, so the
// failure is logged before the row carries on empty.
const emptyRowAfter = (label, err) => {
	console.warn(`[Browse] Failed to load ${label}:`, err);
	return {Items: []};
};

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
	recommendationsSupported,
	getItemServerUrl,
	homeRowsConfig
}) => {
	const [state, dispatch] = useReducer(browseReducer, browseInitialState);
	const [reloadKey, setReloadKey] = useState(0);

	const cacheOwner = useMemo(() => ({serverUrl, userId}), [serverUrl, userId]);

	const lastVolatileRefreshRef = useRef(0);
	const loadFetchedVolatileRef = useRef(0);

	const settingsRef = useRef(settings);
	settingsRef.current = settings;

	const recommendations = useMemo(
		() => ({seerrEnabled, seerrAuthenticated, recommendationsSupported}),
		[seerrEnabled, seerrAuthenticated, recommendationsSupported]
	);
	const recommendationsRef = useRef(recommendations);
	recommendationsRef.current = recommendations;
	const loaderContextRef = useRef(null);
	// The picked rows waiting for Home to come near them, and the load they belong to.
	const deferredRef = useRef(null);

	const fetchFreshFeaturedItems = useCallback(async (fallbackItems = null) => {
		const s = settingsRef.current;
		const configKey = featuredConfigKey(s, unifiedMode);
		// The bar already holds a set for these settings, and a new random draw would only reshuffle it.
		if (memoryCache.featuredItems?.length > 0 && memoryCache.featuredConfigKey === configKey) {
			return null;
		}
		const publish = (items) => {
			memoryCache.featuredItems = items;
			memoryCache.featuredConfigKey = configKey;
			dispatch({type: 'SET_FEATURED_ITEMS', items});
		};
		const sourceType = s.mediaBarSourceType || 'library';
		// The saved picks sync across servers and can name a library access has since been revoked
		// for, so only what this server still offers and the policy still allows is trusted.
		const views = unifiedMode || !s.mediaBarLibraryIds?.length ? null : (await api.getLibraries().catch(() => null))?.Items;
		const onThisServer = (s.mediaBarLibraryIds || []).filter((id) => !views || views.some((view) => view.Id === id));
		const libraryIds = await retainPermitted(api, onThisServer);
		const collectionIds = s.mediaBarCollectionIds || [];
		const hasSourceFilter = (sourceType === 'collection' && collectionIds.length > 0) || libraryIds.length > 0;
		// Kids Mode hides every outside list on Home, and the lists come through the plugin.
		const externalIds = s.useMoonfinPlugin && !isKidsMode(s) ? s.mediaBarExternalLists || [] : [];
		const mixInExternal = (picked) => withExternalSlides(picked, externalIds, s, {serverUrl, accessToken});

		try {
			let items = [];
			const count = s.featuredItemCount;

			// Lists picked on their own fill the bar alone. When they come back empty the bar
			// falls back to what it shows with nothing picked.
			if (externalIds.length > 0 && !hasSourceFilter) {
				items = await mixInExternal([]);
			}

			if (items.length === 0 && s.useMoonfinPlugin) {
				// The plugin answers from the synced picks, so it has to read the profile this TV syncs with.
				const mediaBarResult = await seerrApi.getMoonfinMediaBar(serverUrl, accessToken, activeSyncProfile(s.syncProfile));
				if (mediaBarResult?.Items?.length) {
					items = mediaBarResult.Items;
				}
			}

			if (items.length === 0) {
				// What the bar can show: a title with a backdrop that no setting keeps off it.
				const isUsable = (item) => item.Type !== 'BoxSet' && item.BackdropImageTags?.length > 0 &&
					matchesContentType(item, s.featuredContentType) &&
					filterItemsByExcludedGenres([item], s.excludedGenres).length > 0 && withoutBlockedItems([item]).length > 0;
				const pickFrom = (pool) => shuffleArray(pool.filter(isUsable)).slice(0, count);
				if (sourceType === 'collection' && collectionIds.length > 0) {
					items = pickFrom(await readFeaturedSources(collectionIds, (cid) => api.getCollectionItems(cid, 50), isUsable, count));
				} else if (unifiedMode) {
					items = await connectionPool.getRandomItemsFromAllServers(s.featuredContentType, count, libraryIds);
				} else if (libraryIds.length > 0) {
					items = pickFrom(await readFeaturedSources(libraryIds, (lid) => api.getRandomItems(s.featuredContentType, count * 2, lid), isUsable, count));
				} else {
					const randomItems = await api.getRandomItems(s.featuredContentType, count);
					items = randomItems?.Items || [];
				}
			}

			if (externalIds.length > 0 && hasSourceFilter) {
				items = await mixInExternal(items);
			}

			if (items.length > 0) {
				const filteredItems = filterItemsByExcludedGenres(
					items.filter(item => item.Type !== 'BoxSet' && matchesContentType(item, s.featuredContentType)),
					s.excludedGenres
				);
				const featuredWithLogos = filteredItems.map(item => ({
					...item,
					LogoUrl: item.LogoUrl || getLogoUrl(getItemServerUrl(item), item, {maxWidth: 800, quality: 90})
				}));
				publish(featuredWithLogos);
				return featuredWithLogos;
			} else if (fallbackItems && !hasSourceFilter) {
				publish(fallbackItems);
				return fallbackItems;
			}
		} catch (e) {
			console.warn('[Browse] Failed to fetch fresh featured items:', e);
			if (fallbackItems && !hasSourceFilter) {
				publish(fallbackItems);
				return fallbackItems;
			}
		}
		return null;
	}, [api, serverUrl, accessToken, unifiedMode, getItemServerUrl]);

	const refreshVolatileData = useCallback(async (force = false) => {
		// The load that just ran fetched these rows itself, so Home's first show doesn't fetch them again.
		if (Date.now() - loadFetchedVolatileRef.current < LOAD_FRESH_MS) return;
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
	// The user is part of that, since a switch can bring the token and the user in
	// separate renders, and rows read in between still belong to the previous user.
	const owner = `${accessToken}:${userId}`;
	useEffect(() => {
		if (memoryCache.owner === owner) return;
		clearMemoryCache();
		memoryCache.owner = owner;
	}, [owner]);

	// A new random set for the media bar, drawn while the current one stays up and kept if the draw
	// fails. A press while one is on its way is dropped. The rows that change refresh too.
	const drawingRef = useRef(false);
	const drawNewMediaBar = async () => {
		refreshVolatileData(true);
		if (drawingRef.current || settingsRef.current.featuredBarStyle === 'off') return;
		drawingRef.current = true;
		const current = memoryCache.featuredItems;
		memoryCache.featuredItems = null;
		try {
			if (!(await fetchFreshFeaturedItems(current))) memoryCache.featuredItems = current;
		} finally {
			drawingRef.current = false;
		}
	};
	const drawNewMediaBarRef = useRef(drawNewMediaBar);
	drawNewMediaBarRef.current = drawNewMediaBar;

	useEffect(() => {
		// detail.featured marks refreshes that change what the bar may hold, like hiding a library.
		// detail.libraries marks a change to the libraries themselves, like their order, which has
		// to show straight away, so the stored rows go too and the rows are asked for again.
		// detail.newMediaBar is Home pressed while Home is showing.
		const handleBrowseRefresh = (e) => {
			if (e?.detail?.newMediaBar) {
				drawNewMediaBarRef.current();
				return;
			}
			clearMemoryCache({keepFeatured: !e?.detail?.featured});
			if (e?.detail?.libraries) clearBrowseCache().then(() => setReloadKey((key) => key + 1));
		};

		window.addEventListener('moonfin:browseRefresh', handleBrowseRefresh);
		return () => {
			window.removeEventListener('moonfin:browseRefresh', handleBrowseRefresh);
		};
	}, []);

	useEffect(() => cancelPendingCacheSave, []);

	// Only the Since you watched rows read the Seerr state, and it settles a moment after launch,
	// so those rows are all that load again when it does.
	useEffect(() => {
		if (loaderContextRef.current) loadSinceYouWatched(loaderContextRef.current);
	}, [recommendations]);

	const loadSectionsNear = useCallback((rowIds) => {
		const deferred = deferredRef.current;
		const due = deferred ? rowIds.map((id) => deferred.sections.get(id)).filter(Boolean) : [];
		if (due.length === 0) return;
		due.forEach((section) => deferred.sections.delete(section.id));
		loadDeferredSections(deferred.ctx, due, (id) => {
			if (deferredRef.current === deferred) dispatch({type: 'SECTIONS_DONE', sections: [id]});
		});
	}, []);

	useEffect(() => {
		let cancelled = false;

		// Loading cant clear until the media bar has something, or the first focus lands
		// on a row rather than on the bar. Items we already remember do that on the spot,
		// so coming back to the home screen no longer waits on a request whose answer is
		// already in hand, and a fresh draw only follows if the media bar settings changed.
		// With nothing remembered there is still nothing to show until the request answers.
		const primeFeaturedItems = async (remembered, rememberedConfigKey) => {
			if (remembered?.length) {
				// Records which settings the bar's items were drawn for.
				memoryCache.featuredItems = remembered;
				memoryCache.featuredConfigKey = rememberedConfigKey;
				dispatch({type: 'SET_FEATURED_ITEMS', items: remembered});
				fetchFreshFeaturedItems(remembered);
				return;
			}
			await fetchFreshFeaturedItems(remembered);
		};

		const loadData = async () => {
			loaderContextRef.current = null;
			deferredRef.current = null;
			dispatch({type: 'SET_PENDING_SECTIONS', sections: []});
			// Recommendation rows are only built by fetchAllData, so treat an enabled one
			// as dynamic config. Otherwise enabling it shows nothing until the cache expires.
			const hasEnabledRecommendationRow = homeRowsConfig.some(
				(row) => row.enabled && (row.id.startsWith('sinceyouwatched') || row.id === 'rewatch')
			);
			const hasEnabledMediaSectionRow = homeRowsConfig.some(
				(row) => row.enabled && ['audioartists', 'audioalbums', 'audioplaylists', 'resumeaudio', 'activerecordings', 'onnow'].includes(row.id)
			);
			const hasDynamicRowConfig =
				settings.displayFavoritesRows ||
				settings.displayCollectionsRows ||
				settings.displayGenresRows ||
				settings.displayPlaylistsRows ||
				hasEnabledRecommendationRow ||
				hasEnabledMediaSectionRow;

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
				await primeFeaturedItems(memoryCache.featuredItems, memoryCache.featuredConfigKey);
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
				await primeFeaturedItems(persistedCache.featuredItems, persistedCache.featuredConfigKey);
				memoryCache.libraries = persistedCache.libraries;
				memoryCache.rowData = persistedCache.rowData;
				memoryCache.timestamp = persistedCache.timestamp;
				memoryCache.rowConfigKey = rowConfigKey;
				dispatch({type: 'SET_LOADING', value: false});

				if (!isCacheValid(persistedCache.timestamp, CACHE_TTL_VOLATILE)) {
					refreshVolatileData(true);
					loadFetchedVolatileRef.current = Date.now();
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
						api.getResumeItems().catch((err) => emptyRowAfter('resume', err)),
						api.getNextUp(24, null, settings.nextUpMaxDays).catch((err) => emptyRowAfter('next up', err)),
						api.getUserConfiguration().catch(() => null),
						mergesContinueWatchingNextUp(settings) ? api.getItems({
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
				loadFetchedVolatileRef.current = Date.now();

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
					// Kids Mode sends the guide back home, so leaving its tile here would be a dead end.
					const libraryItems = librariesForNav(libs, false, {hideLiveTv: isKidsMode(settings)}).map(lib => ({
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
				// keeps what it last held unless the media bar settings changed.
				if (settingsRef.current.featuredBarStyle !== 'off') {
					await primeFeaturedItems(memoryCache.featuredItems, memoryCache.featuredConfigKey);
				} else {
					fetchFreshFeaturedItems();
				}
				dispatch({type: 'SET_LOADING', value: false});

				const eligibleLibraries = libs.filter(lib => {
					if (EXCLUDED_COLLECTION_TYPES.includes(lib.CollectionType?.toLowerCase())) {
						return false;
					}
					// Its row is dropped when the rows are built, so there is nothing to ask it for.
					if (isKidsMode(settings) && isLiveTvLibrary(lib)) {
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
							.map((r) => ({
								lib: r.lib,
								items: normalizeLatestMediaItems(r.latest, {collectionType: r.lib?.CollectionType, limit: 16})
							}));
						for (const merged of mergeRecentRows(entries, 'DateCreated')) {
							newRows.push({
								id: `latest-merged-${merged.collectionType}`,
								title: $L('Recently Added {libraryName}').replace('{libraryName}', genericCollectionLabel(merged.collectionType)),
								items: merged.items,
								type: merged.cardType,
								isLatestRow: true
							});
						}
					} else {
						for (const result of latestResults) {
							if (result && result.latest?.length > 0) {
								const items = normalizeLatestMediaItems(result.latest, {collectionType: result.lib?.CollectionType, limit: 16});
								if (items.length > 0) {
									const libraryTitle = result.lib._serverName
										? `${result.lib.Name} (${result.lib._serverName})`
										: result.lib.Name;
									const rowId = `latest-${result.lib.Id}${result.lib._serverName ? '-' + result.lib._serverName : ''}`;

									newRows.push({
										id: rowId,
										title: $L('Recently Added {libraryName}').replace('{libraryName}', libraryTitle),
										items,
										library: result.lib,
										type: result.lib.CollectionType?.toLowerCase() === 'music' ? 'square' : 'portrait',
										isLatestRow: true
									});
								}
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

				const loaderContext = buildLoaderContext({
					api,
					serverUrl,
					settings,
					homeRowsConfig,
					eligibleLibraries,
					recommendations: () => recommendationsRef.current,
					appendRows
				});
				const loaderSections = BROWSE_ROW_LOADERS.map(({sections}) => sections(loaderContext));
				if (!cancelled) {
					loaderContextRef.current = loaderContext;
					deferredRef.current = {ctx: loaderContext, sections: new Map(loaderContext.deferredPluginSections.map((section) => [section.id, section]))};
					dispatch({type: 'SET_PENDING_SECTIONS', sections: [].concat(...loaderSections, [...deferredRef.current.sections.keys()])});
				}
				dispatch({type: 'SET_LOADING', value: false});
				if (!cancelled) {
					BROWSE_ROW_LOADERS.forEach(({load}, index) => {
						const done = () => {
							if (!cancelled) dispatch({type: 'SECTIONS_DONE', sections: loaderSections[index]});
						};
						Promise.resolve(load(loaderContext)).then(done, done);
					});
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
		reloadKey,
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
		settings.playlistsRowShowEpisodes,
		settings.uiLanguage,
		settings.mergeRecentRowsByType,
		settings.mergeContinueWatchingNextUp,
		settings.kidsModeEnabled,
		settings.nextUpMaxDays,
		settings.sinceYouWatchedSource,
		settings.sinceYouWatchedSourceItem,
		settings.sinceYouWatchedSourceType,
		settings.sinceYouWatchedIncludeWatched,
		settings.tmdbApiKey,
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
		pendingSections: state.pendingSections,
		setBrowseMode,
		fetchFreshFeaturedItems,
		refreshVolatileData,
		loadSectionsNear
	};
};

export default useBrowseData;
