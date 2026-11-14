import {fetchWithTimeout} from '../utils/fetchTimeout';
import {registerPlexServer} from '../utils/plexUrls';
import {getMoonfinStatus, moonfinLogin, moonfinPing, setMoonfinConfig} from './seerrApi';

jest.mock('../utils/fetchTimeout', () => ({fetchWithTimeout: jest.fn()}));
jest.mock('../platform', () => ({isLegacyWebOS: () => false, isLegacyTizen: () => false}));
jest.mock('./jellyfinApi', () => ({createApiForServer: jest.fn(), getUserId: () => null}));
jest.mock('./siloSession', () => ({loadSiloSessions: async () => {}}));

// The Plex server at :32400 has Moonbase for Plex beside it, reached through the companion's own fetch.
const mockCompanion = {fetch: jest.fn(), present: true, base: 'http://plex:32500'};
jest.mock('./moonbaseEndpoint', () => ({
	moonbaseEndpoint: async (base, token) => {
		if (!base.includes(':32400')) return {base, headers: {Authorization: `MediaBrowser Token="${token}"`}};
		return mockCompanion.present ? {base: mockCompanion.base, headers: {'X-Plex-Token': token}, fetch: mockCompanion.fetch} : null;
	},
	isSiloLogin: () => false
}));

const reply = (status, body) => Promise.resolve({
	status,
	text: () => Promise.resolve(body == null ? '' : JSON.stringify(body)),
	headers: {forEach: () => {}}
});

beforeEach(() => {
	registerPlexServer('http://plex:32400', 'pms');
	setMoonfinConfig('http://plex:32400', 'pms');
	mockCompanion.fetch.mockReset();
	mockCompanion.present = true;
	mockCompanion.base = 'http://plex:32500';
	fetchWithTimeout.mockReset();
});

test('a plugin route on a Plex server goes to Moonbase for Plex, signed with the PMS token', async () => {
	mockCompanion.fetch.mockReturnValueOnce(reply(200, {enabled: true, authenticated: false}));
	expect(await getMoonfinStatus()).toEqual({enabled: true, authenticated: false});
	const [url, init] = mockCompanion.fetch.mock.calls[0];
	expect(url).toBe('http://plex:32500/Moonfin/Seerr/Status');
	expect(init.headers['X-Plex-Token']).toBe('pms');
	expect(fetchWithTimeout).not.toHaveBeenCalled();
});

test('Moonbase routes found through the endpoint take the companion\'s fetch too', async () => {
	mockCompanion.fetch.mockReturnValueOnce(reply(200, {installed: true, version: '0.6.2'}));
	expect(await moonfinPing('http://plex:32400', 'pms')).toMatchObject({installed: true});
	expect(mockCompanion.fetch.mock.calls[0][0]).toBe('http://plex:32500/Moonfin/Ping');
});

test("a companion behind a proxy under the Plex server's own address is asked once", async () => {
	mockCompanion.base = 'http://plex:32400/moonbase';
	mockCompanion.fetch.mockReturnValue(reply(200, {enabled: true, authenticated: false}));
	expect(await getMoonfinStatus()).toEqual({enabled: true, authenticated: false});
	expect(await moonfinPing('http://plex:32400', 'pms')).toMatchObject({enabled: true});
	expect(mockCompanion.fetch.mock.calls.map(([url]) => url)).toEqual([
		'http://plex:32400/moonbase/Moonfin/Seerr/Status',
		'http://plex:32400/moonbase/Moonfin/Ping'
	]);
});

test('a Plex server without the companion answers as a server without the plugin', async () => {
	mockCompanion.present = false;
	await expect(getMoonfinStatus()).rejects.toMatchObject({status: 404});
	expect(mockCompanion.fetch).not.toHaveBeenCalled();
	expect(fetchWithTimeout).not.toHaveBeenCalled();
});

test('a Plex account signs in to Seerr with its plex.tv token, and a refusal says why', async () => {
	mockCompanion.fetch.mockReturnValueOnce(reply(200, {success: true, displayName: 'Axl'}));
	await moonfinLogin('', '', 'plex', 'plex-tv-token');
	expect(JSON.parse(mockCompanion.fetch.mock.calls[0][1].body)).toEqual({authType: 'plex', authToken: 'plex-tv-token'});

	mockCompanion.fetch.mockReturnValueOnce(reply(400, {error: 'Plex sign-in isn\'t available on Plex', errorCode: 'plex_unsupported'}));
	await expect(moonfinLogin('', '', 'plex', 'plex-tv-token')).rejects.toMatchObject({status: 400, code: 'plex_unsupported'});
});

test('a local Seerr account still signs in with its email and password', async () => {
	mockCompanion.fetch.mockReturnValueOnce(reply(200, {success: true}));
	await moonfinLogin('me@example.com', 'secret', 'local');
	expect(JSON.parse(mockCompanion.fetch.mock.calls[0][1].body)).toEqual({username: 'me@example.com', password: 'secret', authType: 'local'});
});
