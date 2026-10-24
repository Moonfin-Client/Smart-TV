import {
	indexEntryFor,
	compareReleaseAscending,
	orderItemsByIds,
	buildCollectionIndex,
	fetchCollectionPage,
	reorderCollectionIds
} from './collectionPlaylist';

const entry = (over) => ({id: 'x', name: '', premiereDate: null, productionYear: null, ...over});

describe('indexEntryFor', () => {
	it('keeps only the id and what it takes to sort', () => {
		expect(indexEntryFor({Id: 'a', Name: 'Alien', PremiereDate: '1979-05-25', ProductionYear: 1979, Overview: 'long'}))
			.toEqual({id: 'a', name: 'Alien', premiereDate: '1979-05-25', productionYear: 1979});
	});
});

describe('compareReleaseAscending', () => {
	it('orders by premiere date', () => {
		expect(compareReleaseAscending(entry({premiereDate: '1986-07-18'}), entry({premiereDate: '1979-05-25'}))).toBeGreaterThan(0);
	});

	it('falls back to the production year when there is no date', () => {
		expect(compareReleaseAscending(entry({productionYear: 1979}), entry({premiereDate: '1986-07-18'}))).toBeLessThan(0);
	});

	it('sinks the entries with no date at all, whichever side they are on', () => {
		expect(compareReleaseAscending(entry({name: 'A'}), entry({premiereDate: '1979-05-25'}))).toBe(1);
		expect(compareReleaseAscending(entry({premiereDate: '1979-05-25'}), entry({name: 'A'}))).toBe(-1);
	});

	it('settles a tie by name, and orders two undated entries by name', () => {
		expect(compareReleaseAscending(entry({name: 'B', premiereDate: '1979-05-25'}), entry({name: 'A', premiereDate: '1979-05-25'}))).toBeGreaterThan(0);
		expect(compareReleaseAscending(entry({name: 'alpha'}), entry({name: 'Beta'}))).toBeLessThan(0);
	});

	it('treats an unparseable date as no date', () => {
		expect(compareReleaseAscending(entry({name: 'A', premiereDate: 'not a date'}), entry({premiereDate: '1979-05-25'}))).toBe(1);
	});
});

describe('orderItemsByIds', () => {
	it('puts a page back into the order it was asked for', () => {
		const items = [{Id: 'c'}, {Id: 'a'}, {Id: 'b'}];
		expect(orderItemsByIds(items, ['a', 'b', 'c']).map((i) => i.Id)).toEqual(['a', 'b', 'c']);
	});

	it('pushes anything it did not ask for to the end', () => {
		expect(orderItemsByIds([{Id: 'z'}, {Id: 'a'}], ['a']).map((i) => i.Id)).toEqual(['a', 'z']);
	});
});

describe('buildCollectionIndex', () => {
	it('defaults to release order ascending across movies and series episodes', async () => {
		const api = {
			getItems: jest.fn().mockResolvedValue({Items: [
				{Id: 'm1', Type: 'Movie', Name: 'Movie', PremiereDate: '1990-01-01'},
				{Id: 's1', Type: 'Series', Name: 'Show'},
				{Id: 'b1', Type: 'BoxSet', Name: 'Nested'},
				{Id: 'm2', Type: 'Movie', Name: 'Older', PremiereDate: '1980-01-01'}
			]}),
			getEpisodes: jest.fn().mockResolvedValue({Items: [
				{Id: 'e1', Type: 'Episode', Name: 'Ep 1', PremiereDate: '1985-01-01'},
				{Id: 'e2', Type: 'Episode', Name: 'Ep 2', PremiereDate: '1985-01-08'}
			]})
		};
		expect(await buildCollectionIndex(api, 'box')).toEqual(['m2', 'e1', 'e2', 'm1']);
		expect(api.getItems).toHaveBeenCalledWith(expect.objectContaining({ParentId: 'box', Limit: 2000}));
		expect(api.getEpisodes).toHaveBeenCalledWith('s1');
	});

	it('plays an episode filed on its own, and only once when its series is there too', async () => {
		const api = {
			getItems: jest.fn().mockResolvedValue({Items: [
				{Id: 'e9', Type: 'Episode', Name: 'Pilot'},
				{Id: 's1', Type: 'Series', Name: 'Show'},
				{Id: 'e1', Type: 'Episode', Name: 'Ep 1'}
			]}),
			getEpisodes: jest.fn().mockResolvedValue({Items: [{Id: 'e1', Type: 'Episode'}, {Id: 'e2', Type: 'Episode'}]})
		};
		expect(await buildCollectionIndex(api, 'box', {sortBy: 'server'})).toEqual(['e9', 'e1', 'e2']);
	});

	it('preserves the server order when sortBy is server', async () => {
		const api = {
			getItems: jest.fn().mockResolvedValue({Items: [
				{Id: 'm1', Type: 'Movie', Name: 'Movie', PremiereDate: '1990-01-01'},
				{Id: 's1', Type: 'Series', Name: 'Show'},
				{Id: 'b1', Type: 'BoxSet', Name: 'Nested'},
				{Id: 'm2', Type: 'Movie', Name: 'Older', PremiereDate: '1980-01-01'}
			]}),
			getEpisodes: jest.fn().mockResolvedValue({Items: [
				{Id: 'e1', Type: 'Episode', Name: 'Ep 1', PremiereDate: '1985-01-01'},
				{Id: 'e2', Type: 'Episode', Name: 'Ep 2', PremiereDate: '1985-01-08'}
			]})
		};
		expect(await buildCollectionIndex(api, 'box', {sortBy: 'server'})).toEqual(['m1', 'e1', 'e2', 'm2']);
	});

	it('uses custom order and appends remaining items in release order', async () => {
		const api = {
			getCollectionOrder: jest.fn().mockResolvedValue(['m1', 'm2']),
			getItems: jest.fn().mockResolvedValue({Items: [
				{Id: 'm1', Type: 'Movie', Name: 'Movie', PremiereDate: '1990-01-01'},
				{Id: 's1', Type: 'Series', Name: 'Show'},
				{Id: 'm2', Type: 'Movie', Name: 'Older', PremiereDate: '1980-01-01'}
			]}),
			getEpisodes: jest.fn().mockResolvedValue({Items: [
				{Id: 'e1', Type: 'Episode', Name: 'Ep 1', PremiereDate: '1985-01-01'}
			]})
		};
		expect(await buildCollectionIndex(api, 'box', {sortBy: 'custom'})).toEqual(['m1', 'm2', 'e1']);
	});

	it('orders by release date descending when requested', async () => {
		const api = {
			getItems: jest.fn().mockResolvedValue({Items: [
				{Id: 'm1', Type: 'Movie', Name: 'Movie', PremiereDate: '1990-01-01'},
				{Id: 'm2', Type: 'Movie', Name: 'Older', PremiereDate: '1980-01-01'}
			]})
		};
		expect(await buildCollectionIndex(api, 'box', {sortBy: 'releaseDescending'})).toEqual(['m1', 'm2']);
	});

	it('orders alphabetically when requested', async () => {
		const api = {
			getItems: jest.fn().mockResolvedValue({Items: [
				{Id: 'm1', Type: 'Movie', Name: 'Zebra', PremiereDate: '1990-01-01'},
				{Id: 'm2', Type: 'Movie', Name: 'Apple', PremiereDate: '1980-01-01'}
			]})
		};
		expect(await buildCollectionIndex(api, 'box', {sortBy: 'alphabetical'})).toEqual(['m2', 'm1']);
	});

	it('deduplicates entries appearing through both series expansion and direct membership', async () => {
		const api = {
			getItems: jest.fn().mockResolvedValue({Items: [
				{Id: 'e1', Type: 'Episode', Name: 'Direct Ep', PremiereDate: '1985-01-01'},
				{Id: 's1', Type: 'Series', Name: 'Show'}
			]}),
			getEpisodes: jest.fn().mockResolvedValue({Items: [
				{Id: 'e1', Type: 'Episode', Name: 'Series Ep', PremiereDate: '1985-01-01'}
			]})
		};
		expect(await buildCollectionIndex(api, 'box')).toEqual(['e1']);
	});

	it('carries on when a series refuses to list its episodes', async () => {
		const api = {
			getItems: jest.fn().mockResolvedValue({Items: [{Id: 'm1', Type: 'Movie', Name: 'M'}, {Id: 's1', Type: 'Series'}]}),
			getEpisodes: jest.fn().mockRejectedValue(new Error('nope'))
		};
		expect(await buildCollectionIndex(api, 'box')).toEqual(['m1']);
	});

	it('comes back empty when the scan itself fails', async () => {
		const api = {getItems: jest.fn().mockRejectedValue(new Error('nope')), getEpisodes: jest.fn()};
		expect(await buildCollectionIndex(api, 'box')).toEqual([]);
	});
});

describe('fetchCollectionPage', () => {
	const ids = Array.from({length: 60}, (_, i) => `i${i}`);

	// The two halves have to agree on what an index holds, so the page is asked for using
	// exactly what the scan produced rather than a shape made up for the test.
	it('asks for the ids the scan produced, not the entries behind them', async () => {
		const scan = {
			getItems: jest.fn().mockResolvedValue({Items: [{Id: 'm1', Type: 'Movie', Name: 'M'}]}),
			getEpisodes: jest.fn()
		};
		const index = await buildCollectionIndex(scan, 'box');
		const api = {getItems: jest.fn().mockResolvedValue({Items: [{Id: 'm1'}]})};
		await fetchCollectionPage(api, index, 0);
		expect(api.getItems).toHaveBeenCalledWith(expect.objectContaining({Ids: 'm1'}));
	});

	it('reads fifty at a time and says there is more to come', async () => {
		const api = {getItems: jest.fn().mockResolvedValue({Items: ids.slice(0, 50).map((Id) => ({Id}))})};
		const page = await fetchCollectionPage(api, ids, 0);
		expect(page.items).toHaveLength(50);
		expect(page).toMatchObject({fetchedCount: 50, hasMore: true});
	});

	it('counts in index positions, so an id the server dropped cannot stall it', async () => {
		const api = {getItems: jest.fn().mockResolvedValue({Items: [{Id: 'i50'}]})};
		const page = await fetchCollectionPage(api, ids, 50);
		expect(page).toMatchObject({fetchedCount: 60, hasMore: false});
		expect(page.items).toHaveLength(1);
	});

	it('does nothing once the index is exhausted', async () => {
		const api = {getItems: jest.fn()};
		expect(await fetchCollectionPage(api, ids, 60)).toEqual({items: [], fetchedCount: 60, hasMore: false});
		expect(api.getItems).not.toHaveBeenCalled();
	});
});

describe('reorderCollectionIds', () => {
	const currentItems = [{Id: 'i0'}, {Id: 'i1'}, {Id: 'i2'}];

	it('preserves unloaded member ids from customOrder when reordering', () => {
		const customOrder = ['i0', 'i1', 'i2', 'i3', 'i4'];
		const result = reorderCollectionIds({
			currentItems,
			customOrder,
			allIds: [],
			itemIndex: 0,
			direction: 1
		});

		expect(result).toEqual({
			newIndex: 1,
			newOrder: ['i1', 'i0', 'i2', 'i3', 'i4']
		});
	});

	it('preserves unloaded member ids from allIds when customOrder is empty', () => {
		const allIds = ['i0', 'i1', 'i2', 'i3', 'i4'];
		const result = reorderCollectionIds({
			currentItems,
			customOrder: [],
			allIds,
			itemIndex: 2,
			direction: -1
		});

		expect(result).toEqual({
			newIndex: 1,
			newOrder: ['i0', 'i2', 'i1', 'i3', 'i4']
		});
	});

	it('returns null when reordering past boundary', () => {
		expect(reorderCollectionIds({
			currentItems,
			customOrder: [],
			allIds: ['i0', 'i1', 'i2'],
			itemIndex: 0,
			direction: -1
		})).toBeNull();

		expect(reorderCollectionIds({
			currentItems,
			customOrder: [],
			allIds: ['i0', 'i1', 'i2'],
			itemIndex: 2,
			direction: 1
		})).toBeNull();
	});
});
