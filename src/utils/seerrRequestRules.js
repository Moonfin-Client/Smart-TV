// What the request controls may offer for one quality track.

import {MEDIA_STATUS, REQUEST_STATUS} from './seerrStatus';

// An unknown status counts as ended, so a lookup that found nothing never opens the
// button on a guess.
export const isContinuingSeries = (status) => {
	const value = String(status || '').trim().toLowerCase();
	return value !== '' && value !== 'ended' && value !== 'canceled';
};

// A provider that splits a run its own way reports its own season numbers, so counting
// from one would offer seasons that aren't there. The count is only a fallback for a
// server that sends no season list.
export const seasonNumbersOf = (seasons, fallbackCount = 0) => {
	const reported = (seasons || [])
		.map((season) => season?.seasonNumber)
		.filter((number) => Number.isFinite(number) && number > 0);
	if (reported.length) return reported;
	const numbers = [];
	for (let i = 1; i <= fallbackCount; i++) numbers.push(i);
	return numbers;
};

export const isAvailableStatus = (status) =>
	status === MEDIA_STATUS.PARTIALLY_AVAILABLE || status === MEDIA_STATUS.AVAILABLE;

// The seasons the request sheet may not offer, being already in the library or already
// spoken for by an open request.
export const unavailableOrRequestedSeasons = (seasonAvailability, activeRequests, is4k) => {
	const taken = new Set();
	(seasonAvailability || []).forEach((season) => {
		// A blocklisted or deleted season isn't in the library, so it can be asked for again.
		if (isAvailableStatus(is4k ? season?.status4k : season?.status)) taken.add(season.seasonNumber);
	});
	(activeRequests || []).forEach((request) => {
		(request?.seasons || []).forEach((season) => taken.add(season.seasonNumber));
	});
	return taken;
};

// Whether a track can still be asked for, and whether the ask reads as more. A partly
// available series with an open request still offers more. Full availability is final for
// a film or an ended series, but a running series can always grow another season. A season
// nobody has asked for lifts the gate that would otherwise hide the button while another
// season's request is open.
export const requestOfferFor = ({
	status,
	hasExistingRequest = false,
	allowed = false,
	isTv = false,
	isContinuing = false,
	hasUnrequestedSeasons = false
}) => {
	const isFullyAvailable = status === MEDIA_STATUS.AVAILABLE;
	const isPartiallyAvailable = status === MEDIA_STATUS.PARTIALLY_AVAILABLE;
	const continuingFullyAvailable = isTv && isContinuing && isFullyAvailable;
	const seasonsLeftToAsk = isTv && hasUnrequestedSeasons;

	const canRequest = allowed &&
		(!isFullyAvailable || continuingFullyAvailable) &&
		(!hasExistingRequest || isPartiallyAvailable || continuingFullyAvailable || seasonsLeftToAsk);

	return {
		canRequest,
		// Without the existing request test the first ask would read as more.
		wantsMore: isPartiallyAvailable || continuingFullyAvailable || hasExistingRequest
	};
};

// Seerr's own delete rule: a request manager may take back any open request, and everyone
// else only their own while it's still pending. Offering more gets a refusal from the server.
export const cancelableRequests = (activeRequests, {canManageRequests = false, currentUserId = null} = {}) => {
	const open = activeRequests || [];
	if (canManageRequests) return open;
	// Without a known viewer every request would match on an absent owner.
	if (currentUserId == null) return [];
	return open.filter((request) =>
		request?.status === REQUEST_STATUS.PENDING &&
		request?.requestedBy?.id === currentUserId
	);
};
