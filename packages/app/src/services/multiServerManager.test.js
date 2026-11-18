import {addServer, checkServerType, getAllServersArray, getUniqueServers, removeServer} from './multiServerManager';
import {platformFetch} from './secureFetch';

jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));
jest.mock('./secureFetch', () => ({platformFetch: jest.fn()}));

const stored = {};

jest.mock('./storage', () => ({
	getFromStorage: jest.fn(),
	saveToStorage: jest.fn(),
	removeFromStorage: jest.fn()
}));

const storage = require('./storage');

beforeEach(() => {
	Object.keys(stored).forEach((key) => delete stored[key]);
	storage.getFromStorage.mockImplementation((key) => Promise.resolve(stored[key] === undefined ? null : JSON.parse(stored[key])));
	storage.saveToStorage.mockImplementation((key, value) => {
		stored[key] = JSON.stringify(value);
		return Promise.resolve();
	});
	storage.removeFromStorage.mockImplementation((key) => {
		delete stored[key];
		return Promise.resolve();
	});
});

describe('removeServer', () => {
	test('removing the last user forgets the server', async () => {
		const {serverId} = await addServer('http://jf:8096', 'Jellyfin', 'u1', 'brady', 'token');
		await removeServer(serverId, 'u1');
		expect(await getUniqueServers()).toEqual([]);
	});

	test('signing the last user out keeps the server saved', async () => {
		const {serverId} = await addServer('http://jf:8096', 'Jellyfin', 'u1', 'brady', 'token');
		await removeServer(serverId, 'u1', {keepServer: true});
		expect(await getAllServersArray()).toEqual([]);
		expect(await getUniqueServers()).toMatchObject([{serverId, name: 'Jellyfin', userCount: 0}]);
	});

	test('a server kept with no users is still forgotten by id', async () => {
		const {serverId} = await addServer('http://jf:8096', 'Jellyfin', 'u1', 'brady', 'token');
		await removeServer(serverId, 'u1', {keepServer: true});
		await removeServer(serverId);
		expect(await getUniqueServers()).toEqual([]);
	});
});

describe('checking a saved server type', () => {
	const answers = (info) => platformFetch.mockResolvedValue({ok: true, json: () => Promise.resolve(info)});
	const EMBY = {ServerName: 'emby', Version: '4.10.2.0'};
	const typeOf = async (serverId) => (await getUniqueServers()).find((entry) => entry.serverId === serverId).serverType;

	afterEach(() => platformFetch.mockReset());

	test('a Jellyfin entry that answers as Emby is saved as Emby', async () => {
		const {serverId} = await addServer('http://media:8096', 'Media', 'u1', 'brady', 'token', null, 'jellyfin');
		answers(EMBY);
		expect(await checkServerType(serverId, 'http://media:8096', 'jellyfin')).toBe('emby');
		expect(await typeOf(serverId)).toBe('emby');
	});

	test('an answer from something else, or none, keeps the saved type', async () => {
		const {serverId} = await addServer('http://media:8096', 'Media', 'u1', 'brady', 'token', null, 'emby');
		answers({ServerName: 'router'});
		expect(await checkServerType(serverId, 'http://media:8096', 'emby')).toBe('emby');
		platformFetch.mockRejectedValue(new Error('offline'));
		expect(await checkServerType(serverId, 'http://media:8096', 'emby')).toBe('emby');
		expect(await typeOf(serverId)).toBe('emby');
	});

	test('Plex and Silo are never asked', async () => {
		expect(await checkServerType('s1', 'http://plex:32400', 'plex')).toBe('plex');
		expect(await checkServerType('s2', 'http://silo:8080', 'silo')).toBe('silo');
		expect(platformFetch).not.toHaveBeenCalled();
	});

	test('a slow answer keeps the saved type for now and is saved for next time', async () => {
		const {serverId} = await addServer('http://media:8096', 'Media', 'u1', 'brady', 'token', null, 'jellyfin');
		jest.useFakeTimers();
		let reply;
		platformFetch.mockReturnValue(new Promise((resolve) => { reply = resolve; }));
		const checked = checkServerType(serverId, 'http://media:8096', 'jellyfin');
		jest.advanceTimersByTime(2000);
		expect(await checked).toBe('jellyfin');
		jest.useRealTimers();
		reply({ok: true, json: () => Promise.resolve(EMBY)});
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(await typeOf(serverId)).toBe('emby');
	});

	test('signing in again takes the type it found, and leaves it alone when it found none', async () => {
		const {serverId} = await addServer('http://media:8096', 'Media', 'u1', 'brady', 'token', null, 'jellyfin');
		await addServer('http://media:8096', 'Media', 'u2', 'kim', 'token2');
		expect(await typeOf(serverId)).toBe('jellyfin');
		await addServer('http://media:8096', 'Media', 'u2', 'kim', 'token3', null, 'emby');
		expect(await typeOf(serverId)).toBe('emby');
	});
});
