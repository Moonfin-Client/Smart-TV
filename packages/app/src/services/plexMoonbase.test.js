const mockServers = {};

jest.mock('./secureFetch', () => ({corsFreeFetch: jest.fn()}));
jest.mock('./multiServerManager', () => ({
	getAllServers: async () => mockServers,
	updateServer: jest.fn(async (id, updates) => {
		Object.assign(mockServers[id], updates);
		return true;
	})
}));

const ping = (body, status = 200) => Promise.resolve({ok: status === 200, status, json: () => Promise.resolve(body)});

// What was found lives in module state, so each test starts from a fresh copy.
const load = () => {
	let mod;
	jest.isolateModules(() => {
		mod = {...require('./plexMoonbase'), shell: require('./secureFetch').corsFreeFetch};
	});
	return mod;
};

beforeEach(() => {
	Object.keys(mockServers).forEach((id) => delete mockServers[id]);
	mockServers.plex = {url: 'http://192.168.1.5:32400', serverType: 'plex'};
});

describe('Moonbase for Plex', () => {
	test("is found next to the Plex server once its ping says it's installed, signed with the PMS token", async () => {
		const {findPlexMoonbase, shell} = load();
		shell.mockReturnValue(ping({installed: true, version: '0.6.2'}));
		expect(await findPlexMoonbase('http://192.168.1.5:32400/', 'pms-token')).toBe('http://192.168.1.5:32500');
		expect(await findPlexMoonbase('http://192.168.1.5:32400', 'pms-token')).toBe('http://192.168.1.5:32500');
		expect(shell).toHaveBeenCalledTimes(1);
		const [url, init, timeout] = shell.mock.calls[0];
		expect(url).toBe('http://192.168.1.5:32500/Moonfin/Ping');
		expect(init.headers['X-Plex-Token']).toBe('pms-token');
		expect(timeout).toBe(3000);
	});

	test("a server whose companion is missing or says nothing of Moonbase isn't asked again for a while", async () => {
		const {findPlexMoonbase, shell} = load();
		shell.mockReturnValueOnce(ping({}));
		expect(await findPlexMoonbase('http://192.168.1.5:32400', 'pms-token')).toBeNull();
		expect(await findPlexMoonbase('http://192.168.1.5:32400', 'pms-token')).toBeNull();
		expect(shell).toHaveBeenCalledTimes(1);
	});

	test('an unreachable companion counts as missing, since most Plex servers have none', async () => {
		const {findPlexMoonbase, forgetPlexMoonbase, shell} = load();
		shell.mockRejectedValueOnce(new Error('offline')).mockReturnValueOnce(ping({installed: true}));
		expect(await findPlexMoonbase('http://192.168.1.5:32400', 'pms-token')).toBeNull();
		expect(await findPlexMoonbase('http://192.168.1.5:32400', 'pms-token')).toBeNull();
		forgetPlexMoonbase('http://192.168.1.5:32400');
		expect(await findPlexMoonbase('http://192.168.1.5:32400', 'pms-token')).toBe('http://192.168.1.5:32500');
	});

	test('pings at once are one ping', async () => {
		const {findPlexMoonbase, shell} = load();
		shell.mockReturnValue(ping({installed: true}));
		await Promise.all([findPlexMoonbase('http://192.168.1.5:32400', 't'), findPlexMoonbase('http://192.168.1.5:32400', 't')]);
		expect(shell).toHaveBeenCalledTimes(1);
	});

	test('the address set for the server comes before the one next to it, with longer to answer', async () => {
		const {findPlexMoonbase, knownPlexMoonbase, plexMoonbaseBase, setPlexMoonbaseAddress, getPlexMoonbaseAddress, shell} = load();
		expect(plexMoonbaseBase('http://192.168.1.5:32400')).toBe('http://192.168.1.5:32500');
		await setPlexMoonbaseAddress('plex', ' moonbase.lan:8080/ ');
		expect(await getPlexMoonbaseAddress('plex')).toBe('http://moonbase.lan:8080');
		shell.mockReturnValue(ping({installed: true}));
		expect(await findPlexMoonbase('http://192.168.1.5:32400', 't')).toBe('http://moonbase.lan:8080');
		expect(shell.mock.calls[0][0]).toBe('http://moonbase.lan:8080/Moonfin/Ping');
		expect(shell.mock.calls[0][2]).toBe(10000);
		expect(knownPlexMoonbase('http://192.168.1.5:32400')).toBe('http://moonbase.lan:8080');
		expect(plexMoonbaseBase('http://192.168.1.5:32400')).toBe('http://moonbase.lan:8080');
	});

	test('a plex.direct name is turned back into its address, since the companion has no certificate for it', async () => {
		const {findPlexMoonbase, shell} = load();
		shell.mockReturnValue(ping({installed: true}));
		expect(await findPlexMoonbase('https://192-168-1-5.0123abcd.plex.direct:32400', 't')).toBe('http://192.168.1.5:32500');
	});

	test('needs a token', async () => {
		const {findPlexMoonbase, shell} = load();
		expect(await findPlexMoonbase('http://192.168.1.5:32400', '')).toBeNull();
		expect(shell).not.toHaveBeenCalled();
	});
});
