import {sortById, titlesFetcher} from './bookTitles';

const library = {Id: 'lib', CollectionType: 'books'};
const epub = (id) => ({Id: id, Type: 'Book', Name: id, Path: `/b/${id}.epub`});
const comic = (id) => ({Id: id, Type: 'Book', Name: id, Path: `/c/${id}.cbz`});
const page = (items, total) => ({Items: items, TotalRecordCount: total});

describe('titlesFetcher', () => {
	it('asks for the scope in the sort picked, narrowed to a genre', async () => {
		const audiobook = {Id: 'a', Type: 'AudioBook'};
		const api = {getItems: jest.fn().mockResolvedValue(page([audiobook], 1))};
		const result = await titlesFetcher({api, library, scope: 'audiobooks', sort: sortById('name'), genreId: 'g1'})(0, 100);
		expect(api.getItems.mock.calls[0][0]).toMatchObject({ParentId: 'lib', IncludeItemTypes: 'AudioBook', GenreIds: 'g1', SortBy: 'SortName', SortOrder: 'Ascending', StartIndex: 0, Limit: 100});
		expect(result).toEqual({items: [audiobook], total: 1});
	});

	it('splits comics from books, keeping the server total so paging follows its offsets', async () => {
		const api = {getItems: jest.fn().mockResolvedValue(page([comic('c1'), epub('e1'), comic('c2')], 250))};
		expect(await titlesFetcher({api, library, scope: 'books'})(100, 100)).toEqual({items: [epub('e1')], total: 250});
		expect(await titlesFetcher({api, library, scope: 'comics'})(0, 100)).toEqual({items: [comic('c1'), comic('c2')], total: 250});
	});

	it('goes untyped once the typed query comes back empty, and stays that way', async () => {
		const api = {getItems: jest.fn()
			.mockResolvedValueOnce(page([], 0))
			.mockResolvedValueOnce(page([epub('a'), {Id: 'f', Type: 'Folder'}], 90))
			.mockResolvedValueOnce(page([epub('b')], 90))};
		const fetchPage = titlesFetcher({api, library});
		expect((await fetchPage(0, 2)).items).toEqual([epub('a')]);
		expect(api.getItems.mock.calls[1][0]).toMatchObject({ExcludeItemTypes: 'Folder,CollectionFolder,UserView'});
		expect(api.getItems.mock.calls[1][0].IncludeItemTypes).toBeUndefined();
		await fetchPage(2, 2);
		expect(api.getItems.mock.calls[2][0]).toMatchObject({StartIndex: 2, ExcludeItemTypes: 'Folder,CollectionFolder,UserView'});
	});

	it('reads every favorite whatever the scope', async () => {
		const api = {getItems: jest.fn().mockResolvedValue(page([comic('c1'), epub('e1')], 2))};
		const result = await titlesFetcher({api, library, scope: 'books', favorites: true})(0, 50);
		expect(api.getItems.mock.calls[0][0]).toMatchObject({Filters: 'IsFavorite', IncludeItemTypes: 'Book,AudioBook'});
		expect(result.items).toHaveLength(2);
	});
});
