jest.mock('@enact/i18n/$L', () => (text) => text);
jest.mock('../platform', () => ({isWebOS: () => false, isVega: jest.fn(() => false), isXbox: jest.fn(() => false)}));
jest.mock('../utils/fetchTimeout', () => ({...jest.requireActual('../utils/fetchTimeout'), fetchWithTimeout: jest.fn()}));
jest.mock('../utils/networkLogSink', () => ({traceRequest: (url, options, send) => send()}));
jest.mock('./storage', () => ({getFromStorage: jest.fn()}));
jest.mock('./shellBridge', () => ({loadShellBridge: jest.fn()}));

import {fetchWithTimeout} from '../utils/fetchTimeout';
import {isVega, isXbox} from '../platform';
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

	test('is never extended to the Plex or Emby account services', async () => {
		fetchWithTimeout.mockRejectedValue(refused());

		await expect(platformFetch('https://clients.plex.tv/api/v2/resources')).rejects.toThrow('Failed to fetch');
		await expect(platformFetch('https://connect.emby.media/service/user/authenticate')).rejects.toThrow('Failed to fetch');

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
	afterEach(() => {
		isVega.mockReturnValue(false);
		isXbox.mockReturnValue(false);
	});

	test('is made by the shell on Fire TV', async () => {
		isVega.mockReturnValue(true);
		const bridge = {requestThroughShell: jest.fn().mockResolvedValue({status: 200, body: '{"MediaContainer":{}}'})};
		loadShellBridge.mockResolvedValue(bridge);

		const response = await corsFreeFetch('http://plex:32400/identity', {headers: {Accept: 'application/json'}}, 4000);

		expect(await response.json()).toEqual({MediaContainer: {}});
		expect(bridge.requestThroughShell).toHaveBeenCalledWith('http://plex:32400/identity', {headers: {Accept: 'application/json'}}, 4000);
		expect(fetchWithTimeout).not.toHaveBeenCalled();
	});

	test('is made by the host on Xbox, where Silo would hold its answers back too', async () => {
		isXbox.mockReturnValue(true);
		const bridge = {requestThroughShell: jest.fn().mockResolvedValue({status: 201, body: '{"ok":true}', headers: {'content-type': 'application/json'}})};
		loadShellBridge.mockResolvedValue(bridge);
		const options = {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{"username":"a"}'};

		const response = await corsFreeFetch('http://silo:8090/api/v2/auth/login', options, 15000);

		expect(response.status).toBe(201);
		expect(response.headers.get('Content-Type')).toBe('application/json');
		expect(await response.json()).toEqual({ok: true});
		expect(bridge.requestThroughShell).toHaveBeenCalledWith('http://silo:8090/api/v2/auth/login', options, 15000);
		expect(fetchWithTimeout).not.toHaveBeenCalled();
	});

	test('lets the host through a certificate it refused once the setting allows it, and asks again', async () => {
		isXbox.mockReturnValue(true);
		getFromStorage.mockResolvedValue({allowInsecureCerts: true});
		const bridge = {
			allowInsecureHost: jest.fn(),
			requestThroughShell: jest.fn().mockResolvedValueOnce({status: 0, body: ''}).mockResolvedValueOnce({status: 200, body: '{}'})
		};
		loadShellBridge.mockResolvedValue(bridge);

		const response = await corsFreeFetch('https://silo-self-signed:8443/api/v2/system/info');

		expect(response.status).toBe(200);
		expect(bridge.allowInsecureHost).toHaveBeenCalledWith('silo-self-signed:8443');
		expect(bridge.requestThroughShell).toHaveBeenCalledTimes(2);
	});

	test('fails as a network error when nothing answers the shell', async () => {
		isVega.mockReturnValue(true);
		loadShellBridge.mockResolvedValue({requestThroughShell: jest.fn().mockResolvedValue({status: 0, body: ''})});

		await expect(corsFreeFetch('http://plex:32400/identity')).rejects.toMatchObject({connectionType: 'network'});
	});

	test('never hands the shell a request its caller gave up on before its turn', async () => {
		isVega.mockReturnValue(true);
		const requestThroughShell = jest.fn();
		loadShellBridge.mockResolvedValue({requestThroughShell});
		const caller = new AbortController();
		caller.abort();

		await expect(corsFreeFetch('http://silo:8090/x', {signal: caller.signal})).rejects.toMatchObject({name: 'AbortError'});
		expect(requestThroughShell).not.toHaveBeenCalled();
	});

	test('goes straight to the server everywhere else', async () => {
		fetchWithTimeout.mockResolvedValue({ok: true, status: 200});

		await corsFreeFetch('http://plex:32400/identity');

		expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
	});
});
