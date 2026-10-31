import {corsFreeFetch} from './secureFetch';
import {createSiloApi, probeSilo} from './siloApi';
import {resetSiloSessions} from './siloSession';

jest.mock('./secureFetch', () => ({corsFreeFetch: jest.fn()}));
jest.mock('./storage', () => ({getFromStorage: () => Promise.resolve(null), saveToStorage: () => Promise.resolve()}));

const SERVER = 'http://silo:8090';
const device = {appName: 'Moonfin for webOS', appVersion: '3.0.0', deviceName: 'LG Smart TV', deviceId: 'dev-1'};

const reply = (status, body) => Promise.resolve({
	ok: status >= 200 && status < 300,
	status,
	headers: {get: () => null},
	text: () => Promise.resolve(body == null ? '' : JSON.stringify(body))
});
const answer = (byPath) => corsFreeFetch.mockImplementation((url, options) => {
	const path = url.replace(SERVER, '').split('?')[0];
	const found = byPath[`${options.method || 'GET'} ${path}`] ?? byPath[path];
	if (typeof found === 'function') return found(url, options);
	return found === undefined ? reply(404, {type: 'x/not_found', title: 'Not found', status: 404}) : reply(200, found);
});
const calls = () => corsFreeFetch.mock.calls.map(([url, options]) => `${options.method || 'GET'} ${url.replace(SERVER, '')}`);

const account = {id: 7, username: 'brady', role: 'admin', download_allowed: true, password_change_required: false};
const profiles = {items: [
	{id: 'kid', name: 'Kid', is_primary: false, has_pin: true},
	{id: 'main', name: 'Brady', is_primary: true, has_pin: false, avatar_url: '/a.png'}
]};

let token = null;
let userId = null;
let silo = null;

beforeEach(() => {
	resetSiloSessions();
	corsFreeFetch.mockReset();
	token = null;
	userId = null;
	silo = createSiloApi({getBaseUrl: () => SERVER, getToken: () => token, getUserId: () => userId, getDeviceInfo: () => device, platform: 'webos'});
});

describe('probe', () => {
	test('a native Silo answers as Jellyfin public info, named from its branding', async () => {
		answer({
			'/api/v2/system/info': {server_version: '315bb567', api_major: 2, contract_digest: 'd'},
			'/api/v2/system/identity': {server_id: 'srv-1'},
			'/api/v2/theme/branding': {server_name: 'Home Silo', login_subtitle: 'Hi'},
			'/api/v2/system/setup': {wizard_completed: true}
		});
		await expect(probeSilo(SERVER)).resolves.toMatchObject({
			Id: 'srv-1', ServerName: 'Home Silo', Version: '315bb567', ProductName: 'Silo', LoginDisclaimer: 'Hi', SiloApiMajor: 2
		});
	});

	test('a server that answers something else is not Silo', async () => {
		answer({'/api/v2/system/info': {Version: '10.10.0'}});
		await expect(probeSilo(SERVER)).resolves.toBe(null);
	});

	test('a server that answers with an error is not Silo', async () => {
		answer({});
		await expect(probeSilo(SERVER)).resolves.toBe(null);
	});

	test('another API major is refused, saying which side to update', async () => {
		answer({'/api/v2/system/info': {server_version: 'x', api_major: 3}});
		await expect(probeSilo(SERVER)).rejects.toMatchObject({siloApiUnsupported: true, serverIsNewer: true});
	});

	test('a retired namespace means the server is newer', async () => {
		answer({'/api/v2/system/info': () => reply(410, {type: 'x/client_upgrade_required', title: 'Gone', status: 410})});
		await expect(probeSilo(SERVER)).rejects.toMatchObject({siloApiUnsupported: true, serverIsNewer: true});
	});
});

describe('sign-in', () => {
	test('signs the account in and acts as its primary profile', async () => {
		answer({
			'POST /api/v2/auth/login': {access_token: 'a1', refresh_token: 'r1', expires_in: 900, user: account},
			'/api/v2/profiles': profiles
		});
		const result = await silo.authenticateByName('brady', 'pw');
		expect(result).toMatchObject({
			AccessToken: 'a1',
			SiloAccountId: '7',
			User: {Id: 'main', Name: 'Brady', Policy: {IsAdministrator: true}}
		});
		const login = corsFreeFetch.mock.calls[0][1];
		expect(login.headers.Authorization).toBeUndefined();
		expect(JSON.parse(login.body)).toEqual({username: 'brady', password: 'pw'});
		const list = corsFreeFetch.mock.calls[1][1];
		expect(list.headers.Authorization).toBe('Bearer a1');
	});

	test('a wrong password is not retried', async () => {
		answer({'POST /api/v2/auth/login': () => reply(401, {type: 'x/invalid_token', title: 'No', status: 401})});
		await expect(silo.authenticateByName('brady', 'bad')).rejects.toMatchObject({status: 401});
		expect(corsFreeFetch).toHaveBeenCalledTimes(1);
	});
});

describe('the signed-in profile', () => {
	const signIn = async () => {
		answer({
			'POST /api/v2/auth/login': {access_token: 'a1', refresh_token: 'r1', expires_in: 900, user: account},
			'/api/v2/profiles': profiles
		});
		const result = await silo.authenticateByName('brady', 'pw');
		token = result.AccessToken;
		userId = result.User.Id;
		corsFreeFetch.mockReset();
	};

	test('reads the profile with its settings as the user configuration', async () => {
		await signIn();
		answer({
			'/api/v2/account/me': account,
			'/api/v2/profiles': profiles,
			'/api/v2/settings/values/effective': {items: [
				{key: 'ui.library_order', value: [3, 1]},
				{key: 'playback.subtitle_mode', value: 'off'},
				{key: 'playback.show_forced_subtitles', value: false},
				{key: 'playback.auto_play_next', value: false}
			]}
		});
		const user = await silo.getUserConfiguration();
		expect(user).toMatchObject({
			Id: 'main',
			Configuration: {OrderedViews: ['3', '1'], SubtitleMode: 'None', EnableNextEpisodeAutoPlay: false}
		});
		const settingsCall = corsFreeFetch.mock.calls.find(([url]) => url.includes('/settings/'));
		expect(settingsCall[1].headers['X-Profile-Id']).toBe('main');
		const accountCall = corsFreeFetch.mock.calls.find(([url]) => url.includes('/account/me'));
		expect(accountCall[1].headers['X-Profile-Id']).toBeUndefined();
	});

	test('an update writes only the settings that changed', async () => {
		await signIn();
		answer({
			'/api/v2/settings/values/effective': {items: [{key: 'ui.library_order', value: [3, 1]}]},
			'PUT /api/v2/settings/values/ui.library_order': {}
		});
		await silo.updateUserConfiguration({OrderedViews: ['1', '3'], SubtitleMode: 'Default', EnableNextEpisodeAutoPlay: true});
		expect(calls()).toEqual([
			'GET /api/v2/settings/values/effective?keys=ui.library_order&keys=ui.disabled_library_ids&keys=playback.audio_language' +
				'&keys=playback.subtitle_language&keys=playback.subtitle_mode&keys=playback.show_forced_subtitles&keys=playback.auto_play_next',
			'PUT /api/v2/settings/values/ui.library_order?scope=profile'
		]);
		expect(JSON.parse(corsFreeFetch.mock.calls[1][1].body)).toEqual({value: [1, 3]});
	});

	test('sign-out ends the login on Silo', async () => {
		await signIn();
		answer({'POST /api/v2/auth/logout': {}});
		await silo.logout();
		expect(calls()).toEqual(['POST /api/v2/auth/logout']);
		await silo.logout();
		expect(corsFreeFetch).toHaveBeenCalledTimes(1);
	});
});

describe('device sign-in', () => {
	test('shows Silo\'s code, and signs in to the household once another login approves it', async () => {
		let polls = 0;
		answer({
			'/api/v2/auth/device/capability': {state: 'available', allowed: true},
			'POST /api/v2/auth/device/start': {device_code: 'secret-1', user_code: '1234-5678', verification_uri_complete: `${SERVER}/link?code=12345678`},
			'POST /api/v2/auth/device/poll': () => {
				polls += 1;
				return reply(200, polls === 1
					? {status: 'pending'}
					: {status: 'approved', tokens: {access_token: 'a1', refresh_token: 'r1', expires_in: 3600, user: account}});
			},
			'/api/v2/profiles': profiles
		});
		await expect(silo.initiateQuickConnect()).resolves.toEqual({
			Code: '12345678', Secret: 'secret-1', Authenticated: false, VerificationUriComplete: `${SERVER}/link?code=12345678`
		});
		await expect(silo.getQuickConnectState('secret-1')).resolves.toEqual({Authenticated: false, Expired: false});
		await expect(silo.getQuickConnectState('secret-1')).resolves.toEqual({Authenticated: true});
		const result = await silo.authenticateQuickConnect('secret-1');
		expect(result).toMatchObject({AccessToken: 'a1', SiloAccountId: '7', User: {Id: 'main'}});
		expect(result.SiloUsers.map((u) => [u.Id, u.SiloHasPin])).toEqual([['kid', true], ['main', false]]);
		await expect(silo.authenticateQuickConnect('secret-1')).rejects.toMatchObject({status: 409});
	});

	test('a code Silo no longer knows is done', async () => {
		answer({});
		await expect(silo.getQuickConnectState('gone')).resolves.toEqual({Authenticated: false, Expired: true});
	});
});

describe('a temporary password', () => {
	const temporary = {...account, password_change_required: true};

	test('keeps the login waiting for a new one, then signs in to the household with it', async () => {
		let refreshed = false;
		answer({
			'POST /api/v2/auth/login': {access_token: 'a1', refresh_token: 'r1', expires_in: 3600, user: temporary},
			'/api/v2/account/password/capability': {allowed: true, minimum_password_length: 8},
			'POST /api/v2/account/password': (url, options) => {
				expect(JSON.parse(options.body)).toEqual({current_password: 'temp', new_password: 'brand new pw'});
				return reply(204);
			},
			'POST /api/v2/auth/refresh': () => {
				refreshed = true;
				return reply(200, {access_token: 'a2', refresh_token: 'r2', expires_in: 3600});
			},
			'/api/v2/profiles': () => reply(refreshed ? 200 : 403, refreshed ? profiles : {type: 'x/password_change_required', status: 403})
		});
		await expect(silo.authenticateByName('brady', 'temp')).rejects.toMatchObject({code: 'password_change_required', minimumLength: 8});
		const result = await silo.changeRequiredPassword('brand new pw');
		expect(result).toMatchObject({AccessToken: 'a2', SiloAccountId: '7', User: {Id: 'main'}});
		await expect(silo.changeRequiredPassword('again')).rejects.toMatchObject({status: 409});
	});

	test('is ended when Silo won\'t let it be changed here', async () => {
		answer({
			'POST /api/v2/auth/login': {access_token: 'a1', refresh_token: 'r1', expires_in: 3600, user: temporary},
			'/api/v2/account/password/capability': {allowed: false},
			'POST /api/v2/auth/logout': null
		});
		await expect(silo.authenticateByName('brady', 'temp')).rejects.toMatchObject({code: 'password_change_unavailable'});
		expect(calls()).toContain('POST /api/v2/auth/logout');
	});
});
