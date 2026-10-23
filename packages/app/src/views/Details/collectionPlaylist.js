// A collection played in order, which means every movie in it plus every episode of every
// series in it, flattened into one list.
//
// Only the keys are held. The items themselves are read a page at a time, so a collection of
// any size settles at a few KB until the viewer scrolls.

// How much of a collection is walked looking for members.
const INDEX_SCAN_LIMIT = 2000;

// How many series are asked for their episodes at once. All of them together would open as
// many sockets as the collection has shows.
const INDEX_SCAN_BATCH = 8;

const PAGE_SIZE = 50;

export const PLAYABLE_TYPES = new Set(['Movie', 'Audio', 'Video', 'MusicVideo', 'Episode']);

// All an entry keeps: enough to sort by, and the id to fetch with.
export const indexEntryFor = (item) => ({
	id: item.Id,
	name: item.Name || '',
	premiereDate: item.PremiereDate || null,
	productionYear: item.ProductionYear || null
});

const releaseKey = (entry) => {
	const date = entry?.premiereDate || entry?.PremiereDate;
	if (date) {
		const parsed = Date.parse(date);
		if (!isNaN(parsed)) return parsed;
	}
	const year = entry?.productionYear || entry?.ProductionYear;
	return year ? Date.UTC(year, 0, 1) : null;
};

// Release order, with the entries carrying no date at all sinking to the bottom and ties
// settled by name.
export const compareReleaseAscending = (a, b) => {
	const aKey = releaseKey(a);
	const bKey = releaseKey(b);
	const aName = (a?.name || a?.Name || '').toLowerCase();
	const bName = (b?.name || b?.Name || '').toLowerCase();
	if (aKey === null && bKey === null) return aName.localeCompare(bName);
	if (aKey === null) return 1;
	if (bKey === null) return -1;
	if (aKey !== bKey) return aKey - bKey;
	return aName.localeCompare(bName);
};

// The by-id endpoint answers in whatever order it likes, so the page is put back into the
// order it was asked for.
export const orderItemsByIds = (items = [], ids = []) => {
	const rank = new Map(ids.map((id, i) => [id, i]));
	return [...items].sort((a, b) => (rank.get(a.Id) ?? ids.length) - (rank.get(b.Id) ?? ids.length));
};

// Walks the collection once and returns the ids of everything playable in it, defaulting to
// release order or custom order when present.
//
// Deliberately not recursive. The scan reads the collection's own members and then asks each
// series for its episodes, so walking the tree here would spend the limit on episodes that
// arrive twice.
export const buildCollectionIndex = async (api, collectionId, options = {}) => {
	const sortBy = options.sortBy || 'releaseAscending';
	const customOrder = (sortBy === 'custom' || sortBy === 'releaseAscending') && typeof api?.getCollectionOrder === 'function'
		? await api.getCollectionOrder(collectionId).catch(() => null)
		: null;

	const data = await api.getItems({
		ParentId: collectionId,
		Limit: INDEX_SCAN_LIMIT,
		Fields: 'BasicSyncInfo,PremiereDate,ProductionYear'
	}).catch(() => null);
	const members = data?.Items || [];
	const series = members.filter((item) => item?.Type === 'Series');

	const episodes = new Map();
	for (let i = 0; i < series.length; i += INDEX_SCAN_BATCH) {
		const batch = series.slice(i, i + INDEX_SCAN_BATCH);
		// eslint-disable-next-line no-await-in-loop
		const lists = await Promise.all(batch.map((show) => api.getEpisodes(show.Id).catch(() => null)));
		batch.forEach((show, j) => episodes.set(show.Id, lists[j]?.Items || []));
	}

	const allItems = members.flatMap((item) => {
		if (item?.Type === 'Series') return episodes.get(item.Id) || [];
		return PLAYABLE_TYPES.has(item?.Type) ? [item] : [];
	});

	// Deduplicate by ID preserving first occurrence
	const seenIds = new Set();
	const uniqueItems = [];
	for (const item of allItems) {
		if (item?.Id && !seenIds.has(item.Id)) {
			seenIds.add(item.Id);
			uniqueItems.push(item);
		}
	}

	if (Array.isArray(customOrder) && customOrder.length) {
		const customSet = new Set(customOrder);
		const remaining = uniqueItems
			.filter((item) => !customSet.has(item.Id))
			.sort(compareReleaseAscending);
		const remainingIds = remaining.map((item) => item.Id);
		const seen = new Set();
		return [...customOrder, ...remainingIds].filter((id) => {
			if (seen.has(id)) return false;
			seen.add(id);
			return true;
		});
	}

	if (sortBy === 'releaseAscending') {
		return [...uniqueItems].sort(compareReleaseAscending).map((item) => item.Id);
	}

	if (sortBy === 'alphabetical') {
		return [...uniqueItems]
			.sort((a, b) => String(a?.Name || a?.name || '').toLowerCase().localeCompare(String(b?.Name || b?.name || '').toLowerCase()))
			.map((item) => item.Id);
	}

	return uniqueItems.map((item) => item.Id);
};

// Reads the next run of ids. Progress is counted in index positions rather than items
// returned, so an id the server no longer knows about cant stall the list.
export const fetchCollectionPage = async (api, ids = [], fetchedCount = 0) => {
	if (fetchedCount >= ids.length) return {items: [], fetchedCount, hasMore: false};

	const batch = ids.slice(fetchedCount, fetchedCount + PAGE_SIZE);
	const data = await api.getItems({
		Ids: batch.join(','),
		Fields: 'PrimaryImageAspectRatio,BasicSyncInfo,People,Overview'
	}).catch(() => null);

	const next = fetchedCount + batch.length;
	return {
		items: orderItemsByIds(data?.Items || [], batch),
		fetchedCount: next,
		hasMore: next < ids.length
	};
};
