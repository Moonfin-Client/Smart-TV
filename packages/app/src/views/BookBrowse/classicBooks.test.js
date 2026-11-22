import {classicShelves, scopedAuthors} from './ClassicBooks';

// Only the pure shelf logic is under test, so the screen's components stay out of it.
jest.mock('react/jsx-dev-runtime', () => {
	const React = require('react');
	return {jsxDEV: (type, props, key) => React.createElement(type, key === undefined ? props : {...props, key})};
});
jest.mock('@enact/spotlight/Spottable', () => () => () => null);
jest.mock('@enact/spotlight/SpotlightContainerDecorator', () => () => () => null);
jest.mock('../../components/MediaCard', () => () => null);
jest.mock('./BookCard', () => ({__esModule: true, default: () => null, BookEmptyState: () => null, BookIcon: () => null}));

const library = {Id: 'lib', CollectionType: 'books'};
const epub = {Id: 'e1', Type: 'Book', Name: 'Dune', Path: '/b/Dune.epub', People: [{Name: 'Frank Herbert', Type: 'Author'}]};
const comic = {Id: 'c1', Type: 'Book', Name: 'Saga 1', Path: '/c/Saga 1.cbz'};
const audiobook = {Id: 'a1', Type: 'AudioBook', Name: 'Dune', AlbumArtist: 'Simon Vance'};

const data = {resume: [epub, audiobook], genres: [{Id: 'g', Name: 'Fantasy', Type: 'Genre'}], collections: [], favorites: [comic]};
const extra = {
	latestBooks: [epub], latestAudiobooks: [audiobook], latestComics: [comic], lastPlayed: [],
	allBooks: [epub], allAudiobooks: [audiobook], allComics: [comic], all: [epub, audiobook, comic]
};
const shelvesFor = (scope, mixed = true) => classicShelves({
	library, scope, mixed, data, extra, series: [], authors: scopedAuthors([{Id: 'p1', Name: 'Frank Herbert'}], extra.all, scope)
});

describe('classicShelves', () => {
	it('lays out every format in a mixed library and drops the empty shelves', () => {
		const shelves = shelvesFor('all');
		expect(shelves.map((s) => s.id)).toEqual(['resume', 'latestBooks', 'latestAudiobooks', 'latestComics', 'authors', 'genres', 'favorites', 'allTitles']);
		expect(shelves[shelves.length - 1].title).toBe('All Titles');
		expect(shelves.filter((s) => s.mixFormats).map((s) => s.id)).toEqual(['resume', 'favorites', 'allTitles']);
		expect(shelves.find((s) => s.id === 'genres').seeAll).toEqual({id: 'genres'});
		expect(shelves.find((s) => s.id === 'latestAudiobooks').seeAll).toEqual({id: 'titles', scope: 'audiobooks'});
		expect(shelves.find((s) => s.id === 'resume').seeAll).toEqual({id: 'titles', scope: 'all', sort: 'datePlayed'});
	});

	it('keeps a format to its own titles, with no authors for comics', () => {
		const shelves = shelvesFor('comics');
		expect(shelves.map((s) => s.id)).toEqual(['latestComics', 'allComics']);
		expect(shelves[1].title).toBe('Comics');
		expect(shelvesFor('books').find((s) => s.id === 'resume').items).toEqual([epub]);
	});

	it('names the last shelf after the one format a library holds', () => {
		expect(shelvesFor('all', false).pop()).toMatchObject({id: 'allTitles', title: 'Books'});
	});
});

describe('scopedAuthors', () => {
	const authors = [{Id: 'p1', Name: 'Frank Herbert'}, {Id: 'p2', Name: 'Simon Vance'}, {Id: 'p3', Name: 'Nobody Credited'}];

	it('keeps the authors a format credits, and audiobooks keep anyone books don\'t', () => {
		expect(scopedAuthors(authors, [epub, audiobook], 'books').map((a) => a.Name)).toEqual(['Frank Herbert']);
		expect(scopedAuthors(authors, [epub, audiobook], 'audiobooks').map((a) => a.Name)).toEqual(['Simon Vance', 'Nobody Credited']);
		expect(scopedAuthors(authors, [epub], 'comics')).toEqual([]);
		expect(scopedAuthors(authors, [epub], 'all')).toBe(authors);
	});
});
