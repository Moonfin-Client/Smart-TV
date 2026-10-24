import $L from '@enact/i18n/$L';

import {compareReleaseAscending, indexEntryFor, orderItemsByIds} from './collectionPlaylist';

// How a collection's contents are ordered.
export const SORT_SERVER = 'server';
export const SORT_ALPHABETICAL = 'alphabetical';
export const SORT_RELEASE_ASCENDING = 'releaseAscending';
export const SORT_RELEASE_DESCENDING = 'releaseDescending';
export const SORT_CUSTOM = 'custom';

export const DEFAULT_SORT = SORT_RELEASE_ASCENDING;

export const sortLabel = (option) => {
	if (option === SORT_ALPHABETICAL) return $L('Alphabetical');
	if (option === SORT_RELEASE_ASCENDING) return $L('Release Order (Ascending)');
	if (option === SORT_RELEASE_DESCENDING) return $L('Release Order (Descending)');
	if (option === SORT_CUSTOM) return $L('Custom Order');
	return $L('Server Order');
};

export const collectionSortOptions = (canReorder = false) => [
	SORT_SERVER,
	SORT_RELEASE_ASCENDING,
	SORT_RELEASE_DESCENDING,
	SORT_ALPHABETICAL,
	...(canReorder ? [SORT_CUSTOM] : [])
].map((id) => ({id, label: sortLabel(id)}));

const byName = (a, b) => String(a?.Name || '').toLowerCase().localeCompare(String(b?.Name || '').toLowerCase());

const byRelease = (a, b) => compareReleaseAscending(indexEntryFor(a), indexEntryFor(b));

export const applyCollectionSort = (items = [], option = DEFAULT_SORT, customOrder = []) => {
	if (option === SORT_CUSTOM && customOrder.length) {
		const customSet = new Set(customOrder);
		const remaining = items.filter((item) => !customSet.has(item?.Id)).sort(byRelease);
		const orderedCustom = orderItemsByIds(items.filter((item) => customSet.has(item?.Id)), customOrder);
		return [...orderedCustom, ...remaining];
	}
	if (option === SORT_ALPHABETICAL) return [...items].sort(byName);
	if (option === SORT_RELEASE_ASCENDING) return [...items].sort(byRelease);
	if (option === SORT_RELEASE_DESCENDING) return [...items].sort((a, b) => byRelease(b, a));
	return items;
};
