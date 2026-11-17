import connectionPool from './connectionPool';
import {clearMergedTitleReads, findEveryCopy, readSharedTitles} from './mergedTitleReads';
import {copiesOf} from '../utils/mergedCopies';

jest.mock('./connectionPool', () => ({__esModule: true, default: {getMergedLibrarySources: jest.fn()}}));

const source = (serverId, items) => ({
	libraryId: `lib-${serverId}`,
	server: {_serverId: serverId, _serverName: serverId},
	api: {getItems: jest.fn(() => Promise.resolve({Items: items, TotalRecordCount: items.length}))}
});

describe('findEveryCopy', () => {
	test("finds another server's copy a Home row left out, under another name", async () => {
		connectionPool.getMergedLibrarySources.mockResolvedValue({complete: true, sources: [
			source('a', [{Id: 'm1', Type: 'Movie', Name: "Title One", ProviderIds: {Tmdb: '5001'}}]),
			source('b', [{Id: 'x9', Type: 'Movie', Name: 'Titre Un', ProviderIds: {Tmdb: '5001'}}, {Id: 'x8', Type: 'Movie', ProviderIds: {Tmdb: '1'}}])
		]});
		const card = {Id: 'm1', Type: 'Movie', _serverId: 'a', ProviderIds: {Tmdb: '5001'}};
		const found = await findEveryCopy(card);
		expect(copiesOf(found).map((copy) => `${copy._serverId}:${copy.Id}`)).toEqual(['a:m1', 'b:x9']);
		expect(copiesOf(card)).toHaveLength(1);
	});

	test('leaves a title without ids, or of another type, as it is', async () => {
		const episode = {Id: 'e1', Type: 'Episode', ProviderIds: {Tmdb: '5'}};
		expect(await findEveryCopy(episode)).toBe(episode);
		const bare = {Id: 'm2', Type: 'Movie'};
		expect(await findEveryCopy(bare)).toBe(bare);
	});

	test("never hands one account's titles to another account on the same server", async () => {
		clearMergedTitleReads();
		const first = source('a', [{Id: 'm1', Type: 'Movie'}]);
		first.server = {...first.server, _serverUserId: 'u1', _serverAccessToken: 't1'};
		const second = {...first, server: {...first.server, _serverUserId: 'u2', _serverAccessToken: 't2'}, api: {getItems: jest.fn(() => Promise.resolve({Items: [], TotalRecordCount: 0}))}};
		expect(await readSharedTitles(first, {})).toHaveLength(1);
		expect(await readSharedTitles(second, {})).toEqual([]);
		expect(second.api.getItems).toHaveBeenCalled();
	});

	test('reads again once the session ends', async () => {
		const one = source('c', [{Id: 'm1', Type: 'Movie'}]);
		await readSharedTitles(one, {});
		await readSharedTitles(one, {});
		expect(one.api.getItems).toHaveBeenCalledTimes(1);
		clearMergedTitleReads();
		await readSharedTitles(one, {});
		expect(one.api.getItems).toHaveBeenCalledTimes(2);
	});

	test("doesn't look for copies in a read that collapsed collections", async () => {
		clearMergedTitleReads();
		const collapsed = source('a', []);
		await readSharedTitles(collapsed, {IncludeItemTypes: 'Movie', CollapseBoxSetItems: true});
		const complete = {...collapsed, api: {getItems: jest.fn(() => Promise.resolve({Items: [{Id: 'm7', Type: 'Movie', ProviderIds: {Tmdb: '5007'}}], TotalRecordCount: 1}))}};
		connectionPool.getMergedLibrarySources.mockResolvedValue({complete: true, sources: [complete]});
		const found = await findEveryCopy({Id: 'h1', Type: 'Movie', _serverId: 'b', ProviderIds: {Tmdb: '5007'}}, null);
		expect(copiesOf(found).map((copy) => copy.Id)).toEqual(['h1', 'm7']);
	});
});
