// Loads the favorites behind the tabbed view, one request per type, fired together.

import {useCallback, useEffect, useRef, useState} from 'react';

import * as connectionPool from '../../services/connectionPool';
import {getActiveParentalFilter, withoutBlockedItems} from '../../services/parentalControls';
import {getMovie, getTv, getWatchlist} from '../../services/seerrApi';
import mapBounded from '../../utils/mapBounded';
import {withoutBlockedOrUnrated} from '../../utils/parentalFilter';
import {normalizeMediaItem} from '../../utils/seerrHomeRows';
import {hydrateWatchlistItems, watchlistBackdrops} from '../../utils/seerrHydration';
import {seerrCardId} from '../../utils/seerrTarget';

import {
	ALL_FAVORITE_TABS, FAVORITE_TABS, FAVORITE_TAB_FIELDS, FAVORITE_TAB_PAGE_SIZE, FAVORITE_TAB_TYPES, WATCHLIST_TAB, bucketByTab,
	swapRequestCard, visibleTabs, watchlistCards, withRequestDetail, withWatchlistBackdrops
} from './favoriteTabs';

const emptyBuckets = () => {
	const buckets = {};
	ALL_FAVORITE_TABS.forEach((tab) => { buckets[tab.key] = []; });
	return buckets;
};

const emptyCounts = () => {
	const counts = {};
	ALL_FAVORITE_TABS.forEach((tab) => { counts[tab.key] = 0; });
	return counts;
};

// Silo's own watchlist of library titles, read whole, 200 at a time.
const SILO_WATCHLIST_PAGE = 200;
const SILO_WATCHLIST_MAX = 1000;
const readSiloWatchlist = async (api) => {
	const items = [];
	for (let start = 0; start < SILO_WATCHLIST_MAX; start += SILO_WATCHLIST_PAGE) {
		const result = await api.getItems({
			Recursive: true,
			Filters: 'IsInWatchlist',
			IncludeItemTypes: 'Movie,Series',
			StartIndex: start,
			Limit: SILO_WATCHLIST_PAGE,
			Fields: FAVORITE_TAB_FIELDS
		});
		const page = result?.Items || [];
		items.push(...page);
		if (page.length < SILO_WATCHLIST_PAGE) break;
	}
	return items;
};

// Request cards past those read so far, so the tab's count says how many there are to page through.
const unreadRequests = (body) => Math.max(0, (body?.totalResults || 0) - (body?.results?.length || 0));

// Silo's watchlist lists each title's age rating, so its cards go through the parental filter right away,
// and one with no rating stays out while any rating is blocked.
const requestCardsOf = (items) => withoutBlockedOrUnrated(items.map((item) => (
	item.contentRating ? {...normalizeMediaItem(item), OfficialRating: item.contentRating} : normalizeMediaItem(item)
)), getActiveParentalFilter());

// Each detail read waits out its own request, so no more than this many hold the server's connections at
// once and the rest stay free for the screen.
const DETAIL_READS = 3;

/**
 * `serverType` and `requestsReady` (signed in to Seerr, or to Silo's own requests) decide what the
 * watchlist tab can show.
 */
const useFavoriteTabs = ({api, sortBy, sortOrder, unifiedMode, enabled = true, serverType = null, requestsReady = false}) => {
	const [itemsByKey, setItemsByKey] = useState(emptyBuckets);
	const [countsByKey, setCountsByKey] = useState(emptyCounts);
	const [isLoading, setIsLoading] = useState(true);

	// A sort change starts a fresh load while the last one may still be in flight,
	// so a stale response is thrown away rather than landing on top of the new list.
	const loadIdRef = useRef(0);
	const pagingRef = useRef({});
	// How far into each tab the server has been read. Paging from what's on screen instead would
	// ask again for rows the ratings filter dropped.
	const fetchedRef = useRef({});
	const countsRef = useRef(countsByKey);
	countsRef.current = countsByKey;
	// The requests watchlist pages by page number, and the last one read.
	const watchlistRef = useRef({page: 0, totalPages: 0, loading: false});

	// The watchlist's titles carry no backdrop or runtime, so each request card reads its title's detail
	// once the row is up, and is swapped in as soon as its own arrives. A reload replaces [state], which
	// drops the reads still waiting, and a failed read leaves the card as it was.
	const fillRequestCards = useCallback((cards, state) => mapBounded(cards, DETAIL_READS, async (card) => {
		if (watchlistRef.current !== state) return;
		const {mediaId, mediaType} = card._seerrRaw || {};
		const details = await (mediaType === 'tv' ? getTv(mediaId) : getMovie(mediaId)).catch(() => null);
		if (!details || watchlistRef.current !== state) return;
		const filled = withRequestDetail(card, details, normalizeMediaItem({...details, mediaType}));
		const blocked = withoutBlockedItems([filled]).length === 0;
		setItemsByKey((prev) => ({...prev, [WATCHLIST_TAB.key]: swapRequestCard(prev[WATCHLIST_TAB.key], filled, blocked)}));
	}), []);

	useEffect(() => {
		if (!enabled || !api) return undefined;

		const loadId = ++loadIdRef.current;
		let cancelled = false;
		pagingRef.current = {};
		fetchedRef.current = {};
		setIsLoading(true);

		const run = async () => {
			try {
				if (unifiedMode) {
					const all = await connectionPool.getFavoritesFromAllServers({
						includeItemTypes: FAVORITE_TAB_TYPES,
						fields: FAVORITE_TAB_FIELDS
					});
					if (cancelled || loadId !== loadIdRef.current) return;
					const pooled = bucketByTab(all);
					const pooledCounts = {};
					FAVORITE_TABS.forEach((tab) => { pooledCounts[tab.key] = pooled[tab.key].length; });
					setItemsByKey(pooled);
					setCountsByKey(pooledCounts);
					return;
				}

				const results = await Promise.all(FAVORITE_TABS.map(async (tab) => {
					try {
						return await api.getItems({
							Recursive: true,
							Filters: 'IsFavorite',
							IncludeItemTypes: tab.types,
							SortBy: sortBy,
							SortOrder: sortOrder,
							StartIndex: 0,
							Limit: FAVORITE_TAB_PAGE_SIZE,
							EnableTotalRecordCount: true,
							Fields: FAVORITE_TAB_FIELDS
						});
					} catch (err) {
						// One type failing leaves the other eight worth showing.
						console.error(`Failed to load ${tab.key} favorites:`, err);
						return null;
					}
				}));

				if (cancelled || loadId !== loadIdRef.current) return;

				const buckets = emptyBuckets();
				const counts = emptyCounts();
				FAVORITE_TABS.forEach((tab, index) => {
					const result = results[index];
					const fetched = result?.Items || [];
					fetchedRef.current[tab.key] = fetched.length;
					buckets[tab.key] = withoutBlockedItems(fetched);
					counts[tab.key] = result?.TotalRecordCount || fetched.length;
				});
				// The watchlist loads on its own, so a favorites reload keeps what it has.
				setItemsByKey((prev) => ({...buckets, [WATCHLIST_TAB.key]: prev[WATCHLIST_TAB.key] || []}));
				setCountsByKey((prev) => ({...counts, [WATCHLIST_TAB.key]: prev[WATCHLIST_TAB.key] || 0}));
			} finally {
				if (!cancelled && loadId === loadIdRef.current) setIsLoading(false);
			}
		};

		run();

		return () => { cancelled = true; };
	}, [api, sortBy, sortOrder, unifiedMode, enabled]);

	// The watchlist, apart from the favorites since it reads from the requests service too, which on Silo
	// is only ready once the signed in profile is.
	useEffect(() => {
		const clear = () => {
			watchlistRef.current = {page: 0, totalPages: 0, loading: false};
			setItemsByKey((prev) => ({...prev, [WATCHLIST_TAB.key]: []}));
			setCountsByKey((prev) => ({...prev, [WATCHLIST_TAB.key]: 0}));
		};
		if (!enabled || !api || unifiedMode) {
			clear();
			return undefined;
		}
		let cancelled = false;
		const run = async () => {
			const [library, first] = await Promise.all([
				serverType === 'silo' ? readSiloWatchlist(api).catch((err) => {
					console.error('Failed to load the Silo watchlist:', err);
					return [];
				}) : [],
				requestsReady ? getWatchlist(1).catch((err) => {
					console.error('Failed to load the requests watchlist:', err);
					return null;
				}) : null
			]);
			const requestCards = requestCardsOf(await hydrateWatchlistItems(first?.results || []));
			if (cancelled) return;
			const state = {page: first?.page || 0, totalPages: first?.totalPages || 0, loading: false};
			watchlistRef.current = state;
			const cards = watchlistCards(withoutBlockedItems(library), requestCards);
			setItemsByKey((prev) => ({...prev, [WATCHLIST_TAB.key]: cards}));
			setCountsByKey((prev) => ({...prev, [WATCHLIST_TAB.key]: cards.length + unreadRequests(first)}));
			fillRequestCards(cards.filter((card) => card._seerr), state);
			// The backdrops come once the row is up, since each takes a details request of its own. Silo's
			// watchlist is a single page, so the pages after this one need none.
			const shown = new Set(cards.map((card) => card.Id));
			const kept = (first?.results || []).filter((item) => shown.has(seerrCardId(item.mediaType, item.id)));
			const backdrops = await watchlistBackdrops(kept).catch((err) => {
				console.error('Failed to read the watchlist backdrops:', err);
				return new Map();
			});
			if (cancelled || backdrops.size === 0) return;
			setItemsByKey((prev) => ({...prev, [WATCHLIST_TAB.key]: withWatchlistBackdrops(prev[WATCHLIST_TAB.key], backdrops)}));
		};
		run().catch((err) => console.error('Failed to load the watchlist:', err));
		return () => {
			cancelled = true;
			// Drops the detail reads this load still has waiting.
			watchlistRef.current = {page: 0, totalPages: 0, loading: false};
		};
	}, [api, serverType, requestsReady, unifiedMode, enabled, fillRequestCards]);

	const loadMoreWatchlist = useCallback(async () => {
		const state = watchlistRef.current;
		if (!requestsReady || state.loading || state.page === 0 || state.page >= state.totalPages) return;
		state.loading = true;
		try {
			const body = await getWatchlist(state.page + 1);
			const cards = requestCardsOf(await hydrateWatchlistItems(body?.results || []));
			if (watchlistRef.current !== state) return;
			state.page = body?.page || state.page + 1;
			if (cards.length === 0) {
				state.totalPages = state.page;
				return;
			}
			setItemsByKey((prev) => ({...prev, [WATCHLIST_TAB.key]: watchlistCards(prev[WATCHLIST_TAB.key], cards)}));
			fillRequestCards(cards, state);
		} catch (err) {
			console.error('Failed to load more of the watchlist:', err);
		} finally {
			state.loading = false;
		}
	}, [requestsReady, fillRequestCards]);

	// The next page of one tab, asked for as its grid runs out. Multi server mode
	// already has everything in hand.
	const loadMore = useCallback(async (key) => {
		if (key === WATCHLIST_TAB.key) {
			loadMoreWatchlist();
			return;
		}
		if (unifiedMode || !api || !key) return;

		const loaded = fetchedRef.current[key] || 0;
		if (pagingRef.current[key] || loaded === 0) return;
		// The grid asks for more every time it settles, so a tab that is already all
		// here says so rather than asking the server again for nothing.
		if (loaded >= (countsRef.current[key] || 0)) return;

		const tab = FAVORITE_TABS.find((entry) => entry.key === key);
		if (!tab) return;

		pagingRef.current[key] = true;
		const loadId = loadIdRef.current;

		try {
			const result = await api.getItems({
				Recursive: true,
				Filters: 'IsFavorite',
				IncludeItemTypes: tab.types,
				SortBy: sortBy,
				SortOrder: sortOrder,
				StartIndex: loaded,
				Limit: FAVORITE_TAB_PAGE_SIZE,
				EnableTotalRecordCount: true,
				Fields: FAVORITE_TAB_FIELDS
			});

			if (loadId !== loadIdRef.current) return;

			const fetched = result?.Items || [];
			if (fetched.length === 0) return;
			fetchedRef.current[key] = loaded + fetched.length;

			const more = withoutBlockedItems(fetched);
			if (more.length === 0) return;
			setItemsByKey((prev) => ({...prev, [key]: [...(prev[key] || []), ...more]}));
		} catch (err) {
			console.error(`Failed to load more ${key} favorites:`, err);
		} finally {
			pagingRef.current[key] = false;
		}
	}, [api, sortBy, sortOrder, unifiedMode, loadMoreWatchlist]);

	const tabs = visibleTabs(itemsByKey);
	const totalCount = FAVORITE_TABS.reduce((sum, tab) => sum + (countsByKey[tab.key] || 0), 0);

	return {tabs, itemsByKey, countsByKey, totalCount, isLoading, loadMore};
};

export default useFavoriteTabs;
