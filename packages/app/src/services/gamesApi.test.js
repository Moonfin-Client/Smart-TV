import {getRomUrl, getStateBytes, putStateBytes} from './gamesApi';
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

	test('ends the direct url in the file name it is given', async () => {
		fetchWithTimeout.mockResolvedValueOnce(probeOf(4 * MB));

		const rom = await getRomUrl('lib', 'game', 'sf2 (world).zip');

		expect(rom.url).toBe('https://server/Moonfin/Games/lib/Rom/game/sf2%20(world).zip?ApiKey=key');
		expect(fetchWithTimeout.mock.calls[0][0]).toBe(rom.url);
	});

	test('fetches the blob fallback from the plain rom route', async () => {
		fetchWithTimeout
			.mockRejectedValueOnce(new Error('network'))
			.mockResolvedValueOnce(response({headers: {'content-length': String(2 * MB)}}));

		await getRomUrl('lib', 'game', 'sf2.zip');

		expect(fetchWithTimeout.mock.calls[1][0]).toBe('https://server/Moonfin/Games/lib/Rom/game');
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

describe('getStateBytes', () => {
	const stateResponse = (status, bytes = []) => ({
		status,
		ok: status >= 200 && status < 300,
		arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer)
	});

	beforeEach(() => {
		fetchWithTimeout.mockReset();
	});

	test('reads the state under the save id it is given', async () => {
		fetchWithTimeout.mockResolvedValueOnce(stateResponse(200, [1, 2]));

		const bytes = await getStateBytes('ejs-nes-game');

		expect(Array.from(bytes)).toEqual([1, 2]);
		expect(fetchWithTimeout.mock.calls[0][0]).toBe('https://server/Moonfin/Games/Saves/ejs-nes-game?kind=state');
	});

	test('reads a 404 as no save', async () => {
		fetchWithTimeout.mockResolvedValueOnce(stateResponse(404));

		await expect(getStateBytes('ejs-nes-game')).resolves.toBeNull();
	});

	test('throws on a server error rather than reading it as no save', async () => {
		fetchWithTimeout.mockResolvedValueOnce(stateResponse(500));

		await expect(getStateBytes('ejs-nes-game')).rejects.toMatchObject({status: 500});
	});

	test('lets a network failure through', async () => {
		fetchWithTimeout.mockRejectedValueOnce(new Error('network'));

		await expect(getStateBytes('ejs-nes-game')).rejects.toThrow('network');
	});
});

describe('putStateBytes', () => {
	beforeEach(() => {
		fetchWithTimeout.mockReset();
	});

	test('uploads the state under the save id it is given', async () => {
		fetchWithTimeout.mockResolvedValueOnce({status: 204, ok: true});

		await putStateBytes('ejs-nes-game', new Uint8Array([1]));

		expect(fetchWithTimeout.mock.calls[0][0]).toBe('https://server/Moonfin/Games/Saves/ejs-nes-game?kind=state');
		expect(fetchWithTimeout.mock.calls[0][1].method).toBe('PUT');
	});

	test('throws when the server turns the upload down', async () => {
		fetchWithTimeout.mockResolvedValueOnce({status: 500, ok: false});

		await expect(putStateBytes('ejs-nes-game', new Uint8Array([1]))).rejects.toMatchObject({status: 500});
	});
});

describe('getEmulatorDataPath', () => {
	let api;
	let pageFetch;
	let directFetch;
	const playerPage = (path) => ({ok: true, status: 200, text: () => Promise.resolve(`window.EJS_pathtodata = '${path}';`)});

	beforeEach(() => {
		jest.resetModules();
		api = require('./gamesApi');
		pageFetch = require('./secureFetch').platformFetch;
		directFetch = require('../utils/fetchTimeout').fetchWithTimeout;
	});

	test('uses the server copy the player page points at', async () => {
		pageFetch.mockResolvedValueOnce(playerPage('./data/'));
		directFetch.mockResolvedValueOnce({ok: true, status: 200});

		await expect(api.getEmulatorDataPath()).resolves.toBe('https://server/Moonfin/EmulatorJS/data/');
		expect(pageFetch.mock.calls[0][0]).toBe('https://server/Moonfin/EmulatorJS/player.html');
		expect(directFetch.mock.calls[0][0]).toBe('https://server/Moonfin/EmulatorJS/data/loader.js');
	});

	test('uses an admin URL as the page gives it', async () => {
		pageFetch.mockResolvedValueOnce(playerPage('https://cores.example/data/'));
		directFetch.mockResolvedValueOnce({ok: true, status: 200});

		await expect(api.getEmulatorDataPath()).resolves.toBe('https://cores.example/data/');
	});

	test('stays on the CDN when this TV can\'t reach the path', async () => {
		pageFetch.mockResolvedValueOnce(playerPage('./data/'));
		directFetch.mockRejectedValueOnce(new TypeError('certificate'));

		await expect(api.getEmulatorDataPath()).resolves.toBeNull();
	});

	test('stays on the CDN when the server has no player page', async () => {
		pageFetch.mockResolvedValueOnce({ok: false, status: 404});

		await expect(api.getEmulatorDataPath()).resolves.toBeNull();
		expect(directFetch).not.toHaveBeenCalled();
	});

	test('asks each server once', async () => {
		pageFetch.mockResolvedValue(playerPage('./data/'));
		directFetch.mockResolvedValue({ok: true, status: 200});

		await api.getEmulatorDataPath();
		await api.getEmulatorDataPath();

		expect(pageFetch).toHaveBeenCalledTimes(1);
	});
});

describe('setGameCoreOverride', () => {
	test('puts the core for the game and returns it as it now plays', async () => {
		const {platformFetch} = require('./secureFetch');
		const {setGameCoreOverride} = require('./gamesApi');
		platformFetch.mockResolvedValueOnce({ok: true, status: 200, text: () => Promise.resolve('{"id":"g1","core":"mame"}')});

		await expect(setGameCoreOverride('lib', 'g1', 'mame')).resolves.toEqual({id: 'g1', core: 'mame'});

		const [url, options] = platformFetch.mock.calls[platformFetch.mock.calls.length - 1];
		expect(url).toBe('https://server/Moonfin/Games/lib/Games/g1/Core');
		expect(options.method).toBe('PUT');
		expect(JSON.parse(options.body)).toEqual({core: 'mame'});
	});
});
