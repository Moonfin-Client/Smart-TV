jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

import {addSeriesProviderIds, genericCollectionLabel, mergeRecentRows} from './mergeRecentRows';

const lib = (id, type) => ({Id: id, CollectionType: type});

describe('mergeRecentRows', () => {
	it('folds libraries of the same type into one group', () => {
		const rows = mergeRecentRows([
			{lib: lib('a', 'movies'), items: [{Id: '1', DateCreated: '2026-01-02'}]},
			{lib: lib('b', 'movies'), items: [{Id: '2', DateCreated: '2026-01-03'}]},
			{lib: lib('c', 'tvshows'), items: [{Id: '3', DateCreated: '2026-01-01'}]}
		], 'DateCreated');
		expect(rows.map((r) => r.collectionType)).toEqual(['movies', 'tvshows']);
		expect(rows[0].items.map((i) => i.Id)).toEqual(['2', '1']);
	});

	it('keeps a title held in two libraries once', () => {
		const rows = mergeRecentRows([
			{lib: lib('a', 'movies'), items: [{Id: '1', DateCreated: '2026-01-02'}]},
			{lib: lib('b', 'movies'), items: [{Id: '1', DateCreated: '2026-01-02'}, {Id: '2', DateCreated: '2026-01-01'}]}
		], 'DateCreated');
		expect(rows[0].items.map((i) => i.Id)).toEqual(['1', '2']);
	});

	it('with merged libraries, keeps two servers\' copies of a title as one card led by the newest', () => {
		const rows = mergeRecentRows([
			{lib: lib('a', 'movies'), items: [{Id: '1', Type: 'Movie', _serverId: 'a', ProviderIds: {Tmdb: '5003'}, DateCreated: '2026-01-02'}]},
			{lib: lib('b', 'movies'), items: [
				{Id: '1', Type: 'Movie', _serverId: 'b', ProviderIds: {Tmdb: '5003'}, DateCreated: '2026-01-05'},
				{Id: '7', Type: 'Movie', _serverId: 'b', ProviderIds: {Tmdb: '42'}, DateCreated: '2026-01-01'}
			]}
		], 'DateCreated', {foldCopies: true});
		expect(rows[0].items.map((i) => `${i._serverId}:${i.Id}`)).toEqual(['b:1', 'b:7']);
		expect(rows[0].items[0]._mergedCopies.map((i) => i._serverId)).toEqual(['a']);
	});

	it('sorts undated items to the back', () => {
		const rows = mergeRecentRows([
			{lib: lib('a', 'movies'), items: [{Id: '1'}, {Id: '2', PremiereDate: '2026-01-01'}]}
		], 'PremiereDate');
		expect(rows[0].items.map((i) => i.Id)).toEqual(['2', '1']);
	});

	it('gives music the square cards the per library rows use', () => {
		const rows = mergeRecentRows([
			{lib: lib('a', 'music'), items: [{Id: '1'}]},
			{lib: lib('b', 'movies'), items: [{Id: '2'}]}
		], 'DateCreated');
		expect(rows.find((r) => r.collectionType === 'music').cardType).toBe('square');
		expect(rows.find((r) => r.collectionType === 'movies').cardType).toBe('portrait');
	});

	it('caps a merged row at the per library fetch size', () => {
		const items = [];
		for (let i = 0; i < 20; i++) items.push({Id: String(i), DateCreated: '2026-01-01'});
		const rows = mergeRecentRows([{lib: lib('a', 'movies'), items}], 'DateCreated');
		expect(rows[0].items.length).toBe(16);
	});
});

describe('genericCollectionLabel', () => {
	it('names the known types and capitalizes the rest', () => {
		expect(genericCollectionLabel('movies')).toBe('Movies');
		expect(genericCollectionLabel('tvshows')).toBe('TV Shows');
		expect(genericCollectionLabel('podcasts')).toBe('Podcasts');
		expect(genericCollectionLabel('')).toBe('Media');
	});
});

describe('addSeriesProviderIds', () => {
	const show = (id, serverId) => ({Id: id, Type: 'Series', Name: 'Show One', _serverId: serverId, DateCreated: '2026-01-01'});

	test('reads each show\'s provider ids from its server, so two servers\' cards of one show fold', async () => {
		const ids = {a: {s1: {Tvdb: '371980'}}, b: {s9: {Tvdb: '371980'}}};
		const apiFor = (item) => ({
			getItems: async ({Ids}) => ({Items: Ids.split(',').map((id) => ({Id: id, ProviderIds: ids[item._serverId][id]}))})
		});
		const entries = [
			{lib: {CollectionType: 'tvshows'}, items: [show('s1', 'a')]},
			{lib: {CollectionType: 'tvshows'}, items: [show('s9', 'b')]}
		];
		await addSeriesProviderIds(entries, apiFor);
		const [row] = mergeRecentRows(entries, 'DateCreated', {foldCopies: true});
		expect(row.items).toHaveLength(1);
		expect(row.items[0]._mergedCopies.map((copy) => copy._serverId)).toEqual(['b']);
	});

	test('leaves the cards alone when a server doesn\'t answer', async () => {
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
		const entries = [{lib: {CollectionType: 'tvshows'}, items: [show('s1', 'a')]}];
		await addSeriesProviderIds(entries, () => ({getItems: () => Promise.reject(new Error('down'))}));
		expect(entries[0].items[0].ProviderIds).toBeUndefined();
		warn.mockRestore();
	});

	test('doesn\'t wait on a server that takes too long', async () => {
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
		const entries = [{lib: {CollectionType: 'tvshows'}, items: [show('s1', 'a')]}];
		await addSeriesProviderIds(entries, () => ({getItems: () => new Promise(() => {})}), 10);
		expect(entries[0].items[0].ProviderIds).toBeUndefined();
		warn.mockRestore();
	});
});
