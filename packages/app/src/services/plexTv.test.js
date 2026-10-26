import {firstAnswering, getServers, plexAddressCandidates} from './plexTv';
import {platformFetch} from './secureFetch';

jest.mock('./secureFetch', () => ({platformFetch: jest.fn(), corsFreeFetch: jest.fn()}));
jest.mock('./jellyfinApi', () => ({
	getDeviceInfo: () => ({appName: 'Moonfin for webOS', appVersion: '2.10.0', deviceName: 'LG Smart TV', deviceId: 'dev-1'})
}));

const after = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

describe('finding where a Plex server answers', () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	test('takes the best address that answers, giving the ones ahead of it a moment more', async () => {
		const answers = {local: after(900, true), remote: after(100, true), relay: after(50, true)};
		const found = firstAnswering(['local', 'remote', 'relay'], (uri) => answers[uri]);
		await jest.advanceTimersByTimeAsync(1600);
		await expect(found).resolves.toBe('local');
	});

	test("doesn't wait out an address that never answers once a later one has", async () => {
		const found = firstAnswering(['container', 'relay'], (uri) => (uri === 'relay' ? after(100, true) : after(60000, true)));
		await jest.advanceTimersByTimeAsync(1200);
		await expect(found).resolves.toBe('relay');
	});

	test('is null when nothing answers', async () => {
		const found = firstAnswering(['a', 'b'], () => after(10, false));
		await jest.advanceTimersByTimeAsync(20);
		await expect(found).resolves.toBeNull();
	});
});

test('a typed address tries Plex\'s port first and plain http when no scheme was given', () => {
	expect(plexAddressCandidates('192.168.50.45')).toEqual(['http://192.168.50.45:32400', 'http://192.168.50.45']);
	expect(plexAddressCandidates('192.168.50.45:32400')).toEqual(['http://192.168.50.45:32400']);
	expect(plexAddressCandidates('https://plex.example.com')).toEqual(['https://plex.example.com:32400', 'https://plex.example.com']);
});

test('lists the account servers best address first, each local https one followed by its plain address', async () => {
	platformFetch.mockResolvedValue({ok: true, status: 200, text: () => Promise.resolve(JSON.stringify([
		{provides: 'player', name: 'phone'},
		{provides: 'server', name: 'Home', clientIdentifier: 'm1', productVersion: '1.43.4.10903-e5521bd8c', accessToken: 'srv', connections: [
			{uri: 'https://relay.plex.direct:8443', relay: true},
			{uri: 'https://45-1-2-3.plex.direct:32400', local: false},
			{uri: 'https://192-168-1-5.plex.direct:32400', local: true, address: '192.168.1.5', port: 32400}
		]}
	]))});
	const [server] = await getServers('account');
	expect(server).toMatchObject({id: 'm1', name: 'Home', version: '1.43.4.10903', accessToken: 'srv'});
	expect(server.connections).toEqual([
		'https://192-168-1-5.plex.direct:32400',
		'http://192.168.1.5:32400',
		'https://45-1-2-3.plex.direct:32400',
		'https://relay.plex.direct:8443'
	]);
	expect(platformFetch.mock.calls[0][0]).toContain('X-Plex-Token=account');
});
