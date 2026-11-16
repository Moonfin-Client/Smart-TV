// One home row per library type instead of one per library. A title held in two
// libraries, or on two servers, is kept once, and the newest date wins the
// ordering across them.

import $L from '@enact/i18n/$L';

import {foldCopies} from './mergedCopies';

const MERGED_ROW_LIMIT = 16;
// How long Home waits on a server for its shows' provider ids before showing the rows without them.
const SERIES_IDS_WAIT_MS = 2000;

export const genericCollectionLabel = (collectionType) => {
	switch (collectionType) {
		case 'movies': return $L('Movies');
		case 'tvshows':
		case 'shows': return $L('TV Shows');
		case 'music': return $L('Music');
		case 'livetv': return $L('Live TV');
		case 'books': return $L('Books');
		case 'audiobooks': return $L('Audiobooks');
		case 'musicvideos': return $L('Music Videos');
		case 'homevideos':
		case 'photos': return $L('Home Videos');
		default:
			return collectionType
				? collectionType.charAt(0).toUpperCase() + collectionType.slice(1)
				: $L('Media');
	}
};

// Takes [{lib, items}] and folds them into one group per collection type,
// ordered by the given date field with undated items last. With foldCopies, as
// merged libraries show it, two servers' copies of a title are one card that
// carries the other copies, the newest one leading.
export const mergeRecentRows = (entries, dateField, {foldCopies: fold = false} = {}) => {
	const byType = new Map();
	for (let i = 0; i < entries.length; i++) {
		const collectionType = (entries[i].lib?.CollectionType || '').toLowerCase();
		let group = byType.get(collectionType);
		if (!group) {
			group = {seen: {}, items: []};
			byType.set(collectionType, group);
		}
		const items = entries[i].items || [];
		for (let j = 0; j < items.length; j++) {
			const item = items[j];
			// Two servers can use the same id, so a folding row knows an item by its server too.
			const key = fold ? `${item?._serverId || ''}|${item?.Id}` : item?.Id;
			if (!item?.Id || group.seen[key]) continue;
			group.seen[key] = true;
			group.items.push(item);
		}
	}

	const rows = [];
	byType.forEach((group, collectionType) => {
		if (!group.items.length) return;
		group.items.sort((a, b) => {
			const da = a[dateField] || '';
			const db = b[dateField] || '';
			if (da === db) return 0;
			if (!da) return 1;
			if (!db) return -1;
			return da < db ? 1 : -1;
		});
		const items = fold ? foldCopies(group.items) : group.items;
		rows.push({
			collectionType,
			cardType: collectionType === 'music' ? 'square' : 'portrait',
			items: items.slice(0, MERGED_ROW_LIMIT)
		});
	});
	return rows;
};

// A show added an episode or a season at a time comes back as that episode or season, and its card is made from it
// without the show's own provider ids, which say which show it is. This reads them from each show's server, so two
// servers' cards of one show can fold. A server that doesn't answer, or not within `waitMs`, leaves its cards as they
// were, so a slow server can't hold back the rows.
export const addSeriesProviderIds = async (entries, apiFor, waitMs = SERIES_IDS_WAIT_MS) => {
	const byServer = new Map();
	(entries || []).forEach(({items}) => (items || []).forEach((item) => {
		if (item?.Type !== 'Series' || !item.Id || Object.keys(item.ProviderIds || {}).length) return;
		const server = item._serverId || '';
		if (!byServer.has(server)) byServer.set(server, {api: apiFor(item), cards: []});
		byServer.get(server).cards.push(item);
	}));
	await Promise.all(Array.from(byServer.values()).map(async ({api, cards}) => {
		if (!api) return;
		const ids = Array.from(new Set(cards.map((card) => card.Id)));
		try {
			let timer = null;
			const tooSlow = new Promise((resolve, reject) => {
				timer = setTimeout(() => reject(new Error(`no answer within ${waitMs}ms`)), waitMs);
			});
			let result;
			try {
				result = await Promise.race([
					api.getItems({Ids: ids.join(','), Fields: 'ProviderIds', Limit: ids.length, EnableTotalRecordCount: false}),
					tooSlow
				]);
			} finally {
				clearTimeout(timer);
			}
			const found = new Map((result?.Items || []).map((series) => [series.Id, series.ProviderIds]));
			cards.forEach((card) => {
				if (found.get(card.Id)) card.ProviderIds = found.get(card.Id);
			});
		} catch (err) {
			console.warn('[mergeRecentRows] Could not read the shows\' provider ids:', err);
		}
	}));
	return entries;
};
