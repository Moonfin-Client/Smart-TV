import {renderHook, waitFor} from '@testing-library/react';
import $L from '@enact/i18n/$L';

import useBrowseData from './useBrowseData';
import {clearMemoryCache, loadBrowseCache, memoryCache} from './browseCache';

jest.mock('../../services/storage', () => ({
	getFromStorage: async () => null,
	saveToStorage: async () => {},
	removeFromStorage: async () => {}
}));
jest.mock('../../services/connectionPool', () => ({}));
jest.mock('../../services/seerrApi', () => ({}));
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
const api = {
	getLibraries: empty,
	getResumeItems: jest.fn(empty),
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

// What the previous user left in the stored cache, fresh enough to be served as is.
const previousUserRows = [{id: 'resume', title: 'Continue Watching', items: [{Id: 'theirs'}]}];
const cacheFor = (userId) => ({
	serverUrl: 'http://server',
	userId,
	rowData: previousUserRows,
	libraries: [{Id: 'lib'}],
	featuredItems: [{Id: 'featured'}],
	timestamp: Date.now()
});

beforeEach(() => {
	clearMemoryCache();
	memoryCache.owner = null;
	loadBrowseCache.mockReset();
	api.getResumeItems.mockReset();
	api.getResumeItems.mockImplementation(empty);
});

describe('switching users', () => {
	test('rows read for the previous user go once the new user arrives', async () => {
		// The new user's own row, so the assertion proves the switch fetched
		// this user's data rather than merely that the old rows moved on.
		const newUserRows = [{id: 'resume', title: $L('Continue Watching'), items: [{Id: 'mine'}], type: 'landscape'}];
		api.getResumeItems.mockResolvedValue({Items: newUserRows[0].items});
		loadBrowseCache.mockImplementation(async (serverUrl, userId) => (userId === 'user-a' ? cacheFor('user-a') : null));

		// The switch can land the new token a render before the new user, and that render
		// reads whatever the stored cache holds for the user still in hand.
		const {result, rerender} = renderHook((p) => useBrowseData(p), {initialProps: props('token-b', 'user-a')});
		await waitFor(() => expect(result.current.allRowData).toEqual(previousUserRows));

		rerender(props('token-b', 'user-b'));
		// isLoading is already false when the switch lands: the new user's loading
		// cycle starts only after loadBrowseCache answers, so waiting on it can
		// pass while the previous user's rows are still on screen. Wait on the
		// rows themselves instead.
		await waitFor(() => expect(result.current.allRowData).toEqual(newUserRows));
		expect(loadBrowseCache).toHaveBeenLastCalledWith('http://server', 'user-b');
	});

	test('coming back to the home screen as the same user keeps the rows', async () => {
		loadBrowseCache.mockImplementation(async () => cacheFor('user-a'));

		const {result, unmount} = renderHook((p) => useBrowseData(p), {initialProps: props('token-a', 'user-a')});
		await waitFor(() => expect(result.current.allRowData).toEqual(previousUserRows));
		unmount();

		loadBrowseCache.mockClear();
		const again = renderHook((p) => useBrowseData(p), {initialProps: props('token-a', 'user-a')}).result;
		await waitFor(() => expect(again.current.allRowData).toEqual(previousUserRows));
		expect(loadBrowseCache).not.toHaveBeenCalled();
	});
});
