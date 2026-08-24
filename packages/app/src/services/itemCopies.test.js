jest.mock('./multiServerManager', () => ({getAllServersArray: jest.fn()}));
jest.mock('./jellyfinApi', () => ({createApiForServer: jest.fn()}));

import * as multiServerManager from './multiServerManager';
import {createApiForServer} from './jellyfinApi';
import {getItemCopiesFromAllServers} from './connectionPool';

const server = (serverId, name) => ({
	serverId,
	name,
	url: `http://${serverId}`,
	userId: 'u1',
	accessToken: `token-${serverId}`,
	serverType: 'jellyfin'
});

// Each server answers a name search with whatever it holds, which is what the
// provider ids then get matched against.
const servingItems = (byServerId) => {
	createApiForServer.mockImplementation((url) => ({
		getItems: () => Promise.resolve({Items: byServerId[url.replace('http://', '')] || []})
	}));
};

const dune = {Id: 'local', Name: 'Dune', Type: 'Movie', ProviderIds: {Imdb: 'tt1160419'}};

describe('getItemCopiesFromAllServers', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		multiServerManager.getAllServersArray.mockResolvedValue([server('s1', 'Attic'), server('s2', 'Shed')]);
	});

	test('a title held by both servers comes back once per server', async () => {
		servingItems({
			s1: [{Id: 'a', Name: 'Dune', ProviderIds: {Imdb: 'tt1160419'}}],
			s2: [{Id: 'b', Name: 'Dune', ProviderIds: {Imdb: 'tt1160419'}}]
		});

		const copies = await getItemCopiesFromAllServers(dune);

		expect(copies.map((c) => c.name)).toEqual(['Attic', 'Shed']);
		expect(copies[1].item.Id).toBe('b');
		expect(copies[1].item._serverAccessToken).toBe('token-s2');
	});

	test('a server holding a different title of the same name is not offered', async () => {
		servingItems({
			s1: [{Id: 'a', Name: 'Dune', ProviderIds: {Imdb: 'tt1160419'}}],
			s2: [{Id: 'b', Name: 'Dune', ProviderIds: {Imdb: 'tt0087182'}}]
		});

		const copies = await getItemCopiesFromAllServers(dune);

		expect(copies.map((c) => c.serverId)).toEqual(['s1']);
	});

	test('a title identified by tmdb rather than imdb matches just the same', async () => {
		servingItems({
			s1: [{Id: 'a', Name: 'Dune', ProviderIds: {Tmdb: '438631'}}],
			s2: [{Id: 'b', Name: 'Dune', ProviderIds: {tmdb: '438631'}}]
		});

		const copies = await getItemCopiesFromAllServers({...dune, ProviderIds: {Tmdb: '438631'}});

		expect(copies).toHaveLength(2);
	});

	test('a copy the rows would not have folded together is not offered either', async () => {
		servingItems({
			s1: [{Id: 'a', Name: 'Dune', ProviderIds: {Imdb: 'tt1160419'}}],
			s2: [{Id: 'b', Name: 'Dune', ProviderIds: {Tmdb: '438631'}}]
		});

		const copies = await getItemCopiesFromAllServers(dune);

		expect(copies.map((c) => c.serverId)).toEqual(['s1']);
	});

	test('an item lacking type and name has no identity, so nothing is queried', async () => {
		servingItems({s1: [], s2: []});

		expect(await getItemCopiesFromAllServers({})).toEqual([]);
		expect(createApiForServer).not.toHaveBeenCalled();
	});

	test('one server on its own with only one copy has nothing to pick between', async () => {
		multiServerManager.getAllServersArray.mockResolvedValue([server('s1', 'Attic')]);
		servingItems({s1: [{Id: 'a', Name: 'Dune', ProviderIds: {Imdb: 'tt1160419'}}]});

		expect(await getItemCopiesFromAllServers(dune)).toEqual([]);
	});

	test('one server holding multiple versions in different libraries offers both copies', async () => {
		multiServerManager.getAllServersArray.mockResolvedValue([server('s1', 'Attic')]);
		servingItems({
			s1: [
				{Id: 'a', Name: 'Dune', ProviderIds: {Imdb: 'tt1160419'}, _libraryName: '4K Movies'},
				{Id: 'b', Name: 'Dune', ProviderIds: {Imdb: 'tt1160419'}, _libraryName: 'HD Movies'}
			]
		});

		const copies = await getItemCopiesFromAllServers(dune);

		expect(copies).toHaveLength(2);
		expect(copies.map((c) => c.item.Id)).toEqual(['a', 'b']);
		expect(copies.map((c) => c.libraryName)).toEqual(['4K Movies', 'HD Movies']);
	});

	test('two accounts on one server with only one copy returns empty list', async () => {
		multiServerManager.getAllServersArray.mockResolvedValue([
			server('s1', 'Attic'),
			{...server('s1', 'Attic'), userId: 'u2'}
		]);
		servingItems({s1: [{Id: 'a', Name: 'Dune', ProviderIds: {Imdb: 'tt1160419'}}]});

		expect(await getItemCopiesFromAllServers(dune)).toEqual([]);
	});

	test('a server that cant be reached is left out rather than failing the rest', async () => {
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
		createApiForServer.mockImplementation((url) => ({
			getItems: () => (url.endsWith('s2')
				? Promise.reject(new Error('offline'))
				: Promise.resolve({Items: [{Id: 'a', Name: 'Dune', ProviderIds: {Imdb: 'tt1160419'}}]}))
		}));

		const copies = await getItemCopiesFromAllServers(dune);

		expect(copies.map((c) => c.serverId)).toEqual(['s1']);
		warn.mockRestore();
	});
});
