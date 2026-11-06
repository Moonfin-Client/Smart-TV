jest.mock('./jellyfinApi', () => ({getAuthHeader: () => 'auth', getServerType: jest.fn(() => 'jellyfin'), getServerUrl: () => 'http://a'}));
jest.mock('../utils/requestQueue', () => ({mediaServerQueue: {run: (task) => task()}}));
jest.mock('../utils/fetchTimeout', () => ({fetchWithTimeout: (url, options) => global.fetch(url, options)}));
jest.mock('../utils/plexUrls', () => ({plexMoonbaseUrl: () => 'http://a:32500'}));

const MINUTE = 60 * 1000;

const badge = (label, extra = {}) => ({label, color: '#0284C7', textColor: '', style: 'solid', opacity: 100, size: 'medium', corner: 'topLeft', shape: 'rounded', icon: '', ...extra});

const reply = (body, status = 200) => Promise.resolve({ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body)});

// A fresh module per test, since the cache lives for the session.
const start = (answer = () => ({enabled: true, version: 'v1', maxPerCorner: 2, items: {}})) => {
	jest.resetModules();
	const request = jest.fn((url) => {
		const result = answer(url);
		return result && typeof result.then === 'function' ? result : reply(result);
	});
	global.fetch = request;
	return {api: require('./posterBadgesApi'), request};
};

const idsIn = (url) => new URL(url).searchParams.get('ids')?.split(',') || [];

const settle = async () => {
	for (let i = 0; i < 10; i++) await Promise.resolve();
};

const wait = async (ms) => {
	jest.advanceTimersByTime(ms);
	await settle();
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('a screen of cards shares one request', async () => {
	const {api, request} = start(() => ({enabled: true, version: 'v1', maxPerCorner: 3, items: {a: [badge('4K')]}}));
	const heard = jest.fn();
	['a', 'b', 'c'].forEach((id) => api.watchPosterBadges(id, heard));
	expect(request).not.toHaveBeenCalled();

	await wait(60);
	expect(request).toHaveBeenCalledTimes(1);
	const [url, options] = request.mock.calls[0];
	expect(idsIn(url)).toEqual(['a', 'b', 'c']);
	expect(url).toContain('/Moonfin/PosterBadges/Items?');
	expect(new URL(url).searchParams.get('profile')).toBe('tv');
	expect(options.headers.Authorization).toBe('auth');

	expect(api.posterBadgesFor('a').map((b) => b.label)).toEqual(['4K']);
	expect(api.posterBadgesFor('b')).toEqual([]);
	expect(api.posterBadgesPerCorner()).toBe(3);
	expect(heard).toHaveBeenCalled();
});

test('the same item asks once, even while its request is out', async () => {
	let answer;
	const {api, request} = start(() => new Promise((resolve) => {
		answer = resolve;
	}));
	api.watchPosterBadges('a', jest.fn());
	api.watchPosterBadges('a', jest.fn());
	await wait(60);
	api.watchPosterBadges('a', jest.fn());
	await wait(60);
	expect(request).toHaveBeenCalledTimes(1);
	expect(idsIn(request.mock.calls[0][0])).toEqual(['a']);

	answer({ok: true, status: 200, json: () => Promise.resolve({enabled: true, version: 'v1', items: {}})});
	await settle();
	api.watchPosterBadges('a', jest.fn());
	await wait(60);
	expect(request).toHaveBeenCalledTimes(1);
});

test('no request carries more than 200 ids, and the rest follow', async () => {
	const {api, request} = start();
	for (let i = 0; i < 250; i++) api.watchPosterBadges(`id${i}`, jest.fn());
	await wait(60);
	expect(request).toHaveBeenCalledTimes(1);
	expect(idsIn(request.mock.calls[0][0])).toHaveLength(200);
	await wait(60);
	expect(request).toHaveBeenCalledTimes(2);
	expect(idsIn(request.mock.calls[1][0])).toEqual(Array.from({length: 50}, (_, i) => `id${200 + i}`));
});

test('new rules make the cards on screen ask again, keeping their labels until the answer', async () => {
	let version = 'v1';
	let label = '4K';
	const {api, request} = start((url) => ({
		enabled: true,
		version,
		items: Object.fromEntries(idsIn(url).map((id) => [id, [badge(label)]]))
	}));
	const unwatchGone = api.watchPosterBadges('gone', jest.fn());
	api.watchPosterBadges('a', jest.fn());
	await wait(60);
	expect(api.posterBadgesFor('a')[0].label).toBe('4K');
	unwatchGone();

	version = 'v2';
	label = 'HDR';
	api.watchPosterBadges('b', jest.fn());
	await wait(60);
	expect(api.posterBadgesFor('b')[0].label).toBe('HDR');
	// Still the old label, so the poster doesn't blink while it asks again.
	expect(api.posterBadgesFor('a')[0].label).toBe('4K');
	expect(api.posterBadgesFor('gone')).toEqual([]);

	await wait(60);
	expect(request).toHaveBeenCalledTimes(3);
	expect(idsIn(request.mock.calls[2][0])).toEqual(['a']);
	expect(api.posterBadgesFor('a')[0].label).toBe('HDR');
});

test('a server without the route is left alone for five minutes', async () => {
	const {api, request} = start(() => reply({}, 404));
	api.watchPosterBadges('a', jest.fn());
	await wait(60);
	expect(request).toHaveBeenCalledTimes(1);

	await wait(4 * MINUTE);
	api.watchPosterBadges('b', jest.fn());
	await wait(60);
	expect(request).toHaveBeenCalledTimes(1);

	await wait(MINUTE);
	api.watchPosterBadges('c', jest.fn());
	await wait(60);
	expect(request).toHaveBeenCalledTimes(2);
});

test('a viewer with no rules stops asking for five minutes too', async () => {
	const {api, request} = start(() => ({enabled: false, version: 'v1', items: {}}));
	api.watchPosterBadges('a', jest.fn());
	await wait(60);
	await wait(4 * MINUTE);
	api.watchPosterBadges('b', jest.fn());
	await wait(60);
	expect(request).toHaveBeenCalledTimes(1);

	await wait(MINUTE);
	api.watchPosterBadges('c', jest.fn());
	await wait(60);
	expect(request).toHaveBeenCalledTimes(2);
});

test('a failed lookup is tried again only after a few minutes', async () => {
	const {api, request} = start(() => reply({}, 500));
	const unwatch = api.watchPosterBadges('a', jest.fn());
	await wait(60);
	unwatch();

	await wait(MINUTE);
	api.watchPosterBadges('a', jest.fn())();
	await wait(60);
	expect(request).toHaveBeenCalledTimes(1);

	await wait(2 * MINUTE);
	api.watchPosterBadges('a', jest.fn());
	await wait(60);
	expect(request).toHaveBeenCalledTimes(2);
});

test('settings ask without ids whether this viewer gets labels', async () => {
	const {api, request} = start(() => ({enabled: true, version: 'v1', maxPerCorner: 1, items: {}}));
	await api.checkPosterLabelsAvailable();
	expect(request).toHaveBeenCalledTimes(1);
	expect(new URL(request.mock.calls[0][0]).searchParams.has('ids')).toBe(false);
	expect(api.posterBadgesPerCorner()).toBe(1);

	// Answered once, so opening settings again costs nothing.
	await api.checkPosterLabelsAvailable();
	expect(request).toHaveBeenCalledTimes(1);
});

test('Silo is never asked', async () => {
	const {api, request} = start();
	require('./jellyfinApi').getServerType.mockReturnValue('silo');
	await api.checkPosterLabelsAvailable();
	api.watchPosterBadges('a', jest.fn());
	await wait(60);
	expect(request).not.toHaveBeenCalled();
});

test('Plex is asked through the companion next to it', async () => {
	const {api, request} = start();
	require('./jellyfinApi').getServerType.mockReturnValue('plex');
	api.watchPosterBadges('a', jest.fn());
	await wait(60);
	expect(request.mock.calls[0][0]).toBe('http://a:32500/Moonfin/PosterBadges/Items?ids=a&profile=tv');
	expect(api.posterLabelsBase()).toBe('http://a:32500');
});

test('an answer for the account that signed out is dropped', async () => {
	let answer;
	const {api} = start(() => new Promise((resolve) => {
		answer = resolve;
	}));
	api.watchPosterBadges('a', jest.fn());
	await wait(60);
	api.clearPosterBadges();
	answer({ok: true, status: 200, json: () => Promise.resolve({enabled: true, version: 'v1', items: {a: [badge('4K')]}})});
	await settle();
	expect(api.posterBadgesFor('a')).toEqual([]);
});
