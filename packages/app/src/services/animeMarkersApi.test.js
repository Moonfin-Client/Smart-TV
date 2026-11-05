jest.mock('./storage', () => ({getFromStorage: jest.fn(), saveToStorage: jest.fn()}));
jest.mock('./jellyfinApi', () => ({getAuthHeader: () => 'auth', getServerType: () => 'jellyfin', getServerUrl: () => 'http://a'}));
jest.mock('../utils/requestQueue', () => ({mediaServerQueue: {run: (task) => task()}}));

const DAY_MS = 24 * 60 * 60 * 1000;

const answer = {enabled: true, episodes: {'ep-1': {kind: 'filler'}}, seasons: {}};

// Each launch starts with a fresh module and whatever the TV kept from the last one.
const launch = (kept, reply = answer) => {
	jest.resetModules();
	const storage = require('./storage');
	storage.getFromStorage.mockResolvedValue(kept);
	storage.saveToStorage.mockResolvedValue(true);
	const request = jest.fn(() => Promise.resolve({ok: true, json: () => Promise.resolve(reply)}));
	global.fetch = request;
	return {api: require('./animeMarkersApi'), storage, request};
};

const flush = async () => {
	for (let i = 0; i < 10; i++) await Promise.resolve();
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('a series asked for on one launch is answered from storage on the next', async () => {
	const first = launch(null);
	const markers = await first.api.fetchSeriesMarkers('s1');
	expect(markers.episodes.ep1.kind).toBe('filler');
	jest.advanceTimersByTime(3000);
	await flush();
	const [key, kept] = first.storage.saveToStorage.mock.calls[0];
	expect(key).toBe('anime_markers_series');
	expect(Object.keys(kept)).toEqual(['http://a|s1']);

	const next = launch(kept);
	expect(await next.api.fetchSeriesMarkers('s1')).toEqual(markers);
	expect(next.request).not.toHaveBeenCalled();
});

test('a day old entry or one from another server is asked for again', async () => {
	const old = launch({'http://a|s1': {fetchedAt: Date.now() - DAY_MS, data: {episodes: {}, seasons: {}}}});
	await old.api.fetchSeriesMarkers('s1');
	expect(old.request).toHaveBeenCalledTimes(1);

	const other = launch({'http://b|s1': {fetchedAt: Date.now(), data: {episodes: {}, seasons: {}}}});
	await other.api.fetchSeriesMarkers('s1');
	expect(other.request).toHaveBeenCalledTimes(1);
});

test('a row of series cards asks once when the feature is off', async () => {
	const off = launch(null, {enabled: false, episodes: {}, seasons: {}});
	const results = await Promise.all(['s1', 's2', 's3'].map((id) => off.api.fetchSeriesMarkers(id)));
	expect(results).toEqual([null, null, null]);
	expect(off.request).toHaveBeenCalledTimes(1);
});

test('audio labels stay full until the plugin asks for short ones', async () => {
	const first = launch(null, {...answer, labelStyle: 'short'});
	expect(first.api.animeLabelStyle()).toBe('full');
	await first.api.fetchSeriesMarkers('s1');
	expect(first.api.animeLabelStyle()).toBe('short');
});

test('an answer that names no label style keeps the last one, and one it doesn\'t know reads as full', async () => {
	const {api, request} = launch(null, {...answer, labelStyle: 'short'});
	await api.fetchSeriesMarkers('s1');
	request.mockImplementationOnce(() => Promise.resolve({ok: true, json: () => Promise.resolve(answer)}));
	await api.fetchSeriesMarkers('s2');
	expect(api.animeLabelStyle()).toBe('short');
	request.mockImplementationOnce(() => Promise.resolve({ok: true, json: () => Promise.resolve({...answer, labelStyle: 'tiny'})}));
	await api.fetchSeriesMarkers('s3');
	expect(api.animeLabelStyle()).toBe('full');
});

test('a series kept from the last launch brings its label style back', async () => {
	const first = launch(null, {...answer, labelStyle: 'short'});
	await first.api.fetchSeriesMarkers('s1');
	jest.advanceTimersByTime(3000);
	await flush();
	const [, kept] = first.storage.saveToStorage.mock.calls[0];

	const next = launch(kept);
	await next.api.fetchSeriesMarkers('s1');
	expect(next.request).not.toHaveBeenCalled();
	expect(next.api.animeLabelStyle()).toBe('short');
});

test('the lookup for single items notes the label style too', async () => {
	const {api} = launch(null, {enabled: true, items: {i1: {audio: 'Dubbed'}}, labelStyle: 'short'});
	const asked = api.fetchItemMarkers(['i1']);
	jest.advanceTimersByTime(80);
	await asked;
	expect(api.audioForItem('i1')).toBe('Dubbed');
	expect(api.animeLabelStyle()).toBe('short');
});
