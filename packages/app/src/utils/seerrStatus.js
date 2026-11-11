import $L from '@enact/i18n/$L';

export const MEDIA_STATUS = {
	UNKNOWN: 1,
	PENDING: 2,
	PROCESSING: 3,
	PARTIALLY_AVAILABLE: 4,
	AVAILABLE: 5,
	BLOCKLISTED: 6,
	DELETED: 7
};

export const REQUEST_STATUS = {
	PENDING: 1,
	APPROVED: 2,
	DECLINED: 3,
	FAILED: 4,
	COMPLETED: 5
};

export const ISSUE_STATUS = {
	OPEN: 1,
	RESOLVED: 2
};

export const ISSUE_TYPE = {
	VIDEO: 1,
	AUDIO: 2,
	SUBTITLES: 3,
	OTHER: 4
};

export const isUnlimitedQuota = (quota) => !quota || quota.limit == null || quota.limit === 0;

export const getIssueTypeLabel = (issueType) => {
	switch (issueType) {
		case ISSUE_TYPE.VIDEO: return $L('Video');
		case ISSUE_TYPE.AUDIO: return $L('Audio');
		case ISSUE_TYPE.SUBTITLES: return $L('Subtitles');
		default: return $L('Other');
	}
};

// The request's own status wins only for declined and failed. Everything else
// reflects the media status, so a completed request whose media was deleted
// since reads as deleted rather than available. Seerr shows one media status
// as two words, processing while something is in the download queue and
// requested while nothing is. Only when the media status is unknown does the
// request status decide.
export const getRequestStatusInfo = (req) => {
	if (req.status === REQUEST_STATUS.DECLINED) {
		return {label: $L('Declined'), color: 'error'};
	}
	if (req.status === REQUEST_STATUS.FAILED) {
		return {label: $L('Failed'), color: 'error'};
	}

	const media = req.media || {};
	const mediaStatus = req.is4k ? media.status4k : media.status;
	const queue = req.is4k ? media.downloadStatus4k : media.downloadStatus;
	const inProgress = Array.isArray(queue) && queue.length > 0;
	switch (mediaStatus) {
		case MEDIA_STATUS.PENDING:
			return {label: $L('Pending'), color: 'pending'};
		case MEDIA_STATUS.PROCESSING:
			return inProgress
				? {label: $L('Processing'), color: 'requested'}
				: {label: $L('Requested'), color: 'requested'};
		case MEDIA_STATUS.PARTIALLY_AVAILABLE:
			return inProgress
				? {label: $L('Processing'), color: 'requested'}
				: {label: $L('Partially Available'), color: 'available'};
		case MEDIA_STATUS.AVAILABLE:
			return {label: $L('Available'), color: 'available'};
		case MEDIA_STATUS.BLOCKLISTED:
			return {label: $L('Blocklisted'), color: 'error'};
		case MEDIA_STATUS.DELETED:
			return {label: $L('Deleted'), color: 'error'};
	}

	if (req.status === REQUEST_STATUS.PENDING) {
		return {label: $L('Pending'), color: 'pending'};
	}
	if (req.status === REQUEST_STATUS.COMPLETED) {
		return {label: $L('Available'), color: 'available'};
	}
	return {label: $L('Approved'), color: 'approved'};
};

export const getIssueStatusInfo = (issue) => {
	return issue.status === ISSUE_STATUS.OPEN
		? {label: $L('Open'), color: 'pending'}
		: {label: $L('Resolved'), color: 'available'};
};

// Where a download stands, from the Radarr/Sonarr queue status Seerr passes
// along. When several downloads make up one request the summary shows the one
// that ranks last here. Stalled and failed outrank everything, and downloading
// outranks paused and queued, since one active download means the request is
// moving. Seerr can't tell a blocked import from one still waiting, since the
// download client reports both as completed. The arr's own queue, read through
// Moonbase, can, and a blocked import needs a hand much like a stalled download.
export const DOWNLOAD_STATE = {
	WAITING_FOR_IMPORT: 'waitingForImport',
	PAUSED: 'paused',
	QUEUED: 'queued',
	DOWNLOADING: 'downloading',
	STALLED: 'stalled',
	IMPORT_BLOCKED: 'importBlocked',
	FAILED: 'failed'
};

const STATE_RANK = [
	DOWNLOAD_STATE.WAITING_FOR_IMPORT,
	DOWNLOAD_STATE.PAUSED,
	DOWNLOAD_STATE.QUEUED,
	DOWNLOAD_STATE.DOWNLOADING,
	DOWNLOAD_STATE.STALLED,
	DOWNLOAD_STATE.IMPORT_BLOCKED,
	DOWNLOAD_STATE.FAILED
];

const lower = (value) => (typeof value === 'string' ? value.toLowerCase() : '');

// What the arr's tracking says once it has an opinion past downloading. Only the
// arr's own queue carries it, so an entry from Seerr has none and goes by status.
const TRACKED_STATE = {
	importblocked: DOWNLOAD_STATE.IMPORT_BLOCKED,
	importpending: DOWNLOAD_STATE.WAITING_FOR_IMPORT,
	importing: DOWNLOAD_STATE.WAITING_FOR_IMPORT,
	imported: DOWNLOAD_STATE.WAITING_FOR_IMPORT,
	failedpending: DOWNLOAD_STATE.FAILED,
	failed: DOWNLOAD_STATE.FAILED
};

// Older Sonarr capitalizes the status. "warning" is usually a torrent with no
// seeders, and an unreachable download client isn't moving either. A delayed
// release is waiting its turn.
const stateOf = (item, done) => {
	const trackedState = lower(item.trackedDownloadState);
	// Radarr and Sonarr leave a release holding an executable here, with a
	// warning, until someone steps in, so it is as stuck as a blocked one.
	const flagged = ['warning', 'error'].includes(lower(item.trackedDownloadStatus));
	if (flagged && (trackedState === 'importpending' || trackedState === 'importing')) {
		return DOWNLOAD_STATE.IMPORT_BLOCKED;
	}
	const tracked = TRACKED_STATE[trackedState];
	if (tracked) return tracked;
	const value = lower(item.status);
	if (value === 'failed') return DOWNLOAD_STATE.FAILED;
	if (done) return DOWNLOAD_STATE.WAITING_FOR_IMPORT;
	switch (value) {
		case 'completed': return DOWNLOAD_STATE.WAITING_FOR_IMPORT;
		case 'warning':
		case 'downloadclientunavailable': return DOWNLOAD_STATE.STALLED;
		case 'paused': return DOWNLOAD_STATE.PAUSED;
		case 'queued':
		case 'delay': return DOWNLOAD_STATE.QUEUED;
		default: return DOWNLOAD_STATE.DOWNLOADING;
	}
};

// Seconds in a .NET TimeSpan as Radarr and Sonarr serialize it: "hh:mm:ss",
// with a "d." day prefix past a day and an optional fraction of a second.
// Null when it is missing or unreadable.
export const parseTimeLeft = (value) => {
	if (typeof value !== 'string') return null;
	const match = /^(?:(\d+)\.)?(\d+):(\d{2}):(\d{2})(?:\.\d+)?$/.exec(value.trim());
	if (!match) return null;
	const [, days, hours, minutes, seconds] = match;
	return (Number(days || 0) * 24 + Number(hours)) * 3600 + Number(minutes) * 60 + Number(seconds);
};

// Aggregates the Radarr/Sonarr queue entries Seerr reports in downloadStatus.
// Sums bytes so a large episode weighs more than a small one. Returns null
// when nothing is downloading, which falls back to the status chip alone. The
// byte counts ride along so the bar can say how much is left, and the state
// and time left say why it isn't moving or when it will be done.
//
// Sonarr lists a season pack once per episode, each with the whole pack's size
// and the same downloadId, so each download counts once. An entry with no
// downloadId is a release Sonarr or Radarr is holding back and not downloading,
// and one the arr's tracking ignores is no longer its business. The entry that
// decides the state rides along, since it is the one an admin would swap out.
// `reasonOf(item, state)` gives an entry's reason, when its source has one. Of
// two entries stuck the same way, the one that says why decides.
export const getDownloadSummary = (items, reasonOf = null) => {
	if (!Array.isArray(items) || items.length === 0) return null;
	let total = 0;
	let left = 0;
	let state = null;
	let decidingItem = null;
	let timeLeft = null;
	let timeLeftKnown = true;
	const seen = new Set();
	for (const item of items) {
		if (!item || !item.downloadId || seen.has(item.downloadId)) continue;
		if (lower(item.trackedDownloadState) === 'ignored') continue;
		seen.add(item.downloadId);
		// A magnet with no peers never learns its size, so a sizeless download
		// still counts for its state. It just adds no bytes.
		const size = typeof item.size === 'number' && item.size > 0 ? item.size : 0;
		// No sizeLeft says nothing about how far along it is, so it counts as
		// not started rather than finished.
		const hasSizeLeft = typeof item.sizeLeft === 'number';
		const itemLeft = size > 0 ? Math.min(Math.max(hasSizeLeft ? item.sizeLeft : size, 0), size) : 0;
		total += size;
		left += itemLeft;

		const itemState = stateOf(item, size > 0 && hasSizeLeft && itemLeft <= 0);
		if (state === null || STATE_RANK.indexOf(itemState) > STATE_RANK.indexOf(state)) {
			state = itemState;
			decidingItem = item;
		} else if (reasonOf && itemState === state && !reasonOf(decidingItem, state) && reasonOf(item, itemState)) {
			decidingItem = item;
		}
		if (itemState === DOWNLOAD_STATE.WAITING_FOR_IMPORT) continue;
		// A paused or queued sibling has no end in sight, so the request has
		// none either, however soon the active one finishes.
		const eta = itemState === DOWNLOAD_STATE.DOWNLOADING ? parseTimeLeft(item.timeLeft) : null;
		if (eta === null) {
			timeLeftKnown = false;
		} else if (timeLeft === null || eta > timeLeft) {
			timeLeft = eta;
		}
	}
	if (state === null) return null;
	let fraction = total > 0 ? Math.min(Math.max((total - left) / total, 0), 1) : 0;
	if (state === DOWNLOAD_STATE.WAITING_FOR_IMPORT || state === DOWNLOAD_STATE.IMPORT_BLOCKED) {
		// The client can call a download completed before its byte count
		// settles, and the label says it's done, so the bar does too. A blocked
		// import has finished downloading as well.
		fraction = 1;
	} else if (fraction > 0.99) {
		// A sizeless download adds no bytes, so the sized ones alone can add up
		// to 100% while it is still going. Hold the bar short of full.
		fraction = 0.99;
	}
	return {
		fraction,
		state,
		// One download with no estimate leaves the whole request's time left unknown.
		timeLeftSeconds: state === DOWNLOAD_STATE.DOWNLOADING && timeLeftKnown ? timeLeft : null,
		totalBytes: total,
		downloadedBytes: total - left,
		decidingItem,
		reason: reasonOf ? reasonOf(decidingItem, state) || null : null
	};
};

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

export const formatBytes = (bytes) => {
	if (!(bytes >= 0)) return '0 B';
	if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
	if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
	if (bytes >= KB) return `${(bytes / KB).toFixed(1)} KB`;
	return `${Math.round(bytes)} B`;
};

// The done half in the total's unit, so it reads 1.6 GB / 4.4 GB rather than
// 330.9 MB / 12.4 GB.
const sameUnitAs = (bytes, reference) => (reference < GB ? formatBytes(bytes) : `${(bytes / GB).toFixed(1)} GB`);

// "1.6 GB / 4.4 GB", or null when the server reports no usable sizes.
export const downloadSizesLabel = (summary) => (summary.totalBytes > 0
	? `${sameUnitAs(summary.downloadedBytes, summary.totalBytes)} / ${formatBytes(summary.totalBytes)}`
	: null);

// The word for a download that isn't simply progressing, or null for one
// that is.
export const downloadStateLabel = (summary) => {
	switch (summary.state) {
		case DOWNLOAD_STATE.STALLED: return $L('Stalled');
		case DOWNLOAD_STATE.IMPORT_BLOCKED: return $L('Import blocked');
		case DOWNLOAD_STATE.FAILED: return $L('Download failed');
		case DOWNLOAD_STATE.PAUSED: return $L('Paused');
		case DOWNLOAD_STATE.QUEUED: return $L('Queued');
		default: return null;
	}
};

// "12m left", "2h left" or "1h 5m left", rounded up so the last minute reads
// "1m left" rather than "0m left". A download days out reads in hours.
export const formatDownloadTimeLeft = (seconds) => {
	const mins = Math.ceil(seconds / 60);
	const hours = Math.floor(mins / 60);
	const rest = mins % 60;
	let time = `${rest}m`;
	if (hours > 0) time = rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
	return $L('{time} left').replace('{time}', time);
};

// The two halves of the download bar's label. A tile has no room for the verb,
// so compact drops it and keeps the sizes, which ellipsize while the percentage
// stays put. Without usable sizes the verb stands in for them. A download
// that isn't moving says why instead, which matters more than the sizes, so a
// tile keeps the word and drops them. The time left only shows on the full
// bar, after the percentage, and takes the verb's place.
export const downloadLabelParts = (summary, compact = false) => {
	if (summary.state === DOWNLOAD_STATE.WAITING_FOR_IMPORT) {
		// "Downloaded, wai…" on a tile loses the point, so it says the first word.
		return {leading: compact ? $L('Downloaded') : $L('Downloaded, waiting for import'), percent: null};
	}
	if (summary.state === DOWNLOAD_STATE.IMPORT_BLOCKED) {
		// It always finished downloading, so the percentage and sizes say nothing and
		// would cut the words on a tile.
		return {leading: $L('Import blocked'), percent: null};
	}
	let percent = `${Math.round(summary.fraction * 100)}%`;
	const sizes = downloadSizesLabel(summary);
	const stateLabel = downloadStateLabel(summary);
	if (stateLabel) {
		return {leading: compact || !sizes ? stateLabel : `${stateLabel} · ${sizes}`, percent};
	}
	if (!compact && summary.timeLeftSeconds > 0) {
		// The time left already says it's downloading, so the verb makes room
		// for it rather than squeezing the sizes.
		percent = `${percent} · ${formatDownloadTimeLeft(summary.timeLeftSeconds)}`;
		return {leading: sizes || $L('Downloading'), percent};
	}
	if (!sizes) {
		return {leading: compact ? null : $L('Downloading'), percent};
	}
	return {leading: compact ? sizes : `${$L('Downloading')} · ${sizes}`, percent};
};

// The status gate keeps stale queue entries from drawing a bar after the
// media has become available.
export const getMediaDownloadSummary = (media, is4k) => {
	if (!media) return null;
	const status = is4k ? media.status4k : media.status;
	if (status !== MEDIA_STATUS.PROCESSING && status !== MEDIA_STATUS.PARTIALLY_AVAILABLE) {
		return null;
	}
	return getDownloadSummary(is4k ? media.downloadStatus4k : media.downloadStatus);
};

const isOnItsWay = (status) => status === MEDIA_STATUS.PENDING || status === MEDIA_STATUS.PROCESSING;

// Whether the title or one of its seasons is still on its way into the library on this
// track, waiting on approval, a download or the import.
export const isMediaInFlight = (media, is4k) => {
	if (!media) return false;
	if (isOnItsWay(is4k ? media.status4k : media.status)) return true;
	if (getMediaDownloadSummary(media, is4k)) return true;
	return (media.seasons || []).some((season) => isOnItsWay(is4k ? season.status4k : season.status));
};

// Summary for a request row, using the request's quality flavor and skipping
// requests that can no longer be downloading.
export const getRequestDownloadSummary = (req) => {
	if (req.status === REQUEST_STATUS.DECLINED || req.status === REQUEST_STATUS.FAILED) {
		return null;
	}
	return getMediaDownloadSummary(req.media, req.is4k);
};

export const isRequestDownloading = (req) => getRequestDownloadSummary(req) !== null;
