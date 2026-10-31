// The app pages by start index and count, and Silo by cursor only. A first page brings a next cursor and a window
// cursor, which with seek jumps anywhere in the same result. Silo signs each cursor over the whole query, limit
// included, so every request here asks for the same page size and the app's ranges are cut from the pages kept.

const SILO_PAGE_SIZE = 100;
const PARALLEL_PAGES = 4;
const KEPT_PAGES = 8;
const KEPT_QUERIES = 32;

// Silo refuses an expired or foreign cursor as a 400 or 422 naming the cursor.
export const isInvalidCursor = (error) => (error?.status === 400 || error?.status === 422) &&
	(String(error.code || '').toLowerCase().includes('cursor') ||
		(error.problem?.errors || []).some((e) => /\.(cursor|seek)$/.test(String(e.location || '').toLowerCase())));

const newState = () => ({started: false, windowCursor: null, nextCursor: null, nextStart: 0, total: null, totalExact: false, knownEnd: null, pages: []});

const keep = (state, at, page) => {
	state.started = true;
	if (page.windowCursor) state.windowCursor = page.windowCursor;
	if (page.total != null) {
		state.total = page.total;
		state.totalExact = page.totalExact;
		if (page.totalExact) state.knownEnd = page.total;
	}
	const end = at + page.items.length;
	// A short page doesn't end the list, only Silo saying there's no more does.
	if (!page.hasMore) state.knownEnd = end;
	if (end >= state.nextStart || !state.nextCursor) {
		state.nextCursor = page.hasMore ? page.nextCursor : null;
		state.nextStart = end;
	}
	state.pages = state.pages.filter((p) => p.start !== at).concat({start: at, items: page.items}).slice(-KEPT_PAGES);
};

// An estimate below what has been seen still leaves one more to scroll to.
const totalFor = (state, seenEnd) => {
	if (state.total != null && state.totalExact) return state.total;
	if (state.knownEnd != null) return state.knownEnd;
	if (state.total != null) return state.total < seenEnd ? seenEnd + 1 : state.total;
	return state.nextCursor ? seenEnd + 1 : seenEnd;
};

const keptFrom = (state, pos, count) => {
	for (let i = state.pages.length - 1; i >= 0; i--) {
		const {start, items} = state.pages[i];
		const offset = pos - start;
		if (offset >= 0 && offset < items.length) return items.slice(offset, offset + count);
	}
	return [];
};

export const siloPage = (json) => ({
	items: Array.isArray(json?.items) ? json.items.filter((item) => item && typeof item === 'object') : [],
	nextCursor: json?.page?.next_cursor || null,
	windowCursor: json?.window_cursor || null,
	hasMore: json?.page?.has_more === true,
	total: typeof json?.total === 'number' ? json.total : null,
	totalExact: json?.total_exact === true
});

export const createSiloPager = () => {
	const states = new Map();

	const stateFor = (signature) => {
		const state = states.get(signature) || newState();
		states.delete(signature);
		states.set(signature, state);
		while (states.size > KEPT_QUERIES) states.delete(states.keys().next().value);
		return state;
	};

	const seek = async (state, pos, end, fetchPage) => {
		const offsets = [];
		for (let at = pos; at < end && offsets.length < PARALLEL_PAGES; at += SILO_PAGE_SIZE) {
			if (state.knownEnd != null && at >= state.knownEnd) break;
			offsets.push(at);
		}
		const pages = await Promise.all(offsets.map((at) => fetchPage({cursor: state.windowCursor, seek: at, limit: SILO_PAGE_SIZE})));
		pages.forEach((answer, i) => keep(state, offsets[i], answer));
	};

	const read = async (signature, start, wanted, fetchPage) => {
		let state = stateFor(signature);
		const end = start + wanted;
		const items = [];
		let pos = start;
		while (pos < end) {
			if (state.knownEnd != null && pos >= state.knownEnd) break;
			const kept = keptFrom(state, pos, end - pos);
			if (kept.length) {
				items.push(...kept);
				pos += kept.length;
				continue;
			}
			if (pos === 0 || !state.started) {
				keep(state, 0, await fetchPage({limit: SILO_PAGE_SIZE}));
			} else if (state.nextStart === pos && state.nextCursor && (end - pos <= SILO_PAGE_SIZE || !state.windowCursor)) {
				keep(state, pos, await fetchPage({cursor: state.nextCursor, limit: SILO_PAGE_SIZE}));
			} else if (state.windowCursor) {
				await seek(state, pos, end, fetchPage);
			} else if (state.nextCursor && state.nextStart < pos) {
				// No window cursor to jump with, so the next cursors are walked forward.
				const from = state.nextStart;
				const walked = await fetchPage({cursor: state.nextCursor, limit: SILO_PAGE_SIZE});
				keep(state, from, walked);
				if (!walked.items.length) {
					state.knownEnd = state.knownEnd ?? from;
					break;
				}
			} else if (pos < state.nextStart) {
				// Behind the walk with no way to jump back, so it starts over from the top.
				states.set(signature, newState());
				state = states.get(signature);
			} else {
				state.knownEnd = state.knownEnd ?? pos;
				break;
			}
			// A page that brought nothing here, though Silo claims more, ends the range rather than asking forever.
			if (state.pages.some((p) => p.start === pos) && !keptFrom(state, pos, 1).length) {
				state.knownEnd = state.knownEnd ?? pos;
				break;
			}
		}
		return {items, total: totalFor(state, start + items.length)};
	};

	// Items start to start + limit of one query, fetched with fetchPage({cursor, seek, limit}).
	const page = async ({signature, startIndex = 0, limit, fetchPage}) => {
		const start = Math.max(0, startIndex || 0);
		const wanted = limit > 0 ? limit : 50;
		try {
			return await read(signature, start, wanted, fetchPage);
		} catch (error) {
			// The cursor ran out or the server restarted, so the query starts over once.
			if (!isInvalidCursor(error)) throw error;
			states.delete(signature);
			return read(signature, start, wanted, fetchPage);
		}
	};

	return {page};
};
