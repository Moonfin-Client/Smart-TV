jest.mock('@enact/i18n/$L', () => (text) => text);
jest.mock('../platform', () => ({isWebOS: () => false, isVega: jest.fn(() => false)}));
jest.mock('../utils/fetchTimeout', () => ({fetchWithTimeout: jest.fn()}));
jest.mock('../utils/networkLogSink', () => ({traceRequest: (url, options, send) => send()}));
jest.mock('./storage', () => ({getFromStorage: jest.fn()}));
jest.mock('./shellBridge', () => ({loadShellBridge: jest.fn()}));

import {fetchWithTimeout} from '../utils/fetchTimeout';
import {isVega} from '../platform';
import {corsFreeFetch, platformFetch} from './secureFetch';
import {loadShellBridge} from './shellBridge';
import {getFromStorage} from './storage';

describe('a certificate the shell refuses', () => {
	const refused = () => new TypeError('Failed to fetch');
	const answer = {ok: true, status: 200};
	let bridge;

	beforeEach(() => {
		bridge = {allowInsecureHost: jest.fn()};
		loadShellBridge.mockResolvedValue(bridge);
		getFromStorage.mockResolvedValue({allowInsecureCerts: true});
		fetchWithTimeout.mockReset();
	});

	test('is accepted for that server and the request tried once more, with the setting on', async () => {
		fetchWithTimeout.mockRejectedValueOnce(refused()).mockResolvedValueOnce(answer);

		await expect(platformFetch('https://nas-one:8920/System/Info/Public')).resolves.toBe(answer);

		expect(bridge.allowInsecureHost).toHaveBeenCalledWith('nas-one:8920');
		expect(fetchWithTimeout).toHaveBeenCalledTimes(2);
	});

	test('stays refused with the setting off', async () => {
		getFromStorage.mockResolvedValue({allowInsecureCerts: false});
		fetchWithTimeout.mockRejectedValue(refused());

		await expect(platformFetch('https://nas-two/System/Info/Public')).rejects.toThrow('Failed to fetch');

		expect(bridge.allowInsecureHost).not.toHaveBeenCalled();
		expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
	});

	test('is only brought to the shell once for a server', async () => {
		fetchWithTimeout.mockRejectedValue(refused());

		await expect(platformFetch('https://nas-three/a')).rejects.toThrow('Failed to fetch');
		await expect(platformFetch('https://nas-three/b')).rejects.toThrow('Failed to fetch');

		expect(bridge.allowInsecureHost).toHaveBeenCalledTimes(1);
		expect(fetchWithTimeout).toHaveBeenCalledTimes(3);
	});

	test('isnt what a failed http request or a timeout is taken for', async () => {
		const timeout = Object.assign(new Error('The operation was aborted.'), {name: 'AbortError'});
		fetchWithTimeout.mockRejectedValueOnce(refused()).mockRejectedValueOnce(timeout);

		await expect(platformFetch('http://nas-four:8096/a')).rejects.toThrow('Failed to fetch');
		await expect(platformFetch('https://nas-four:8920/a')).rejects.toThrow('aborted');

		expect(bridge.allowInsecureHost).not.toHaveBeenCalled();
	});

	test('is left alone where there is no shell', async () => {
		loadShellBridge.mockResolvedValue(null);
		fetchWithTimeout.mockRejectedValue(refused());

		await expect(platformFetch('https://nas-five/a')).rejects.toThrow('Failed to fetch');

		expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
	});
});

describe('a request a Plex server only answers app.plex.tv for', () => {
	beforeEach(() => fetchWithTimeout.mockReset());
	afterEach(() => isVega.mockReturnValue(false));

	test('is made by the shell on Fire TV', async () => {
		isVega.mockReturnValue(true);
		const bridge = {requestThroughShell: jest.fn().mockResolvedValue({status: 200, body: '{"MediaContainer":{}}'})};
		loadShellBridge.mockResolvedValue(bridge);

		const response = await corsFreeFetch('http://plex:32400/identity', {headers: {Accept: 'application/json'}}, 4000);

		expect(await response.json()).toEqual({MediaContainer: {}});
		expect(bridge.requestThroughShell).toHaveBeenCalledWith('http://plex:32400/identity', {headers: {Accept: 'application/json'}}, 4000);
		expect(fetchWithTimeout).not.toHaveBeenCalled();
	});

	test('fails as a network error when nothing answers the shell', async () => {
		isVega.mockReturnValue(true);
		loadShellBridge.mockResolvedValue({requestThroughShell: jest.fn().mockResolvedValue({status: 0, body: ''})});

		await expect(corsFreeFetch('http://plex:32400/identity')).rejects.toMatchObject({connectionType: 'network'});
	});

	test('goes straight to the server everywhere else', async () => {
		fetchWithTimeout.mockResolvedValue({ok: true, status: 200});

		await corsFreeFetch('http://plex:32400/identity');

		expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
	});
});
