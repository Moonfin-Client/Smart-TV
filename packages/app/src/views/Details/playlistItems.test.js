import {fetchAllPlaylistItems} from './playlistItems';

const entries = (from, count) => Array.from({length: count}, (_, i) => ({Id: `item-${from + i}`}));

describe('fetchAllPlaylistItems', () => {
	test('reads page after page until the whole playlist is in', async () => {
		const api = {getPlaylistItems: jest.fn(async (id, limit, start = 0) => ({Items: entries(start, Math.min(limit, 650 - start)), TotalRecordCount: 650}))};
		const items = await fetchAllPlaylistItems(api, 'pl');
		expect(items).toHaveLength(650);
		expect(items[649].Id).toBe('item-649');
		expect(api.getPlaylistItems.mock.calls.map((call) => call[2] || 0)).toEqual([0, 300, 600]);
	});

	test('stops asking once the total is reached, even when the server ignores StartIndex', async () => {
		const api = {getPlaylistItems: jest.fn(async () => ({Items: entries(0, 300), TotalRecordCount: 650}))};
		await fetchAllPlaylistItems(api, 'pl');
		expect(api.getPlaylistItems).toHaveBeenCalledTimes(3);
	});

	test('takes a single page when the server sends no total', async () => {
		const api = {getPlaylistItems: jest.fn(async () => ({Items: entries(0, 300)}))};
		expect(await fetchAllPlaylistItems(api, 'pl')).toHaveLength(300);
		expect(api.getPlaylistItems).toHaveBeenCalledTimes(1);
	});
});
