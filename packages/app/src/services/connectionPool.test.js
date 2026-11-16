import {getApiForItem, getLatestPerLibraryFromAllServers, oneAccountPerServer} from './connectionPool';
import {createApiForServer} from './jellyfinApi';
import * as multiServerManager from './multiServerManager';

jest.mock('./multiServerManager', () => ({getAllServersArray: jest.fn(), getActiveServer: jest.fn(async () => null)}));
jest.mock('./jellyfinApi', () => ({createApiForServer: jest.fn()}));
jest.mock('./parentalControls', () => ({withoutBlockedItems: (items) => items}));

const server = (name, url) => ({serverId: name, name, url, userId: 'u', accessToken: 't', serverType: 'jellyfin'});

describe('the latest rows across servers', () => {
	test('keep each server\'s own library order, servers by name', async () => {
		multiServerManager.getAllServersArray.mockResolvedValue([server('Zeta', 'http://z'), server('Alpha', 'http://a')]);
		const librariesFor = {
			'http://a': [{Id: 'a-shows', Name: 'Shows'}, {Id: 'a-movies', Name: 'Movies'}],
			'http://z': [{Id: 'z-music', Name: 'Music'}, {Id: 'z-anime', Name: 'Anime'}]
		};
		createApiForServer.mockImplementation((url) => ({
			getLibraries: async () => ({Items: librariesFor[url]}),
			getLatestMedia: async (libraryId) => [{Id: `${libraryId}-item`}]
		}));
		const results = await getLatestPerLibraryFromAllServers();
		expect(results.map((result) => result.lib.Id)).toEqual(['a-shows', 'a-movies', 'z-music', 'z-anime']);
	});
});

describe('the api for a title from another server', () => {
	const item = (serverType) => ({Id: 'm1', _serverUrl: 'http://emby', _serverAccessToken: 't', _serverUserId: 'u', _serverType: serverType});

	test('talks to that server as its own kind, and as Jellyfin when the title never said', () => {
		getApiForItem(item('emby'));
		getApiForItem(item(undefined));
		expect(createApiForServer.mock.calls.slice(-2)).toEqual([
			['http://emby', 't', 'u', 'emby'],
			['http://emby', 't', 'u', 'jellyfin']
		]);
	});

	test("leaves a title from the signed-in server to the app's own api", () => {
		expect(getApiForItem({Id: 'm1'})).toBeNull();
	});
});

describe('one account per server', () => {
	const account = (serverId, userId, extra = {}) => ({serverId, userId, accessToken: 't', serverType: 'jellyfin', ...extra});

	test('keeps the signed-in account on its server and the first saved one with a token elsewhere', () => {
		const servers = [account('a', 'kid'), account('a', 'me'), account('b', 'x', {accessToken: ''}), account('b', 'y'), account('b', 'z')];
		expect(oneAccountPerServer(servers, {serverId: 'a', userId: 'me'}).map((s) => `${s.serverId}:${s.userId}`)).toEqual(['a:me', 'b:y']);
	});

	test('reads another Silo server as its most recently used profile that needs no PIN', () => {
		const silo = (userId, lastConnected, siloHasPin = false) => account('s', userId, {serverType: 'silo', lastConnected, siloHasPin});
		const servers = [silo('old', '2026-01-01'), silo('locked', '2026-12-01', true), silo('recent', '2026-06-01')];
		expect(oneAccountPerServer(servers, null).map((s) => s.userId)).toEqual(['recent']);
		expect(oneAccountPerServer([silo('locked', '2026-12-01', true)], null)).toEqual([]);
	});
});
