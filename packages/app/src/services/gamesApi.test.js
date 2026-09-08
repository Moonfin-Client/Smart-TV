import {getRomUrl} from './gamesApi';
import {fetchWithTimeout} from '../utils/fetchTimeout';

let mockToken = 'key';

jest.mock('../utils/fetchTimeout', () => ({fetchWithTimeout: jest.fn()}));
jest.mock('./secureFetch', () => ({platformFetch: jest.fn()}));
jest.mock('./jellyfinApi', () => ({
	getServerUrl: () => 'https://server',
	getAuthHeader: () => 'MediaBrowser Token="t"',
	getApiKey: () => mockToken,
	getTokenParam: () => 'ApiKey',
	getServerType: () => 'jellyfin'
}));

const MB = 1024 * 1024;

const response = ({status = 200, headers = {}} = {}) => {
	const lower = {};
	Object.keys(headers).forEach((k) => { lower[k.toLowerCase()] = headers[k]; });
	return {
		status,
		ok: status >= 200 && status < 300,
		headers: {get: (name) => (name.toLowerCase() in lower ? lower[name.toLowerCase()] : null)},
		body: {cancel: jest.fn()},
		blob: () => Promise.resolve({size: 1})
	};
};

// A 206 to the one-byte probe, reporting `total` as the size of the whole ROM.
const probeOf = (total) => response({
	status: 206,
	headers: {'content-range': `bytes 0-0/${total}`, 'content-length': '1'}
});

describe('getRomUrl', () => {
	beforeEach(() => {
		fetchWithTimeout.mockReset();
		mockToken = 'key';
		global.URL.createObjectURL = jest.fn(() => 'blob:rom');
	});

	test('serves the direct url when the probed size is under the ceiling', async () => {
		fetchWithTimeout.mockResolvedValueOnce(probeOf(4 * MB));

		const rom = await getRomUrl('lib', 'game');

		expect(rom.isBlob).toBe(false);
		expect(rom.url).toBe('https://server/Moonfin/Games/lib/Rom/game?ApiKey=key');
		// Only the probe went out, so nothing was buffered.
		expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
	});

	test('refuses a rom past the ceiling instead of buffering it', async () => {
		fetchWithTimeout.mockResolvedValueOnce(probeOf(96 * MB));

		await expect(getRomUrl('lib', 'game')).rejects.toMatchObject({romTooLarge: true});
		expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
	});

	test('reads the size off Content-Range, not the one byte the probe asked for', async () => {
		fetchWithTimeout.mockResolvedValueOnce(response({status: 206, headers: {'content-length': '1'}}));

		const rom = await getRomUrl('lib', 'game');

		// No Content-Range means the size stayed unknown, so the 1 must not pass as the total.
		expect(rom).toEqual({url: 'https://server/Moonfin/Games/lib/Rom/game?ApiKey=key', isBlob: false});
	});

	test('falls back to a blob url when the probe cannot reach the server', async () => {
		fetchWithTimeout
			.mockRejectedValueOnce(new Error('network'))
			.mockResolvedValueOnce(response({headers: {'content-length': String(4 * MB)}}));

		const rom = await getRomUrl('lib', 'game');

		expect(rom).toEqual({url: 'blob:rom', isBlob: true});
	});

	test('applies the ceiling to the blob fallback, where the size is only known from the headers', async () => {
		fetchWithTimeout
			.mockRejectedValueOnce(new Error('network'))
			.mockResolvedValueOnce(response({headers: {'content-length': String(96 * MB)}}));

		await expect(getRomUrl('lib', 'game')).rejects.toMatchObject({romTooLarge: true});
		expect(global.URL.createObjectURL).not.toHaveBeenCalled();
	});

	test('goes straight to the blob when there is no token to put in the query', async () => {
		mockToken = null;
		fetchWithTimeout.mockResolvedValueOnce(response({headers: {'content-length': String(2 * MB)}}));

		const rom = await getRomUrl('lib', 'game');

		expect(rom.isBlob).toBe(true);
		// The probe is skipped entirely, so the blob fetch is the first request.
		expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
		expect(fetchWithTimeout.mock.calls[0][0]).toBe('https://server/Moonfin/Games/lib/Rom/game');
	});
});
