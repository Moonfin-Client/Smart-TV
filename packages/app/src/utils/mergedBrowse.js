// Paging through a merged library: every server's library is read a page at a time and the pages are merged into one
// list in the sort's order, taking whichever server's next item comes first.

// One reader per server library, holding what it has read until the merge takes it.
export const createMergedReaders = (sources) => (sources || []).map((source) => ({
	source,
	buffer: [],
	offset: 0,
	total: null,
	done: false,
	failed: false
}));

// How long to wait before each new try of a page a server didn't answer, such as one still waking up. Without them one
// failed request would leave the server out of the list for as long as it stays open.
export const READ_RETRY_DELAYS_MS = [1000, 3000];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithRetries = async (fetchPage, reader, limit, delays) => {
	for (let attempt = 0; ; attempt++) {
		try {
			// eslint-disable-next-line no-await-in-loop
			return await fetchPage(reader.source, reader.offset, limit);
		} catch (err) {
			if (attempt >= delays.length) throw err;
			// eslint-disable-next-line no-await-in-loop
			await wait(delays[attempt]);
		}
	}
};

const readMore = async (reader, fetchPage, limit, delays) => {
	try {
		const result = await fetchWithRetries(fetchPage, reader, limit, delays);
		const raws = (result?.Items || []).filter(Boolean);
		raws.forEach((raw) => {
			// Each item carries its server, since one list holds several servers' items.
			if (raw.Id) reader.buffer.push({...raw, ...reader.source.server});
		});
		reader.offset += raws.length;
		reader.total = typeof result?.TotalRecordCount === 'number' ? result.TotalRecordCount : null;
		// A server can cap its pages below what was asked, so a short page only ends the list when there's no total to go
		// by, or nothing came back at all.
		reader.done = raws.length === 0 || (reader.total != null ? reader.offset >= reader.total : raws.length < limit);
	} catch (err) {
		// The other servers carry on, and this one counts only what it gave.
		reader.done = true;
		reader.failed = true;
		reader.total = reader.offset;
		throw err;
	}
};

// Whether every reader has handed out all it will ever have.
export const mergedReadersDrained = (readers) => (readers || []).every((reader) => reader.done && reader.buffer.length === 0);

// The next `limit` items in `compare`'s order. Every server reads ahead at least a page, so an item only goes out once
// each server's next one is known. A server running low reads a whole page rather than topping up a few items at a
// time. A random order has nothing to compare and takes turns instead. A server that fails is tried again after each of
// `retryDelays` before it's left out. Throws only when every server failed and none has titles left to give.
export const takeMergedPage = async (readers, limit, compare, fetchPage, retryDelays = READ_RETRY_DELAYS_MS) => {
	let failure = null;
	await Promise.all(readers
		.filter((reader) => !reader.done && reader.buffer.length < limit)
		.map((reader) => readMore(reader, fetchPage, limit, retryDelays).catch((err) => {
			failure = err;
		})));
	// Only when nothing is left to give: titles a server already sent still go out though every server failed just now.
	if (failure && readers.every((reader) => reader.failed && reader.buffer.length === 0)) throw failure;

	const page = [];
	let turn = 0;
	while (page.length < limit) {
		if (readers.some((reader) => reader.buffer.length === 0 && !reader.done)) break;
		const ready = readers.filter((reader) => reader.buffer.length > 0);
		if (!ready.length) break;
		const next = compare
			? ready.reduce((a, b) => (compare(a.buffer[0], b.buffer[0]) <= 0 ? a : b))
			: ready[turn++ % ready.length];
		page.push(next.buffer.shift());
	}

	// A server that doesn't say how many it holds counts what it gave, plus a page while it has more.
	const total = readers.reduce((sum, reader) => {
		if (reader.total != null) return sum + reader.total;
		return sum + reader.offset + (reader.done ? 0 : limit);
	}, 0);
	return {Items: page, TotalRecordCount: total};
};
