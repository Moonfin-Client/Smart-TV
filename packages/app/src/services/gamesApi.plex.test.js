import {gameThumbUrl, getLibraries} from './gamesApi';
import {corsFreeFetch, platformFetch} from './secureFetch';

jest.mock('./secureFetch', () => ({platformFetch: jest.fn(), corsFreeFetch: jest.fn()}));
jest.mock('./jellyfinApi', () => ({
	getServerUrl: () => 'http://plex:32400',
	getAuthHeader: () => 'MediaBrowser Token="pms"',
	getApiKey: () => 'pms',
	getTokenParam: () => 'X-Plex-Token',
	getServerType: () => 'plex'
}));
const mockFound = {base: null};
jest.mock('./plexMoonbase', () => ({
	findPlexMoonbase: async () => mockFound.base,
	plexMoonbaseBase: () => mockFound.base || 'http://plex:32500'
}));

beforeEach(() => {
	corsFreeFetch.mockReset();
	platformFetch.mockReset();
});

test('a Plex server lists its games from Moonbase for Plex, reached the way Plex is', async () => {
	mockFound.base = 'http://moonbase.lan:8080';
	corsFreeFetch.mockResolvedValueOnce({ok: true, status: 200, text: () => Promise.resolve('[{"id":"3","name":"Games"}]')});
	expect(await getLibraries()).toEqual([{id: '3', name: 'Games'}]);
	expect(corsFreeFetch.mock.calls[0][0]).toBe('http://moonbase.lan:8080/Moonfin/Games/Libraries');
	expect(platformFetch).not.toHaveBeenCalled();
	expect(gameThumbUrl('3', 'g1')).toBe('http://moonbase.lan:8080/Moonfin/Games/3/Thumb/g1?type=boxart&X-Plex-Token=pms');
});

test('a Plex server without the companion has no game libraries', async () => {
	mockFound.base = null;
	expect(await getLibraries()).toEqual([]);
	expect(corsFreeFetch).not.toHaveBeenCalled();
});
