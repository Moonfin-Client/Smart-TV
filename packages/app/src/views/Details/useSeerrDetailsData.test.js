import {act, renderHook} from '@testing-library/react';

import seerrApi from '../../services/seerrApi';
import {MEDIA_STATUS} from '../../utils/seerrStatus';
import useSeerrDetailsData, {statusPollInterval} from './useSeerrDetailsData';

jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));
jest.mock('../../services/seerrApi', () => ({
	__esModule: true,
	default: {
		getMovie: jest.fn(),
		getTv: jest.fn(),
		getUser: jest.fn(),
		getUserQuota: jest.fn(),
		getRadarrServers: jest.fn(),
		getSonarrServers: jest.fn(),
		getPublicSettings: jest.fn(),
		getMovieRecommendations: jest.fn(),
		getMovieSimilar: jest.fn(),
		getTvRecommendations: jest.fn(),
		getTvSimilar: jest.fn(),
		getArrQueue: jest.fn()
	}
}));

// What the server says about the title, changed between ticks.
let mediaInfo;
let hidden;
const movie = () => ({id: 299534, title: 'Avengers: Endgame', mediaInfo});
// The first fetch is the page loading, every later one is a refresh.
const refreshes = () => seerrApi.getMovie.mock.calls.length - 1;

const elapse = (ms) => act(async () => {
	await jest.advanceTimersByTimeAsync(ms);
});

const open = async (arrQueueAvailable = false) => {
	const view = renderHook(() => useSeerrDetailsData({mediaId: 299534, mediaType: 'movie', contextUser: null, arrQueueAvailable}));
	await elapse(0);
	return view;
};

beforeAll(() => {
	Object.defineProperty(document, 'hidden', {configurable: true, get: () => hidden});
});

beforeEach(() => {
	jest.useFakeTimers();
	jest.clearAllMocks();
	mediaInfo = {status: MEDIA_STATUS.UNKNOWN};
	hidden = false;
	seerrApi.getMovie.mockImplementation(async () => movie());
	seerrApi.getUser.mockResolvedValue({id: 1});
	seerrApi.getUserQuota.mockResolvedValue(null);
	seerrApi.getRadarrServers.mockResolvedValue([]);
	seerrApi.getPublicSettings.mockResolvedValue({});
	seerrApi.getMovieRecommendations.mockResolvedValue({results: []});
	seerrApi.getMovieSimilar.mockResolvedValue({results: []});
	seerrApi.getArrQueue.mockResolvedValue(null);
});

afterEach(() => jest.useRealTimers());

describe('the refresh interval', () => {
	test('a download refreshes every 15s, anything else on its way every 30s', () => {
		expect(statusPollInterval({status: MEDIA_STATUS.PROCESSING, downloadStatus: [{downloadId: 'dl', size: 100, sizeLeft: 40}]})).toBe(15000);
		expect(statusPollInterval({status: MEDIA_STATUS.UNKNOWN, status4k: MEDIA_STATUS.PROCESSING, downloadStatus4k: [{downloadId: 'dl', size: 100, sizeLeft: 40}]})).toBe(15000);
		expect(statusPollInterval({status: MEDIA_STATUS.PENDING})).toBe(30000);
		expect(statusPollInterval({status: MEDIA_STATUS.AVAILABLE})).toBe(null);
		expect(statusPollInterval(undefined)).toBe(null);
	});
});

describe('the open Seerr details page', () => {
	test('follows a request until the title lands', async () => {
		const {result} = await open();

		// The request flow refetches the title once Seerr takes the request.
		mediaInfo = {status: MEDIA_STATUS.PROCESSING};
		act(() => result.current.setDetails(movie()));
		expect(result.current.hdDownload).toBe(null);

		mediaInfo = {status: MEDIA_STATUS.PROCESSING, downloadStatus: [{downloadId: 'dl', size: 100, sizeLeft: 40}]};
		await elapse(30000);
		expect(result.current.hdDownload.fraction).toBe(0.6);

		// Radarr has imported it but Seerr hasnt seen it in the library yet.
		mediaInfo = {status: MEDIA_STATUS.PROCESSING};
		await elapse(15000);
		expect(result.current.hdDownload).toBe(null);
		expect(result.current.hdStatus).toBe(MEDIA_STATUS.PROCESSING);

		mediaInfo = {status: MEDIA_STATUS.AVAILABLE};
		await elapse(30000);
		expect(result.current.hdStatus).toBe(MEDIA_STATUS.AVAILABLE);

		const refreshesOnceAvailable = refreshes();
		await elapse(5 * 60000);
		expect(refreshes()).toBe(refreshesOnceAvailable);
	});

	test('a download refreshes on the 15s beat', async () => {
		mediaInfo = {status: MEDIA_STATUS.PROCESSING, downloadStatus: [{downloadId: 'dl', size: 100, sizeLeft: 40}]};
		await open();
		await elapse(14999);
		expect(refreshes()).toBe(0);
		await elapse(1);
		expect(refreshes()).toBe(1);
	});

	test('nothing is refreshed while the app is in the background', async () => {
		mediaInfo = {status: MEDIA_STATUS.PENDING};
		await open();
		hidden = true;
		await elapse(90000);
		expect(refreshes()).toBe(0);
		hidden = false;
		await elapse(30000);
		expect(refreshes()).toBe(1);
	});

	test('an available title never starts refreshing', async () => {
		mediaInfo = {status: MEDIA_STATUS.AVAILABLE};
		await open();
		await elapse(2 * 60000);
		expect(refreshes()).toBe(0);
	});

	test('picks the streaming region the way Seerr does', async () => {
		seerrApi.getPublicSettings.mockResolvedValue({streamingRegion: 'GB'});
		expect((await open()).result.current.streamingRegion).toBe('GB');

		seerrApi.getUser.mockResolvedValue({id: 1, settings: {streamingRegion: 'CA'}});
		expect((await open()).result.current.streamingRegion).toBe('CA');

		seerrApi.getUser.mockRejectedValue(new Error('offline'));
		seerrApi.getPublicSettings.mockResolvedValue({streamingRegion: ''});
		expect((await open()).result.current.streamingRegion).toBe('US');
	});

	test('a refresh that lands after the page closes starts nothing', async () => {
		mediaInfo = {status: MEDIA_STATUS.PROCESSING};
		const {unmount} = await open();
		let finish;
		seerrApi.getMovie.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
		await elapse(30000);
		unmount();
		finish({...movie(), mediaInfo: {status: MEDIA_STATUS.PROCESSING, downloadStatus: [{downloadId: 'dl', size: 100, sizeLeft: 40}]}});
		const refreshesAtClose = refreshes();
		await elapse(2 * 60000);
		expect(refreshes()).toBe(refreshesAtClose);
	});
});

describe('moving to another title', () => {
	test('never shows the last title\'s answer on the new one', async () => {
		seerrApi.getMovieRecommendations.mockImplementation(async (id, page) => ({results: page === 1 ? [{id: 1, title: 'Iron Man'}] : []}));
		const seen = [];
		const {rerender} = renderHook((props) => {
			const data = useSeerrDetailsData(props);
			if (props.mediaId === 603) seen.push({id: data.details?.id, loading: data.loading, recommendations: data.recommendations.length});
			return data;
		}, {initialProps: {mediaId: 299534, mediaType: 'movie', contextUser: null}});
		await elapse(0);

		let finish;
		seerrApi.getMovie.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
		rerender({mediaId: 603, mediaType: 'movie', contextUser: null});
		expect(seen.length).toBeGreaterThan(0);
		expect(seen.every((render) => render.id === undefined && render.loading && render.recommendations === 0)).toBe(true);

		await act(async () => finish({id: 603, title: 'The Matrix', mediaInfo}));
		await elapse(0);
		expect(seen[seen.length - 1]).toEqual({id: 603, loading: false, recommendations: 1});
	});
});

describe('the arr\'s own queue through Moonbase', () => {
	const approved = [{is4k: false, status: 2}];
	const stalled = {id: 9, title: 'Rel', downloadId: 'D', status: 'warning', errorMessage: 'no connections', size: 0, sizeleft: 0};
	const queue = (items, extra = {}) => ({service: 'radarr', inArr: true, monitored: true, canRemove: true, hasFile: false, isAvailable: true, items, ...extra});

	test('is never asked when the plugin does not offer it', async () => {
		mediaInfo = {status: MEDIA_STATUS.PROCESSING, tmdbId: 299534, requests: approved};
		await open(false);
		expect(seerrApi.getArrQueue).not.toHaveBeenCalled();
	});

	test('draws a stuck bar with its reason even when Seerr reports no queue, and offers the swap', async () => {
		mediaInfo = {status: MEDIA_STATUS.PROCESSING, tmdbId: 299534, requests: approved};
		seerrApi.getArrQueue.mockResolvedValue(queue([stalled]));
		const {result} = await open(true);
		expect(seerrApi.getArrQueue).toHaveBeenCalledWith('radarr', '299534');
		expect(result.current.hdDownload).toMatchObject({state: 'stalled', reason: 'no connections'});
		expect(result.current.removableRelease).toEqual({service: 'radarr', id: 9, release: 'Rel'});
		expect(result.current.notFoundYet).toBe(false);
	});

	test('says Not found yet for a released film with nothing queued', async () => {
		mediaInfo = {status: MEDIA_STATUS.PROCESSING, tmdbId: 299534, requests: approved};
		seerrApi.getArrQueue.mockResolvedValue(queue([]));
		const {result} = await open(true);
		expect(result.current.hdDownload).toBe(null);
		expect(result.current.notFoundYet).toBe(true);
		expect(result.current.removableRelease).toBe(null);
	});

	test('keeps Seerr\'s picture when the plugin answers anything but a 200', async () => {
		mediaInfo = {status: MEDIA_STATUS.PROCESSING, tmdbId: 299534, requests: approved, downloadStatus: [{downloadId: 'dl', size: 100, sizeLeft: 40}]};
		const {result} = await open(true);
		expect(result.current.hdDownload.fraction).toBe(0.6);
		expect(result.current.notFoundYet).toBe(false);
	});

	test('asks again on every refresh, on the download beat', async () => {
		mediaInfo = {status: MEDIA_STATUS.PROCESSING, tmdbId: 299534, requests: approved};
		seerrApi.getArrQueue.mockResolvedValue(queue([stalled]));
		await open(true);
		const asked = seerrApi.getArrQueue.mock.calls.length;
		await elapse(15000);
		expect(refreshes()).toBe(1);
		expect(seerrApi.getArrQueue.mock.calls.length).toBe(asked + 1);
	});

	test('an answer that set off before a removal is thrown away', async () => {
		mediaInfo = {status: MEDIA_STATUS.PROCESSING, tmdbId: 299534, requests: approved};
		let late;
		seerrApi.getArrQueue.mockReturnValueOnce(new Promise((resolve) => {
			late = resolve;
		}));
		const {result} = await open(true);
		act(() => result.current.invalidateArrQueue());
		await act(async () => {
			late(queue([stalled]));
		});
		expect(result.current.hdDownload).toBe(null);
		expect(result.current.removableRelease).toBe(null);
	});

	test('a title the default arr doesn\'t have keeps Seerr\'s bar', async () => {
		mediaInfo = {status: MEDIA_STATUS.PROCESSING, tmdbId: 299534, requests: approved, downloadStatus: [{downloadId: 'dl', size: 100, sizeLeft: 40}]};
		seerrApi.getArrQueue.mockResolvedValue(queue([], {inArr: false}));
		const {result} = await open(true);
		expect(result.current.hdDownload.fraction).toBe(0.6);
	});

	test('an available title costs no call', async () => {
		mediaInfo = {status: MEDIA_STATUS.AVAILABLE, tmdbId: 299534, requests: approved};
		await open(true);
		expect(seerrApi.getArrQueue).not.toHaveBeenCalled();
	});
});
