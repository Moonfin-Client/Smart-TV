import {createSiloRequest, needsRefresh, setSiloTokens, siloAccount, siloDeviceId, siloError, siloHeaders, siloTokens} from './siloSession';
import {corsFreeFetch} from './secureFetch';

jest.mock('./secureFetch', () => ({corsFreeFetch: jest.fn()}));

const device = {appName: 'Moonfin for webOS', appVersion: '3.0.0', deviceName: 'LG Smart TV', deviceId: 'dev-1', platform: 'webos'};
const HOUR = 3600 * 1000;

const reply = (status, body) => Promise.resolve({
	ok: status >= 200 && status < 300,
	status,
	headers: {get: () => null},
	text: () => Promise.resolve(body == null ? '' : JSON.stringify(body))
});

let accountId = 0;
const freshAccount = (pair) => {
	const account = siloAccount('http://silo:8090', `account-${++accountId}`);
	setSiloTokens(account, pair);
	return account;
};
const tokens = (access, refresh, expiresInMs = HOUR) => ({accessToken: access, refreshToken: refresh, expiresAt: Date.now() + expiresInMs, lifetimeMs: HOUR});

const clientFor = (account, profile = {id: 'profile-1'}) => createSiloRequest({
	getBaseUrl: () => 'http://silo:8090/',
	getAccount: () => account,
	getProfile: () => profile,
	getDeviceInfo: () => device
});

const sentHeaders = (call) => corsFreeFetch.mock.calls[call][1].headers;
const paths = () => corsFreeFetch.mock.calls.map(([url]) => url.replace('http://silo:8090/api/v2', '').split('?')[0]);

beforeEach(() => corsFreeFetch.mockReset());

describe('headers', () => {
	test('a device id keeps only the characters Silo takes', () => {
		expect(siloDeviceId('a b/c:d_e-f.g')).toBe('abc:d_e-f.g');
		expect(siloDeviceId('***')).toBeNull();
		expect(siloDeviceId('x'.repeat(200))).toHaveLength(128);
	});

	test('a request names the token, the profile and the device', () => {
		expect(siloHeaders({deviceInfo: device, accessToken: 'tok', profileId: 'p1', profileToken: 'pin-proof'})).toEqual({
			Authorization: 'Bearer tok',
			'X-Profile-Id': 'p1',
			'X-Profile-Token': 'pin-proof',
			'X-Silo-Device-Id': 'dev-1',
			'X-Silo-Device-Name': 'LG Smart TV',
			'X-Silo-Device-Platform': 'webos',
			'X-Silo-Client': 'Moonfin for webOS',
			'X-Silo-Client-Version': '3.0.0'
		});
	});

	test('the account-wide profile routes go out without a profile', async () => {
		const account = freshAccount(tokens('a1', 'r1'));
		corsFreeFetch.mockImplementation(() => reply(200, {items: []}));
		await clientFor(account).request('/profiles', {noProfile: true});
		expect(sentHeaders(0)['X-Profile-Id']).toBeUndefined();
		expect(sentHeaders(0).Authorization).toBe('Bearer a1');
	});
});

describe('tokens', () => {
	test('a pair is renewed with four fifths of its life gone or under a minute left', () => {
		const now = Date.now();
		expect(needsRefresh({refreshToken: 'r', expiresAt: now + 0.5 * HOUR, lifetimeMs: HOUR}, now)).toBe(false);
		expect(needsRefresh({refreshToken: 'r', expiresAt: now + 0.1 * HOUR, lifetimeMs: HOUR}, now)).toBe(true);
		expect(needsRefresh({refreshToken: 'r', expiresAt: now + 30000, lifetimeMs: 0}, now)).toBe(true);
		expect(needsRefresh({refreshToken: '', expiresAt: now, lifetimeMs: HOUR}, now)).toBe(false);
	});

	test('a pair arrives with its expiry counted from now', () => {
		expect(siloTokens({access_token: 'a', refresh_token: 'r', expires_in: 900}, 1000)).toEqual({accessToken: 'a', refreshToken: 'r', expiresAt: 901000, lifetimeMs: 900000});
	});

	test('a pair near its end is renewed first, and the new refresh token is saved', async () => {
		const account = freshAccount(tokens('old', 'r1', 30000));
		const saved = jest.fn();
		account.onTokens = saved;
		corsFreeFetch.mockImplementation((url) => (url.endsWith('/auth/refresh')
			? reply(200, {access_token: 'new', refresh_token: 'r2', expires_in: 3600})
			: reply(200, {ok: true})));
		await clientFor(account).request('/catalog');
		expect(paths()).toEqual(['/auth/refresh', '/catalog']);
		expect(JSON.parse(corsFreeFetch.mock.calls[0][1].body)).toEqual({refresh_token: 'r1'});
		expect(sentHeaders(0).Authorization).toBeUndefined();
		expect(sentHeaders(1).Authorization).toBe('Bearer new');
		expect(saved).toHaveBeenCalledWith(expect.objectContaining({accessToken: 'new', refreshToken: 'r2'}));
		expect(account.tokens.refreshToken).toBe('r2');
	});

	test('requests waiting at once share one refresh', async () => {
		const account = freshAccount(tokens('old', 'r1', 30000));
		corsFreeFetch.mockImplementation((url) => (url.endsWith('/auth/refresh')
			? reply(200, {access_token: 'new', refresh_token: 'r2', expires_in: 3600})
			: reply(200, {})));
		const client = clientFor(account);
		await Promise.all([client.request('/catalog'), client.request('/user/libraries'), client.request('/home/layout')]);
		expect(paths().filter((p) => p === '/auth/refresh')).toHaveLength(1);
	});

	test('a 401 renews the pair and replays the request once', async () => {
		const account = freshAccount(tokens('stale', 'r1'));
		corsFreeFetch.mockImplementation((url, init) => {
			if (url.endsWith('/auth/refresh')) return reply(200, {access_token: 'new', refresh_token: 'r2', expires_in: 3600});
			return init.headers.Authorization === 'Bearer new' ? reply(200, {title: 'ok'}) : reply(401, {type: 'https://siloserver.org/problems/invalid_token', title: 'Invalid token'});
		});
		await expect(clientFor(account).request('/catalog')).resolves.toEqual({title: 'ok'});
		expect(paths()).toEqual(['/catalog', '/auth/refresh', '/catalog']);
	});

	test('a refused refresh ends the login', async () => {
		const account = freshAccount(tokens('stale', 'r1'));
		const ended = jest.fn();
		account.onEnded = ended;
		corsFreeFetch.mockImplementation(() => reply(401, {type: 'https://siloserver.org/problems/invalid_token', title: 'Invalid token'}));
		await expect(clientFor(account).request('/catalog')).rejects.toMatchObject({status: 401, code: 'invalid_token'});
		expect(ended).toHaveBeenCalledTimes(1);
		expect(account.tokens).toBeNull();
	});

	test('a refresh that never reached Silo keeps the login', async () => {
		const account = freshAccount(tokens('old', 'r1', 30000));
		corsFreeFetch.mockImplementation((url) => (url.endsWith('/auth/refresh') ? Promise.reject(new TypeError('offline')) : reply(200, {})));
		await clientFor(account).request('/catalog');
		expect(account.tokens.refreshToken).toBe('r1');
	});

	test('a call Silo says mustn\'t be retried is never refreshed for', async () => {
		const account = freshAccount(tokens('a1', 'r1'));
		corsFreeFetch.mockImplementation(() => reply(401, {type: 'https://siloserver.org/problems/invalid_token', title: 'Invalid token'}));
		await expect(clientFor(account).request('/profiles/p1/verify-pin', {method: 'POST', noRefresh: true, noProfile: true})).rejects.toMatchObject({status: 401});
		expect(paths()).toEqual(['/profiles/p1/verify-pin']);
	});
});

describe('errors', () => {
	test('a problem document gives its code and how long to wait', () => {
		const error = siloError(429, {type: 'https://siloserver.org/docs/api/v2/problems/rate_limited', title: 'Too many attempts', detail: 'Try again later.'}, '300');
		expect(error).toMatchObject({status: 429, code: 'rate_limited', retryAfterMs: 300000, message: 'Try again later.'});
	});

	test('an answer that isn\'t a problem still fails with its status', () => {
		expect(siloError(502, null, null)).toMatchObject({status: 502, code: null, message: 'Silo error 502'});
	});
});
