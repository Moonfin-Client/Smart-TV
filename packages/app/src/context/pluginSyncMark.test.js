// Nothing renders here, and the real React can't be pulled in because the CLI ships a second copy that disagrees with it.
jest.mock('react/jsx-dev-runtime', () => ({}));
jest.mock('react', () => ({createContext: () => ({})}));
jest.mock('../services/storage', () => {
	const storage = {};
	return {
		stored: storage,
		getFromStorage: async (key) => storage[key],
		saveToStorage: async (key, value) => { storage[key] = value; }
	};
});

import {stored} from '../services/storage';
import {isServerSyncInitialized, markServerSyncInitialized} from './SettingsContext';
import {registerPlexServer} from '../utils/plexUrls';

describe('the plugin sync mark', () => {
	beforeEach(() => {
		stored.pluginSyncInitialized = {'jellyfin.lan:8096': true, 'plex.lan:32400': true};
		registerPlexServer('http://plex.lan:32400', 'pms-token');
	});

	test("a Plex server marked before Moonbase for Plex is looked at once more, then it's done", async () => {
		expect(await isServerSyncInitialized('http://plex.lan:32400')).toBe(false);

		await markServerSyncInitialized('http://plex.lan:32400');

		expect(await isServerSyncInitialized('http://plex.lan:32400/')).toBe(true);
	});

	test('an older mark on any other server still counts', async () => {
		expect(await isServerSyncInitialized('http://jellyfin.lan:8096')).toBe(true);
	});

	test("a server that was never marked isn't done", async () => {
		expect(await isServerSyncInitialized('http://emby.lan:8096')).toBe(false);
	});
});
