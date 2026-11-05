import {
	OVERVIEW, ROOT_SCREEN, authorShelves, authorStats, backTarget, bookNavFor, booksByAuthor, navEntries, navKeyFor,
	readingOrder, seriesProgress, sortBookGenres, splitFavorites, titleMeta
} from './bookScreens';

// bookScreens borrows from the music screens, which come with components, so these stand in as
// they do in musicScreens.test.js.
jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {
		Fragment: React.Fragment,
		jsxDEV: (type, {children, ...props}, key) => React.createElement(type, key === undefined ? props : {...props, key}, children)
	};
});
jest.mock('@enact/spotlight', () => ({focus: jest.fn(() => true), getPointerMode: () => false}));
jest.mock('@enact/spotlight/Spottable', () => (type) => type);
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => (config, type) => type);

const library = {Id: 'lib', CollectionType: 'books'};
const epub = (id, extra) => ({Id: id, Type: 'Book', Name: id, Path: `/b/${id}.epub`, ...extra});
const comic = (id) => ({Id: id, Type: 'Book', Name: id, Path: `/c/${id}.cbz`});
const audiobook = (id, extra) => ({Id: id, Type: 'AudioBook', Name: id, ...extra});

const data = (overrides) => ({
	counts: {all: 3, books: 1, audiobooks: 1, comics: 1},
	series: [],
	authorCount: 4,
	genreCount: 0,
	collections: [],
	favoriteCount: 2,
	...overrides
});

describe('the nav', () => {
	test('each style keeps its own nav', () => {
		expect(['bookstore', 'classic', 'readingRoom', 'unknown'].map(bookNavFor)).toEqual(['rail', 'strip', 'chips', 'rail']);
	});

	test('Bookstore lists the formats with counts, then what has anything in it, then Discover', () => {
		const entries = navEntries({style: 'bookstore', library, data: data(), showDiscover: true});
		expect(entries.map((entry) => entry.key)).toEqual(['scope-all', 'scope-books', 'scope-audiobooks', 'scope-comics', 'authors', 'favorites', 'discover']);
		expect(entries[1]).toMatchObject({screen: {id: 'titles', scope: 'books'}, count: 1, section: 'titles'});
		expect(entries[5]).toMatchObject({section: 'browse', count: 2});
	});

	test('a library of one format gets one Titles entry, and Discover follows its setting', () => {
		const entries = navEntries({style: 'bookstore', library, data: data({counts: {all: 2, books: 2, audiobooks: 0, comics: 0}}), showDiscover: false});
		expect(entries.map((entry) => entry.key)).toEqual(['scope-all', 'authors', 'favorites']);
	});

	test('Classic and Reading Room lead with Overview and list Titles once', () => {
		const entries = navEntries({style: 'classic', library, data: data({series: [{}]}), showDiscover: true});
		expect(entries.map((entry) => entry.key)).toEqual([OVERVIEW, 'titles', 'series', 'authors', 'favorites', 'discover']);
		expect(entries[0].screen).toBeNull();
	});

	test('the current entry follows the screen', () => {
		expect(navKeyFor('bookstore', null)).toBe('scope-all');
		expect(navKeyFor('bookstore', {id: 'titles', scope: 'comics'})).toBe('scope-comics');
		expect(navKeyFor('classic', null)).toBe(OVERVIEW);
		expect(navKeyFor('readingRoom', {id: 'titles', scope: 'books'})).toBe('titles');
		expect(navKeyFor('readingRoom', {id: 'genres'})).toBe('genres');
	});

	test('Back goes to All Titles on Bookstore, the overview elsewhere, and leaves from the root', () => {
		expect(backTarget('bookstore', ROOT_SCREEN)).toBeNull();
		expect(backTarget('bookstore', {id: 'titles', scope: 'books'})).toBe(ROOT_SCREEN);
		expect(backTarget('bookstore', {id: 'authors'})).toBe(ROOT_SCREEN);
		expect(backTarget('classic', {id: 'authors'})).toBe(OVERVIEW);
		expect(backTarget('classic', null)).toBeNull();
	});
});

describe('series', () => {
	const books = [epub('c', {IndexNumber: 3}), epub('untitled'), epub('a', {IndexNumber: 1}), epub('b', {IndexNumber: 2})];

	test('reads in number order, then by name', () => {
		expect(readingOrder(books).map((book) => book.Id)).toEqual(['a', 'b', 'c', 'untitled']);
	});

	test('the next book is the first not finished', () => {
		const ordered = readingOrder(books);
		ordered[0].UserData = {Played: true};
		const progress = seriesProgress(ordered);
		expect(progress.next.Id).toBe('b');
		expect(progress.label).toBe('Book 2 of 4');
	});

	test('a series read to the end is Finished', () => {
		const progress = seriesProgress([epub('a', {UserData: {Played: true}})]);
		expect(progress).toMatchObject({next: null, finished: true, label: 'Finished'});
	});
});

describe('authors', () => {
	const titles = [
		epub('dune', {SeriesName: 'Dune', IndexNumber: 1, People: [{Name: 'Frank Herbert', Type: 'Author'}]}),
		epub('messiah', {SeriesName: 'Dune', IndexNumber: 2, People: [{Name: 'Frank Herbert', Type: 'Author'}]}),
		audiobook('dune-audio', {AlbumArtist: 'frank herbert'}),
		epub('other', {People: [{Name: 'Someone Else', Type: 'Author'}]})
	];

	test('finds an author on credits, album artists and artists whatever the case', () => {
		expect(booksByAuthor(titles, {Name: 'Frank Herbert'}).map((book) => book.Id)).toEqual(['dune', 'messiah', 'dune-audio']);
	});

	test('groups the books a shelf per series, then the rest', () => {
		const shelves = authorShelves(booksByAuthor(titles, {Name: 'Frank Herbert'}));
		expect(shelves.map((shelf) => [shelf.title, shelf.items.map((book) => book.Id)])).toEqual([['Dune', ['dune', 'messiah']], ['Other Books', ['dune-audio']]]);
		expect(authorShelves([titles[3]])[0].title).toBe('Books');
	});

	test('counts books, audiobooks and series', () => {
		expect(authorStats(booksByAuthor(titles, {Name: 'Frank Herbert'}))).toEqual({books: 2, audiobooks: 1, series: 1});
	});
});

describe('the rest', () => {
	test('a title panel names the author, year and place in a series', () => {
		expect(titleMeta(epub('x', {People: [{Name: 'Ann Leckie', Role: 'Author'}], ProductionYear: 2013, SeriesName: 'Imperial Radch', IndexNumber: 1})))
			.toBe('Ann Leckie · 2013 · Imperial Radch #1');
	});

	test('genres sort by title count with ties by name, or A to Z', () => {
		const genres = [{Name: 'Mystery', ChildCount: 2}, {Name: 'Fantasy', ChildCount: 5}, {Name: 'Drama', ChildCount: 2}];
		expect(sortBookGenres(genres, 'most').map((genre) => genre.Name)).toEqual(['Fantasy', 'Drama', 'Mystery']);
		expect(sortBookGenres(genres, 'name').map((genre) => genre.Name)).toEqual(['Drama', 'Fantasy', 'Mystery']);
	});

	test('favorites split by format', () => {
		const split = splitFavorites([epub('e'), comic('c'), audiobook('a')]);
		expect([split.books, split.audiobooks, split.comics].map((list) => list.map((item) => item.Id))).toEqual([['e'], ['a'], ['c']]);
	});
});
