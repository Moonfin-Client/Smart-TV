import {
	splitCollectionMembers,
	indexEntryFor,
	compareReleaseAscending,
	sortIndexEntries,
	orderItemsByIds,
	buildCollectionIndex,
	fetchCollectionPage
} from './collectionPlaylist';

const entry = (over) => ({id: 'x', name: '', premiereDate: null, productionYear: null, ...over});

describe('splitCollectionMembers', () => {
	it('keeps what plays as it is apart from the series that need expanding', () => {
		const members = [
			{Id: '1', Type: 'Movie'}, {Id: '2', Type: 'Series'}, {Id: '3', Type: 'MusicVideo'},
			{Id: '4', Type: 'BoxSet'}, {Id: '5', Type: 'Audio'}, {Id: '6', Type: 'Video'}
		];
		const {playables, series} = splitCollectionMembers(members);
		expect(playables.map((i) => i.Id)).toEqual(['1', '3', '5', '6']);
		expect(series.map((i) => i.Id)).toEqual(['2']);
	});

	it('has nothing to split when the collection came back empty', () => {
		expect(splitCollectionMembers()).toEqual({playables: [], series: []});
	});
});

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

describe('sortIndexEntries', () => {
	it('orders a mixed list without touching the one it was given', () => {
		const entries = [entry({id: 'c', name: 'C'}), entry({id: 'a', premiereDate: '1986-01-01'}), entry({id: 'b', productionYear: 1979})];
		expect(sortIndexEntries(entries).map((e) => e.id)).toEqual(['b', 'a', 'c']);
		expect(entries.map((e) => e.id)).toEqual(['c', 'a', 'b']);
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
	it('expands the series and folds their episodes in with the movies', async () => {
		const api = {
			getItems: jest.fn().mockResolvedValue({Items: [
				{Id: 'm1', Type: 'Movie', Name: 'Movie', PremiereDate: '1990-01-01'},
				{Id: 's1', Type: 'Series', Name: 'Show'}
			]}),
			getEpisodes: jest.fn().mockResolvedValue({Items: [
				{Id: 'e1', Type: 'Episode', Name: 'Ep 1', PremiereDate: '1985-01-01'}
			]})
		};
		expect((await buildCollectionIndex(api, 'box')).map((e) => e.id)).toEqual(['e1', 'm1']);
		expect(api.getItems).toHaveBeenCalledWith(expect.objectContaining({ParentId: 'box', Limit: 2000}));
		expect(api.getEpisodes).toHaveBeenCalledWith('s1');
	});

	it('carries on when a series refuses to list its episodes', async () => {
		const api = {
			getItems: jest.fn().mockResolvedValue({Items: [{Id: 'm1', Type: 'Movie', Name: 'M'}, {Id: 's1', Type: 'Series'}]}),
			getEpisodes: jest.fn().mockRejectedValue(new Error('nope'))
		};
		expect((await buildCollectionIndex(api, 'box')).map((e) => e.id)).toEqual(['m1']);
	});

	it('comes back empty when the scan itself fails', async () => {
		const api = {getItems: jest.fn().mockRejectedValue(new Error('nope')), getEpisodes: jest.fn()};
		expect(await buildCollectionIndex(api, 'box')).toEqual([]);
	});
});

describe('fetchCollectionPage', () => {
	const ids = Array.from({length: 60}, (_, i) => `i${i}`);

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
