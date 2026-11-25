import {HOME_ROW_ITEM_FIELDS} from '../services/jellyfinApi.js';
import {withoutBlockedItems} from '../services/parentalControls.js';
import {collapseLatestTvItems} from './latestMediaRowNormalizer.js';

// Enough to hold a whole collection laid out flat, which a stored order is sorted against.
const FLAT_COLLECTION_LIMIT = 500;

// Replaces each series with its episodes for the collection rows that asked for
// it, keeping movies and anything else where they were.
const expandSeriesToEpisodes = async (api, items, limit) => {
	const expanded = await Promise.all(items.map(async (item) => {
		if (item?.Type !== 'Series') return [item];
		try {
			const result = await api.getItems({
				ParentId: item.Id,
				IncludeItemTypes: 'Episode',
				Recursive: true,
				SortBy: 'ParentIndexNumber,IndexNumber',
				SortOrder: 'Ascending',
				Limit: limit,
				Fields: HOME_ROW_ITEM_FIELDS
			});
			const episodes = result?.Items || [];
			if (!episodes.length) return [item];
			// Not a fallback to the series card, or a blocked series would come back as one.
			return withoutBlockedItems(episodes, item.OfficialRating);
		} catch (_error) {
			return [item];
		}
	}));
	return [].concat(...expanded).slice(0, limit);
};

// Anything the order leaves out keeps the server's order after the rest. The index breaks ties
// because the older TV engines don't sort stably.
const arrangeByStoredOrder = (items, order) => {
	const position = new Map(order.map((id, index) => [id, index]));
	return items
		.map((item, index) => ({item, index, at: position.has(item.Id) ? position.get(item.Id) : order.length}))
		.sort((a, b) => a.at - b.at || a.index - b.index)
		.map(({item}) => item);
};

// Only the collection's own members come back, since asking recursively brings every season and
// episode under them along too. A stored Playlist Order lists movies and episodes instead, so with
// one the playable items are read flat, arranged by it and folded back into series cards unless
// episodes were asked for.
export const loadCollectionRowItems = async (api, collectionId, {limit, usePlaylistOrder, sortBy, sortOrder, showEpisodes}) => {
	const order = usePlaylistOrder ? await api.getCollectionOrder(collectionId).catch(() => null) : null;
	if (Array.isArray(order) && order.length) {
		const flat = await api.getItems({
			ParentId: collectionId,
			Recursive: true,
			Limit: FLAT_COLLECTION_LIMIT,
			Fields: HOME_ROW_ITEM_FIELDS
		});
		// The series and seasons come back too, since the server ignores IsFolder on a collection.
		// Episodes rarely carry a rating of their own, so they're judged by their series where it came
		// along, or a blocked series would slip through as its episodes or as a card built from one.
		const items = flat?.Items || [];
		const seriesRatings = new Map(items.filter((item) => item.Type === 'Series').map((series) => [series.Id, series.OfficialRating]));
		const playable = items.filter((item) => !item.IsFolder && withoutBlockedItems([item], seriesRatings.get(item.SeriesId)).length);
		const arranged = arrangeByStoredOrder(playable, order);
		return (showEpisodes ? arranged : collapseLatestTvItems(arranged)).slice(0, limit);
	}

	const result = await api.getItems({
		ParentId: collectionId,
		SortBy: usePlaylistOrder ? null : sortBy,
		SortOrder: usePlaylistOrder ? null : sortOrder,
		Limit: limit,
		Fields: HOME_ROW_ITEM_FIELDS
	});
	const members = result?.Items || [];
	return showEpisodes ? expandSeriesToEpisodes(api, members, limit) : members;
};
