import {corsFreeFetch} from './secureFetch';
import {
	needsRefresh, onSiloSessionEnded, onSiloTokensRotated, openSiloSession, profileProof, resetSiloSessions, setProfileProof,
	siloDeviceId, siloHeaders, siloRequest, siloSessionFor, tokensFrom
} from './siloSession';

jest.mock('./secureFetch', () => ({corsFreeFetch: jest.fn()}));
jest.mock('./storage', () => ({getFromStorage: () => Promise.resolve(null), saveToStorage: () => Promise.resolve()}));

const SERVER = 'http://silo:8090';
const device = {appName: 'Moonfin for webOS', appVersion: '3.0.0', deviceName: 'LG Smart TV', deviceId: 'moonfin_webos_abc'};

const reply = (status, body) => Promise.resolve({
	ok: status >= 200 && status < 300,
	status,
	headers: {get: () => null},
	text: () => Promise.resolve(body == null ? '' : JSON.stringify(body))
});
const problem = (status, code) => ({type: `https://siloserver.org/docs/api/v2/problems/${code}`, title: code, status, detail: `${code} detail`});
const pair = (access, refresh, expiresIn = 900) => ({access_token: access, refresh_token: refresh, expires_in: expiresIn});

beforeEach(() => {
	resetSiloSessions();
	corsFreeFetch.mockReset();
});

describe('headers', () => {
	test('a device id keeps only the characters Silo accepts', () => {
		expect(siloDeviceId('moonfin_webos_a b/c')).toBe('moonfin_webos_abc');
		expect(siloDeviceId('!!!')).toBe(null);
	});

	test('a request carries the bearer token, the profile with its PIN proof, and the device', () => {
		expect(siloHeaders({deviceInfo: device, platform: 'webos', accessToken: 'a1', profileId: 'p1', profileToken: 'proof'})).toEqual({
			Authorization: 'Bearer a1',
			'X-Profile-Id': 'p1',
			'X-Profile-Token': 'proof',
			'X-Silo-Device-Id': 'moonfin_webos_abc',
			'X-Silo-Device-Name': 'LG Smart TV',
			'X-Silo-Device-Platform': 'webos',
			'X-Silo-Client': 'Moonfin for webOS',
			'X-Silo-Client-Version': '3.0.0'
		});
	});
});

describe('tokens', () => {
	test('a pair is refreshed once four fifths of its life has passed', () => {
		const tokens = tokensFrom(pair('a', 'r', 1000), 0);
		expect(needsRefresh(tokens, 700000)).toBe(false);
		expect(needsRefresh(tokens, 800000)).toBe(true);
	});

	test('a pair with under a minute left is refreshed', () => {
		const tokens = tokensFrom(pair('a', 'r', 100), 0);
		expect(needsRefresh(tokens, 41000)).toBe(true);
	});
});

describe('requests', () => {
	test('an error answers with its Problem Details code and status', async () => {
		corsFreeFetch.mockImplementation(() => reply(422, problem(422, 'validation_failed')));
		await expect(siloRequest(SERVER, '/api/v2/system/info')).rejects.toMatchObject({status: 422, code: 'validation_failed'});
	});

	test('a list in the query goes as one parameter per value', async () => {
		corsFreeFetch.mockImplementation(() => reply(200, {}));
		await siloRequest(SERVER, '/api/v2/settings/values/effective', {query: {keys: ['a.b', 'c.d'], empty: null}});
		expect(corsFreeFetch.mock.calls[0][0]).toBe(`${SERVER}/api/v2/settings/values/effective?keys=a.b&keys=c.d`);
	});

	test('a 401 refreshes once, replays once with the new token, and rotates the stored pair', async () => {
		const session = openSiloSession(SERVER, 'acc-1', tokensFrom(pair('old', 'r1')));
		const rotated = jest.fn();
		onSiloTokensRotated(rotated);
		corsFreeFetch.mockImplementation((url, options) => {
			if (url.endsWith('/auth/refresh')) return reply(200, pair('new', 'r2'));
			return options.headers.Authorization === 'Bearer new' ? reply(200, {ok: true}) : reply(401, problem(401, 'invalid_token'));
		});
		await expect(siloRequest(SERVER, '/api/v2/account/me', {session})).resolves.toEqual({ok: true});
		expect(corsFreeFetch).toHaveBeenCalledTimes(3);
		expect(JSON.parse(corsFreeFetch.mock.calls[1][1].body)).toEqual({refresh_token: 'r1'});
		expect(rotated).toHaveBeenCalledWith(session, 'old');
		expect(siloSessionFor(SERVER, 'old')).toBe(session);
		expect(siloSessionFor(SERVER, 'new')).toBe(session);
	});

	test('requests that meet a 401 together share one refresh', async () => {
		const session = openSiloSession(SERVER, 'acc-1', tokensFrom(pair('old', 'r1')));
		let refreshes = 0;
		corsFreeFetch.mockImplementation((url, options) => {
			if (url.endsWith('/auth/refresh')) {
				refreshes++;
				return reply(200, pair('new', 'r2'));
			}
			return options.headers.Authorization === 'Bearer new' ? reply(200, {}) : reply(401, problem(401, 'invalid_token'));
		});
		await Promise.all([1, 2, 3].map(() => siloRequest(SERVER, '/api/v2/account/me', {session})));
		expect(refreshes).toBe(1);
	});

	test('a refused refresh ends the login', async () => {
		const session = openSiloSession(SERVER, 'acc-1', tokensFrom(pair('old', 'r1')));
		const ended = jest.fn();
		onSiloSessionEnded(ended);
		corsFreeFetch.mockImplementation((url) => (url.endsWith('/auth/refresh')
			? reply(401, problem(401, 'invalid_token'))
			: reply(401, problem(401, 'invalid_token'))));
		await expect(siloRequest(SERVER, '/api/v2/account/me', {session})).rejects.toMatchObject({status: 401});
		expect(ended).toHaveBeenCalledWith(session);
		expect(siloSessionFor(SERVER, 'old')).toBe(null);
	});

	test('a refresh that fails for any other reason keeps the login', async () => {
		const session = openSiloSession(SERVER, 'acc-1', tokensFrom(pair('old', 'r1')));
		corsFreeFetch.mockImplementation((url) => (url.endsWith('/auth/refresh')
			? reply(503, problem(503, 'service_unavailable'))
			: reply(401, problem(401, 'invalid_token'))));
		await expect(siloRequest(SERVER, '/api/v2/account/me', {session})).rejects.toMatchObject({status: 401});
		expect(siloSessionFor(SERVER, 'old')).toBe(session);
	});

	test('a sign-in is never refreshed for or replayed', async () => {
		const session = openSiloSession(SERVER, 'acc-1', tokensFrom(pair('old', 'r1')));
		corsFreeFetch.mockImplementation(() => reply(401, problem(401, 'invalid_token')));
		await expect(siloRequest(SERVER, '/api/v2/profiles/p/verify-pin', {session, refresh: false, method: 'POST', body: {pin: '1'}}))
			.rejects.toMatchObject({status: 401});
		expect(corsFreeFetch).toHaveBeenCalledTimes(1);
	});

	test('a request that waited on a refresh while the login changed is not sent', async () => {
		const session = openSiloSession(SERVER, 'acc-1', {...tokensFrom(pair('old', 'r1')), expiresAt: Date.now() + 1000});
		corsFreeFetch.mockImplementation((url) => {
			if (url.endsWith('/auth/refresh')) {
				openSiloSession(SERVER, 'acc-1', tokensFrom(pair('other', 'r9')));
				return reply(200, pair('new', 'r2'));
			}
			return reply(200, {});
		});
		await expect(siloRequest(SERVER, '/api/v2/account/me', {session})).rejects.toMatchObject({cancelled: true});
		expect(corsFreeFetch).toHaveBeenCalledTimes(1);
	});
});

describe('PIN proofs', () => {
	test('a proof is sent until it runs out', () => {
		const session = openSiloSession(SERVER, 'acc-1', tokensFrom(pair('a', 'r')));
		setProfileProof(session, 'kid', {token: 'proof', expiresAt: 2000});
		expect(profileProof(session, 'kid', 1000)).toBe('proof');
		expect(profileProof(session, 'kid', 3000)).toBe(null);
	});
});

describe('needsStreamRefresh', () => {
	const {needsStreamRefresh} = require('./siloSession');
	const tokens = (left, lifetimeMs = 3600000) => ({refreshToken: 'r', lifetimeMs, expiresAt: 1000000 + left});
	test('a stream about to open gets a token past a tenth of its life refreshed first', () => {
		expect(needsStreamRefresh(tokens(3600000), 1000000)).toBe(false);
		expect(needsStreamRefresh(tokens(3300000), 1000000)).toBe(false);
		expect(needsStreamRefresh(tokens(3200000), 1000000)).toBe(true);
		expect(needsStreamRefresh({...tokens(10), refreshToken: ''}, 1000000)).toBe(false);
	});
});
