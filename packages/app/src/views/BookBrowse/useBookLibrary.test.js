import {loadBookSeries} from './useBookLibrary';

const book = (Id, SeriesName, extra) => ({Id, Type: 'Book', Name: Id, SeriesName, ...extra});

const apiWith = ({ancestors, titles}) => ({
	getAncestors: jest.fn(() => (ancestors instanceof Error ? Promise.reject(ancestors) : Promise.resolve(ancestors))),
	getItems: jest.fn(() => Promise.resolve({Items: titles}))
});

describe('a book\'s series', () => {
	test('is every title in its library carrying the series name, however few', async () => {
		const api = apiWith({
			ancestors: [{Id: 'folder', Type: 'Folder'}, {Id: 'lib', Type: 'CollectionFolder', CollectionType: 'books'}],
			titles: [book('dune', 'Dune', {ImageTags: {Primary: 't'}}), book('neuromancer', 'Sprawl'), book('messiah', ' Dune ')]
		});

		const series = await loadBookSeries(api, book('dune', 'Dune'));

		expect(api.getItems.mock.calls[0][0]).toMatchObject({ParentId: 'lib', IncludeItemTypes: 'Book,AudioBook', Recursive: true});
		expect(series).toMatchObject({Id: 'bookSeries:Dune', Name: 'Dune', Type: 'BookSeries', ChildCount: 2, PrimaryImageItemId: 'dune'});
		expect(series.Members.map((member) => member.Id)).toEqual(['dune', 'messiah']);
	});

	test('looks through every book when the library can\'t be found', async () => {
		const api = apiWith({ancestors: new Error('offline'), titles: [book('solo', 'Solo')]});

		const series = await loadBookSeries(api, book('solo', 'Solo'));

		expect(api.getItems.mock.calls[0][0].ParentId).toBeUndefined();
		expect(series.ChildCount).toBe(1);
	});

	test('is nothing for a book outside any series', async () => {
		const api = apiWith({ancestors: [], titles: []});

		expect(await loadBookSeries(api, book('dune', '  '))).toBeNull();
		expect(api.getItems).not.toHaveBeenCalled();
	});
});
