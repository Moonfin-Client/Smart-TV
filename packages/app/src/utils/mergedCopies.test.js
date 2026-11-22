jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

import {
	PreferredCopies,
	copiesOf,
	foldCopies,
	hasMergedCopies,
	indexCopies,
	joinIndexedCopies,
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
		expect(titleMatchKeys(movie('1', 'a', {Tmdb: '5003', Imdb: 'tt0000101', Tvdb: '0', Other: '5'}))).toEqual([
			'Movie:tmdb:5003',
			'Movie:imdb:tt0000101'
		]);
		expect(titleMatchKeys(movie('1', 'a', {Imdb: 'tt0000000', Tmdb: 'abc'}))).toEqual([]);
		expect(titleMatchKeys({Id: '1'})).toEqual([]);
	});
});

describe('foldCopies', () => {
	it('folds another server\'s copy into the first card', () => {
		const a = movie('1', 'a', {Tmdb: '5003'});
		const b = movie('9', 'b', {Imdb: 'tt1', Tmdb: '5003'});
		const c = movie('2', 'b', {Tmdb: '5004'});
		const kept = foldCopies([a, b, c]);
		expect(kept.map((i) => i.Id)).toEqual(['1', '2']);
		expect(copiesOf(kept[0]).map((i) => `${i._serverId}:${i.Id}`)).toEqual(['a:1', 'b:9']);
		expect(serverCountOf(kept[0])).toBe(2);
		expect(hasMergedCopies(kept[1])).toBe(false);
	});

	it('folds a later page into an earlier page\'s card', () => {
		const holders = new Map();
		const first = foldCopies([movie('1', 'a', {Tmdb: '5003'})], holders);
		const second = foldCopies([movie('9', 'b', {Tmdb: '5003'}), movie('3', 'b', {Tmdb: '1'})], holders);
		expect(second.map((i) => i.Id)).toEqual(['3']);
		expect(serverCountOf(first[0])).toBe(2);
	});

	it('says which card took on a copy, and a picked copy leaves the others behind', () => {
		const holders = new Map();
		const [card] = foldCopies([movie('1', 'a', {Tmdb: '5003'})], holders);
		const grown = [];
		foldCopies([movie('9', 'b', {Tmdb: '5003'})], holders, null, (holder) => grown.push(holder));
		expect(grown).toEqual([card]);
		expect(hasMergedCopies(withoutCopies(card))).toBe(false);
	});

	it('makes one card of two that a later copy shows to be one title', () => {
		const a = movie('1', 'a', {Tmdb: '5003'});
		const b = movie('2', 'b', {Imdb: 'tt0000101'});
		const c = movie('3', 'c', {Tmdb: '5003', Imdb: 'tt0000101'});
		const kept = foldCopies([a, b, c]);
		expect(kept).toEqual([a]);
		expect(copiesOf(a).map((i) => i._serverId)).toEqual(['a', 'b', 'c']);
	});

	it('takes down an earlier page\'s card that a later copy folds away', () => {
		const holders = new Map();
		const [a, b] = foldCopies([movie('1', 'a', {Tmdb: '5003'}), movie('2', 'b', {Imdb: 'tt0000101'})], holders);
		const absorbed = [];
		foldCopies([movie('3', 'c', {Imdb: 'tt0000101', Tmdb: '5003'})], holders, null, (holder, card) => card && absorbed.push(card));
		expect(absorbed).toEqual([b]);
		expect(serverCountOf(a)).toBe(3);
		// The folded card's keys now lead to the card that kept the title.
		foldCopies([movie('4', 'd', {Imdb: 'tt0000101'})], holders);
		expect(serverCountOf(a)).toBe(4);
	});

	it('sends a key only a dropped repeat brought along to the card that kept the title', () => {
		const holders = new Map();
		const [a, b] = foldCopies([movie('1', 'a', {Tmdb: '5003'}), movie('2', 'b', {Imdb: 'tt0000101'})], holders);
		// The same item seen by a second account, now also carrying a tvdb id.
		foldCopies([movie('2', 'b', {Imdb: 'tt0000101', Tvdb: '77'})], holders);
		foldCopies([movie('3', 'c', {Tmdb: '5003', Imdb: 'tt0000101'})], holders);
		foldCopies([movie('4', 'd', {Tvdb: '77'})], holders);
		expect(copiesOf(a).map((i) => i.Id)).toEqual(['1', '2', '3', '4']);
		expect(b).toBeDefined();
	});

	it('lets the preferred server\'s card keep a title two cards turn out to share', () => {
		const preferred = new PreferredCopies('p', new Set());
		const q = movie('1', 'q', {Tmdb: '5003'});
		const p = movie('2', 'p', {Imdb: 'tt0000101'});
		const kept = foldCopies([q, p, movie('3', 'r', {Tmdb: '5003', Imdb: 'tt0000101'})], new Map(), preferred);
		expect(kept).toEqual([p]);
		expect(copiesOf(p).map((i) => i._serverId)).toEqual(['p', 'q', 'r']);
	});

	it('orders cards by the fold they were shown in', () => {
		const a = movie('1', 'a', {Tmdb: '5003'});
		const b = movie('2', 'b', {Imdb: 'tt0000101'});
		foldCopies([a, b]);
		const kept = foldCopies([b, a, movie('3', 'c', {Tmdb: '5003', Imdb: 'tt0000101'})]);
		expect(kept).toEqual([b]);
	});

	it('keeps one copy of an item two saved accounts on one server both see', () => {
		const kept = foldCopies([movie('1', 'a', {Tmdb: '5003'}), movie('1', 'a', {Tmdb: '5003'}), movie('7', 'a', {Tmdb: '5003'})]);
		expect(copiesOf(kept[0]).map((i) => i.Id)).toEqual(['1', '7']);
	});

	it('never folds a title without provider ids', () => {
		expect(foldCopies([movie('1', 'a', {}), movie('1', 'b', {})])).toHaveLength(2);
	});

	it('holds another server\'s copy back for the preferred server\'s card', () => {
		const preferred = new PreferredCopies('a', new Set(['Movie:tmdb:5003']));
		const holders = new Map();
		const other = movie('9', 'b', {Tmdb: '5003'});
		expect(foldCopies([other], holders, preferred)).toEqual([]);
		const own = movie('1', 'a', {Tmdb: '5003'});
		const kept = foldCopies([own], holders, preferred);
		expect(kept).toEqual([own]);
		expect(copiesOf(own).map((i) => i._serverId)).toEqual(['a', 'b']);
		expect(preferred.takeAllWaiting()).toEqual([]);
	});

	it('hands back a copy whose preferred card never came', () => {
		const preferred = new PreferredCopies('a', new Set(['Movie:tmdb:5003']));
		const other = movie('9', 'b', {Tmdb: '5003'});
		foldCopies([other], new Map(), preferred);
		expect(preferred.takeAllWaiting()).toEqual([other]);
	});
});

describe('mergedSortComparator', () => {
	it('orders by folded sort name', () => {
		const compare = mergedSortComparator('SortName', false);
		const items = [{Name: 'Zeta'}, {Name: 'Été'}, {SortName: 'alpha'}];
		expect(items.sort(compare).map((i) => i.SortName || i.Name)).toEqual(['alpha', 'Été', 'Zeta']);
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

	it('orders a Plex critic rating from another source on the value Plex sorts by', () => {
		const compare = mergedSortComparator('CriticRating,SortName', true);
		const items = [{Name: 'jellyfin', CriticRating: 70}, {Name: 'plex', _criticSort: 82}];
		expect(items.sort(compare).map((i) => i.Name)).toEqual(['plex', 'jellyfin']);
	});

	it('has nothing to merge on for a random order', () => {
		expect(mergedSortComparator('Random', false)).toBeNull();
	});
});

describe('mergedSearchText', () => {
	it('answers to every copy\'s title and original title', () => {
		const card = foldCopies([
			movie('1', 'a', {Tmdb: '1'}, {Name: 'Écrit'}),
			movie('2', 'b', {Tmdb: '1'}, {Name: 'Ein Titel', OriginalTitle: "Le Titre d'Été"})
		])[0];
		const text = mergedSearchText(card);
		expect(text).toContain('Ein Titel');
		expect(text).toContain('Titre d');
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

describe('joinIndexedCopies', () => {
	it('gives a card the copy another server sorts far away, and folds that copy in when paging reaches it', () => {
		const english = movie('1', 'a', {Tmdb: '5001'}, {Name: "Title One"});
		const french = movie('9', 'b', {Tmdb: '5001', Imdb: 'tt0000102'}, {Name: 'Titre Un'});
		const index = indexCopies([english, french, movie('5', 'b', {Tmdb: '1'})]);
		const holders = new Map();
		const shown = new Set();
		const [card] = foldCopies([english], holders);
		shown.add('a|1');
		expect(joinIndexedCopies(card, index, holders, (copy) => shown.has(`${copy._serverId}|${copy.Id}`))).toBe(true);
		expect(copiesOf(card).map((i) => i.Name)).toEqual(["Title One", 'Titre Un']);
		// Paging reaches the copy: it joins the card instead of becoming one, and isn't added twice.
		expect(foldCopies([movie('9', 'b', {Tmdb: '5001', Imdb: 'tt0000102'})], holders)).toEqual([]);
		expect(serverCountOf(card)).toBe(2);
		expect(copiesOf(card)).toHaveLength(2);
	});

	it('follows the ids of a copy already on the card to the copies they lead to', () => {
		const holders = new Map();
		const [card] = foldCopies([movie('1', 'a', {Tmdb: '1'}), movie('2', 'b', {Tmdb: '1', Imdb: 'tt2'})], holders);
		const c = movie('3', 'c', {Imdb: 'tt2'});
		const shown = new Set(['a|1', 'b|2']);
		joinIndexedCopies(card, indexCopies([c, movie('2', 'b', {Tmdb: '1', Imdb: 'tt2'})]), holders, (copy) => shown.has(`${copy._serverId}|${copy.Id}`));
		expect(copiesOf(card).map((i) => i._serverId)).toEqual(['a', 'b', 'c']);
	});

	it('swaps the light copy the index gave for the full one paging brings', () => {
		const holders = new Map();
		const [card] = foldCopies([movie('1', 'a', {Tmdb: '5001'})], holders);
		const light = movie('9', 'b', {Tmdb: '5001'});
		joinIndexedCopies(card, indexCopies([light]), holders, () => false);
		foldCopies([movie('9', 'b', {Tmdb: '5001'}, {UserData: {Played: true}, ImageTags: {Primary: 'p'}})], holders);
		expect(copiesOf(card)).toHaveLength(2);
		expect(copiesOf(card)[1]).toMatchObject({Id: '9', UserData: {Played: true}, ImageTags: {Primary: 'p'}});
	});

	it('keeps the full copy when a card holding a light one of it is folded in', () => {
		const holders = new Map();
		const [a, c] = foldCopies([movie('1', 'a', {Tmdb: '5003'}), movie('3', 'c', {Imdb: 'tt5003'})], holders);
		// Paging folds the full copy of B into A.
		foldCopies([movie('2', 'b', {Tmdb: '5003'}, {UserData: {Played: true}})], holders);
		// The index gives C a light copy of the same B.
		joinIndexedCopies(c, indexCopies([movie('2', 'b', {Imdb: 'tt5003'})]), holders, () => false);
		// An item that holds both ids folds C into A.
		foldCopies([movie('4', 'd', {Tmdb: '5003', Imdb: 'tt5003'})], holders);
		const b = copiesOf(a).find((copy) => copy._serverId === 'b');
		expect(b).toMatchObject({UserData: {Played: true}});
		expect(b._lightCopy).toBeUndefined();
	});

	it('leaves alone a copy paging already showed', () => {
		const a = movie('1', 'a', {Tmdb: '5003'});
		const b = movie('2', 'b', {Tmdb: '5003'});
		const card = foldCopies([a])[0];
		expect(joinIndexedCopies(card, indexCopies([a, b]), new Map(), () => true)).toBe(false);
		expect(hasMergedCopies(card)).toBe(false);
	});
});
