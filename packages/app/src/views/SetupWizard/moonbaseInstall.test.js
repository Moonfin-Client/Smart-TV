jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

import {MOONBASE_MANIFEST_URL, installMoonbase, moonbaseFeatures, moonbaseGuideUrl} from './moonbaseInstall';

const OTHER = {Name: 'Other', Url: 'https://example.com/m.json', Enabled: true};

const fakeApi = (repos) => {
	const api = {
		repos,
		saved: null,
		installs: [],
		getRepositories: async () => api.repos,
		setRepositories: async (next) => {
			api.saved = next;
			api.repos = next;
		},
		installPackage: async (name, params) => {
			api.installs.push({name, ...params});
		}
	};
	return api;
};

describe('moonbaseFeatures', () => {
	test('Jellyfin and Emby get the full plugin', () => {
		for (const type of ['jellyfin', 'emby']) {
			const features = moonbaseFeatures(type);
			expect(features).toContain('Seerr requests');
			expect(features).toContain('Retro games with synced saves');
			expect(features).toContain("A calendar of what's coming up");
			expect(features).not.toContain('Your own order for each collection');
		}
	});

	test('Plex and Silo get the smaller set, and Silo has no calendar', () => {
		const plex = moonbaseFeatures('plex');
		const silo = moonbaseFeatures('silo');
		for (const features of [plex, silo]) {
			expect(features).toContain('Settings synced across your devices');
			expect(features).toContain('Your own order for each collection');
			expect(features).not.toContain('Seerr requests');
			expect(features).not.toContain('Custom rows from your favorite lists');
		}
		expect(plex).toContain("A calendar of what's coming up");
		expect(silo).not.toContain("A calendar of what's coming up");
	});

	test('each server links its own install steps', () => {
		expect(moonbaseGuideUrl('silo')).toBe('https://github.com/Moonfin-Client/Plugin/wiki/Installation#silo');
	});
});

describe('installMoonbase', () => {
	test('adds the repository next to the others, then installs', async () => {
		const api = fakeApi([OTHER]);
		await installMoonbase(api);
		expect(api.saved.map((repo) => repo.Url)).toEqual([OTHER.Url, MOONBASE_MANIFEST_URL]);
		expect(api.installs).toEqual([{
			name: 'Moonbase',
			assemblyGuid: '8c5d0e91-4f2a-4b6d-9e3f-1a7c8d9e0f2b',
			repositoryUrl: MOONBASE_MANIFEST_URL
		}]);
	});

	test('leaves the repositories alone when Moonbase is already there', async () => {
		const api = fakeApi([OTHER, {Name: 'Mine', Url: MOONBASE_MANIFEST_URL, Enabled: true}]);
		await installMoonbase(api);
		expect(api.saved).toBeNull();
		expect(api.installs).toHaveLength(1);
	});

	test('turns a disabled Moonbase repository back on', async () => {
		const api = fakeApi([{Name: 'Mine', Url: MOONBASE_MANIFEST_URL, Enabled: false}, OTHER]);
		await installMoonbase(api);
		expect(api.saved.map((repo) => [repo.Url, repo.Enabled])).toEqual([
			[OTHER.Url, true],
			[MOONBASE_MANIFEST_URL, true]
		]);
	});

	test('a failed install is passed on', async () => {
		const api = fakeApi([]);
		api.installPackage = async () => {
			throw new Error('API Error: 404');
		};
		await expect(installMoonbase(api)).rejects.toThrow('API Error: 404');
	});
});
