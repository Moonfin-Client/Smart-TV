import {arrQueueTarget, isNotFoundYet, itemReason, readArrQueue} from './seerrArrQueue';
import {DOWNLOAD_STATE} from './seerrStatus';

jest.mock('@enact/i18n/$L', () => (s) => s);

// A stalled magnet as the local Radarr reports it through Plugin #381.
const radarrStalled = {
	id: 1113619046,
	title: 'Big.Buck.Bunny.2008.1080p.WEB-DL.x264-MOONFINc',
	status: 'warning',
	trackedDownloadState: 'downloading',
	trackedDownloadStatus: 'ok',
	size: 0,
	sizeleft: 0,
	downloadId: 'CCCC',
	errorMessage: 'qBittorrent cannot resolve magnet link with DHT disabled',
	statusMessages: []
};

const radarr = (overrides = {}) => ({
	service: 'radarr', inArr: true, monitored: true, canRemove: false, hasFile: false, isAvailable: true, items: [], ...overrides
});

describe('arrQueueTarget', () => {
	test('a movie asks Radarr by TMDB id and a series asks Sonarr by TVDB id', () => {
		expect(arrQueueTarget('movie', {tmdbId: 10378})).toEqual({service: 'radarr', id: 10378});
		expect(arrQueueTarget('tv', {tmdbId: 63639, tvdbId: 280619})).toEqual({service: 'sonarr', id: 280619});
	});

	test('4K, a missing id or missing media asks nothing', () => {
		expect(arrQueueTarget('movie', {tmdbId: 10378}, true)).toBeNull();
		expect(arrQueueTarget('tv', {tmdbId: 63639})).toBeNull();
		expect(arrQueueTarget('movie', null)).toBeNull();
	});
});

describe('itemReason', () => {
	test('the error message wins', () => {
		expect(itemReason(radarrStalled)).toBe('qBittorrent cannot resolve magnet link with DHT disabled');
	});

	test('then the first message in any group, then the first group title', () => {
		expect(itemReason({statusMessages: [{title: 'Movie.mkv', messages: ['', 'No audio tracks detected']}]})).toBe('No audio tracks detected');
		expect(itemReason({statusMessages: [{title: 'Movie.mkv', messages: []}, {title: 'Other.mkv', messages: ['Sample']}]})).toBe('Sample');
		expect(itemReason({statusMessages: [{title: '', messages: []}, {title: 'Failed to import movie', messages: []}]})).toBe('Failed to import movie');
	});

	test('keeps the arr\'s words whole, only trimmed', () => {
		expect(itemReason({errorMessage: '  ', statusMessages: [{title: 'x', messages: [' Failed to import movie\nmore detail ']}]})).toBe('Failed to import movie\nmore detail');
	});

	test('null when the arr said nothing', () => {
		expect(itemReason({statusMessages: []})).toBeNull();
		expect(itemReason(null)).toBeNull();
	});
});

describe('readArrQueue', () => {
	test('a stalled Radarr download gives its reason, a stalled bar and, for an admin, the release to swap', () => {
		const view = readArrQueue(radarr({items: [radarrStalled], canRemove: true}));
		expect(view.reason).toBe('qBittorrent cannot resolve magnet link with DHT disabled');
		expect(view.summary.state).toBe(DOWNLOAD_STATE.STALLED);
		expect(view.removable).toEqual({service: 'radarr', id: 1113619046, release: radarrStalled.title});
		expect(view.notFoundYet).toBe(false);
	});

	test('a non-admin answer never offers the swap', () => {
		expect(readArrQueue(radarr({items: [radarrStalled]})).removable).toBeNull();
	});

	test('a blocked import says so, fills the bar and can be swapped', () => {
		const blocked = {id: 7, title: 'Rel', downloadId: 'B', status: 'completed', trackedDownloadState: 'importBlocked',
			trackedDownloadStatus: 'warning', size: 1000, sizeleft: 0,
			statusMessages: [{title: 'Rel.mkv', messages: ['Found executable file .exe']}]};
		const view = readArrQueue(radarr({items: [blocked], canRemove: true}));
		expect(view.summary.state).toBe(DOWNLOAD_STATE.IMPORT_BLOCKED);
		expect(view.summary.fraction).toBe(1);
		expect(view.reason).toBe('Found executable file .exe');
		expect(view.removable.id).toBe(7);
	});

	test('a download moving with nothing wrong has no reason and nothing to swap', () => {
		const moving = {...radarrStalled, status: 'downloading', trackedDownloadStatus: 'ok', size: 1000, sizeleft: 250, timeleft: '00:10:00'};
		const view = readArrQueue(radarr({items: [moving], canRemove: true}));
		expect(view.reason).toBeNull();
		expect(view.removable).toBeNull();
		expect(view.summary.fraction).toBeCloseTo(0.75);
		expect(view.summary.timeLeftSeconds).toBe(600);
	});

	test('a paused download still carries the arr\'s words but is not offered for a swap', () => {
		const paused = {...radarrStalled, status: 'paused', errorMessage: 'Paused by user'};
		const view = readArrQueue(radarr({items: [paused], canRemove: true}));
		expect(view.summary.state).toBe(DOWNLOAD_STATE.PAUSED);
		expect(view.reason).toBe('Paused by user');
		expect(view.removable).toBeNull();
	});

	test('an import held for a warning is blocked, with the arr\'s caution, and can be swapped', () => {
		const held = {id: 4, title: 'Tears', downloadId: 'T', status: 'completed', trackedDownloadState: 'importPending',
			trackedDownloadStatus: 'warning', size: 10, sizeleft: 0,
			statusMessages: [{title: 'Tears.mkv', messages: ['Caution: Found executable file']}]};
		const view = readArrQueue(radarr({items: [held], canRemove: true}));
		expect(view.summary.state).toBe(DOWNLOAD_STATE.IMPORT_BLOCKED);
		expect(view.reason).toBe('Caution: Found executable file');
		expect(view.removable.id).toBe(4);
		const clean = readArrQueue(radarr({items: [{...held, trackedDownloadStatus: 'ok', statusMessages: []}], canRemove: true}));
		expect(clean.summary.state).toBe(DOWNLOAD_STATE.WAITING_FOR_IMPORT);
		expect(clean.removable).toBeNull();
	});

	test('a plain download with no tracked status says nothing either', () => {
		const going = {id: 1, title: 'A', downloadId: 'A', status: 'downloading', errorMessage: 'noise', size: 10, sizeleft: 5};
		expect(readArrQueue(radarr({items: [going]})).reason).toBeNull();
	});

	test('of two downloads stuck the same way, the one that says why decides', () => {
		const mute = {id: 1, title: 'A', downloadId: 'A', status: 'warning', size: 10, sizeleft: 10};
		const told = {id: 2, title: 'B', downloadId: 'B', status: 'warning', errorMessage: 'no peers', size: 10, sizeleft: 10};
		const view = readArrQueue(radarr({items: [mute, told], canRemove: true}));
		expect(view.reason).toBe('no peers');
		expect(view.removable.id).toBe(2);
	});

	test('the reason comes from the worst item, not the first', () => {
		const queued = {id: 1, title: 'A', downloadId: 'A', status: 'queued', errorMessage: 'waiting for slot', size: 10, sizeleft: 10};
		const failed = {id: 2, title: 'B', downloadId: 'B', status: 'downloading', trackedDownloadState: 'failed', errorMessage: 'bad archive', size: 10, sizeleft: 10};
		const view = readArrQueue(radarr({items: [queued, failed], canRemove: true}));
		expect(view.summary.state).toBe(DOWNLOAD_STATE.FAILED);
		expect(view.reason).toBe('bad archive');
		expect(view.removable.id).toBe(2);
	});

	test('a season pack counts once and a season request sees only its seasons', () => {
		const ep = (episodeNumber, seasonNumber, downloadId) => ({
			id: seasonNumber * 100 + episodeNumber, seasonNumber, episodeNumber, downloadId, title: downloadId,
			status: 'warning', errorMessage: `stalled ${downloadId}`, size: 1000, sizeleft: 1000
		});
		const response = {service: 'sonarr', inArr: true, monitored: true, canRemove: true,
			items: [ep(1, 1, 'S1'), ep(2, 1, 'S1'), ep(1, 2, 'S2')]};
		expect(readArrQueue(response).summary.totalBytes).toBe(2000);
		const season2 = readArrQueue(response, {seasons: [2]});
		expect(season2.removable).toEqual({service: 'sonarr', id: 201, release: 'S2'});
		expect(season2.reason).toBe('stalled S2');
		expect(readArrQueue(response, {seasons: [3]}).summary).toBeNull();
	});

	test('an empty queue has no bar', () => {
		expect(readArrQueue(radarr()).summary).toBeNull();
	});

	test('a title the default arr doesn\'t have reads as nothing, so Seerr\'s bar stays', () => {
		expect(readArrQueue(radarr({inArr: false, items: [radarrStalled]}))).toBeNull();
	});

	test('a stuck item with no id offers nothing to remove', () => {
		const {id, ...noId} = radarrStalled;
		void id;
		const view = readArrQueue(radarr({items: [noId], canRemove: true}));
		expect(view.summary.state).toBe(DOWNLOAD_STATE.STALLED);
		expect(view.removable).toBeNull();
	});

	test('anything but a queue answer reads as nothing', () => {
		expect(readArrQueue(null)).toBeNull();
		expect(readArrQueue({service: 'radarr'})).toBeNull();
	});
});

describe('isNotFoundYet', () => {
	test('a released, monitored film with no file and nothing queued', () => {
		expect(isNotFoundYet(radarr())).toBe(true);
	});

	test('not while something is queued, a file exists, or it is not out yet', () => {
		expect(isNotFoundYet(radarr({items: [radarrStalled]}))).toBe(false);
		expect(isNotFoundYet(radarr({hasFile: true}))).toBe(false);
		expect(isNotFoundYet(radarr({isAvailable: false}))).toBe(false);
		expect(isNotFoundYet(radarr({isAvailable: null}))).toBe(false);
		expect(isNotFoundYet(radarr({monitored: false}))).toBe(false);
		expect(isNotFoundYet(radarr({inArr: false}))).toBe(false);
	});

	test('Sonarr never says it, since it reports neither file nor release', () => {
		expect(isNotFoundYet({service: 'sonarr', inArr: true, monitored: true, items: []})).toBe(false);
	});
});

describe('what the screens show', () => {
	const {MEDIA_STATUS, REQUEST_STATUS} = jest.requireActual('./seerrStatus');
	const {hdDownloadFor, hdNotFoundYet, requestDownloadFor, requestNotFoundYet, requestQueueView, requestWantsArrQueue} = jest.requireActual('./seerrArrQueue');
	const seerrQueue = [{downloadId: 'S', size: 100, sizeLeft: 50, status: 'downloading'}];
	const processing = {status: MEDIA_STATUS.PROCESSING, tmdbId: 10378, downloadStatus: seerrQueue,
		requests: [{is4k: false, status: REQUEST_STATUS.APPROVED}]};

	test('without a 200 the HD bar is Part 1\'s, from Seerr\'s copy of the queue', () => {
		expect(hdDownloadFor(processing, null).fraction).toBeCloseTo(0.5);
	});

	test('a 200 replaces Seerr\'s copy and carries the reason, even when Seerr has none', () => {
		const view = readArrQueue(radarr({items: [radarrStalled]}));
		const bar = hdDownloadFor({...processing, downloadStatus: []}, view);
		expect(bar.state).toBe(DOWNLOAD_STATE.STALLED);
		expect(bar.reason).toBe('qBittorrent cannot resolve magnet link with DHT disabled');
	});

	test('a 200 for a title the arr doesn\'t have keeps Part 1\'s bar', () => {
		expect(hdDownloadFor(processing, readArrQueue(radarr({inArr: false}))).fraction).toBeCloseTo(0.5);
	});

	test('a 200 with an empty queue means no bar, and an available title has none either', () => {
		expect(hdDownloadFor(processing, readArrQueue(radarr()))).toBeNull();
		expect(hdDownloadFor({...processing, status: MEDIA_STATUS.AVAILABLE}, readArrQueue(radarr({items: [radarrStalled]})))).toBeNull();
	});

	test('Not found yet needs an approved HD request and Seerr still processing', () => {
		const view = readArrQueue(radarr());
		expect(hdNotFoundYet(processing, view)).toBe(true);
		expect(hdNotFoundYet({...processing, requests: [{is4k: true, status: REQUEST_STATUS.APPROVED}]}, view)).toBe(false);
		expect(hdNotFoundYet({...processing, requests: [{is4k: false, status: REQUEST_STATUS.PENDING}]}, view)).toBe(false);
		expect(hdNotFoundYet({...processing, status: MEDIA_STATUS.PARTIALLY_AVAILABLE}, view)).toBe(false);
		expect(hdNotFoundYet(processing, null)).toBe(false);
	});

	test('a request card asks only for an approved HD request on its way', () => {
		const req = {status: REQUEST_STATUS.APPROVED, is4k: false, media: processing};
		expect(requestWantsArrQueue(req)).toBe(true);
		expect(requestWantsArrQueue({...req, is4k: true})).toBe(false);
		expect(requestWantsArrQueue({...req, status: REQUEST_STATUS.PENDING})).toBe(false);
		expect(requestWantsArrQueue({...req, media: {...processing, status: MEDIA_STATUS.AVAILABLE}})).toBe(false);
	});

	test('a request card reads its own seasons, and keeps Part 1 without an answer', () => {
		const req = {status: REQUEST_STATUS.APPROVED, is4k: false, seasons: [{seasonNumber: 2}], media: {...processing, tvdbId: 1}};
		const response = {service: 'sonarr', inArr: true, monitored: true, canRemove: false,
			items: [{id: 1, seasonNumber: 1, downloadId: 'A', status: 'warning', errorMessage: 'one'}]};
		const view = requestQueueView(req, response);
		expect(requestDownloadFor(req, view)).toBeNull();
		expect(requestNotFoundYet(req, view)).toBe(false);
		expect(requestDownloadFor(req, requestQueueView(req, null)).fraction).toBeCloseTo(0.5);
	});

	test('a movie request card says Not found yet', () => {
		const req = {status: REQUEST_STATUS.APPROVED, is4k: false, seasons: [], media: processing};
		const view = requestQueueView(req, radarr());
		expect(requestDownloadFor(req, view)).toBeNull();
		expect(requestNotFoundYet(req, view)).toBe(true);
	});
});
