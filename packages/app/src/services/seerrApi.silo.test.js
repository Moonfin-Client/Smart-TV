import {fetchWithTimeout} from '../utils/fetchTimeout';
import {getMoonfinStatus, setMoonfinConfig} from './seerrApi';

jest.mock('../utils/fetchTimeout', () => ({fetchWithTimeout: jest.fn()}));
jest.mock('../platform', () => ({isWebOS: () => false, isLegacyTizen: () => false}));
jest.mock('./jellyfinApi', () => ({createApiForServer: jest.fn(), getUserId: () => null}));

// The stored Silo logins are only known once they've been read back, which takes a moment.
let mockSessionsRead = false;
jest.mock('./siloSession', () => ({
	loadSiloSessions: () => new Promise((resolve) => setTimeout(() => {
		mockSessionsRead = true;
		resolve();
	}, 0))
}));
jest.mock('./moonbaseEndpoint', () => ({
	moonbaseEndpoint: jest.fn(),
	isSiloLogin: () => mockSessionsRead
}));
jest.mock('./siloSeerr', () => ({
	createSiloSeerr: () => ({status: async () => ({authenticated: true, displayName: 'Silo'})})
}));

test('a Silo login is answered by Silo even when Seerr starts before the logins are read', async () => {
	setMoonfinConfig('https://silo.example', 'token');
	const status = await getMoonfinStatus();
	expect(status.authenticated).toBe(true);
	expect(fetchWithTimeout).not.toHaveBeenCalled();
});
