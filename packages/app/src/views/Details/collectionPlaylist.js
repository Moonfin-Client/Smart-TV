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

const PLAYABLE_TYPES = new Set(['Movie', 'Audio', 'Video', 'MusicVideo']);

// Splits a collection's own members into the things that play as they are and the series that
// have to be asked for their episodes.
export const splitCollectionMembers = (items = []) => ({
	playables: items.filter((item) => PLAYABLE_TYPES.has(item?.Type)),
	series: items.filter((item) => item?.Type === 'Series')
});

// All an entry keeps: enough to sort by, and the id to fetch with.
export const indexEntryFor = (item) => ({
	id: item.Id,
	name: item.Name || '',
	premiereDate: item.PremiereDate || null,
	productionYear: item.ProductionYear || null
});

const releaseKey = (entry) => {
	if (entry.premiereDate) {
		const parsed = Date.parse(entry.premiereDate);
		if (!isNaN(parsed)) return parsed;
	}
	return entry.productionYear ? Date.UTC(entry.productionYear, 0, 1) : null;
};

// Release order, with the entries carrying no date at all sinking to the bottom and ties
// settled by name.
export const compareReleaseAscending = (a, b) => {
	const aKey = releaseKey(a);
	const bKey = releaseKey(b);
	if (aKey === null && bKey === null) return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
	if (aKey === null) return 1;
	if (bKey === null) return -1;
	if (aKey !== bKey) return aKey - bKey;
	return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
};

export const sortIndexEntries = (entries = []) => [...entries].sort(compareReleaseAscending);

// The by-id endpoint answers in whatever order it likes, so the page is put back into the
// order it was asked for.
export const orderItemsByIds = (items = [], ids = []) => {
	const rank = new Map(ids.map((id, i) => [id, i]));
	return [...items].sort((a, b) => (rank.get(a.Id) ?? ids.length) - (rank.get(b.Id) ?? ids.length));
};

// Walks the collection once for the id and sort key of everything playable in it.
//
// Deliberately not recursive. The scan reads the collection's own members and then asks each
// series for its episodes, so walking the tree here would spend the limit on episodes that
// arrive twice.
export const buildCollectionIndex = async (api, collectionId) => {
	const data = await api.getItems({
		ParentId: collectionId,
		Limit: INDEX_SCAN_LIMIT,
		Fields: 'BasicSyncInfo'
	}).catch(() => null);
	const {playables, series} = splitCollectionMembers(data?.Items || []);

	const flat = [...playables];
	for (let i = 0; i < series.length; i += INDEX_SCAN_BATCH) {
		const batch = series.slice(i, i + INDEX_SCAN_BATCH);
		// eslint-disable-next-line no-await-in-loop
		const lists = await Promise.all(batch.map((show) => api.getEpisodes(show.Id).catch(() => null)));
		lists.forEach((list) => {
			if (list?.Items) flat.push(...list.Items);
		});
	}

	return sortIndexEntries(flat.map(indexEntryFor));
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
