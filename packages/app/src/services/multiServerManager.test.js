import {addServer, getAllServersArray, getUniqueServers, removeServer} from './multiServerManager';

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
});
