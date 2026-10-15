const api = {serverUrl: 'http://one.lan:8096', userId: 'adult'};
// A request can wait in the queue behind others, which is when an account switch can land.
const queue = {hold: null};

jest.mock('./jellyfinApi', () => ({
	getServerUrl: () => api.serverUrl,
	getUserId: () => api.userId,
	getAuthHeader: () => `MediaBrowser Token="${api.userId}"`
}));
jest.mock('../utils/requestQueue', () => ({mediaServerQueue: {run: (fn) => (queue.hold ? queue.hold.then(fn) : fn())}}));
jest.mock('../utils/fetchTimeout', () => ({fetchWithTimeout: jest.fn()}));

import {fetchWithTimeout} from '../utils/fetchTimeout';
import {fetchCustomRow, fetchSeasonalRow, __resetExternalRowCache} from './externalRowsApi';

const answer = (body) => Promise.resolve({ok: true, json: () => Promise.resolve(body)});
const row = {source: 'tmdb_chart', type: 'trending/all/week', params: {}};
const item = (name) => ({name, type: 'Movie', providerIds: {Tmdb: '1'}});

beforeEach(() => {
	__resetExternalRowCache();
	queue.hold = null;
	fetchWithTimeout.mockReset();
	api.serverUrl = 'http://one.lan:8096';
	api.userId = 'adult';
});

describe('the row cache', () => {
	it('serves the same account the row it fetched', async () => {
		fetchWithTimeout.mockReturnValue(answer({success: true, items: [item('Carrie')]}));

		expect((await fetchCustomRow(row)).map((i) => i.name)).toEqual(['Carrie']);
		expect((await fetchCustomRow(row)).map((i) => i.name)).toEqual(['Carrie']);
		expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
	});

	it('does not hand the next account the row the last one fetched', async () => {
		fetchWithTimeout.mockReturnValueOnce(answer({success: true, items: [item('Carrie')]}));
		await fetchCustomRow({...row, type: 'movie/popular'});

		api.userId = 'child';
		fetchWithTimeout.mockReturnValueOnce(answer({success: true, items: []}));

		expect(await fetchCustomRow({...row, type: 'movie/popular'})).toEqual([]);
		expect(fetchWithTimeout).toHaveBeenCalledTimes(2);
	});

	it('keeps the servers apart as well', async () => {
		fetchWithTimeout.mockReturnValueOnce(answer({success: true, items: [item('Carrie')]}));
		await fetchCustomRow({...row, type: 'movie/top_rated'});

		api.serverUrl = 'http://two.lan:8096';
		fetchWithTimeout.mockReturnValueOnce(answer({success: true, items: [item('Elf')]}));

		expect((await fetchCustomRow({...row, type: 'movie/top_rated'})).map((i) => i.name)).toEqual(['Elf']);
	});

	it('holds the seasonal row to the account too', async () => {
		fetchWithTimeout.mockReturnValueOnce(answer({holiday: 'halloween', items: [], suggestions: [item('Carrie')]}));
		expect((await fetchSeasonalRow({country: 'NL'})).suggestions.map((i) => i.name)).toEqual(['Carrie']);

		api.userId = 'child';
		fetchWithTimeout.mockReturnValueOnce(answer({holiday: 'halloween', items: [], suggestions: []}));

		expect((await fetchSeasonalRow({country: 'NL'})).suggestions).toEqual([]);
		expect(fetchWithTimeout).toHaveBeenCalledTimes(2);
	});

	it('asks for a queued seasonal row as the account that started it', async () => {
		let release;
		queue.hold = new Promise((resolve) => { release = resolve; });
		fetchWithTimeout.mockReturnValueOnce(answer({holiday: 'halloween', items: [], suggestions: []}));
		const pending = fetchSeasonalRow({country: 'NL'});

		api.userId = 'child';
		release();
		await pending;

		expect(fetchWithTimeout.mock.calls[0][1].headers.Authorization).toBe('MediaBrowser Token="adult"');
	});
});
