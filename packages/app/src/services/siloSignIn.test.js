import {createSiloSignIn, probeSilo, siloBehindJellyfin, siloVersionMismatch} from './siloSignIn';
import {siloAccount} from './siloSession';
import {corsFreeFetch, platformFetch} from './secureFetch';
import systemInfo from './__fixtures__/silo/system_info.json';
import systemIdentity from './__fixtures__/silo/system_identity.json';
import branding from './__fixtures__/silo/theme_branding.json';
import authLogin from './__fixtures__/silo/auth_login.json';
import deviceCapability from './__fixtures__/silo/device_login_capability.json';
import deviceStart from './__fixtures__/silo/device_login_start.json';
import pollPending from './__fixtures__/silo/device_login_poll_pending.json';
import pollApproved from './__fixtures__/silo/device_login_poll_approved.json';
import profiles from './__fixtures__/silo/profiles.json';

jest.mock('./secureFetch', () => ({corsFreeFetch: jest.fn(), platformFetch: jest.fn()}));

const SILO = 'http://silo:8090';
const device = {appName: 'Moonfin for webOS', appVersion: '3.0.0', deviceName: 'LG Smart TV', deviceId: 'dev-1', platform: 'webos'};
const NOT_FOUND = {type: 'https://siloserver.org/problems/not_found', title: 'Not found'};

const reply = (status, body, headers = {}) => Promise.resolve({
	ok: status >= 200 && status < 300,
	status,
	headers: {get: (name) => headers[name.toLowerCase()] ?? null},
	text: () => Promise.resolve(body == null ? '' : JSON.stringify(body))
});

// A Silo at one address that answers each route from a table, and anything else with a 404.
const serve = (routes, base = SILO) => corsFreeFetch.mockImplementation((url, init) => {
	if (!url.startsWith(`${base}/api/v2`)) return Promise.reject(new TypeError('Failed to fetch'));
	const path = url.substring(base.length + 7).split('?')[0];
	const answer = routes[`${init.method} ${path}`] ?? routes[path];
	return typeof answer === 'function' ? answer(init) : (answer ? reply(...answer) : reply(404, NOT_FOUND));
});

const bodyOf = (path) => JSON.parse(corsFreeFetch.mock.calls.find(([url]) => url.endsWith(path))[1].body);
const headersOf = (path) => corsFreeFetch.mock.calls.find(([url]) => url.endsWith(path))[1].headers;

beforeEach(() => {
	corsFreeFetch.mockReset();
	platformFetch.mockReset();
});

describe('finding a Silo server', () => {
	test('Silo\'s info comes in the shape the app reads a server\'s public info in', async () => {
		serve({'/system/info': [200, systemInfo], '/system/identity': [200, systemIdentity], '/theme/branding': [200, branding]});
		expect(await probeSilo(SILO, device)).toEqual({
			Id: systemIdentity.server_id,
			ServerName: 'Silo',
			Version: '4b2e921c+dirty',
			ProductName: 'Silo',
			ApiMajor: 2
		});
	});

	test('an address that isn\'t Silo\'s native API is no Silo', async () => {
		serve({});
		expect(await probeSilo(SILO, device)).toBeNull();
	});

	test('a server on another major version says which side has to update', async () => {
		expect(siloVersionMismatch({ApiMajor: 2})).toBeNull();
		expect(siloVersionMismatch({ApiMajor: 3})).toBe('app');
		expect(siloVersionMismatch({ApiMajor: 1})).toBe('server');
		serve({'/system/info': [410, {type: 'https://siloserver.org/problems/client_upgrade_required', title: 'Gone'}]});
		expect(siloVersionMismatch(await probeSilo(SILO, device))).toBe('app');
	});

	test('Silo\'s Jellyfin-compatible port leads to its own API on 8090', async () => {
		platformFetch.mockResolvedValue({ok: true, json: () => Promise.resolve({LoginDisclaimer: 'Powered by Silo'})});
		serve({'/system/info': [200, systemInfo]});
		expect(await siloBehindJellyfin('http://silo:8096', device)).toMatchObject({url: SILO, info: {ProductName: 'Silo'}});
		expect(platformFetch.mock.calls[0][0]).toBe('http://silo:8096/Branding/Configuration');
	});

	test('a Jellyfin server that doesn\'t name Silo stays Jellyfin', async () => {
		platformFetch.mockResolvedValue({ok: true, json: () => Promise.resolve({LoginDisclaimer: ''})});
		expect(await siloBehindJellyfin('http://jelly:8096', device)).toBeNull();
		expect(corsFreeFetch).not.toHaveBeenCalled();
	});
});

describe('signing in', () => {
	test('a password sign-in puts the token pair into the account its profiles share', async () => {
		serve({'POST /auth/login': [200, {...authLogin, access_token: 'a1', refresh_token: 'r1'}]});
		const login = await createSiloSignIn(SILO, device).signIn('user', 'secret');
		expect(login.account).toMatchObject({id: '9', username: 'user'});
		expect(siloAccount(SILO, '9').tokens).toMatchObject({accessToken: 'a1', refreshToken: 'r1'});
		expect(bodyOf('/auth/login')).toEqual({username: 'user', password: 'secret'});
		expect(headersOf('/auth/login').Authorization).toBeUndefined();
	});

	test('a wrong password is never refreshed for or tried again', async () => {
		serve({'POST /auth/login': [401, {type: 'https://siloserver.org/problems/invalid_token', title: 'Invalid credentials'}]});
		await expect(createSiloSignIn(SILO, device).signIn('user', 'wrong')).rejects.toMatchObject({status: 401});
		expect(corsFreeFetch).toHaveBeenCalledTimes(1);
	});

	test('a code sign-in shows Silo\'s code without its dash, with the link for the QR code', async () => {
		serve({'/auth/device/capability': [200, deviceCapability], 'POST /auth/device/start': [200, deviceStart]});
		expect(await createSiloSignIn(SILO, device).startCodeSignIn()).toEqual({
			code: '48217730',
			secret: 'dc_SCRUBBED',
			link: 'https://silo.example/activate?code=48217730',
			pollAfterMs: 3000
		});
		expect(bodyOf('/auth/device/start')).toEqual({device_name: 'LG Smart TV', device_platform: 'webos'});
	});

	test('an approved code hands over the login once, and a gone code has run out', async () => {
		const signIn = createSiloSignIn(SILO, device);
		serve({'POST /auth/device/poll': [200, pollPending]});
		expect(await signIn.checkCodeSignIn('dc')).toEqual({status: 'pending', pollAfterMs: 3000});
		serve({'POST /auth/device/poll': [200, {...pollApproved, tokens: {...pollApproved.tokens, access_token: 'c1', refresh_token: 'c2'}}]});
		expect(await signIn.checkCodeSignIn('dc')).toMatchObject({status: 'approved', login: {account: {id: '9'}}});
		expect(siloAccount(SILO, '9').tokens.accessToken).toBe('c1');
		serve({});
		expect(await signIn.checkCodeSignIn('dc')).toEqual({status: 'expired'});
	});
});

describe('profiles', () => {
	const signedIn = async () => {
		serve({'POST /auth/login': [200, {...authLogin, access_token: 'a1', refresh_token: 'r1'}]});
		const signIn = createSiloSignIn(SILO, device);
		await signIn.signIn('user', 'secret');
		return signIn;
	};

	test('the profiles are listed as the account, naming no profile', async () => {
		const signIn = await signedIn();
		serve({'/profiles': [200, profiles]});
		expect((await signIn.profiles()).map((p) => p.name)).toEqual(['Profile 1']);
		expect(headersOf('/profiles')).toMatchObject({Authorization: 'Bearer a1'});
		expect(headersOf('/profiles')['X-Profile-Id']).toBeUndefined();
	});

	test('a PIN is right, wrong, or locked out for a while', async () => {
		const signIn = await signedIn();
		serve({'POST /profiles/p1/verify-pin': [200, {valid: true, profile_token: 'proof'}]});
		expect(await signIn.verifyPin('p1', '1234')).toEqual({profileToken: 'proof'});
		serve({'POST /profiles/p1/verify-pin': [200, {valid: false}]});
		expect(await signIn.verifyPin('p1', '0000')).toEqual({wrong: true});
		serve({'POST /profiles/p1/verify-pin': [429, {type: 'https://siloserver.org/problems/rate_limited', title: 'Too many attempts'}, {'retry-after': '300'}]});
		expect(await signIn.verifyPin('p1', '0000')).toEqual({lockedForMs: 300000});
	});
});
