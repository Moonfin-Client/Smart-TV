// Home rows load more cards as focus nears their end, the way Moonfin Core's do. A pageable row
// carries `readHead(limit)`, which reads the first `limit` items of the row's list, and whether
// there may be more behind what it holds. Each page asks for a longer head rather than an
// offset: Recently Added has no start index, and a row scoped to the visible libraries is merged
// from one search per library, so neither has a single offset to resume from.

export const ROW_PAGE_SIZE = 15;
export const ROW_MAX_ITEMS = 100;

// Whether a list read `limit` long may have more behind it. A count the server gave is trusted,
// and without one a full read is taken to mean there's more.
export const moreAfter = (result, limit) => {
	if (limit >= ROW_MAX_ITEMS) return false;
	// A read that can't count, like Recently Added once shows fold into their series, says so itself, and
	// the row keeps going until a page brings nothing new.
	if (typeof result?.hasMore === 'boolean') return result.hasMore;
	const items = result?.Items || [];
	const total = result?.TotalRecordCount;
	if (typeof total === 'number' && total > 0) return total > items.length;
	return items.length >= limit;
};

// A row that can page, given the read that filled it.
export const pageableRow = (row, result, limit, readHead) => ({
	...row,
	readHead,
	hasMore: moreAfter(result, limit)
});

// How long a head the next page asks for.
export const nextHeadLength = (row) => Math.min((row.items?.length || 0) + ROW_PAGE_SIZE, ROW_MAX_ITEMS);

// Adds the items of a longer head that the row doesn't have yet to its end, leaving the cards
// already drawn as they are. A head that brought nothing new ends the row.
export const extendRow = (row, items, hasMore) => {
	const seen = new Set((row.items || []).map((item) => item.Id));
	const added = (items || []).filter((item) => {
		if (!item || seen.has(item.Id)) return false;
		seen.add(item.Id);
		return true;
	});
	return {
		...row,
		items: added.length > 0 ? [...row.items, ...added] : row.items,
		hasMore: added.length > 0 && hasMore
	};
};

// A refreshed row read back as long as the one on screen, so paging in more isn't undone.
export const headLengthFor = (row, fallback) => Math.max(fallback, Math.min(row?.items?.length || 0, ROW_MAX_ITEMS));
