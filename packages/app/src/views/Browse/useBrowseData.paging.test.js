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
// Continue Watching has 100 titles, read as a head of whatever length is asked for.
const resumeHead = async (limit) => ({
	Items: Array.from({length: Math.min(limit, 100)}, (_, i) => ({Id: `r${i}`})),
	TotalRecordCount: 100
});
const getResumeItems = jest.fn();
const api = {
	getLibraries: empty,
	getResumeItems,
	getNextUp: empty,
	getItems: empty,
	getRandomItems: empty,
	getCollectionItems: empty,
	getUserConfiguration: async () => null
};

// A cache old enough that Home reads Continue Watching again, which makes it a row that pages.
const staleCache = () => ({
	serverUrl: 'http://server',
	userId: 'user-a',
	rowData: [{id: 'resume', title: 'Continue Watching', items: [{Id: 'r0'}]}],
	libraries: [{Id: 'lib'}],
	featuredItems: [{Id: 'featured'}],
	timestamp: Date.now() - 10 * 60000
});

const resumeRow = (result) => result.current.allRowData.find((row) => row.id === 'resume');
const readLengths = () => getResumeItems.mock.calls.map(([limit]) => limit);

const pageableHome = async () => {
	loadBrowseCache.mockImplementation(async () => staleCache());
	const {result} = renderHook((p) => useBrowseData(p), {initialProps: {
		api,
		serverUrl: 'http://server',
		accessToken: 'token-a',
		userId: 'user-a',
		settings: {},
		unifiedMode: false,
		seerrEnabled: false,
		seerrAuthenticated: false,
		recommendationsSupported: false,
		getItemServerUrl: () => 'http://server',
		homeRowsConfig: []
	}});
	await waitFor(() => expect(resumeRow(result)?.hasMore).toBe(true));
	return result;
};

beforeEach(() => {
	clearMemoryCache();
	memoryCache.owner = null;
	loadBrowseCache.mockReset();
	getResumeItems.mockReset();
	getResumeItems.mockImplementation(resumeHead);
});

describe('paging a home row', () => {
	test('a focus that comes before the last page is drawn asks for the next page, not that one again', async () => {
		const result = await pageableHome();
		expect(readLengths()).toEqual([12]);
		// The second call comes before React draws the first page, as it does when a key is held on a slow TV.
		await result.current.loadMoreRow('resume');
		await result.current.loadMoreRow('resume');
		expect(readLengths()).toEqual([12, 27, 42]);
		await waitFor(() => expect(resumeRow(result).items).toHaveLength(42));
		expect(resumeRow(result).hasMore).toBe(true);
	});

	test('the merged Continue Watching & Next Up row pages Continue Watching while it has more', async () => {
		const result = await pageableHome();
		await result.current.loadMoreRow('continue-nextup');
		expect(readLengths()).toEqual([12, 27]);
	});
});
