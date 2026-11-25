// How a home row's sort setting turns into the sort order and item types the server wants.
// The settings editor and the home screen both ask, and they have to agree, or the rows the
// editor previews come back in a different order than the ones the home screen draws.

// Playlist order means the arrangement a playlist or collection was curated in, which is what the
// server returns when nothing sorts it. Moonfin Core syncs the value as playlistOrder, so the
// match ignores case.
export const isPlaylistOrder = (sortBy) => (sortBy || '').toLowerCase() === 'playlistorder';

// Playlist order isn't a server sort field, so anywhere that needs a real field falls back to name.
export const apiSortBy = (sortBy) => (isPlaylistOrder(sortBy) ? 'SortName' : sortBy);

// Names read best A to Z and a shuffle has no direction, everything else newest first.
const getSortOrderFromSortBy = (sortBy) => {
	const lower = (sortBy || '').toLowerCase();
	if (lower === 'sortname' || lower === 'name' || lower === 'playlistorder') return 'Ascending';
	if (lower === 'random') return 'Ascending';
	return 'Descending';
};

// A stored direction wins, and auto keeps the derived one above.
export const resolveSortOrder = (sortBy, storedOrder) => {
	if (storedOrder === 'Ascending' || storedOrder === 'Descending') return storedOrder;
	return getSortOrderFromSortBy(sortBy);
};

export const getGenresIncludeTypes = (filter) => {
	if (filter === 'Movie') return 'Movie';
	if (filter === 'Series') return 'Series';
	return 'Movie,Series';
};
