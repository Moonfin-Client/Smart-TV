import {STUDIO_PAGE_SIZE, readStudioRow, sortNamedItems, titleCount} from './studioGenreSorting';

// A server holding `total` studios that, like Jellyfin, lists them by name whatever it is asked.
const nameOnlyServer = (total) => {
	const calls = [];
	const fetchPage = async (startIndex, limit, sortBy, sortOrder) => {
		calls.push({startIndex, limit, sortBy, sortOrder});
		const end = limit == null ? total : Math.min(startIndex + limit, total);
		const Items = [];
		for (let i = startIndex; i < end; i++) {
			Items.push({Name: `Studio ${String(i).padStart(4, '0')}`, MovieCount: i === 993 ? 50 : i % 7, DateCreated: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`});
		}
		return {Items, TotalRecordCount: total};
	};
	return {calls, fetchPage};
};

const names = (items) => items.map((i) => i.Name);

describe('title count', () => {
	it('counts only the types the row shows', () => {
		const genre = {MovieCount: 4, SeriesCount: 3};
		expect(titleCount(genre, 'Movie,Series')).toBe(7);
		expect(titleCount(genre, 'Movie')).toBe(4);
		expect(titleCount(genre, 'Series')).toBe(3);
	});

	it('falls back to the plain total a genre was counted with', () => {
		expect(titleCount({ChildCount: 9}, 'Movie')).toBe(9);
		expect(titleCount({}, 'Movie')).toBe(0);
	});
});

describe('sorting studios and genres', () => {
	const items = [
		{Name: 'beta', MovieCount: 2, DateCreated: '2026-03-01'},
		{Name: 'Alpha', MovieCount: 9, DateCreated: '2026-01-01'},
		{Name: 'Gamma', MovieCount: 2, DateCreated: '2026-02-01'}
	];

	it('sorts by name either way, ignoring case', () => {
		expect(names(sortNamedItems(items, 'SortName', 'Ascending'))).toEqual(['Alpha', 'beta', 'Gamma']);
		expect(names(sortNamedItems(items, 'SortName', 'Descending'))).toEqual(['Gamma', 'beta', 'Alpha']);
	});

	it('ranks by item count, ties by name', () => {
		expect(names(sortNamedItems(items, 'ItemCount', 'Descending'))).toEqual(['Alpha', 'beta', 'Gamma']);
		expect(names(sortNamedItems(items, 'ItemCount', 'Ascending'))).toEqual(['beta', 'Gamma', 'Alpha']);
	});

	it('sorts by date added', () => {
		expect(names(sortNamedItems(items, 'DateCreated', 'Descending'))).toEqual(['beta', 'Gamma', 'Alpha']);
	});

	it('shuffles without losing anything', () => {
		expect(names(sortNamedItems(items, 'Random')).sort()).toEqual(['Alpha', 'Gamma', 'beta']);
	});
});

describe('reading the studio row', () => {
	const read = (server, sortBy, sortOrder = 'Ascending', serverSorts = false, cacheKey = `${Math.random()}`) =>
		readStudioRow(server.fetchPage, {limit: 20, sortBy, sortOrder, serverSorts, cacheKey});

	it('reads just the row for name A to Z', async () => {
		const server = nameOnlyServer(1000);
		const row = await read(server, 'SortName');
		expect(server.calls).toEqual([{startIndex: 0, limit: 20, sortBy: 'SortName', sortOrder: 'Ascending'}]);
		expect(row.Items[0].Name).toBe('Studio 0000');
	});

	it('reads the end of the list for name Z to A', async () => {
		const server = nameOnlyServer(1000);
		const row = await read(server, 'SortName', 'Descending');
		expect(server.calls.map((c) => c.startIndex)).toEqual([0, 1000 - STUDIO_PAGE_SIZE]);
		expect(row.Items).toHaveLength(20);
		expect(row.Items[0].Name).toBe('Studio 0999');
	});

	it('reads a page from anywhere in the list for Random', async () => {
		const server = nameOnlyServer(1000);
		await read(server, 'Random');
		expect(server.calls).toHaveLength(2);
		expect(server.calls[1].startIndex).toBeGreaterThanOrEqual(0);
		expect(server.calls[1].startIndex).toBeLessThanOrEqual(1000 - STUDIO_PAGE_SIZE);
	});

	it('ranks the whole list by item count and date added', async () => {
		const server = nameOnlyServer(1000);
		const row = await read(server, 'ItemCount', 'Descending');
		expect(server.calls.map((c) => c.limit)).toEqual([null]);
		expect(row.Items).toHaveLength(20);
		expect(row.Items[0].Name).toBe('Studio 0993');
		expect(row.Items.slice(1).every((s) => s.MovieCount === 6)).toBe(true);

		const byDate = await read(nameOnlyServer(1000), 'DateCreated', 'Descending');
		expect(byDate.Items.every((s) => s.DateCreated === '2026-01-28')).toBe(true);
	});

	it('reads the whole list once a day per server and user', async () => {
		const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
		const server = nameOnlyServer(1000);
		await read(server, 'ItemCount', 'Descending', false, 'srv|me');
		await read(server, 'DateCreated', 'Descending', false, 'srv|me');
		expect(server.calls).toHaveLength(1);

		await read(server, 'ItemCount', 'Descending', false, 'srv|other');
		expect(server.calls).toHaveLength(2);

		now.mockReturnValue(1000 + 24 * 60 * 60 * 1000);
		await read(server, 'ItemCount', 'Descending', false, 'srv|other');
		expect(server.calls).toHaveLength(3);
		now.mockRestore();
	});

	it('reads a short list once', async () => {
		const server = nameOnlyServer(120);
		await read(server, 'Random');
		expect(server.calls).toHaveLength(1);
	});

	it('keeps name order for a sort the row no longer offers', async () => {
		const server = nameOnlyServer(1000);
		await read(server, 'Runtime', 'Descending');
		expect(server.calls).toEqual([{startIndex: 0, limit: 20, sortBy: 'SortName', sortOrder: 'Ascending'}]);
	});

	it('hands a server that sorts the sort, except item count', async () => {
		const server = nameOnlyServer(1000);
		await read(server, 'DateCreated', 'Descending', true);
		expect(server.calls).toEqual([{startIndex: 0, limit: 20, sortBy: 'DateCreated', sortOrder: 'Descending'}]);

		const counted = nameOnlyServer(1000);
		await read(counted, 'ItemCount', 'Descending', true);
		expect(counted.calls).toEqual([{startIndex: 0, limit: null, sortBy: 'SortName', sortOrder: 'Ascending'}]);
	});
});
