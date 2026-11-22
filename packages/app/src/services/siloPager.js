// Offset paging over Silo's cursors. The app asks for a start index and a count; Silo pages by `cursor` (the next
// page) and, where a list offers one, a `window_cursor` that can `seek` straight to an offset. Pages are kept per
// query, so scrolling a grid walks forward without asking again.
//
// A cursor is bound to the page size, so every request asks for the same `limit`.

export const SILO_MAX_PAGE_SIZE = 200;

export const siloPage = (json) => {
	const page = json?.page || {};
	return {
		items: Array.isArray(json?.items) ? json.items.filter((i) => i && typeof i === 'object') : [],
		nextCursor: typeof page.next_cursor === 'string' && page.next_cursor ? page.next_cursor : null,
		windowCursor: typeof json?.window_cursor === 'string' && json.window_cursor ? json.window_cursor : null,
		hasMore: page.has_more === true,
		total: typeof json?.total === 'number' ? Math.trunc(json.total) : null,
		totalExact: json?.total_exact === true
	};
};

// The query a page belongs to, without the paging itself.
export const siloPageSignature = (path, params) => {
	const kept = {};
	Object.keys(params).sort().forEach((key) => {
		const value = params[key];
		if (['cursor', 'seek', 'limit'].includes(key) || value == null || value === '' || (Array.isArray(value) && !value.length)) return;
		kept[key] = Array.isArray(value) ? value.map(String) : String(value);
	});
	return `${path}?${JSON.stringify(kept)}`;
};

// Silo refuses a cursor that expired or no longer fits the query with a 400 or 422 naming the cursor.
export const isInvalidCursorError = (err) => {
	if (err?.status !== 400 && err?.status !== 422) return false;
	if (String(err.code || '').toLowerCase().includes('cursor')) return true;
	return (err.problem?.errors || []).some((e) => /\.(cursor|seek)$/i.test(String(e?.location || '')));
};

const newState = (keep) => ({
	keep,
	started: false,
	windowCursor: null,
	nextCursor: null,
	nextStart: 0,
	total: null,
	totalExact: false,
	knownEnd: null,
	pages: [],
	add (at, page) {
		this.started = true;
		this.windowCursor = page.windowCursor || this.windowCursor;
		if (page.total != null) {
			this.total = page.total;
			this.totalExact = page.totalExact;
			if (page.totalExact) this.knownEnd = page.total;
		}
		const end = at + page.items.length;
		if (!page.hasMore) this.knownEnd = end;
		if (end >= this.nextStart || this.nextCursor == null) {
			this.nextCursor = page.hasMore ? page.nextCursor : null;
			this.nextStart = end;
		}
		this.pages = this.pages.filter((p) => p.start !== at).concat([{start: at, items: page.items}]);
		while (this.pages.length > this.keep) this.pages.shift();
	},
	fetchedAt (pos) {
		return this.pages.some((p) => p.start === pos);
	},
	itemsAt (pos, count) {
		for (let i = this.pages.length - 1; i >= 0; i--) {
			const p = this.pages[i];
			const offset = pos - p.start;
			if (offset >= 0 && offset < p.items.length) return p.items.slice(offset, Math.min(offset + count, p.items.length));
		}
		return [];
	},
	totalFor (seenEnd) {
		if (this.total != null && this.totalExact) return this.total;
		if (this.knownEnd != null) return this.knownEnd;
		if (this.total != null) return this.total < seenEnd ? seenEnd + 1 : this.total;
		return this.nextCursor != null ? seenEnd + 1 : seenEnd;
	}
});

export const createSiloPager = ({maxEntries = 32, pageSize = 100, parallelRequests = 4, keptPages = 8} = {}) => {
	// Insertion order is recency: a query read again moves to the end.
	const states = new Map();

	const seek = async (state, windowCursor, pos, end, fetchPage) => {
		const offsets = [];
		for (let at = pos; at < end && offsets.length < parallelRequests; at += pageSize) {
			if (state.knownEnd != null && at >= state.knownEnd) break;
			offsets.push(at);
		}
		const pages = await Promise.all(offsets.map((at) => fetchPage({cursor: windowCursor, seek: at, limit: pageSize})));
		pages.forEach((page, i) => state.add(offsets[i], page));
	};

	const read = async (signature, start, wanted, fetchPage) => {
		let state = states.get(signature) || newState(keptPages);
		states.delete(signature);
		states.set(signature, state);
		while (states.size > maxEntries) states.delete(states.keys().next().value);
		const end = start + wanted;
		const items = [];
		let pos = start;
		while (pos < end) {
			if (state.knownEnd != null && pos >= state.knownEnd) break;
			const kept = state.itemsAt(pos, end - pos);
			if (kept.length) {
				items.push(...kept);
				pos += kept.length;
				continue;
			}
			if (pos === 0) {
				// eslint-disable-next-line no-await-in-loop
				state.add(0, await fetchPage({limit: pageSize}));
			} else if (state.nextStart === pos && state.nextCursor != null && (end - pos <= pageSize || state.windowCursor == null)) {
				// eslint-disable-next-line no-await-in-loop
				state.add(pos, await fetchPage({cursor: state.nextCursor, limit: pageSize}));
			} else if (state.windowCursor) {
				// eslint-disable-next-line no-await-in-loop
				await seek(state, state.windowCursor, pos, end, fetchPage);
			} else if (!state.started) {
				// eslint-disable-next-line no-await-in-loop
				state.add(0, await fetchPage({limit: pageSize}));
			} else if (state.nextCursor != null && state.nextStart < pos) {
				// No window to seek with: walk forward a page at a time.
				const from = state.nextStart;
				// eslint-disable-next-line no-await-in-loop
				const walked = await fetchPage({cursor: state.nextCursor, limit: pageSize});
				state.add(from, walked);
				if (!walked.items.length) {
					if (state.knownEnd == null) state.knownEnd = from;
					break;
				}
			} else if (pos < state.nextStart) {
				// Behind what's kept, with no way back: start the query over.
				state = newState(keptPages);
				states.set(signature, state);
				return read(signature, start, wanted, fetchPage);
			} else {
				if (state.knownEnd == null) state.knownEnd = pos;
				break;
			}
			if (state.fetchedAt(pos) && !state.itemsAt(pos, 1).length) {
				if (state.knownEnd == null) state.knownEnd = pos;
				break;
			}
		}
		return {items, totalRecordCount: state.totalFor(start + items.length)};
	};

	return {
		page: async ({signature, startIndex, limit, fetch: fetchPage}) => {
			const start = startIndex > 0 ? startIndex : 0;
			const wanted = limit > 0 ? limit : 50;
			try {
				return await read(signature, start, wanted, fetchPage);
			} catch (err) {
				if (!isInvalidCursorError(err)) throw err;
				states.delete(signature);
				return read(signature, start, wanted, fetchPage);
			}
		},
		clear: () => states.clear()
	};
};
