import {sameSiloHousehold} from './multiServerManager';

jest.mock('./storage', () => ({getFromStorage: jest.fn(), saveToStorage: jest.fn(), removeFromStorage: jest.fn()}));

describe('sameSiloHousehold', () => {
	const self = {serverType: 'silo', serverId: 's1', userId: 'a', siloAccountId: '7', accessToken: 't1'};

	test('the same account, or a profile saved before its account was that shares the token', () => {
		expect(sameSiloHousehold({serverId: 's1', userId: 'b', siloAccountId: '7', accessToken: 'x'}, self)).toBe(true);
		expect(sameSiloHousehold({serverId: 's1', userId: 'c', siloAccountId: null, accessToken: 't1'}, self)).toBe(true);
		expect(sameSiloHousehold({serverId: 's1', userId: 'd', siloAccountId: '8', accessToken: 't2'}, self)).toBe(false);
		expect(sameSiloHousehold({serverId: 's2', userId: 'e', siloAccountId: '7', accessToken: 't1'}, self)).toBe(false);
	});

	test('only a Silo profile has a household', () => {
		expect(sameSiloHousehold({serverId: 's1', accessToken: 't1'}, {...self, serverType: 'jellyfin'})).toBe(false);
	});
});
