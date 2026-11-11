import {act, renderHook, waitFor} from '@testing-library/react';

import useBrowseData from './useBrowseData';
import {clearMemoryCache, loadBrowseCache, memoryCache} from './browseCache';
import {loadRewatchItems} from '../../services/homeRecommendations';

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
jest.mock('../../services/homeRecommendations', () => ({
	loadRewatchItems: jest.fn(),
	loadSinceYouWatchedRows: async () => []
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
	getLibraries: async () => ({Items: [{Id: 'movies', Name: 'Movies', CollectionType: 'movies'}]}),
	getResumeItems: empty,
	getNextUp: empty,
	getItems: jest.fn(),
	getAlbumArtists: empty,
	getPlaylists: empty,
	getResumeAudioItems: empty,
	// Home only reuses the rows it has once the media bar has something to show.
	getRandomItems: async () => ({Items: [{Id: 'featured', Type: 'Movie', BackdropImageTags: ['tag']}]}),
	getCollectionItems: empty,
	getLatest: async () => [{Id: 'new', Name: 'New', Type: 'Movie'}],
	getRecentlyReleased: jest.fn(),
	getStudios: jest.fn(),
	getUserConfiguration: async () => null
};

// The same function each render, so only the settings change between renders.
const getItemServerUrl = () => 'http://server';

const rows = (...ids) => ids.map((id) => ({id, enabled: true}));

const props = (settings, homeRowsConfig = []) => ({
	api,
	serverUrl: 'http://server',
	accessToken: 'token',
	userId: 'user',
	settings,
	unifiedMode: false,
	seerrEnabled: false,
	seerrAuthenticated: false,
	recommendationsSupported: false,
	getItemServerUrl,
	homeRowsConfig
});

// Home with [settings], then the same Home after one of them changes, the way it stays mounted
// behind the settings panel. It changes once Home has finished loading and kept its rows, so a
// reload that only hands back the kept rows fails.
const changed = async (settings, next, homeRowsConfig, loadedWith) => {
	const {result, rerender} = renderHook((p) => useBrowseData(p), {initialProps: props(settings, homeRowsConfig)});
	await waitFor(loadedWith);
	await waitFor(() => {
		expect(result.current.isLoading).toBe(false);
		expect(memoryCache.timestamp).not.toBeNull();
	});
	jest.clearAllMocks();
	rerender(props({...settings, ...next}, homeRowsConfig));
};

const albumsAsked = () => api.getItems.mock.calls.some(([params]) => params.IncludeItemTypes === 'MusicAlbum');

beforeEach(() => {
	clearMemoryCache();
	memoryCache.owner = null;
	loadBrowseCache.mockReset();
	// The test setup resets every mock before each test, so the answers are given here.
	api.getItems.mockImplementation(empty);
	api.getRecentlyReleased.mockImplementation(empty);
	api.getStudios.mockImplementation(empty);
	loadRewatchItems.mockImplementation(async () => []);
});

describe('Home loads again when a row setting changes', () => {
	test('turning on Display Audio Rows loads the audio rows', async () => {
		await changed({displayAudioRows: false}, {displayAudioRows: true}, rows('audioalbums'),
			() => expect(api.getRecentlyReleased).toHaveBeenCalled());
		await waitFor(() => expect(albumsAsked()).toBe(true));
	});

	test('turning on Display Studio Row loads the Studios row', async () => {
		await changed({displayStudiosRows: false}, {displayStudiosRows: true}, rows('studios'),
			() => expect(api.getRecentlyReleased).toHaveBeenCalled());
		await waitFor(() => expect(api.getStudios).toHaveBeenCalled());
	});

	test('a new Studio Row sort loads the row in that order', async () => {
		await changed({displayStudiosRows: true, studiosRowSortOrder: 'Ascending'}, {studiosRowSortBy: 'DateCreated'}, rows('studios'),
			() => expect(api.getStudios).toHaveBeenCalled());
		await waitFor(() => expect(api.getStudios).toHaveBeenCalledWith(20, 'DateCreated', 'Ascending'));
	});

	test('a new Studio Row sort order loads the row in that order', async () => {
		await changed({displayStudiosRows: true, studiosRowSortBy: 'DateCreated'}, {studiosRowSortOrder: 'Ascending'}, rows('studios'),
			() => expect(api.getStudios).toHaveBeenCalled());
		await waitFor(() => expect(api.getStudios).toHaveBeenCalledWith(20, 'DateCreated', 'Ascending'));
	});

	test('turning on Display Rewatch Row loads the Rewatch row', async () => {
		await changed({displayRewatchRow: false}, {displayRewatchRow: true}, rows('rewatch'),
			() => expect(api.getRecentlyReleased).toHaveBeenCalled());
		await waitFor(() => expect(loadRewatchItems).toHaveBeenCalled());
	});

	test('a new Recently Released Series Sort By loads the rows for it', async () => {
		await changed({recentlyReleasedSeriesType: 'series'}, {recentlyReleasedSeriesType: 'episode'}, [],
			() => expect(api.getRecentlyReleased).toHaveBeenCalled());
		await waitFor(() => expect(api.getRecentlyReleased).toHaveBeenCalledWith('movies', 16, 'Movie,Episode', undefined));
	});

	test('a load a newer one took over leaves the newer rows in place', async () => {
		const settings = {displayStudiosRows: true};
		const config = rows('studios');
		const libraries = api.getLibraries;
		try {
			const {result, rerender} = renderHook((p) => useBrowseData(p), {initialProps: props(settings, config)});
			await waitFor(() => expect(result.current.isLoading).toBe(false));
			let release;
			api.getLibraries = jest.fn()
				.mockImplementationOnce(() => new Promise((resolve) => {
					release = resolve;
				}))
				.mockImplementation(libraries);
			api.getStudios.mockImplementation(async () => ({Items: [{Id: 'studio', Name: 'Studio'}]}));
			rerender(props({...settings, studiosRowSortBy: 'DateCreated'}, config));
			rerender(props({...settings, studiosRowSortBy: 'Random'}, config));
			const hasStudios = () => result.current.allRowData.some((row) => row.id === 'studios');
			await waitFor(() => expect(hasStudios()).toBe(true));
			await act(async () => {
				release(await libraries());
				await new Promise((resolve) => setTimeout(resolve, 50));
			});
			expect(hasStudios()).toBe(true);
		} finally {
			api.getLibraries = libraries;
		}
	});

	test("rows stored for another Recently Released Series Sort By aren't reused at start", async () => {
		loadBrowseCache.mockImplementation(async () => ({
			serverUrl: 'http://server',
			userId: 'user',
			rowData: [{id: 'latest-movies', title: 'Recently Added', items: [{Id: 'stored'}]}],
			libraries: [{Id: 'movies', Name: 'Movies', CollectionType: 'movies'}],
			featuredItems: [{Id: 'featured'}],
			timestamp: Date.now() - 60000
		}));
		renderHook((p) => useBrowseData(p), {initialProps: props({recentlyReleasedSeriesType: 'season'})});
		await waitFor(() => expect(api.getRecentlyReleased).toHaveBeenCalledWith('movies', 16, 'Movie,Season', undefined));
	});
});
