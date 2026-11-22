import {fetchWithTimeout} from '../utils/fetchTimeout';
import {getArrQueue, removeArrQueueItem, setMoonfinConfig} from './seerrApi';

jest.mock('../utils/fetchTimeout', () => ({fetchWithTimeout: jest.fn()}));
jest.mock('../platform', () => ({isLegacyWebOS: () => false, isLegacyTizen: () => false}));
jest.mock('./jellyfinApi', () => ({createApiForServer: jest.fn(), getUserId: () => null}));
jest.mock('./siloSession', () => ({loadSiloSessions: () => Promise.resolve()}));
jest.mock('./moonbaseEndpoint', () => ({
	moonbaseEndpoint: async (base, token) => ({base, headers: {Authorization: `MediaBrowser Token="${token}"`}}),
	isSiloLogin: () => false
}));

const answer = (status, body = '') => () => Promise.resolve({
	status,
	text: () => Promise.resolve(body),
	headers: {forEach: () => {}}
});

beforeEach(() => setMoonfinConfig('http://server', 'token'));

describe('getArrQueue', () => {
	test('asks Radarr by TMDB id and Sonarr by TVDB id', async () => {
		fetchWithTimeout.mockImplementation(answer(200, '{"service":"radarr","items":[]}'));
		await getArrQueue('radarr', 10378);
		await getArrQueue('sonarr', 280619);
		expect(fetchWithTimeout.mock.calls[0][0]).toBe('http://server/Moonfin/Seerr/Radarr/Queue?tmdbId=10378');
		expect(fetchWithTimeout.mock.calls[1][0]).toBe('http://server/Moonfin/Seerr/Sonarr/Queue?tvdbId=280619');
		expect(fetchWithTimeout.mock.calls[0][1].headers.Authorization).toBe('MediaBrowser Token="token"');
	});

	test('a 200 comes back as the queue', async () => {
		fetchWithTimeout.mockImplementation(answer(200, '{"service":"radarr","inArr":true,"items":[]}'));
		expect(await getArrQueue('radarr', 1)).toEqual({service: 'radarr', inArr: true, items: []});
	});

	test.each([404, 400, 502, 503])('a %i means the plugin can\'t see the arr', async (status) => {
		fetchWithTimeout.mockImplementation(answer(status, '{"error":"x"}'));
		expect(await getArrQueue('radarr', 1)).toBeNull();
	});

	test('a body that isn\'t a queue, or a network error, is null too', async () => {
		fetchWithTimeout.mockImplementation(answer(200, '<html>'));
		expect(await getArrQueue('radarr', 1)).toBeNull();
		fetchWithTimeout.mockImplementation(() => Promise.reject(new Error('down')));
		expect(await getArrQueue('radarr', 1)).toBeNull();
	});
});

describe('removeArrQueueItem', () => {
	test('sends a DELETE for the item and counts a 200 as done', async () => {
		fetchWithTimeout.mockImplementation(answer(200, '{"removed":[5]}'));
		await expect(removeArrQueueItem('sonarr', 5)).resolves.toBe(true);
		expect(fetchWithTimeout.mock.calls[0][0]).toBe('http://server/Moonfin/Seerr/Sonarr/Queue/5');
		expect(fetchWithTimeout.mock.calls[0][1].method).toBe('DELETE');
	});

	test('a 404 means it already left the queue, which is done too', async () => {
		fetchWithTimeout.mockImplementation(answer(404));
		await expect(removeArrQueueItem('radarr', 5)).resolves.toBe(true);
	});

	test('a 403 or 502 is an error with its status', async () => {
		fetchWithTimeout.mockImplementation(answer(403, '{"error":"Admin only"}'));
		await expect(removeArrQueueItem('radarr', 5)).rejects.toMatchObject({status: 403, message: 'Admin only'});
		fetchWithTimeout.mockImplementation(answer(502));
		await expect(removeArrQueueItem('radarr', 5)).rejects.toMatchObject({status: 502});
	});
});
