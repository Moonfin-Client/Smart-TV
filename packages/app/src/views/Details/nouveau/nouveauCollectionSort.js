import $L from '@enact/i18n/$L';

import {compareReleaseAscending} from '../collectionPlaylist';

// How a collection's contents are ordered. The server's own order is what Jellyfin's web client
// shows, so it is the one everything falls back to.

export const SORT_SERVER = 'server';
export const SORT_ALPHABETICAL = 'alphabetical';
export const SORT_RELEASE_ASCENDING = 'releaseAscending';
export const SORT_RELEASE_DESCENDING = 'releaseDescending';
export const SORT_CUSTOM = 'custom';

export const DEFAULT_SORT = SORT_SERVER;

// The custom option is named for the order it keeps rather than for any gesture, since a remote
// has none to offer.
export const sortLabel = (option) => {
	if (option === SORT_ALPHABETICAL) return $L('Alphabetical');
	if (option === SORT_RELEASE_ASCENDING) return $L('Release Order (Ascending)');
	if (option === SORT_RELEASE_DESCENDING) return $L('Release Order (Descending)');
	if (option === SORT_CUSTOM) return $L('Custom Order');
	return $L('Server Order');
};

export const collectionSortOptions = () => [
	SORT_SERVER,
	SORT_RELEASE_ASCENDING,
	SORT_RELEASE_DESCENDING,
	SORT_ALPHABETICAL,
	SORT_CUSTOM
].map((id) => ({id, label: sortLabel(id)}));

const byName = (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase());

const uniqueIds = (ids) => [...new Set(ids)];

// Puts a whole collection's index entries in one of the fixed orders and hands back their ids.
export const orderCollectionIndex = (entries = [], option = DEFAULT_SORT) => {
	let sorted = entries;
	if (option === SORT_ALPHABETICAL) sorted = [...entries].sort(byName);
	if (option === SORT_RELEASE_ASCENDING) sorted = [...entries].sort(compareReleaseAscending);
	if (option === SORT_RELEASE_DESCENDING) sorted = [...entries].sort((a, b) => compareReleaseAscending(b, a));
	return uniqueIds(sorted.map((entry) => entry.id));
};

// A saved order still needs the scan to find members added since it was saved. They go on the end
// in release order so they aren't lost.
export const mergeSavedOrder = (saved = [], entries = []) => {
	const listed = new Set(saved);
	const added = entries.filter((entry) => !listed.has(entry.id)).sort(compareReleaseAscending);
	return uniqueIds([...saved, ...added.map((entry) => entry.id)]);
};
