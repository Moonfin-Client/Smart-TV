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

// The request's own status wins only for declined and failed, everything
// else reflects the media status.
export const getRequestStatusInfo = (req) => {
	if (req.status === REQUEST_STATUS.DECLINED) {
		return {label: $L('Declined'), color: 'error'};
	}
	if (req.status === REQUEST_STATUS.FAILED) {
		return {label: $L('Failed'), color: 'error'};
	}
	if (req.status === REQUEST_STATUS.COMPLETED) {
		return {label: $L('Available'), color: 'available'};
	}

	const mediaStatus = req.media && req.media.status;
	switch (mediaStatus) {
		case MEDIA_STATUS.PENDING:
			return {label: $L('Pending'), color: 'pending'};
		case MEDIA_STATUS.PROCESSING:
			return {label: $L('Requested'), color: 'requested'};
		case MEDIA_STATUS.PARTIALLY_AVAILABLE:
			return {label: $L('Partially Available'), color: 'available'};
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
	return {label: $L('Approved'), color: 'approved'};
};

export const getIssueStatusInfo = (issue) => {
	return issue.status === ISSUE_STATUS.OPEN
		? {label: $L('Open'), color: 'pending'}
		: {label: $L('Resolved'), color: 'available'};
};

// Aggregates the Radarr/Sonarr queue entries Seerr reports in downloadStatus.
// Sums bytes so a large episode weighs more than a small one. Returns null
// when nothing is downloading, which falls back to the status chip alone.
export const getDownloadSummary = (items) => {
	if (!Array.isArray(items) || items.length === 0) return null;
	let total = 0;
	let left = 0;
	for (const item of items) {
		const size = item && item.size;
		if (typeof size !== 'number' || size <= 0) continue;
		total += size;
		const sizeLeft = typeof item.sizeLeft === 'number' ? item.sizeLeft : 0;
		left += Math.min(Math.max(sizeLeft, 0), size);
	}
	if (total <= 0) return null;
	return {
		fraction: Math.min(Math.max((total - left) / total, 0), 1),
		isImporting: left <= 0
	};
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

// Summary for a request row, using the request's quality flavor and skipping
// requests that can no longer be downloading.
export const getRequestDownloadSummary = (req) => {
	if (req.status === REQUEST_STATUS.DECLINED || req.status === REQUEST_STATUS.FAILED) {
		return null;
	}
	return getMediaDownloadSummary(req.media, req.is4k);
};

export const isRequestDownloading = (req) => getRequestDownloadSummary(req) !== null;
