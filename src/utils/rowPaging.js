// Home rows load more cards as focus nears their end. A pageable row carries `readHead(limit)`,
// which reads the first `limit` items of the row's list. Each page asks for a longer head rather
// than an offset, since Recently Added has no start index and a row scoped to the visible
// libraries is merged from one search per library, so neither has a single offset to resume from.

export const ROW_PAGE_SIZE = 15;
export const ROW_MAX_ITEMS = 100;
// How many cards from a row's end focus asks for the next page, unless the row says otherwise.
const ROW_PAGE_AHEAD = 5;

export const nearRowEnd = (index, length, ahead = ROW_PAGE_AHEAD) => index >= 0 && index >= length - ahead;

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

export const nextHeadLength = (row) => Math.min((row.items?.length || 0) + ROW_PAGE_SIZE, ROW_MAX_ITEMS);

// Adds the items of a longer head that the row doesn't have yet to its end, leaving the cards
// already drawn as they are. A head that brought nothing new ends the row. `pagedFrom` marks where
// the paged cards begin.
export const extendRow = (row, items, hasMore) => {
	const current = row.items || [];
	const seen = new Set(current.map((item) => item.Id));
	// Items added to the top since the row was read can make a head bring more than a page.
	const added = (items || []).filter((item) => {
		if (!item || seen.has(item.Id)) return false;
		seen.add(item.Id);
		return true;
	}).slice(0, Math.max(0, ROW_MAX_ITEMS - current.length));
	const next = added.length > 0 ? [...current, ...added] : current;
	return {
		...row,
		items: next,
		pagedFrom: row.pagedFrom ?? current.length,
		hasMore: added.length > 0 && next.length < ROW_MAX_ITEMS && hasMore
	};
};

// How far a folded read goes before giving up on finding another card.
const MAX_RAW_READ = ROW_MAX_ITEMS * 2;
// How far a recent row that hides watched titles reads.
export const FULL_ROW_READ = 500;

// Reads a head `limit` cards long from a list whose items fold together, like a show's episodes
// into one series card. Folding can leave a read short of `limit`, so the raw read doubles
// until it has the cards, the list runs out, or it reaches `maxRaw`.
export const readFoldedHead = async (readRaw, fold, limit, rawLimit = limit, maxRaw = MAX_RAW_READ) => {
	let size = Math.min(rawLimit, maxRaw);
	for (;;) {
		const raw = (await readRaw(size)) || [];
		const items = fold(raw);
		const full = raw.length >= size;
		if (items.length >= limit || !full || size >= maxRaw) {
			return {Items: items.slice(0, limit), hasMore: items.length > limit || full};
		}
		size = Math.min(size * 2, maxRaw);
	}
};
