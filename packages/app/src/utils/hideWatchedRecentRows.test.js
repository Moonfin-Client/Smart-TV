import {seedHideWatched, writeHidePlayedInLatest} from './hideWatchedRecentRows';

jest.mock('../services/jellyfinApi', () => ({api: {}}));

describe('Hide Watched in the recent rows', () => {
	test('starts from the account only while it has never been set', () => {
		expect(seedHideWatched({hideWatchedInRecentRows: null}, {HidePlayedInLatest: true})).toEqual({hideWatchedInRecentRows: true});
		expect(seedHideWatched({hideWatchedInRecentRows: false}, {HidePlayedInLatest: true})).toEqual({});
		expect(seedHideWatched({hideWatchedInRecentRows: null}, {HidePlayedInLatest: false})).toEqual({});
		expect(seedHideWatched({}, undefined)).toEqual({});
	});

	test('writes the account setting only when it differs', async () => {
		const config = {OrderedViews: ['a'], HidePlayedInLatest: true};
		const serverApi = {getUserConfiguration: jest.fn(async () => ({Configuration: config})), updateUserConfiguration: jest.fn(async () => null)};
		expect(await writeHidePlayedInLatest(serverApi, false)).toBe(true);
		expect(serverApi.updateUserConfiguration).toHaveBeenCalledWith({OrderedViews: ['a'], HidePlayedInLatest: false});
		serverApi.updateUserConfiguration.mockClear();
		expect(await writeHidePlayedInLatest(serverApi, true)).toBe(false);
		expect(serverApi.updateUserConfiguration).not.toHaveBeenCalled();
	});

	test('leaves an account with no such setting alone, like Plex', async () => {
		const serverApi = {getUserConfiguration: async () => ({Configuration: {}}), updateUserConfiguration: jest.fn()};
		expect(await writeHidePlayedInLatest(serverApi, true)).toBe(false);
		expect(serverApi.updateUserConfiguration).not.toHaveBeenCalled();
	});
});
