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
const withGenre = {Items: [{Id: 'genre', Name: 'Drama'}]};

let genres;
const getGenres = jest.fn();
const api = {
	getLibraries: empty,
	getResumeItems: empty,
	getNextUp: empty,
	getItems: empty,
	getRandomItems: empty,
	getUserConfiguration: async () => null,
	getLiveTvAiringPrograms: empty,
	getGenres
};

const props = (settings, homeRowsConfig = [], apiChanges) => ({
	api: apiChanges ? {...api, ...apiChanges} : api,
	serverUrl: 'http://server',
	accessToken: 'token',
	userId: 'user',
	settings: {displayGenresRows: true, ...settings},
	unifiedMode: false,
	seerrEnabled: false,
	seerrAuthenticated: false,
	recommendationsSupported: false,
	getItemServerUrl: () => 'http://server',
	homeRowsConfig
});

const stored = (rowData) => ({serverUrl: 'http://server', userId: 'user', rowData, libraries: [{Id: 'lib'}], timestamp: Date.now()});

// Each load of the genres section waits until the test answers it.
const expectGenresLoad = () => {
	let answer;
	genres = new Promise((resolve) => {
		answer = resolve;
	});
	getGenres.mockImplementation(() => genres);
	return answer;
};

const loadingGenres = async (result) => {
	await waitFor(() => expect(result.current.pendingSections).toContain('genres'));
	return result.current.emptySections;
};

const settled = (result) => waitFor(() => expect(result.current.pendingSections).toEqual([]));

beforeEach(() => {
	clearMemoryCache();
	memoryCache.owner = null;
	loadBrowseCache.mockReset();
	loadBrowseCache.mockResolvedValue(null);
});

describe('empty Home sections', () => {
	test('a section keeps its placeholder until a load finds it empty', async () => {
		const answer = expectGenresLoad();
		const {result} = renderHook((p) => useBrowseData(p), {initialProps: props()});

		expect((await loadingGenres(result)).has('genres')).toBe(false);
		answer({Items: []});
		await settled(result);
		expect(result.current.emptySections.has('genres')).toBe(true);
	});

	test('a section that came back empty stays hidden while it loads again', async () => {
		let answer = expectGenresLoad();
		const {result, rerender} = renderHook((p) => useBrowseData(p), {initialProps: props()});
		await loadingGenres(result);
		answer({Items: []});
		await settled(result);

		answer = expectGenresLoad();
		rerender(props({genresRowSortBy: 'DateCreated'}));
		expect((await loadingGenres(result)).has('genres')).toBe(true);

		answer(withGenre);
		await settled(result);
		expect(result.current.emptySections.has('genres')).toBe(false);
	});

	test('a cold start hides the sections the stored rows had nothing for', async () => {
		loadBrowseCache.mockResolvedValue(stored([{id: 'latest-lib', isLatestRow: true, items: [{Id: 'new'}]}]));
		const answer = expectGenresLoad();
		// These never finish loading, so only the stored rows decide whether they count as empty.
		const stillLoading = {
			getLibraries: async () => ({Items: [{Id: 'lib', Name: 'Movies', CollectionType: 'movies'}]}),
			getLatest: () => new Promise(() => {}),
			getRecentlyReleased: () => new Promise(() => {}),
			getLiveTvAiringPrograms: () => new Promise(() => {})
		};
		const {result} = renderHook((p) => useBrowseData(p), {initialProps: props({}, [{id: 'onnow', enabled: true}], stillLoading)});

		const knownEmpty = await loadingGenres(result);
		expect(knownEmpty.has('genres')).toBe(true);
		expect(knownEmpty.has('recently-released')).toBe(true);
		expect(knownEmpty.has('latest-media')).toBe(false);
		// On Now changes by the minute, so missing from the stored rows says nothing.
		expect(knownEmpty.has('onnow')).toBe(false);

		answer(withGenre);
		await waitFor(() => expect(result.current.pendingSections).not.toContain('genres'));
		expect(result.current.emptySections.has('genres')).toBe(false);
	});

	test('stored rows from days ago say nothing about empty sections', async () => {
		loadBrowseCache.mockResolvedValue({...stored([{id: 'latest-lib', isLatestRow: true, items: [{Id: 'new'}]}]), timestamp: Date.now() - 4 * 24 * 3600000});
		expectGenresLoad();
		const {result} = renderHook((p) => useBrowseData(p), {initialProps: props()});

		expect((await loadingGenres(result)).has('genres')).toBe(false);
	});

	test("a section switched off is never loaded, so it's never taken for empty", async () => {
		const answer = expectGenresLoad();
		const {result} = renderHook((p) => useBrowseData(p), {initialProps: props({displayCollectionsRows: false})});

		await loadingGenres(result);
		expect(result.current.pendingSections).not.toContain('collections');
		answer({Items: []});
		await settled(result);
		expect(result.current.emptySections.has('collections')).toBe(false);
	});

	test('another account starts over', async () => {
		const answer = expectGenresLoad();
		const {result, rerender} = renderHook((p) => useBrowseData(p), {initialProps: props()});
		await loadingGenres(result);
		answer({Items: []});
		await settled(result);

		expectGenresLoad();
		rerender({...props(), accessToken: 'other-token', userId: 'other-user'});
		expect((await loadingGenres(result)).has('genres')).toBe(false);
	});
});
