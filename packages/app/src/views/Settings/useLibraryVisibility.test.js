import {act, renderHook} from '@testing-library/react';

import connectionPool from '../../services/connectionPool';
import serverLogger from '../../services/serverLogger';
import useLibraryVisibility from './useLibraryVisibility';

jest.mock('../../services/connectionPool', () => ({
	__esModule: true,
	default: {
		getAllLibrariesFromAllServers: jest.fn(),
		getUserConfigFromAllServers: jest.fn(),
		updateUserConfigOnServer: jest.fn()
	}
}));
jest.mock('../../services/libraryScope', () => ({resetLibraryScope: jest.fn()}));
jest.mock('../../services/serverLogger', () => ({__esModule: true, default: {error: jest.fn(), LOG_CATEGORIES: {NETWORK: 'Network'}}}));

const jellyfin = {serverUrl: 'http://jf', accessToken: 'tj', userId: 'uj', serverType: 'jellyfin', configuration: {MyMediaExcludes: []}};
const emby = {serverUrl: 'http://emby', accessToken: 'te', userId: 'ue', serverType: 'emby', configuration: {MyMediaExcludes: []}};

const setup = (over = {}) => renderHook(() => useLibraryVisibility({
	api: over.api,
	settings: {unifiedLibraryMode: !over.api},
	hasMultipleServers: !over.api,
	pushView: jest.fn(),
	popView: jest.fn(),
	onLibrariesChanged: jest.fn()
}));

let refreshes;
const onRefresh = (e) => refreshes.push(e.detail);

beforeEach(() => {
	jest.clearAllMocks();
	refreshes = [];
	window.addEventListener('moonfin:browseRefresh', onRefresh);
	connectionPool.getAllLibrariesFromAllServers.mockResolvedValue([
		{Id: 'j1', CollectionType: 'movies', _serverUrl: 'http://jf'},
		{Id: 'e1', CollectionType: 'movies', _serverUrl: 'http://emby'}
	]);
	connectionPool.getUserConfigFromAllServers.mockResolvedValue([jellyfin, emby]);
	connectionPool.updateUserConfigOnServer.mockResolvedValue(null);
});

afterEach(() => window.removeEventListener('moonfin:browseRefresh', onRefresh));

describe('saving library visibility', () => {
	test('each server is written on its own route and Home loads again', async () => {
		const {result} = setup();
		await act(async () => { await result.current.openLibraries(); });
		act(() => result.current.toggleLibraryVisibility('e1'));
		await act(async () => { await result.current.saveLibraryVisibility(); });
		expect(connectionPool.updateUserConfigOnServer.mock.calls).toEqual([
			['http://jf', 'tj', 'uj', {MyMediaExcludes: []}, 'jellyfin'],
			['http://emby', 'te', 'ue', {MyMediaExcludes: ['e1']}, 'emby']
		]);
		expect(refreshes).toEqual([{featured: true, libraries: true}]);
	});

	test('a single server saves through its own api and Home loads again', async () => {
		const api = {
			getAllLibraries: jest.fn(async () => ({Items: [{Id: 'm', CollectionType: 'movies'}]})),
			getUserConfiguration: jest.fn(async () => ({Configuration: {MyMediaExcludes: []}})),
			updateUserConfiguration: jest.fn(async () => null)
		};
		const {result} = setup({api});
		await act(async () => { await result.current.openLibraries(); });
		act(() => result.current.toggleLibraryVisibility('m'));
		await act(async () => { await result.current.saveLibraryVisibility(); });
		expect(api.updateUserConfiguration).toHaveBeenCalledWith({MyMediaExcludes: ['m']});
		expect(refreshes).toEqual([{featured: true, libraries: true}]);
	});

	test('a refused save stays on the screen, counts a failure for the notice and logs what was sent', async () => {
		const refused = Object.assign(new Error('API Error: 400'), {status: 400, body: '{"title":"One or more validation errors occurred."}'});
		const config = {MyMediaExcludes: [], OrderedViews: ['a'], LatestItemsExcludes: ['b'], GroupedFolders: [], Other: 1};
		const api = {
			getAllLibraries: jest.fn(async () => ({Items: [{Id: 'm', CollectionType: 'movies'}]})),
			getUserConfiguration: jest.fn(async () => ({Configuration: config})),
			updateUserConfiguration: jest.fn(async () => {
				throw refused;
			})
		};
		const {result} = setup({api});
		await act(async () => { await result.current.openLibraries(); });
		act(() => result.current.toggleLibraryVisibility('m'));
		jest.spyOn(console, 'error').mockImplementation(() => {});
		await act(async () => { await result.current.saveLibraryVisibility(); });
		expect(result.current.librarySaveFailures).toBe(1);
		expect(result.current.hiddenLibraries).toEqual(['m']);
		expect(refreshes).toEqual([]);
		expect(serverLogger.error).toHaveBeenCalledWith('Network', 'User configuration rejected with 400. {"title":"One or more validation errors occurred."}', {
			OrderedViews: ['a'], MyMediaExcludes: ['m'], LatestItemsExcludes: ['b'], GroupedFolders: []
		});
	});

	test('a server or network failure counts a failure without the 4xx log', async () => {
		connectionPool.updateUserConfigOnServer.mockRejectedValue(Object.assign(new Error('API Error: 503'), {status: 503}));
		const {result} = setup();
		await act(async () => { await result.current.openLibraries(); });
		jest.spyOn(console, 'error').mockImplementation(() => {});
		await act(async () => { await result.current.saveLibraryVisibility(); });
		expect(result.current.librarySaveFailures).toBe(1);
		expect(serverLogger.error).not.toHaveBeenCalled();
	});
});
