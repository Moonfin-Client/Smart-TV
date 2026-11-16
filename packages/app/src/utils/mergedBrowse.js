// Paging through a merged library: every server's library is read a page at a time and the pages are merged into one
// list in the sort's order, taking whichever server's next item comes first.

import {titleMatchKeys} from './mergedCopies';

// One reader per server library, holding what it has read until the merge takes it.
export const createMergedReaders = (sources) => (sources || []).map((source) => ({
	source,
	buffer: [],
	offset: 0,
	total: null,
	done: false,
	failed: false
}));

const readMore = async (reader, fetchPage, limit) => {
	try {
		const result = await fetchPage(reader.source, reader.offset, limit);
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
// time. A random order has nothing to compare and takes turns instead. Throws only when
// every server failed.
export const takeMergedPage = async (readers, limit, compare, fetchPage) => {
	let failure = null;
	await Promise.all(readers
		.filter((reader) => !reader.done && reader.buffer.length < limit)
		.map((reader) => readMore(reader, fetchPage, limit).catch((err) => {
			failure = err;
		})));
	if (failure && readers.every((reader) => reader.failed)) throw failure;

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

// The match keys of every title in a server's answers, for the preferred server's own cards.
export const titleKeysOf = (responses) => {
	const keys = new Set();
	(responses || []).forEach((response) => {
		(response?.Items || []).forEach((raw) => {
			if (raw) titleMatchKeys(raw).forEach((key) => keys.add(key));
		});
	});
	return keys;
};
