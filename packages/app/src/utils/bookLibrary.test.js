import {
	SCOPE_ALL, SCOPE_AUDIOBOOKS, SCOPE_BOOKS, SCOPE_COMICS,
	authorTitleCounts, availableScopes, bookCounts, bookImageUrl, bookProgressMeta, bookSeriesEntries, bookSubtitle,
	formatBookDuration, genreHue, isComicItem, isMixedLibrary, matchesScope, peopleAuthors, scopedTypes
} from './bookLibrary';

const epub = {Id: 'e1', Type: 'Book', Name: 'Dune', Path: '/books/Frank Herbert/Dune.epub'};
const comic = {Id: 'c1', Type: 'Book', Name: 'Saga 1', Path: '/books/Comics/Saga/Saga 1.cbz'};
const audiobook = {Id: 'a1', Type: 'AudioBook', Name: 'Dune', RunTimeTicks: 36000000000 * 6 + 600000000 * 12};

describe('formats', () => {
	it('tells comics, audiobooks and ebooks apart', () => {
		expect(isComicItem(comic)).toBe(true);
		expect(isComicItem(epub)).toBe(false);
		expect(matchesScope(comic, SCOPE_BOOKS)).toBe(false);
		expect(matchesScope(comic, SCOPE_COMICS)).toBe(true);
		expect(matchesScope(audiobook, SCOPE_AUDIOBOOKS)).toBe(true);
		expect(matchesScope(epub, SCOPE_ALL)).toBe(true);
	});

	it('counts each format and offers a filter only for a mixed library', () => {
		const counts = bookCounts([epub, comic, audiobook]);
		expect(counts).toEqual({all: 3, books: 1, audiobooks: 1, comics: 1});
		expect(isMixedLibrary({CollectionType: 'books'}, counts)).toBe(true);
		expect(isMixedLibrary({CollectionType: 'books'}, bookCounts([epub]))).toBe(false);
		expect(isMixedLibrary({CollectionType: 'audiobooks'}, counts)).toBe(false);
		expect(availableScopes(bookCounts([epub, audiobook]))).toEqual([SCOPE_ALL, SCOPE_BOOKS, SCOPE_AUDIOBOOKS]);
	});

	it('asks for audiobooks in a books library too', () => {
		const books = {CollectionType: 'books'};
		expect(scopedTypes(books, SCOPE_ALL)).toBe('Book,AudioBook');
		expect(scopedTypes(books, SCOPE_COMICS)).toBe('Book');
		expect(scopedTypes({CollectionType: 'audiobooks'}, SCOPE_BOOKS)).toBe('AudioBook,Audio');
	});
});

describe('cards', () => {
	it('credits the author before anything else', () => {
		expect(bookSubtitle({Type: 'Book', People: [{Name: 'Ed', Type: 'Editor'}, {Name: 'Frank Herbert', Type: 'Author'}], SeriesName: 'Dune'})).toBe('Frank Herbert');
		expect(bookSubtitle({Type: 'AudioBook', AlbumArtist: 'Simon Vance'})).toBe('Simon Vance');
		expect(bookSubtitle({Type: 'BookSeries', ChildCount: 3})).toBe('3 books');
	});

	it('borrows a parent cover when the title has none', () => {
		expect(bookImageUrl('http://s', {Id: 'b', ImageTags: {Primary: 't'}})).toBe('http://s/Items/b/Images/Primary?maxHeight=400&quality=90&tag=t');
		expect(bookImageUrl('http://s', {Id: 'b', ParentId: 'p', ParentPrimaryImageTag: 'pt'})).toBe('http://s/Items/p/Images/Primary?maxHeight=400&quality=90&tag=pt');
		expect(bookImageUrl('http://s', {Id: 'b'})).toBeNull();
	});

	it('reads progress as a share for books and time for audiobooks', () => {
		expect(formatBookDuration(600000000 * 42)).toBe('42m');
		expect(bookProgressMeta(audiobook)).toBe('6h 12m');
		expect(bookProgressMeta({...audiobook, UserData: {PlayedPercentage: 50}})).toBe('3h 6m left');
		expect(bookProgressMeta({...epub, UserData: {PlayedPercentage: 33.6}})).toBe('34% read');
		expect(bookProgressMeta(epub)).toBeNull();
	});
});

describe('bookSeriesEntries', () => {
	const folders = [
		{Id: 'root', ParentId: 'library'},
		{Id: 'saga', Name: 'Saga', ParentId: 'root'},
		{Id: 'herbert', Name: 'Frank Herbert', ParentId: 'root'}
	];
	const issue = (id, parent, extra) => ({Id: id, Type: 'Book', Name: id, Path: `/c/${id}.cbz`, ParentId: parent, ImageTags: {Primary: `t${id}`}, ...extra});

	it('groups comics by the folder they sit in, but not the library roots', () => {
		const series = bookSeriesEntries([issue('s1', 'saga'), issue('s2', 'saga'), issue('r1', 'root'), issue('r2', 'root')], folders, true);
		expect(series).toHaveLength(1);
		expect(series[0]).toMatchObject({Id: 'saga', Name: 'Saga', Type: 'BookSeries', ChildCount: 2, IsFolder: true, PrimaryImageItemId: 's1'});
		expect(series[0].StackCovers).toEqual([{Id: 's1', Tag: 'ts1'}, {Id: 's2', Tag: 'ts2'}]);
	});

	it('leaves ebooks in an author folder ungrouped, and groups them by series name instead', () => {
		const dune = {...epub, ParentId: 'herbert', SeriesName: 'Dune'};
		const messiah = {...dune, Id: 'e2', Name: 'Dune Messiah', SeriesName: ' Dune '};
		const series = bookSeriesEntries([dune, messiah], folders, false);
		expect(series).toEqual([expect.objectContaining({Id: 'bookSeries:Dune', ChildCount: 2})]);
		expect(series[0].IsFolder).toBeUndefined();
	});

	it('drops a named series whose books already show as a series folder', () => {
		const named = {SeriesName: 'Saga'};
		expect(bookSeriesEntries([issue('s1', 'saga', named), issue('s2', 'saga', named)], folders, true).map((s) => s.Id)).toEqual(['saga']);
	});
});

describe('authors', () => {
	const titles = [
		{People: [{Name: 'Frank Herbert', Type: 'Author', Id: 'p1'}], Artists: ['Simon Vance']},
		{People: [{Name: 'frank herbert', Role: 'Author'}, {Name: 'Brian Herbert', Type: 'Author'}]}
	];

	it('adds authors only named as people, once each and in name order', () => {
		expect(peopleAuthors(titles, ['simon vance']).map((a) => a.Name)).toEqual(['Brian Herbert', 'Frank Herbert']);
	});

	it('counts the titles each name is on', () => {
		const counts = authorTitleCounts(titles);
		expect(counts.get('frank herbert')).toBe(2);
		expect(counts.get('simon vance')).toBe(1);
	});
});

describe('genreHue', () => {
	it('folds the name the way a wrapping 64 bit hash does', () => {
		expect(genreHue('Fantasy')).toBe(126);
		expect(genreHue('Science Fiction')).toBe(80);
		expect(genreHue('Biography & Autobiography')).toBe(53);
		expect(genreHue('Young Adult Fiction')).toBe(214);
		expect(genreHue('日本語')).toBe(143);
	});
});
