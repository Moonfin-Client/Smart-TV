const mockSilo = {getInstalledPlugins: jest.fn(), requestHeaders: jest.fn()};
const mockSiloTokens = new Set();

jest.mock('./jellyfinApi', () => ({
	createApiForServer: () => mockSilo,
	getServerUrl: () => 'http://silo:8090',
	getUserId: () => 'p1'
}));
jest.mock('./siloSession', () => ({
	loadSiloSessions: async () => {},
	siloServerKey: (url) => String(url || '').replace(/\/+$/, ''),
	siloSessionFor: (base, token) => (mockSiloTokens.has(token) ? {} : null)
}));

// The installations found live in module state, so each test starts from a fresh copy.
const load = () => {
	let mod;
	jest.isolateModules(() => {
		mod = require('./moonbaseEndpoint');
	});
	return mod;
};

describe('the Moonbase endpoint', () => {
	beforeEach(() => {
		mockSiloTokens.clear();
		mockSiloTokens.add('silo-token');
		mockSilo.getInstalledPlugins.mockReset();
		mockSilo.requestHeaders.mockReset().mockResolvedValue({Authorization: 'Bearer silo-token', 'X-Profile-Id': 'p1'});
	});

	test('is the server root with the MediaBrowser token on Jellyfin', async () => {
		const {moonbaseEndpoint} = load();
		expect(await moonbaseEndpoint('http://jf:8096/', 'jf-token'))
			.toEqual({base: 'http://jf:8096', headers: {Authorization: 'MediaBrowser Token="jf-token"'}});
	});

	test('is Moonbase\'s plugin path with Silo\'s headers on Silo, found once', async () => {
		const {moonbaseEndpoint, moonbaseAssetUrl} = load();
		mockSilo.getInstalledPlugins.mockResolvedValue({items: [{id: '3', plugin_id: 'other'}, {id: '6', plugin_id: 'moonfin.moonbase'}]});
		const expected = {base: 'http://silo:8090/api/v2/plugin-content/plugins/6', headers: {Authorization: 'Bearer silo-token', 'X-Profile-Id': 'p1'}};
		expect(await moonbaseEndpoint('http://silo:8090', 'silo-token')).toEqual(expected);
		expect(await moonbaseEndpoint('http://silo:8090', 'silo-token')).toEqual(expected);
		expect(mockSilo.getInstalledPlugins).toHaveBeenCalledTimes(1);
		expect(moonbaseAssetUrl('http://silo:8090', '/Moonfin/Assets/tmdb.svg', 't k'))
			.toBe('http://silo:8090/api/v2/plugin-content/plugins/6/Moonfin/Assets/tmdb.svg?token=t%20k');
	});

	test('is null on a Silo without Moonbase, which isn\'t asked again for a while', async () => {
		const {moonbaseEndpoint} = load();
		mockSilo.getInstalledPlugins.mockResolvedValue({items: []});
		expect(await moonbaseEndpoint('http://silo:8090', 'silo-token')).toBeNull();
		expect(await moonbaseEndpoint('http://silo:8090', 'silo-token')).toBeNull();
		expect(mockSilo.getInstalledPlugins).toHaveBeenCalledTimes(1);
	});

	test('asks again after a Silo that couldn\'t be reached', async () => {
		const {moonbaseEndpoint} = load();
		mockSilo.getInstalledPlugins.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValueOnce({items: [{id: '6', plugin_id: 'moonfin.moonbase'}]});
		expect(await moonbaseEndpoint('http://silo:8090', 'silo-token')).toBeNull();
		expect((await moonbaseEndpoint('http://silo:8090', 'silo-token')).base).toBe('http://silo:8090/api/v2/plugin-content/plugins/6');
	});
});
