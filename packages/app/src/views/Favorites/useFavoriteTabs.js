// Loads the favorites behind the tabbed view, one request per type, fired together.

import {useCallback, useEffect, useRef, useState} from 'react';

import * as connectionPool from '../../services/connectionPool';

import {FAVORITE_TABS, FAVORITE_TAB_FIELDS, FAVORITE_TAB_PAGE_SIZE, FAVORITE_TAB_TYPES, bucketByTab, visibleTabs} from './favoriteTabs';

const emptyBuckets = () => {
	const buckets = {};
	FAVORITE_TABS.forEach((tab) => { buckets[tab.key] = []; });
	return buckets;
};

const emptyCounts = () => {
	const counts = {};
	FAVORITE_TABS.forEach((tab) => { counts[tab.key] = 0; });
	return counts;
};

const useFavoriteTabs = ({api, sortBy, sortOrder, unifiedMode, enabled = true}) => {
	const [itemsByKey, setItemsByKey] = useState(emptyBuckets);
	const [countsByKey, setCountsByKey] = useState(emptyCounts);
	const [isLoading, setIsLoading] = useState(true);

	// A sort change starts a fresh load while the last one may still be in flight,
	// so a stale response is thrown away rather than landing on top of the new list.
	const loadIdRef = useRef(0);
	const pagingRef = useRef({});
	const itemsRef = useRef(itemsByKey);
	itemsRef.current = itemsByKey;
	const countsRef = useRef(countsByKey);
	countsRef.current = countsByKey;

	useEffect(() => {
		if (!enabled || !api) return undefined;

		const loadId = ++loadIdRef.current;
		let cancelled = false;
		pagingRef.current = {};
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
					buckets[tab.key] = result?.Items || [];
					counts[tab.key] = result?.TotalRecordCount || buckets[tab.key].length;
				});
				setItemsByKey(buckets);
				setCountsByKey(counts);
			} finally {
				if (!cancelled && loadId === loadIdRef.current) setIsLoading(false);
			}
		};

		run();

		return () => { cancelled = true; };
	}, [api, sortBy, sortOrder, unifiedMode, enabled]);

	// The next page of one tab, asked for as its grid runs out. Multi server mode
	// already has everything in hand.
	const loadMore = useCallback(async (key) => {
		if (unifiedMode || !api || !key) return;

		const loaded = itemsRef.current[key]?.length || 0;
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

			const more = result?.Items || [];
			if (more.length === 0) return;

			setItemsByKey((prev) => ({...prev, [key]: [...(prev[key] || []), ...more]}));
		} catch (err) {
			console.error(`Failed to load more ${key} favorites:`, err);
		} finally {
			pagingRef.current[key] = false;
		}
	}, [api, sortBy, sortOrder, unifiedMode]);

	const tabs = visibleTabs(itemsByKey);
	const totalCount = FAVORITE_TABS.reduce((sum, tab) => sum + (countsByKey[tab.key] || 0), 0);

	return {tabs, itemsByKey, countsByKey, totalCount, isLoading, loadMore};
};

export default useFavoriteTabs;
