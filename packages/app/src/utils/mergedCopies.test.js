jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

import {
	PreferredCopies,
	copiesOf,
	foldCopies,
	hasMergedCopies,
	mergeFacetValues,
	mergeLibrariesByType,
	mergedLibraryId,
	mergedLibraryType,
	mergedSearchText,
	mergedSortComparator,
	mergesLibraries,
	serverCountOf,
	titleMatchKeys,
	withoutCopies
} from './mergedCopies';

const lib = (id, type, serverId) => ({Id: id, Name: id, CollectionType: type, _serverId: serverId, _serverName: `Server ${serverId}`, ImageTags: {Primary: 't'}});
const movie = (id, serverId, providerIds, extra = {}) => ({Id: id, Type: 'Movie', Name: id, _serverId: serverId, ProviderIds: providerIds, ...extra});

describe('merged library ids', () => {
	it('round trips the collection type', () => {
		expect(mergedLibraryType(mergedLibraryId('movies'))).toBe('movies');
		expect(mergedLibraryType('abc123')).toBeNull();
		expect(mergedLibraryType(null)).toBeNull();
	});

	it('only merges with the multi-server switch on and several servers', () => {
		expect(mergesLibraries({unifiedLibraryMode: true, mergeLibrariesByType: true}, true)).toBe(true);
		expect(mergesLibraries({unifiedLibraryMode: false, mergeLibrariesByType: true}, true)).toBe(false);
		expect(mergesLibraries({unifiedLibraryMode: true, mergeLibrariesByType: true}, false)).toBe(false);
	});
});

describe('mergeLibrariesByType', () => {
	it('puts each type two servers hold behind one library in the first one\'s place', () => {
		const merged = mergeLibrariesByType([
			lib('m1', 'movies', 'a'),
			lib('music', 'music', 'a'),
			lib('t1', 'tvshows', 'a'),
			lib('m2', 'movies', 'b'),
			lib('m3', 'movies', 'b')
		]);
		expect(merged.map((l) => l.Id)).toEqual(['merged-movies', 'music', 't1']);
		expect(merged[0]).toMatchObject({Name: 'Movies', CollectionType: 'movies', _serverId: 'a', _imageItemId: 'm1', _mergedType: 'movies'});
	});

	it('leaves a type only one server holds alone', () => {
		const libraries = [lib('m1', 'movies', 'a'), lib('m2', 'movies', 'a')];
		expect(mergeLibrariesByType(libraries).map((l) => l.Id)).toEqual(['m1', 'm2']);
	});
});

describe('titleMatchKeys', () => {
	it('keeps real tmdb, tvdb and imdb ids and drops placeholders', () => {
		expect(titleMatchKeys(movie('1', 'a', {Tmdb: '603', Imdb: 'tt0133093', Tvdb: '0', Other: '5'}))).toEqual([
			'Movie:tmdb:603',
			'Movie:imdb:tt0133093'
		]);
		expect(titleMatchKeys(movie('1', 'a', {Imdb: 'tt0000000', Tmdb: 'abc'}))).toEqual([]);
		expect(titleMatchKeys({Id: '1'})).toEqual([]);
	});
});

describe('foldCopies', () => {
	it('folds another server\'s copy into the first card', () => {
		const a = movie('1', 'a', {Tmdb: '603'});
		const b = movie('9', 'b', {Imdb: 'tt1', Tmdb: '603'});
		const c = movie('2', 'b', {Tmdb: '604'});
		const kept = foldCopies([a, b, c]);
		expect(kept.map((i) => i.Id)).toEqual(['1', '2']);
		expect(copiesOf(kept[0]).map((i) => `${i._serverId}:${i.Id}`)).toEqual(['a:1', 'b:9']);
		expect(serverCountOf(kept[0])).toBe(2);
		expect(hasMergedCopies(kept[1])).toBe(false);
	});

	it('folds a later page into an earlier page\'s card', () => {
		const holders = new Map();
		const first = foldCopies([movie('1', 'a', {Tmdb: '603'})], holders);
		const second = foldCopies([movie('9', 'b', {Tmdb: '603'}), movie('3', 'b', {Tmdb: '1'})], holders);
		expect(second.map((i) => i.Id)).toEqual(['3']);
		expect(serverCountOf(first[0])).toBe(2);
	});

	it('says which card took on a copy, and a picked copy leaves the others behind', () => {
		const holders = new Map();
		const [card] = foldCopies([movie('1', 'a', {Tmdb: '603'})], holders);
		const grown = [];
		foldCopies([movie('9', 'b', {Tmdb: '603'})], holders, null, (holder) => grown.push(holder));
		expect(grown).toEqual([card]);
		expect(hasMergedCopies(withoutCopies(card))).toBe(false);
	});

	it('never folds a title without provider ids', () => {
		expect(foldCopies([movie('1', 'a', {}), movie('1', 'b', {})])).toHaveLength(2);
	});

	it('holds another server\'s copy back for the preferred server\'s card', () => {
		const preferred = new PreferredCopies('a', new Set(['Movie:tmdb:603']));
		const holders = new Map();
		const other = movie('9', 'b', {Tmdb: '603'});
		expect(foldCopies([other], holders, preferred)).toEqual([]);
		const own = movie('1', 'a', {Tmdb: '603'});
		const kept = foldCopies([own], holders, preferred);
		expect(kept).toEqual([own]);
		expect(copiesOf(own).map((i) => i._serverId)).toEqual(['a', 'b']);
		expect(preferred.takeAllWaiting()).toEqual([]);
	});

	it('hands back a copy whose preferred card never came', () => {
		const preferred = new PreferredCopies('a', new Set(['Movie:tmdb:603']));
		const other = movie('9', 'b', {Tmdb: '603'});
		foldCopies([other], new Map(), preferred);
		expect(preferred.takeAllWaiting()).toEqual([other]);
	});
});

describe('mergedSortComparator', () => {
	it('orders by folded sort name', () => {
		const compare = mergedSortComparator('SortName', false);
		const items = [{Name: 'Zorro'}, {Name: 'Été'}, {SortName: 'alpha'}];
		expect(items.sort(compare).map((i) => i.SortName || i.Name)).toEqual(['alpha', 'Été', 'Zorro']);
	});

	it('orders dates descending with a tie broken by name', () => {
		const compare = mergedSortComparator('DateCreated,SortName', true);
		const items = [
			{Name: 'a', DateCreated: '2026-01-01T00:00:00Z'},
			{Name: 'b', DateCreated: '2026-03-01T00:00:00Z'},
			{Name: 'c'}
		];
		expect(items.sort(compare).map((i) => i.Name)).toEqual(['b', 'a', 'c']);
	});

	it('has nothing to merge on for a random order', () => {
		expect(mergedSortComparator('Random', false)).toBeNull();
	});
});

describe('mergedSearchText', () => {
	it('answers to every copy\'s title and original title', () => {
		const card = foldCopies([
			movie('1', 'a', {Tmdb: '1'}, {Name: 'Amélie'}),
			movie('2', 'b', {Tmdb: '1'}, {Name: 'Die fabelhafte Welt der Amélie', OriginalTitle: "Le Fabuleux Destin d'Amélie Poulain"})
		])[0];
		const text = mergedSearchText(card);
		expect(text).toContain('fabelhafte');
		expect(text).toContain('Fabuleux');
	});
});

describe('mergeFacetValues', () => {
	it('takes the union of every server\'s values', () => {
		const merged = mergeFacetValues([
			{genres: ['Drama', 'Action'], years: [2001], officialRatings: [], tags: [], audioLanguages: [{value: 'fre', name: 'French'}], subtitleLanguages: []},
			null,
			{genres: ['Action', 'Comedy'], years: [1999, 2001], officialRatings: ['PG'], tags: ['x'], audioLanguages: [{value: 'fre', name: 'French'}, {value: 'eng', name: 'English'}], subtitleLanguages: []}
		]);
		expect(merged.genres).toEqual(['Action', 'Comedy', 'Drama']);
		expect(merged.years).toEqual([1999, 2001]);
		expect(merged.audioLanguages.map((l) => l.value)).toEqual(['eng', 'fre']);
	});
});
