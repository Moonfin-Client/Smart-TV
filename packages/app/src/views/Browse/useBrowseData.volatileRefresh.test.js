import {renderHook, waitFor} from '@testing-library/react';

import useBrowseData from './useBrowseData';
import {clearMemoryCache, loadBrowseCache, memoryCache} from './browseCache';

jest.mock('../../services/storage', () => ({
	getFromStorage: async () => null,
	saveToStorage: async () => {},
	removeFromStorage: async () => {}
}));
jest.mock('../../services/connectionPool', () => ({}));
jest.mock('../../services/seerrApi', () => ({}));
jest.mock('../../context/SettingsContext', () => ({activeSyncProfile: () => 'tv'}));
jest.mock('../../services/jellyfinApi', () => ({
	HOME_ROW_ITEM_FIELDS: '',
	getServerUrl: () => 'http://server',
	getApiKey: () => 'key',
	getServerType: () => 'jellyfin'
}));
jest.mock('./browseCache', () => {
	const actual = jest.requireActual('./browseCache');
	return {
		...actual,
		loadBrowseCache: jest.fn(),
		saveBrowseCache: jest.fn(),
		clearBrowseCache: jest.fn(async () => {}),
		cancelPendingCacheSave: jest.fn()
	};
});

const empty = async () => ({Items: []});
const getResumeItems = jest.fn();
const getLibraries = jest.fn(empty);
const getLatest = jest.fn();
const api = {
	getLibraries,
	getLatest,
	getRecentlyReleased: empty,
	getResumeItems,
	getNextUp: empty,
	getItems: empty,
	getRandomItems: empty,
	getCollectionItems: empty,
	getUserConfiguration: async () => null
};

const props = (accessToken, userId) => ({
	api,
	serverUrl: 'http://server',
	accessToken,
	userId,
	settings: {},
	unifiedMode: false,
	seerrEnabled: false,
	seerrAuthenticated: false,
	recommendationsSupported: false,
	getItemServerUrl: () => 'http://server',
	homeRowsConfig: []
});

const cacheAged = (minutes) => ({
	serverUrl: 'http://server',
	userId: 'user-a',
	rowData: [
		{id: 'resume', title: 'Continue Watching', items: [{Id: 'item'}]},
		{id: 'latest-lib', title: 'Recently Added', items: [{Id: 'new'}], isLatestRow: true}
	],
	libraries: [{Id: 'lib'}],
	featuredItems: [{Id: 'featured'}],
	timestamp: Date.now() - minutes * 60000
});

const loaded = async (minutes) => {
	loadBrowseCache.mockImplementation(async () => cacheAged(minutes));
	const {result} = renderHook((p) => useBrowseData(p), {initialProps: props('token-a', 'user-a')});
	await waitFor(() => expect(result.current.allRowData.length).toBeGreaterThan(0));
	return result;
};

beforeEach(() => {
	clearMemoryCache();
	memoryCache.owner = null;
	loadBrowseCache.mockReset();
	getResumeItems.mockImplementation(empty);
	getLibraries.mockReset();
	getLibraries.mockImplementation(empty);
	getLatest.mockReset();
});

afterEach(() => jest.restoreAllMocks());

describe('refreshing Continue Watching and Next Up', () => {
	test("rows the load just refreshed aren't fetched again when Home first shows", async () => {
		const result = await loaded(10);
		await waitFor(() => expect(getResumeItems).toHaveBeenCalledTimes(1));
		await result.current.refreshVolatileData(true);
		expect(getResumeItems).toHaveBeenCalledTimes(1);
	});

	test('rows served from a fresh cache are still refreshed when Home first shows', async () => {
		const result = await loaded(1);
		expect(getResumeItems).not.toHaveBeenCalled();
		await result.current.refreshVolatileData(true);
		expect(getResumeItems).toHaveBeenCalledTimes(1);
	});

	test('a show well after the load refreshes them again', async () => {
		const result = await loaded(10);
		await waitFor(() => expect(getResumeItems).toHaveBeenCalledTimes(1));
		const later = Date.now() + 15000;
		jest.spyOn(Date, 'now').mockImplementation(() => later);
		await result.current.refreshVolatileData(true);
		expect(getResumeItems).toHaveBeenCalledTimes(2);
	});

	// Recently Added wasn't read again, so it keeps its age, or it would never expire.
	test("refreshing them doesn't make Recently Added look newly read", async () => {
		const cache = cacheAged(10);
		loadBrowseCache.mockImplementation(async () => cache);
		const {result} = renderHook((p) => useBrowseData(p), {initialProps: props('token-a', 'user-a')});
		await waitFor(() => expect(result.current.allRowData.length).toBeGreaterThan(0));
		await waitFor(() => expect(getResumeItems).toHaveBeenCalledTimes(1));
		expect(memoryCache.recentAt).toBe(cache.timestamp);
	});

	// Home read more than the stored copy's lifetime ago, as a TV that leaves the app running has it.
	const staleHome = async () => {
		const cache = cacheAged(10);
		loadBrowseCache.mockImplementation(async () => cache);
		const {result} = renderHook((p) => useBrowseData(p), {initialProps: props('token-a', 'user-a')});
		await waitFor(() => expect(result.current.allRowData.length).toBeGreaterThan(0));
		await waitFor(() => expect(getResumeItems).toHaveBeenCalledTimes(1));
		getLibraries.mockImplementation(async () => ({Items: [{Id: 'lib', Name: 'Movies', CollectionType: 'movies'}]}));
		getLatest.mockImplementation(async () => [{Id: 'other', Name: 'Other', Type: 'Movie'}]);
		const later = Date.now() + 25 * 60000;
		jest.spyOn(Date, 'now').mockImplementation(() => later);
		return result;
	};
	const recentIds = (result) => result.current.allRowData.find((row) => row.id === 'latest-lib')?.items.map((item) => item.Id);

	// Without this a title removed from the server stays in Recently Added until the app restarts.
	test('Recently Added is read again in place once it is older than the stored copy lasts', async () => {
		const result = await staleHome();
		await result.current.refreshVolatileData(true);
		await waitFor(() => expect(recentIds(result)).toEqual(['other']));
		expect(result.current.isLoading).toBe(false);
	});

	// Waking from standby can come before the network does.
	test("a server that can't be reached leaves the rows as they were", async () => {
		const result = await staleHome();
		getLibraries.mockImplementation(async () => {
			throw new Error('offline');
		});
		jest.spyOn(console, 'warn').mockImplementation(() => {});
		await result.current.refreshVolatileData(true);
		await waitFor(() => expect(getLibraries).toHaveBeenCalledTimes(1));
		expect(recentIds(result)).toEqual(['new']);
	});

	// The loader passes over a library it couldn't read, which would otherwise look like an emptied row.
	test("a library that can't be read leaves the rows as they were", async () => {
		const result = await staleHome();
		getLatest.mockImplementation(async () => {
			throw new Error('timeout');
		});
		jest.spyOn(console, 'warn').mockImplementation(() => {});
		await result.current.refreshVolatileData(true);
		await waitFor(() => expect(getLatest).toHaveBeenCalled());
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(recentIds(result)).toEqual(['new']);
	});

	// A failed read leaves the rows stale, which mustn't send every return to Home back to the server.
	test('a failed read is tried again only after a pause', async () => {
		const result = await staleHome();
		getLatest.mockImplementation(async () => {
			throw new Error('timeout');
		});
		jest.spyOn(console, 'warn').mockImplementation(() => {});
		await result.current.refreshVolatileData(true);
		await waitFor(() => expect(getLatest).toHaveBeenCalledTimes(1));
		await new Promise((resolve) => setTimeout(resolve, 0));

		await result.current.refreshVolatileData(true);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(getLatest).toHaveBeenCalledTimes(1);

		getLatest.mockImplementation(async () => [{Id: 'other', Name: 'Other', Type: 'Movie'}]);
		const muchLater = Date.now() + 61000;
		Date.now.mockImplementation(() => muchLater);
		await result.current.refreshVolatileData(true);
		await waitFor(() => expect(recentIds(result)).toEqual(['other']));
	});

	// The pause is for whoever the failed read was for, not the next user to sign in.
	test("a failed read doesn't hold up the next user's", async () => {
		const staleRecent = () => ({...cacheAged(1), recentAt: Date.now() - 40 * 60000});
		loadBrowseCache.mockImplementation(async () => staleRecent());
		getLibraries.mockImplementation(async () => ({Items: [{Id: 'lib', Name: 'Movies', CollectionType: 'movies'}]}));
		getLatest.mockImplementation(async () => {
			throw new Error('timeout');
		});
		jest.spyOn(console, 'warn').mockImplementation(() => {});
		const {result, rerender} = renderHook((p) => useBrowseData(p), {initialProps: props('token-a', 'user-a')});
		await waitFor(() => expect(getLatest).toHaveBeenCalledTimes(1));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(recentIds(result)).toEqual(['new']);

		getLatest.mockImplementation(async () => [{Id: 'other', Name: 'Other', Type: 'Movie'}]);
		loadBrowseCache.mockImplementation(async () => ({...staleRecent(), userId: 'user-b'}));
		rerender(props('token-b', 'user-b'));
		await waitFor(() => expect(recentIds(result)).toEqual(['other']));
	});

	// Cutting a paged row back to its first read would take away the card focus is on.
	test('a row paged further is read back as long', async () => {
		const cache = cacheAged(10);
		cache.rowData[1] = {...cache.rowData[1], items: Array.from({length: 20}, (_, i) => ({Id: `old${i}`}))};
		loadBrowseCache.mockImplementation(async () => cache);
		const {result} = renderHook((p) => useBrowseData(p), {initialProps: props('token-a', 'user-a')});
		await waitFor(() => expect(result.current.allRowData.length).toBeGreaterThan(0));
		await waitFor(() => expect(getResumeItems).toHaveBeenCalledTimes(1));
		getLibraries.mockImplementation(async () => ({Items: [{Id: 'lib', Name: 'Movies', CollectionType: 'movies'}]}));
		getLatest.mockImplementation(async (id, limit) => Array.from({length: Math.min(limit, 40)}, (_, i) => ({Id: `n${i}`, Name: `N${i}`, Type: 'Movie'})));
		const later = Date.now() + 25 * 60000;
		jest.spyOn(Date, 'now').mockImplementation(() => later);
		await result.current.refreshVolatileData(true);
		await waitFor(() => expect(recentIds(result)?.[0]).toBe('n0'));
		expect(recentIds(result)).toHaveLength(20);
	});

	// Stored rows can still be in date while the recent rows in them aren't.
	test('a start from stored rows reads stale recent rows again', async () => {
		const cache = {...cacheAged(1), recentAt: Date.now() - 40 * 60000};
		loadBrowseCache.mockImplementation(async () => cache);
		getLibraries.mockImplementation(async () => ({Items: [{Id: 'lib', Name: 'Movies', CollectionType: 'movies'}]}));
		getLatest.mockImplementation(async () => [{Id: 'other', Name: 'Other', Type: 'Movie'}]);
		const {result} = renderHook((p) => useBrowseData(p), {initialProps: props('token-a', 'user-a')});
		await waitFor(() => expect(recentIds(result)).toEqual(['other']));
	});

	// Opening the app again resumes it on the screen it was left on, which is often Home.
	test('coming back to the app catches the rows up too', async () => {
		const result = await staleHome();
		document.dispatchEvent(new Event('visibilitychange'));
		await waitFor(() => expect(recentIds(result)).toEqual(['other']));
	});
});
