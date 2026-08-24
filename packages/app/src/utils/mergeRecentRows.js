// One home row per library type instead of one per library. A title held in two
// libraries, or on two servers, is kept once, and the newest date wins the
// ordering across them.

import $L from '@enact/i18n/$L';
import {getDeduplicationKey} from './mediaDedup';

const MERGED_ROW_LIMIT = 16;

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
// ordered by the given date field with undated items last.
export const mergeRecentRows = (entries, dateField) => {
	const byType = new Map();
	for (let i = 0; i < entries.length; i++) {
		const collectionType = (entries[i].lib?.CollectionType || '').toLowerCase();
		let group = byType.get(collectionType);
		if (!group) {
			group = {seen: new Set(), items: []};
			byType.set(collectionType, group);
		}
		const items = entries[i].items || [];
		for (let j = 0; j < items.length; j++) {
			const item = items[j];
			if (!item) continue;
			const key = getDeduplicationKey(item);
			if (group.seen.has(key)) continue;
			group.seen.add(key);
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
		rows.push({
			collectionType,
			cardType: collectionType === 'music' ? 'square' : 'portrait',
			items: group.items.slice(0, MERGED_ROW_LIMIT)
		});
	});
	return rows;
};
