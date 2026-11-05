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
		getTvSimilar: jest.fn()
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

const open = async () => {
	const view = renderHook(() => useSeerrDetailsData({mediaId: 299534, mediaType: 'movie', contextUser: null}));
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
