import {createMergedReaders, mergedReadersDrained, takeMergedPage} from './mergedBrowse';
import {mergedSortComparator} from './mergedCopies';

const source = (serverId, names) => ({
	libraryId: `${serverId}-lib`,
	server: {_serverId: serverId, _serverName: serverId},
	names
});

// A server that pages through its names in order.
const fetchPage = (src, start, limit) => Promise.resolve({
	Items: src.names.slice(start, start + limit).map((name) => ({Id: `${src.server._serverId}-${name}`, Name: name})),
	TotalRecordCount: src.names.length
});

describe('takeMergedPage', () => {
	it('merges the servers\' pages in the sort\'s order and tags each item with its server', async () => {
		const readers = createMergedReaders([source('a', ['a', 'c', 'e']), source('b', ['b', 'd'])]);
		const compare = mergedSortComparator('SortName', false);
		const first = await takeMergedPage(readers, 3, compare, fetchPage);
		expect(first.Items.map((i) => i.Name)).toEqual(['a', 'b', 'c']);
		expect(first.Items[1]._serverId).toBe('b');
		expect(first.TotalRecordCount).toBe(5);
		const second = await takeMergedPage(readers, 3, compare, fetchPage);
		expect(second.Items.map((i) => i.Name)).toEqual(['d', 'e']);
		expect(mergedReadersDrained(readers)).toBe(true);
	});

	it('takes turns for a random order', async () => {
		const readers = createMergedReaders([source('a', ['x', 'y']), source('b', ['p', 'q'])]);
		const page = await takeMergedPage(readers, 4, null, fetchPage);
		expect(page.Items.map((i) => i._serverId)).toEqual(['a', 'b', 'a', 'b']);
	});

	it('carries on without a server that fails, and fails only when every one does', async () => {
		const failing = (src, start, limit) => (src.server._serverId === 'b' ? Promise.reject(new Error('down')) : fetchPage(src, start, limit));
		const readers = createMergedReaders([source('a', ['a', 'b']), source('b', ['c'])]);
		const page = await takeMergedPage(readers, 5, mergedSortComparator('SortName', false), failing, []);
		expect(page.Items.map((i) => i.Name)).toEqual(['a', 'b']);
		expect(page.TotalRecordCount).toBe(2);

		const allDown = createMergedReaders([source('a', ['a'])]);
		await expect(takeMergedPage(allDown, 5, null, () => Promise.reject(new Error('down')), [])).rejects.toThrow('down');
	});

	it('still hands out titles already read when every server fails on the next read', async () => {
		let down = false;
		const flaky = (src, start, limit) => (down ? Promise.reject(new Error('down')) : fetchPage(src, start, limit));
		const readers = createMergedReaders([source('a', ['a', 'b', 'c', 'd']), source('b', ['e', 'f', 'g', 'h'])]);
		await takeMergedPage(readers, 2, mergedSortComparator('SortName', false), flaky, []);
		down = true;
		const page = await takeMergedPage(readers, 2, mergedSortComparator('SortName', false), flaky, []);
		expect(page.Items.length).toBeGreaterThan(0);
	});

	it('tries a server again before leaving it out, so one that was slow to wake still shows', async () => {
		let misses = 1;
		const waking = (src, start, limit) => {
			if (src.server._serverId === 'b' && misses > 0) {
				misses--;
				return Promise.reject(new Error('waking up'));
			}
			return fetchPage(src, start, limit);
		};
		const readers = createMergedReaders([source('a', ['a', 'b']), source('b', ['c'])]);
		const page = await takeMergedPage(readers, 5, mergedSortComparator('SortName', false), waking, [0]);
		expect(page.Items.map((i) => i.Name)).toEqual(['a', 'b', 'c']);
	});
	it('keeps reading a server that caps its pages below what was asked', async () => {
		// Two at a time, whatever the limit.
		const capped = (src, start) => fetchPage(src, start, 2);
		const readers = createMergedReaders([source('a', ['a', 'b', 'c', 'd', 'e'])]);
		const names = [];
		for (let i = 0; i < 5 && !mergedReadersDrained(readers); i++) {
			(await takeMergedPage(readers, 4, null, capped)).Items.forEach((item) => names.push(item.Name));
		}
		expect(names).toEqual(['a', 'b', 'c', 'd', 'e']);
	});
});
