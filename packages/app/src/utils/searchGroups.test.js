import {groupSearchResults, searchLibrary} from './searchGroups';

jest.mock('@enact/i18n/$L', () => (text) => text);
jest.mock('../services/gamesApi', () => ({}));

const items = (type, count) => Array.from({length: count}, (_, i) => ({Id: `${type}${i}`, Type: type}));

const counts = (result) => result.Items.reduce((acc, item) => ({...acc, [item.Type]: (acc[item.Type] || 0) + 1}), {});

describe('searchLibrary', () => {
	test('a page with room left is the whole answer', async () => {
		const api = {search: jest.fn().mockResolvedValue({Items: items('Movie', 30)})};

		expect(counts(await searchLibrary(api, 'harry potter', 240, 'jellyfin'))).toEqual({Movie: 30});
		expect(api.search).toHaveBeenCalledTimes(1);
		expect(api.search).toHaveBeenCalledWith('harry potter', 240);
	});

	test('a full Jellyfin page searches each group it left short again', async () => {
		const api = {
			search: jest.fn((query, limit, types) => (types === 'Program' ? Promise.reject(new Error('down')) : Promise.resolve({
				Items: !types ? [...items('AudioBook', 239), ...items('Movie', 1)]
					: types === 'Movie' ? items('Movie', 3)
						: types === 'Series' ? items('Series', 1) : []
			})))
		};

		const result = await searchLibrary(api, 'harry potter', 240, 'jellyfin');

		// The movie the page already had isn't counted twice, and a failed refill leaves the rest.
		expect(counts(result)).toEqual({AudioBook: 239, Movie: 3, Series: 1});
		const asked = api.search.mock.calls.map(([, , types]) => types);
		expect(asked).not.toContain('AudioBook');
		expect(asked).not.toContain('Person');
		expect(asked).not.toContain('TvChannel,LiveTvChannel');
		expect(asked).toContain('Folder,CollectionFolder,UserView');
		expect(api.search.mock.calls.slice(1).every(([, limit]) => limit === 24)).toBe(true);
	});

	test.each(['emby', 'plex'])('%s keeps its one search even when the page is full', async (serverType) => {
		const api = {search: jest.fn().mockResolvedValue({Items: items('Episode', 240)})};

		expect(counts(await searchLibrary(api, 'the', 240, serverType))).toEqual({Episode: 240});
		expect(api.search.mock.calls).toEqual([['the', 240]]);
	});
});

test('audiobooks get their own row, after books', () => {
	const groups = groupSearchResults([...items('AudioBook', 2), ...items('Book', 1), ...items('Movie', 1)]);

	expect(groups.map((g) => [g.key, g.items.length])).toEqual([['books', 1], ['audiobooks', 2], ['movies', 1]]);
});
