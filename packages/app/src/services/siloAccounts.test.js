import {onSiloLoginEnded, restoreSiloAccounts, siloProfileOf} from './siloAccounts';
import {setSiloTokens, siloAccount} from './siloSession';
import {getAllServers, updateServer} from './multiServerManager';

jest.mock('./multiServerManager', () => ({getAllServers: jest.fn(), updateServer: jest.fn()}));

const SILO = 'http://silo:8090';
const pair = (access) => ({accessToken: access, refreshToken: `${access}-refresh`, expiresAt: Date.now() + 3600000, lifetimeMs: 3600000});

const saved = (accountId, tokens) => ({
	silo: {
		serverType: 'silo',
		url: SILO,
		siloAccounts: {[accountId]: tokens},
		users: {'profile-1': {siloAccountId: accountId, siloProfileToken: 'pin-proof'}, 'profile-2': {siloAccountId: accountId}}
	},
	jelly: {serverType: 'jellyfin', url: 'http://jelly:8096', users: {u1: {accessToken: 'x'}}}
});

beforeEach(() => updateServer.mockReset());

test('a saved login is loaded into the account its profiles share', async () => {
	getAllServers.mockResolvedValue(saved('account-a', pair('a1')));
	await restoreSiloAccounts();
	expect(siloAccount(SILO, 'account-a').tokens.accessToken).toBe('a1');
	expect(siloProfileOf(`${SILO}/`, 'profile-1')).toEqual({accountId: 'account-a', profileToken: 'pin-proof'});
	expect(siloProfileOf(SILO, 'profile-2')).toEqual({accountId: 'account-a', profileToken: null});
	expect(siloProfileOf('http://jelly:8096', 'u1')).toBeNull();
});

test('a pair already in use isn\'t replaced by the older one in storage', async () => {
	setSiloTokens(siloAccount(SILO, 'account-b'), pair('renewed'));
	getAllServers.mockResolvedValue(saved('account-b', pair('stored')));
	await restoreSiloAccounts();
	expect(siloAccount(SILO, 'account-b').tokens.accessToken).toBe('renewed');
});

test('each renewed pair is saved on the server entry', async () => {
	getAllServers.mockResolvedValue(saved('account-c', pair('c1')));
	await restoreSiloAccounts();
	const renewed = pair('c2');
	await siloAccount(SILO, 'account-c').onTokens(renewed);
	expect(updateServer).toHaveBeenCalledWith('silo', {siloAccounts: {'account-c': renewed}});
});

test('a login Silo turned down is dropped from storage, then announced with its server and account', async () => {
	getAllServers.mockResolvedValue(saved('account-d', pair('d1')));
	await restoreSiloAccounts();
	const ended = jest.fn();
	const stop = onSiloLoginEnded(ended);
	await siloAccount(SILO, 'account-d').onEnded();
	expect(updateServer).toHaveBeenCalledWith('silo', {siloAccounts: {}});
	expect(ended).toHaveBeenCalledWith(SILO, 'account-d');
	stop();
});

test('a profile no longer saved is forgotten when the saved servers load again', async () => {
	getAllServers.mockResolvedValue(saved('account-e', pair('e1')));
	await restoreSiloAccounts();
	getAllServers.mockResolvedValue({});
	await restoreSiloAccounts();
	expect(siloProfileOf(SILO, 'profile-1')).toBeNull();
});
