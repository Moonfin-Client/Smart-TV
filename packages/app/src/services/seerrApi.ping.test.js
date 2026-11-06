import {fetchWithTimeout} from '../utils/fetchTimeout';
import {moonfinPing} from './seerrApi';

jest.mock('../utils/fetchTimeout', () => ({fetchWithTimeout: jest.fn()}));
jest.mock('../platform', () => ({isWebOS: () => false, isLegacyTizen: () => false}));
jest.mock('./jellyfinApi', () => ({createApiForServer: jest.fn(), getUserId: () => null}));
jest.mock('./moonbaseEndpoint', () => ({
	moonbaseEndpoint: async (base, token) => ({base, headers: {Authorization: `MediaBrowser Token="${token}"`}}),
	isSiloLogin: () => false
}));

const answer = () => Promise.resolve({
	status: 200,
	text: () => Promise.resolve('{"installed":true}'),
	headers: {forEach: () => {}}
});

beforeEach(() => fetchWithTimeout.mockImplementation(answer));

test('pings sent while one is still on its way share it', async () => {
	const [first, second] = await Promise.all([moonfinPing('http://server', 'token'), moonfinPing('http://server', 'token')]);
	expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
	expect(second).toBe(first);
});

test('a ping after the last one answered goes out again', async () => {
	await moonfinPing('http://server', 'token');
	await moonfinPing('http://server', 'token');
	expect(fetchWithTimeout).toHaveBeenCalledTimes(2);
});

test('another server or token is its own ping', async () => {
	await Promise.all([moonfinPing('http://server', 'token'), moonfinPing('http://other', 'token')]);
	expect(fetchWithTimeout).toHaveBeenCalledTimes(2);
});
