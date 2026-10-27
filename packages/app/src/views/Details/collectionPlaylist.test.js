import {
	indexEntryFor,
	compareReleaseAscending,
	orderItemsByIds,
	buildCollectionIndex,
	fetchCollectionPage,
	collectionPlaylistItems,
	moveInCollection
} from './collectionPlaylist';
import {orderCollectionIndex} from './nouveau/nouveauCollectionSort';

const entry = (over) => ({id: 'x', name: '', premiereDate: null, productionYear: null, ...over});
const idsOf = (entries) => entries.map((e) => e.id);

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
	it('keeps the server order and puts each series\' episodes in its place', async () => {
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
		const entries = await buildCollectionIndex(api, 'box');
		expect(idsOf(entries)).toEqual(['m1', 'e1', 'e2', 'm2']);
		expect(entries[0]).toEqual({id: 'm1', name: 'Movie', premiereDate: '1990-01-01', productionYear: null});
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
		expect(idsOf(await buildCollectionIndex(api, 'box'))).toEqual(['e9', 'e1', 'e2']);
	});

	it('carries on when a series refuses to list its episodes', async () => {
		const api = {
			getItems: jest.fn().mockResolvedValue({Items: [{Id: 'm1', Type: 'Movie', Name: 'M'}, {Id: 's1', Type: 'Series'}]}),
			getEpisodes: jest.fn().mockRejectedValue(new Error('nope'))
		};
		expect(idsOf(await buildCollectionIndex(api, 'box'))).toEqual(['m1']);
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
	it('asks for the ids the ordered scan produced, not the entries behind them', async () => {
		const scan = {
			getItems: jest.fn().mockResolvedValue({Items: [{Id: 'm1', Type: 'Movie', Name: 'M'}]}),
			getEpisodes: jest.fn()
		};
		const index = orderCollectionIndex(await buildCollectionIndex(scan, 'box'));
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

describe('collectionPlaylistItems', () => {
	it('shows the playlist once it has items', () => {
		expect(collectionPlaylistItems([{Id: 'p1'}], [{Id: 'm1', Type: 'Movie'}])).toEqual([{Id: 'p1'}]);
	});

	it('stands in with the collection\'s own playable members until then', () => {
		const members = [{Id: 'm1', Type: 'Movie'}, {Id: 's1', Type: 'Series'}, {Id: 'b1', Type: 'BoxSet'}, {Id: 'e1', Type: 'Episode'}];
		expect(collectionPlaylistItems([], members).map((item) => item.Id)).toEqual(['m1', 'e1']);
	});
});

describe('moveInCollection', () => {
	const loaded = [{Id: 'a'}, {Id: 'b'}, {Id: 'c'}];

	it('moves a loaded row and keeps the rows not read yet behind it', () => {
		const moved = moveInCollection(loaded, ['a', 'b', 'c', 'd', 'e'], 0, 1);
		expect(moved.items.map((item) => item.Id)).toEqual(['b', 'a', 'c']);
		expect(moved.order).toEqual(['b', 'a', 'c', 'd', 'e']);
	});

	it('puts a row the server left out of a page after the loaded ones', () => {
		expect(moveInCollection(loaded, ['a', 'gone', 'b', 'c'], 2, 1).order).toEqual(['a', 'c', 'b', 'gone']);
	});

	it('gives nothing back for a move off either end', () => {
		expect(moveInCollection(loaded, ['a', 'b', 'c'], 0, -1)).toBeNull();
		expect(moveInCollection(loaded, ['a', 'b', 'c'], 2, 3)).toBeNull();
	});
});
