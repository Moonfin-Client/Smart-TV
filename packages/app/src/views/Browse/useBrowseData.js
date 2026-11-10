import {useCallback, useEffect, useMemo, useReducer, useRef, useState} from 'react';
import {retainPermitted} from '../../services/libraryScope';
import {isKidsMode, mergesContinueWatchingNextUp} from '../../utils/kidsMode';
import {isLiveTvLibrary, librariesForNav} from '../../utils/liveTvLibrary';
import $L from '@enact/i18n/$L';

import {getLogoUrl} from '../../utils/helpers';
import {isSiloServer} from '../../utils/siloUrls';
import * as connectionPool from '../../services/connectionPool';
import * as seerrApi from '../../services/seerrApi';
import browseReducer, {browseInitialState, mergeRowsById, replaceRecentRows} from './browseReducer';
import {BROWSE_ROW_LOADERS, buildLoaderContext, loadDeferredSections, loadLatestAndRecentlyReleased, loadSinceYouWatched} from './browseRowLoaders';
import {headLengthFor, moreAfter, nextHeadLength, pageableRow, withRowPage} from './rowPaging';
import {genericCollectionLabel, mergeRecentRows} from '../../utils/mergeRecentRows';
import {normalizeLatestMediaItems} from '../../utils/latestMediaRowNormalizer';
import {EXCLUDED_COLLECTION_TYPES, filterItemsByExcludedGenres, matchesContentType} from './browseFilters';
import {featuredConfigKey} from './featuredConfig';
import {withExternalSlides} from './featuredExternal';
import {readDatedSource, readFeaturedSources} from './featuredSources';
import {DATED_SOURCES} from '../../utils/mediaBarNewRelease';
import {shuffleArray} from '../Details/detailsMedia';
import {withoutBlockedItems} from '../../services/parentalControls';
import {activeSyncProfile} from '../../context/SettingsContext';
import {
	CACHE_TTL_LIBRARIES, CACHE_TTL_VOLATILE, VOLATILE_REFRESH_COOLDOWN_MS,
	cancelPendingCacheSave, clearBrowseCache, clearMemoryCache, isCacheValid, loadBrowseCache, memoryCache, resetEmptySections, saveBrowseCache,
	seedEmptySections, settleSections
} from './browseCache';

const LOAD_FRESH_MS = 10000;

// How long Continue Watching and Next Up start out.
const RESUME_LIMIT = 12;
const NEXT_UP_LIMIT = 24;

// Continue Watching and Next Up page on one server. Across servers they're stitched together and
// have no single list to read further into.
const volatileRow = (row, result, limit, readHead) => (limit ? pageableRow(row, result, limit, readHead) : row);

// A row that quietly loses its source looks the same as a server with nothing to offer, so the
// failure is logged before the row carries on empty.
const emptyRowAfter = (label, err) => {
	console.warn(`[Browse] Failed to load ${label}:`, err);
	return {Items: []};
};

// The libraries the rows are read from.
const rowLibraries = (libs, latestItemsExcludes, settings) => libs.filter(lib => {
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
	const refreshRecentRowsRef = useRef(null);
	// Counts the loads, so a refresh of the recent rows that a reload overtook is dropped.
	const loadGenerationRef = useRef(0);

	const settingsRef = useRef(settings);
	settingsRef.current = settings;
	const apiRef = useRef(api);
	apiRef.current = api;
	const rowsRef = useRef(state.allRowData);
	rowsRef.current = state.allRowData;
	const pagingRef = useRef(new Set());

	const readResume = useCallback((limit) => apiRef.current.getResumeItems(limit), []);
	const readNextUp = useCallback((limit) => apiRef.current.getNextUp(limit, null, settingsRef.current.nextUpMaxDays), []);

	// Reads a row's next page as focus nears its end. A row already being read, or with nothing
	// more, is left alone.
	const loadRowPage = useCallback(async (rowId) => {
		const row = rowsRef.current.find((entry) => entry.id === rowId);
		if (!row || !row.hasMore || typeof row.readHead !== 'function' || pagingRef.current.has(rowId)) return;
		pagingRef.current.add(rowId);
		const limit = nextHeadLength(row);
		let page;
		try {
			const result = await row.readHead(limit);
			page = {items: result?.Items || [], hasMore: moreAfter(result, limit)};
		} catch (err) {
			pagingRef.current.delete(rowId);
			// The row keeps its hasMore, so the next focus near the end tries again.
			console.warn(`[Browse] Failed to load more of ${rowId}:`, err);
			return;
		}
		// The next focus can come before the page is drawn. Reading the row as it was, it would ask
		// for this page again, find nothing new and end the row.
		rowsRef.current = withRowPage(rowsRef.current, rowId, row.readHead, page.items, page.hasMore);
		pagingRef.current.delete(rowId);
		// The reader goes with the page, so a page read for a row that a reload has since replaced
		// is dropped rather than added to the new one.
		dispatch({type: 'EXTEND_ROW', id: rowId, readHead: row.readHead, ...page});
		// The warm cache holds the row too, so coming back to Home keeps the cards paged in.
		if (memoryCache.rowData) {
			memoryCache.rowData = withRowPage(memoryCache.rowData, rowId, row.readHead, page.items, page.hasMore);
		}
	}, []);

	// The merged Continue Watching & Next Up row reads Continue Watching to its end before Next Up,
	// so every page lands after the cards already drawn.
	const loadMoreRow = useCallback((rowId) => {
		if (rowId !== 'continue-nextup') return loadRowPage(rowId);
		const resume = rowsRef.current.find((row) => row.id === 'resume');
		return loadRowPage(resume?.hasMore ? 'resume' : 'nextup');
	}, [loadRowPage]);

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
		const sourceType = s.mediaBarSourceType || 'random';
		// The saved picks sync across servers and can name a library access has since been revoked
		// for, so only what this server still offers and the policy still allows is trusted.
		const views = unifiedMode || !s.mediaBarLibraryIds?.length ? null : (await api.getLibraries().catch(() => null))?.Items;
		const onThisServer = (s.mediaBarLibraryIds || []).filter((id) => !views || views.some((view) => view.Id === id));
		const libraryIds = await retainPermitted(api, onThisServer);
		const collectionIds = s.mediaBarCollectionIds || [];
		// The picked libraries and collections draw as one pool, whatever the source type.
		const sourceIds = [...libraryIds, ...collectionIds];
		const hasSourceFilter = sourceIds.length > 0;
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

			// The app reads the dated sources itself, so they work whatever plugin version the server has.
			const datedSource = DATED_SOURCES.includes(sourceType);
			if (items.length === 0 && s.useMoonfinPlugin && !datedSource) {
				// The plugin answers from the synced picks, so it has to read the profile this TV syncs with.
				const mediaBarResult = await seerrApi.getMoonfinMediaBar(serverUrl, accessToken, activeSyncProfile(s.syncProfile));
				if (mediaBarResult?.Items?.length) {
					items = mediaBarResult.Items;
				}
			}

			// What the bar can show: a title with a backdrop that no setting keeps off it.
			const isUsable = (item) => item.Type !== 'BoxSet' && item.BackdropImageTags?.length > 0 &&
				matchesContentType(item, s.featuredContentType) &&
				filterItemsByExcludedGenres([item], s.excludedGenres).length > 0 && withoutBlockedItems([item]).length > 0;
			const pickFrom = (pool) => shuffleArray(pool.filter(isUsable)).slice(0, count);

			// Merged libraries keep the random draw, since the dated sources read one server.
			if (items.length === 0 && datedSource && !unifiedMode) {
				const options = {contentType: s.featuredContentType, days: s.mediaBarNewReleaseDays};
				const readSource = async (parentId) => ({Items: await readDatedSource(api, sourceType, parentId, options)});
				items = pickFrom(await readFeaturedSources(hasSourceFilter ? sourceIds : [null], readSource, isUsable, count));
			}

			// A dated source with nothing in its window shows random titles instead.
			if (items.length === 0) {
				// Picked collections live on this server, so they keep the draw on it.
				if (unifiedMode && collectionIds.length === 0) {
					items = await connectionPool.getRandomItemsFromAllServers(s.featuredContentType, count, libraryIds);
				} else if (hasSourceFilter) {
					const readSource = (id) => (collectionIds.includes(id)
						? api.getCollectionItems(id, 50)
						: api.getRandomItems(s.featuredContentType, count * 2, id));
					items = pickFrom(await readFeaturedSources(sourceIds, readSource, isUsable, count));
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
		// TVs leave the app running, so Home can be shown again hours after its rows were read.
		if (!unifiedMode && memoryCache.recentAt && !isCacheValid(memoryCache.recentAt, CACHE_TTL_LIBRARIES)) {
			refreshRecentRowsRef.current();
		}
		if (!force && Date.now() - lastVolatileRefreshRef.current < VOLATILE_REFRESH_COOLDOWN_MS) return;
		lastVolatileRefreshRef.current = Date.now();
		try {
			let resumeItems, nextUp;
			let resumeLimit = 0;
			let nextUpLimit = 0;

			if (unifiedMode) {
				[resumeItems, nextUp] = await Promise.all([
					connectionPool.getResumeItemsFromAllServers(),
					connectionPool.getNextUpFromAllServers(settings.nextUpMaxDays)
				]);
				resumeItems = {Items: resumeItems};
				nextUp = {Items: nextUp};
			} else {
				// Read back as long as the rows on screen, so the cards paged in stay.
				const shown = (id) => rowsRef.current.find((row) => row.id === id);
				resumeLimit = headLengthFor(shown('resume'), RESUME_LIMIT);
				nextUpLimit = headLengthFor(shown('nextup'), NEXT_UP_LIMIT);
				[resumeItems, nextUp] = await Promise.all([
					readResume(resumeLimit),
					readNextUp(nextUpLimit)
				]);
			}

			const volatileRows = [];

			if (resumeItems.Items?.length > 0) {
				volatileRows.push(volatileRow({
					id: 'resume',
					title: $L('Continue Watching'),
					items: resumeItems.Items,
					type: 'landscape'
				}, resumeItems, resumeLimit, readResume));
			}

			if (nextUp.Items?.length > 0) {
				volatileRows.push(volatileRow({
					id: 'nextup',
					title: $L('Next Up'),
					items: nextUp.Items,
					type: 'landscape'
				}, nextUp, nextUpLimit, readNextUp));
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
	}, [unifiedMode, cacheOwner, settings.nextUpMaxDays, readResume, readNextUp]);

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
		resetEmptySections();
		memoryCache.owner = owner;
	}, [owner]);

	// A new random set for the media bar, drawn while the current one stays up and kept if the draw
	// fails. A press while one is on its way is dropped. The rows that change refresh too.
	const drawingRef = useRef(false);
	const redrawMediaBar = async () => {
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
	const drawNewMediaBar = () => {
		refreshVolatileData(true);
		return redrawMediaBar();
	};
	const drawNewMediaBarRef = useRef(drawNewMediaBar);
	drawNewMediaBarRef.current = drawNewMediaBar;

	// Recently Added and Recently Released, read again once they're older than the stored copy may
	// be, or a title removed from the server stays on Home until the app is restarted. The rows on
	// screen stay until the new ones are in, so focus keeps its place, and a server that can't be
	// reached, say on waking from standby before the network is back, leaves them as they were.
	// The media bar is drawn again with them, since it can be holding the same title.
	// Both go by who the rows belong to, so a read for the previous user doesn't hold up the next one's.
	const refreshingRecentRef = useRef(null);
	// A read that failed leaves the rows stale, so without a pause every return to Home would
	// read every library again. The next show or resume after it tries again.
	const lastRecentAttemptRef = useRef({owner: null, at: 0});
	const refreshRecentRows = async () => {
		const startedFor = memoryCache.owner;
		const lastAttempt = lastRecentAttemptRef.current;
		if (refreshingRecentRef.current === startedFor ||
			(lastAttempt.owner === startedFor && Date.now() - lastAttempt.at < VOLATILE_REFRESH_COOLDOWN_MS)) return;
		refreshingRecentRef.current = startedFor;
		lastRecentAttemptRef.current = {owner: startedFor, at: Date.now()};
		const generation = loadGenerationRef.current;
		try {
			const currentApi = apiRef.current;
			const currentSettings = settingsRef.current;
			// The loader passes over a library it couldn't read, which mustn't read as its row having emptied.
			let failed = false;
			const failing = (read) => (...args) => read(...args).catch((e) => {
				failed = true;
				throw e;
			});
			const readingApi = Object.assign(Object.create(currentApi), {
				getLatest: failing((...args) => currentApi.getLatest(...args)),
				getRecentlyReleased: failing((...args) => currentApi.getRecentlyReleased(...args))
			});
			const [libraries, userConfig] = await Promise.all([
				currentApi.getLibraries(),
				currentApi.getUserConfiguration().catch(() => null)
			]);
			let recentRows = null;
			await loadLatestAndRecentlyReleased(buildLoaderContext({
				api: readingApi,
				serverUrl,
				settings: currentSettings,
				homeRowsConfig,
				eligibleLibraries: rowLibraries(libraries?.Items || [], userConfig?.Configuration?.LatestItemsExcludes || [], currentSettings),
				recommendations: () => recommendationsRef.current,
				appendRows: (rows) => {
					recentRows = rows;
				}
			}));
			if (failed || !recentRows) return;
			// A row paged further than its first read is read back as long, so the card focus is on stays.
			const shown = new Map(rowsRef.current.map((row) => [row.id, row.items?.length || 0]));
			recentRows = await Promise.all(recentRows.map(async (row) => {
				const length = shown.get(row.id) || 0;
				if (!row.readHead || length <= row.items.length) return row;
				const head = await row.readHead(length);
				return pageableRow({...row, items: head.Items}, head, length, row.readHead);
			}));
			if (loadGenerationRef.current !== generation || memoryCache.owner !== startedFor || !memoryCache.rowData) return;
			dispatch({type: 'REPLACE_RECENT_ROWS', rows: recentRows});
			memoryCache.rowData = replaceRecentRows(memoryCache.rowData, recentRows);
			memoryCache.recentAt = Date.now();
			saveBrowseCache(memoryCache.rowData, memoryCache.libraries, memoryCache.featuredItems, cacheOwner);
			redrawMediaBar();
		} catch (e) {
			console.warn('[Browse] Failed to refresh the recent rows:', e);
		} finally {
			if (refreshingRecentRef.current === startedFor) refreshingRecentRef.current = null;
		}
	};
	refreshRecentRowsRef.current = refreshRecentRows;

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

	// Opening the app again resumes it where it was left, often on Home, without Home being shown
	// again, so coming back to the app catches the rows up the same way. Older sets only fire the
	// prefixed event, so both are watched.
	useEffect(() => {
		const handleVisibility = () => {
			if (!(document.hidden || document.webkitHidden)) refreshVolatileData();
		};
		document.addEventListener('visibilitychange', handleVisibility);
		document.addEventListener('webkitvisibilitychange', handleVisibility);
		return () => {
			document.removeEventListener('visibilitychange', handleVisibility);
			document.removeEventListener('webkitvisibilitychange', handleVisibility);
		};
	}, [refreshVolatileData]);

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
			if (deferredRef.current !== deferred) return;
			settleSections([id], memoryCache.rowData);
			dispatch({type: 'SECTIONS_DONE', sections: [id]});
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
			loadGenerationRef.current += 1;
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
				settings.displayStudiosRows ||
				hasEnabledRecommendationRow ||
				hasEnabledMediaSectionRow;

			// The recent rows come out per library or merged by type, and Recently Released
			// holds series, seasons or episodes, so rows stored for one of those must not
			// answer for another. Series keeps the key rows were stored under before.
			const releasedType = settings.recentlyReleasedSeriesType;
			const rowConfigKey = (settings.mergeRecentRowsByType ? 'merged-recent' : 'per-library') +
				(releasedType && releasedType !== 'series' ? `:${releasedType}` : '');

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

			// Silo's artwork is signed and only known once its item is read in this session, so stored rows would come
			// back without pictures.
			const persistedCache = isSiloServer(cacheOwner.serverUrl) ? null : await loadBrowseCache(cacheOwner.serverUrl, cacheOwner.userId);
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
				// Rows stored before the recent rows had an age of their own go by when they were written.
				memoryCache.recentAt = persistedCache.recentAt || persistedCache.timestamp;
				memoryCache.rowConfigKey = rowConfigKey;
				dispatch({type: 'SET_LOADING', value: false});
				if (!isCacheValid(memoryCache.recentAt, CACHE_TTL_LIBRARIES)) refreshRecentRowsRef.current();

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
				const storedRows = memoryCache.emptySectionsSeeded || unifiedMode ? null : loadBrowseCache(cacheOwner.serverUrl, cacheOwner.userId);

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
						readResume(RESUME_LIMIT).catch((err) => emptyRowAfter('resume', err)),
						readNextUp(NEXT_UP_LIMIT).catch((err) => emptyRowAfter('next up', err)),
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
				memoryCache.recentAt = Date.now();
				loadFetchedVolatileRef.current = Date.now();

				const latestItemsExcludes = userConfig?.Configuration?.LatestItemsExcludes || [];

				const rowData = [];

				if (resumeItems.Items?.length > 0) {
					rowData.push(volatileRow({
						id: 'resume',
						title: $L('Continue Watching'),
						items: resumeItems.Items,
						type: 'landscape'
					}, resumeItems, unifiedMode ? 0 : RESUME_LIMIT, readResume));
				}

				if (nextUp.Items?.length > 0) {
					rowData.push(volatileRow({
						id: 'nextup',
						title: $L('Next Up'),
						items: nextUp.Items,
						type: 'landscape'
					}, nextUp, unifiedMode ? 0 : NEXT_UP_LIMIT, readNextUp));
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

				const eligibleLibraries = rowLibraries(libs, latestItemsExcludes, settings);

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
				const stored = await storedRows;
				if (storedRows && !cancelled) seedEmptySections([].concat(...loaderSections), stored);
				if (!cancelled) {
					loaderContextRef.current = loaderContext;
					deferredRef.current = {ctx: loaderContext, sections: new Map(loaderContext.deferredPluginSections.map((section) => [section.id, section]))};
					dispatch({type: 'SET_PENDING_SECTIONS', sections: [].concat(...loaderSections, [...deferredRef.current.sections.keys()])});
				}
				dispatch({type: 'SET_LOADING', value: false});
				if (!cancelled) {
					BROWSE_ROW_LOADERS.forEach(({load}, index) => {
						const done = (loaded) => {
							if (cancelled) return;
							if (loaded) settleSections(loaderSections[index], memoryCache.rowData);
							dispatch({type: 'SECTIONS_DONE', sections: loaderSections[index]});
						};
						Promise.resolve(load(loaderContext)).then(() => done(true), () => done(false));
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
		settings.displayAudioRows,
		settings.displayStudiosRows,
		settings.displayRewatchRow,
		settings.favoritesRowSortBy,
		settings.collectionsRowSortBy,
		settings.genresRowSortBy,
		settings.genresRowItemFilter,
		settings.playlistsRowSortBy,
		settings.audioRowsSortBy,
		settings.studiosRowSortBy,
		settings.favoritesRowSortOrder,
		settings.collectionsRowSortOrder,
		settings.genresRowSortOrder,
		settings.playlistsRowSortOrder,
		settings.audioRowsSortOrder,
		settings.studiosRowSortOrder,
		settings.collectionsRowShowEpisodes,
		settings.playlistsRowShowEpisodes,
		settings.uiLanguage,
		settings.mergeRecentRowsByType,
		settings.recentlyReleasedSeriesType,
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
		emptySections: memoryCache.emptySections,
		setBrowseMode,
		fetchFreshFeaturedItems,
		refreshVolatileData,
		loadSectionsNear,
		loadMoreRow
	};
};

export default useBrowseData;
