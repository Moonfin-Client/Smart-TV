import serverLogger from './serverLogger';

jest.mock('./platformModule', () => ({resolvePlatformModule: () => Promise.reject(new Error('no device info here'))}));
const mockMoonbase = {endpoint: null, fetch: jest.fn()};
jest.mock('./moonbaseEndpoint', () => ({moonbaseEndpoint: async () => mockMoonbase.endpoint}));

const plexAuth = {serverUrl: 'http://plex:32400', accessToken: 'pms', serverType: 'plex', authHeader: 'MediaBrowser Client="Moonfin", Token="pms"'};

beforeEach(() => {
	mockMoonbase.fetch.mockReset().mockResolvedValue({ok: true, status: 200});
	mockMoonbase.endpoint = {base: 'http://plex:32500', headers: {'X-Plex-Token': 'pms'}, fetch: mockMoonbase.fetch};
	serverLogger.init({enabled: false, getAuth: () => plexAuth});
	serverLogger.setClientLogSupported(true);
});

test('a Plex report goes to Moonbase for Plex once its ping says it takes them', async () => {
	await serverLogger.uploadReport();
	const [url, init] = mockMoonbase.fetch.mock.calls[0];
	expect(url).toBe('http://plex:32500/Moonfin/ClientLog/Document');
	expect(init.headers['X-Plex-Token']).toBe('pms');
	expect(init.body).toContain('diagnostic report');
});

test('a Plex server whose Moonbase is out of reach fails the report instead of sending it elsewhere', async () => {
	mockMoonbase.endpoint = null;
	await expect(serverLogger.uploadReport()).rejects.toThrow("Moonbase couldn't be reached");
});

test('Moonbase not taking logs keeps the report on the device', async () => {
	serverLogger.setClientLogSupported(false);
	await expect(serverLogger.uploadReport()).rejects.toThrow('nowhere to take the report');
	expect(mockMoonbase.fetch).not.toHaveBeenCalled();
});

test("the probe page gets nowhere to send its report on Plex, since it can't look Moonbase up", () => {
	expect(serverLogger.documentRequest('moonfin-tizen-probe')).toBeNull();
});
