jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

import {genericCollectionLabel, mergeRecentRows} from './mergeRecentRows';

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
			{lib: lib('a', 'movies'), items: [{Id: '1', Type: 'Movie', _serverId: 'a', ProviderIds: {Tmdb: '603'}, DateCreated: '2026-01-02'}]},
			{lib: lib('b', 'movies'), items: [
				{Id: '1', Type: 'Movie', _serverId: 'b', ProviderIds: {Tmdb: '603'}, DateCreated: '2026-01-05'},
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
