jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

import {
	MEDIA_STATUS,
	REQUEST_STATUS,
	getRequestStatusInfo,
	DOWNLOAD_STATE,
	getDownloadSummary,
	parseTimeLeft,
	formatBytes,
	formatDownloadTimeLeft,
	downloadLabelParts,
	isMediaInFlight
} from './seerrStatus';

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

const request = (over = {}) => ({status: REQUEST_STATUS.APPROVED, is4k: false, media: {}, ...over});

describe('getRequestStatusInfo', () => {
	test('declined and failed are the request status, whatever the media says', () => {
		expect(getRequestStatusInfo(request({status: REQUEST_STATUS.DECLINED, media: {status: MEDIA_STATUS.AVAILABLE}})).label).toBe('Declined');
		expect(getRequestStatusInfo(request({status: REQUEST_STATUS.FAILED, media: {status: MEDIA_STATUS.AVAILABLE}})).label).toBe('Failed');
	});

	test('a completed request whose media was deleted reads as deleted', () => {
		const info = getRequestStatusInfo(request({status: REQUEST_STATUS.COMPLETED, media: {status: MEDIA_STATUS.DELETED}}));

		expect(info).toEqual({label: 'Deleted', color: 'error'});
	});

	test('processing while something is queued, requested while nothing is', () => {
		const queued = request({media: {status: MEDIA_STATUS.PROCESSING, downloadStatus: [{downloadId: 'dl', size: 1}]}});
		const idle = request({media: {status: MEDIA_STATUS.PROCESSING, downloadStatus: []}});

		expect(getRequestStatusInfo(queued).label).toBe('Processing');
		expect(getRequestStatusInfo(idle).label).toBe('Requested');
	});

	test('partially available says processing while the rest downloads', () => {
		const queued = request({media: {status: MEDIA_STATUS.PARTIALLY_AVAILABLE, downloadStatus: [{downloadId: 'dl', size: 1}]}});
		const idle = request({media: {status: MEDIA_STATUS.PARTIALLY_AVAILABLE}});

		expect(getRequestStatusInfo(queued).label).toBe('Processing');
		expect(getRequestStatusInfo(idle)).toEqual({label: 'Partially Available', color: 'available'});
	});

	test('a 4K request reads the 4K side of the media', () => {
		const info = getRequestStatusInfo(request({is4k: true, media: {status: MEDIA_STATUS.AVAILABLE, status4k: MEDIA_STATUS.PROCESSING, downloadStatus4k: [{downloadId: 'dl', size: 1}]}}));

		expect(info.label).toBe('Processing');
	});

	test('only an unknown media status falls back to the request status', () => {
		expect(getRequestStatusInfo(request({status: REQUEST_STATUS.PENDING})).label).toBe('Pending');
		expect(getRequestStatusInfo(request({status: REQUEST_STATUS.COMPLETED})).label).toBe('Available');
		expect(getRequestStatusInfo(request({status: REQUEST_STATUS.APPROVED})).label).toBe('Approved');
		expect(getRequestStatusInfo(request({status: REQUEST_STATUS.APPROVED, media: null})).label).toBe('Approved');
	});
});

describe('getDownloadSummary', () => {
	test('carries the byte counts alongside the fraction', () => {
		const summary = getDownloadSummary([{downloadId: 'a', size: 4 * GB, sizeLeft: 3 * GB}, {downloadId: 'b', size: 1 * GB, sizeLeft: 0}]);

		expect(summary.totalBytes).toBe(5 * GB);
		expect(summary.downloadedBytes).toBe(2 * GB);
		expect(summary.fraction).toBeCloseTo(0.4);
		expect(summary.state).toBe(DOWNLOAD_STATE.DOWNLOADING);
	});

	test('entries without a download id are left out, and none at all is nothing', () => {
		expect(getDownloadSummary([{size: 0}, {}])).toBeNull();
		expect(getDownloadSummary([])).toBeNull();
		expect(getDownloadSummary(null)).toBeNull();
	});

	test('counts a season pack once and skips the releases held back', () => {
		const pack = {downloadId: 'S06', size: 19 * GB, sizeLeft: 5 * GB};
		const heldBack = {size: 23 * GB, sizeLeft: 23 * GB};
		const summary = getDownloadSummary([heldBack, pack, {...pack}, heldBack, {...pack, downloadId: ''}]);

		expect(summary.totalBytes).toBe(19 * GB);
		expect(summary.downloadedBytes).toBe(14 * GB);
		expect(getDownloadSummary([heldBack, heldBack])).toBeNull();
	});
});

describe('download state', () => {
	const stateOf = (...items) => getDownloadSummary(items).state;

	test('a warning reads as stalled, and older Sonarr capitalizes it', () => {
		expect(stateOf({downloadId: 'a', size: GB, sizeLeft: GB, status: 'warning'})).toBe(DOWNLOAD_STATE.STALLED);
		expect(stateOf({downloadId: 'a', size: GB, sizeLeft: GB, status: 'Warning'})).toBe(DOWNLOAD_STATE.STALLED);
	});

	test('an unreachable client reads as stalled, a waiting one as queued, a paused one as paused', () => {
		expect(stateOf({downloadId: 'a', size: GB, sizeLeft: GB, status: 'downloadClientUnavailable'})).toBe(DOWNLOAD_STATE.STALLED);
		expect(stateOf({downloadId: 'a', size: GB, sizeLeft: GB, status: 'queued'})).toBe(DOWNLOAD_STATE.QUEUED);
		expect(stateOf({downloadId: 'a', size: GB, sizeLeft: GB, status: 'paused'})).toBe(DOWNLOAD_STATE.PAUSED);
	});

	test('a finished download waits for the import', () => {
		const summary = getDownloadSummary([{downloadId: 'a', size: GB, sizeLeft: 0, status: 'downloading'}]);

		expect(summary.state).toBe(DOWNLOAD_STATE.WAITING_FOR_IMPORT);
		expect(summary.fraction).toBe(1);
	});

	test('a completed download fills the bar even with bytes left', () => {
		const summary = getDownloadSummary([{downloadId: 'a', size: GB, sizeLeft: 10, status: 'completed'}]);

		expect(summary.state).toBe(DOWNLOAD_STATE.WAITING_FOR_IMPORT);
		expect(summary.fraction).toBe(1);
	});

	test("a download with no bytes left reported isn't finished", () => {
		const summary = getDownloadSummary([{downloadId: 'a', size: GB}]);

		expect(summary.state).toBe(DOWNLOAD_STATE.DOWNLOADING);
		expect(summary.fraction).toBe(0);
	});

	test('bytes left below zero or past the size are held to the download', () => {
		expect(getDownloadSummary([{downloadId: 'a', size: GB, sizeLeft: -5}]).state).toBe(DOWNLOAD_STATE.WAITING_FOR_IMPORT);
		const over = getDownloadSummary([{downloadId: 'a', size: GB, sizeLeft: 2 * GB}]);
		expect(over.downloadedBytes).toBe(0);
		expect(over.fraction).toBe(0);
	});

	test('a stalled download outranks a finished one', () => {
		const done = {downloadId: 'a', size: GB, sizeLeft: 0, status: 'completed'};
		const stalled = {downloadId: 'b', size: GB, sizeLeft: GB, status: 'warning'};
		expect(getDownloadSummary([done, stalled])).toMatchObject({state: DOWNLOAD_STATE.STALLED, fraction: 0.5});
	});

	test('a failed download stays failed even when it finished', () => {
		expect(stateOf({downloadId: 'a', size: GB, sizeLeft: 0, status: 'failed'})).toBe(DOWNLOAD_STATE.FAILED);
	});

	test('the worst download decides', () => {
		const downloading = {downloadId: 'a', size: GB, sizeLeft: GB / 2, status: 'downloading'};
		const stalled = {downloadId: 'b', size: GB, sizeLeft: GB, status: 'warning'};
		const failed = {downloadId: 'c', size: GB, sizeLeft: GB, status: 'failed'};
		const paused = {downloadId: 'd', size: GB, sizeLeft: GB, status: 'paused'};

		expect(stateOf(downloading, stalled)).toBe(DOWNLOAD_STATE.STALLED);
		expect(stateOf(stalled, failed)).toBe(DOWNLOAD_STATE.FAILED);
		expect(stateOf(paused, downloading)).toBe(DOWNLOAD_STATE.DOWNLOADING);
	});

	test('the arr\'s tracked state wins over the download client\'s status', () => {
		const tracked = (trackedDownloadState, status = 'completed') => ({downloadId: 'a', size: GB, sizeLeft: 0, status, trackedDownloadState});
		expect(stateOf(tracked('importBlocked'))).toBe(DOWNLOAD_STATE.IMPORT_BLOCKED);
		expect(stateOf(tracked('importPending'))).toBe(DOWNLOAD_STATE.WAITING_FOR_IMPORT);
		expect(stateOf(tracked('importing'))).toBe(DOWNLOAD_STATE.WAITING_FOR_IMPORT);
		expect(stateOf(tracked('imported'))).toBe(DOWNLOAD_STATE.WAITING_FOR_IMPORT);
		expect(stateOf(tracked('failedPending', 'downloading'))).toBe(DOWNLOAD_STATE.FAILED);
		expect(stateOf(tracked('failed', 'downloading'))).toBe(DOWNLOAD_STATE.FAILED);
		expect(stateOf({downloadId: 'a', size: GB, sizeLeft: GB, status: 'warning', trackedDownloadState: 'downloading'})).toBe(DOWNLOAD_STATE.STALLED);
	});

	test('a blocked import ranks between stalled and failed, and an ignored one is skipped', () => {
		const stalled = {downloadId: 'a', size: GB, sizeLeft: GB, status: 'warning'};
		const blocked = {downloadId: 'b', size: GB, sizeLeft: 0, status: 'completed', trackedDownloadState: 'importBlocked'};
		const failed = {downloadId: 'c', size: GB, sizeLeft: GB, status: 'failed'};
		const ignored = {downloadId: 'd', size: GB, sizeLeft: GB, status: 'failed', trackedDownloadState: 'ignored'};
		expect(stateOf(stalled, blocked)).toBe(DOWNLOAD_STATE.IMPORT_BLOCKED);
		expect(stateOf(blocked, failed)).toBe(DOWNLOAD_STATE.FAILED);
		expect(stateOf(stalled, ignored)).toBe(DOWNLOAD_STATE.STALLED);
		expect(getDownloadSummary([ignored])).toBeNull();
	});

	test('the summary keeps the item that decided its state', () => {
		const going = {downloadId: 'a', size: GB, sizeLeft: GB / 2, status: 'downloading'};
		const stalled = {downloadId: 'b', size: GB, sizeLeft: GB, status: 'warning'};
		expect(getDownloadSummary([going, stalled]).decidingItem).toBe(stalled);
	});

	test("one finished episode doesn't hide the one still downloading", () => {
		const done = {downloadId: 'a', size: GB, sizeLeft: 0, status: 'completed'};
		const going = {downloadId: 'b', size: GB, sizeLeft: GB / 2, status: 'downloading'};

		expect(stateOf(done, going)).toBe(DOWNLOAD_STATE.DOWNLOADING);
	});

	test('a sizeless download still shows its state and keeps the bar short of full', () => {
		const magnet = {downloadId: 'm', status: 'warning'};
		expect(getDownloadSummary([magnet])).toMatchObject({state: DOWNLOAD_STATE.STALLED, fraction: 0, totalBytes: 0});

		const done = {downloadId: 'a', size: GB, sizeLeft: 0, status: 'downloading'};
		const sizeless = {downloadId: 'b', status: 'downloading'};
		expect(getDownloadSummary([done, sizeless]).fraction).toBe(0.99);
	});
});

describe('download time left', () => {
	const going = (id, timeLeft, status = 'downloading') => ({downloadId: id, size: GB, sizeLeft: GB / 2, status, timeLeft});

	test('the slowest active download sets it', () => {
		expect(getDownloadSummary([going('a', '00:10:00'), going('b', '01:05:00')]).timeLeftSeconds).toBe(3900);
	});

	test('unknown when one active download has no estimate, or another is paused', () => {
		expect(getDownloadSummary([going('a', '00:10:00'), going('b', null)]).timeLeftSeconds).toBeNull();
		expect(getDownloadSummary([going('a', '00:10:00'), going('b', '00:05:00', 'paused')]).timeLeftSeconds).toBeNull();
	});

	test("a finished sibling doesn't count against it", () => {
		const done = {downloadId: 'z', size: GB, sizeLeft: 0, status: 'completed', timeLeft: '00:00:00'};
		expect(getDownloadSummary([done, going('a', '00:10:00')]).timeLeftSeconds).toBe(600);
	});

	test('none for a stalled download, even with an estimate', () => {
		expect(getDownloadSummary([going('a', '00:10:00', 'warning')]).timeLeftSeconds).toBeNull();
	});

	test('parses the TimeSpan forms Radarr and Sonarr send', () => {
		expect(parseTimeLeft('00:12:30')).toBe(750);
		expect(parseTimeLeft('1.02:03:04')).toBe(93784);
		expect(parseTimeLeft('00:00:05.1234567')).toBe(5);
		expect(parseTimeLeft(' 00:01:00 ')).toBe(60);
		expect(parseTimeLeft('26:00:00')).toBe(93600);
		expect(parseTimeLeft('-00:00:05')).toBeNull();
		expect(parseTimeLeft(60)).toBeNull();
		expect(parseTimeLeft('soon')).toBeNull();
		expect(parseTimeLeft(null)).toBeNull();
	});

	test('reads as minutes, hours, or both, rounded up', () => {
		expect(formatDownloadTimeLeft(1)).toBe('1m left');
		expect(formatDownloadTimeLeft(12 * 60)).toBe('12m left');
		expect(formatDownloadTimeLeft(2 * 3600)).toBe('2h left');
		expect(formatDownloadTimeLeft(3900)).toBe('1h 5m left');
		expect(formatDownloadTimeLeft(26 * 3600)).toBe('26h left');
	});
});

describe('formatBytes', () => {
	test('picks the unit that fits', () => {
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(1536)).toBe('1.5 KB');
		expect(formatBytes(2.5 * MB)).toBe('2.5 MB');
		expect(formatBytes(4.4 * GB)).toBe('4.4 GB');
		expect(formatBytes(-1)).toBe('0 B');
	});
});

describe('downloadLabelParts', () => {
	test('a blocked import says so alone, on a tile and on the full bar', () => {
		const blocked = {fraction: 1, state: DOWNLOAD_STATE.IMPORT_BLOCKED, totalBytes: 5000, downloadedBytes: 5000};
		expect(downloadLabelParts(blocked)).toEqual({leading: 'Import blocked', percent: null});
		expect(downloadLabelParts(blocked, true)).toEqual({leading: 'Import blocked', percent: null});
	});

	const summary = {fraction: 0.09, state: DOWNLOAD_STATE.DOWNLOADING, totalBytes: 15 * GB, downloadedBytes: 1.4 * GB};

	test('wide: the verb, both sizes and the percentage', () => {
		expect(downloadLabelParts(summary)).toEqual({leading: 'Downloading · 1.4 GB / 15.0 GB', percent: '9%'});
	});

	test('compact: drops the verb and keeps the sizes', () => {
		expect(downloadLabelParts(summary, true)).toEqual({leading: '1.4 GB / 15.0 GB', percent: '9%'});
	});

	test("both halves use the total's unit", () => {
		const small = {fraction: 0.5, state: DOWNLOAD_STATE.DOWNLOADING, totalBytes: 12.4 * GB, downloadedBytes: 330.9 * MB};

		expect(downloadLabelParts(small, true).leading).toBe('0.3 GB / 12.4 GB');
		const mb = {fraction: 0.5, state: DOWNLOAD_STATE.DOWNLOADING, totalBytes: 700 * MB, downloadedBytes: 350 * MB};
		expect(downloadLabelParts(mb, true).leading).toBe('350.0 MB / 700.0 MB');
	});

	test('no usable sizes: the verb stands in, and compact keeps only the percentage', () => {
		const bare = {fraction: 0.09, state: DOWNLOAD_STATE.DOWNLOADING};

		expect(downloadLabelParts(bare)).toEqual({leading: 'Downloading', percent: '9%'});
		expect(downloadLabelParts(bare, true)).toEqual({leading: null, percent: '9%'});
	});

	test('the time left follows the percentage on the full bar only, in the verb\'s place', () => {
		const timed = {...summary, timeLeftSeconds: 3900};

		expect(downloadLabelParts(timed)).toEqual({leading: '1.4 GB / 15.0 GB', percent: '9% · 1h 5m left'});
		expect(downloadLabelParts(timed, true)).toEqual({leading: '1.4 GB / 15.0 GB', percent: '9%'});
		expect(downloadLabelParts({fraction: 0.09, state: DOWNLOAD_STATE.DOWNLOADING, timeLeftSeconds: 60})).toEqual({leading: 'Downloading', percent: '9% · 1m left'});
	});

	test('a stuck download says why, with the sizes when there is room', () => {
		const stalled = {...summary, fraction: 0, state: DOWNLOAD_STATE.STALLED, downloadedBytes: 0};

		expect(downloadLabelParts(stalled)).toEqual({leading: 'Stalled · 0.0 GB / 15.0 GB', percent: '0%'});
		expect(downloadLabelParts(stalled, true)).toEqual({leading: 'Stalled', percent: '0%'});
		expect(downloadLabelParts({...summary, state: DOWNLOAD_STATE.FAILED}, true).leading).toBe('Download failed');
		expect(downloadLabelParts({...summary, state: DOWNLOAD_STATE.PAUSED}, true).leading).toBe('Paused');
		expect(downloadLabelParts({fraction: 0, state: DOWNLOAD_STATE.QUEUED}).leading).toBe('Queued');
	});

	test('a finished download waits for the import instead of a stuck 100%', () => {
		const done = {fraction: 1, state: DOWNLOAD_STATE.WAITING_FOR_IMPORT, totalBytes: GB, downloadedBytes: GB};

		expect(downloadLabelParts(done)).toEqual({leading: 'Downloaded, waiting for import', percent: null});
		expect(downloadLabelParts(done, true)).toEqual({leading: 'Downloaded', percent: null});
	});
});

describe('isMediaInFlight', () => {
	test('a title stays in flight from the request until it lands', () => {
		expect(isMediaInFlight({status: MEDIA_STATUS.PENDING}, false)).toBe(true);
		expect(isMediaInFlight({status: MEDIA_STATUS.PROCESSING}, false)).toBe(true);
		expect(isMediaInFlight({status: MEDIA_STATUS.AVAILABLE}, false)).toBe(false);
		expect(isMediaInFlight({status: MEDIA_STATUS.UNKNOWN}, false)).toBe(false);
	});

	test('a newly requested season keeps a partial series in flight', () => {
		const media = {
			status: MEDIA_STATUS.PARTIALLY_AVAILABLE,
			status4k: MEDIA_STATUS.UNKNOWN,
			seasons: [
				{seasonNumber: 1, status: MEDIA_STATUS.AVAILABLE, status4k: MEDIA_STATUS.UNKNOWN},
				{seasonNumber: 2, status: MEDIA_STATUS.PENDING, status4k: MEDIA_STATUS.UNKNOWN}
			]
		};
		expect(isMediaInFlight(media, false)).toBe(true);
		expect(isMediaInFlight(media, true)).toBe(false);
	});

	test('a partly available title with a download running is in flight', () => {
		const media = {status: MEDIA_STATUS.PARTIALLY_AVAILABLE, downloadStatus: [{downloadId: 'dl', size: 100, sizeLeft: 40}]};
		expect(isMediaInFlight(media, false)).toBe(true);
	});

	test('a download with no size yet still keeps the title in flight', () => {
		const media = {status: MEDIA_STATUS.PROCESSING, downloadStatus: [{downloadId: 'm', status: 'warning'}]};
		expect(isMediaInFlight(media, false)).toBe(true);
	});

	test('no media means nothing is on its way', () => {
		expect(isMediaInFlight(null, false)).toBe(false);
	});
});
