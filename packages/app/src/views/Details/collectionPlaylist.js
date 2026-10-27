// A collection played in order, which means every movie in it plus every episode of every
// series in it, flattened into one list.
//
// Only a small entry per title is held, enough to put the list in any order without asking the
// server again. The items themselves are read a page at a time, so a collection of any size
// settles at a few KB until the viewer scrolls.

// How much of a collection is walked looking for members.
const INDEX_SCAN_LIMIT = 2000;

// How many series are asked for their episodes at once. All of them together would open as
// many sockets as the collection has shows.
const INDEX_SCAN_BATCH = 8;

const PAGE_SIZE = 50;

const PLAYABLE_TYPES = new Set(['Movie', 'Episode', 'Audio', 'Video', 'MusicVideo']);

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

// The by-id endpoint answers in whatever order it likes, so the page is put back into the
// order it was asked for.
export const orderItemsByIds = (items = [], ids = []) => {
	const rank = new Map(ids.map((id, i) => [id, i]));
	return [...items].sort((a, b) => (rank.get(a.Id) ?? ids.length) - (rank.get(b.Id) ?? ids.length));
};

// Walks the collection once and returns an entry for everything playable in it, in the order the
// server lists them with each series' episodes in its place.
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
	const members = data?.Items || [];
	const series = members.filter((item) => item?.Type === 'Series');

	const episodes = new Map();
	for (let i = 0; i < series.length; i += INDEX_SCAN_BATCH) {
		const batch = series.slice(i, i + INDEX_SCAN_BATCH);
		// eslint-disable-next-line no-await-in-loop
		const lists = await Promise.all(batch.map((show) => api.getEpisodes(show.Id).catch(() => null)));
		batch.forEach((show, j) => episodes.set(show.Id, lists[j]?.Items || []));
	}

	// An episode filed on its own and again through its series plays once.
	const seen = new Set();
	return members.flatMap((item) => {
		if (item?.Type === 'Series') return episodes.get(item.Id);
		return PLAYABLE_TYPES.has(item?.Type) ? [item] : [];
	}).filter((item) => !seen.has(item.Id) && seen.add(item.Id)).map(indexEntryFor);
};

// What a collection's playlist shows. Until the playlist has items, that's the collection's own
// playable members.
export const collectionPlaylistItems = (playlistItems = [], collectionItems = []) => (
	playlistItems.length ? playlistItems : collectionItems.filter((item) => PLAYABLE_TYPES.has(item?.Type))
);

// Moves a loaded row and gives back the whole new order. The loaded rows take the head of it in
// their new order and the rest keep theirs, matched on id since a page can come back short.
export const moveInCollection = (loaded = [], index = [], from, to) => {
	if (from < 0 || from >= loaded.length || to < 0 || to >= loaded.length) return null;
	const items = [...loaded];
	items.splice(to, 0, items.splice(from, 1)[0]);
	const loadedIds = items.map((item) => item.Id);
	const placed = new Set(loadedIds);
	return {items, order: [...loadedIds, ...index.filter((id) => !placed.has(id))]};
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
