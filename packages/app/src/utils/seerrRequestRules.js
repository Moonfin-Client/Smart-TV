// What the request controls may offer for one quality track. Kept apart from the screen so
// the rules can be read on their own.

import {MEDIA_STATUS, REQUEST_STATUS} from './seerrStatus';

/**
 * Whether a series is still running. An unknown status counts as ended, so a lookup that
 * found nothing never opens the button on a guess.
 *
 * @param {string} [status] - the series status Seerr reports
 * @returns {boolean}
 */
export const isContinuingSeries = (status) => {
	const value = String(status || '').trim().toLowerCase();
	return value !== '' && value !== 'ended' && value !== 'canceled';
};

/**
 * The season numbers a series actually has. A provider that splits a run its own way reports
 * its own numbers, so counting from one would offer seasons that aren't there. The count is
 * only a fallback for a server that sends no season list.
 *
 * @param {Array} [seasons] - the seasons Seerr reports
 * @param {number} [fallbackCount] - how many seasons the server says there are
 * @returns {Array<number>}
 */
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

/**
 * The seasons the request sheet may not offer, being already in the library or already
 * spoken for by an open request.
 *
 * @param {Array} [seasonAvailability] - the per season list Seerr keeps
 * @param {Array} [activeRequests] - the requests still open on this track
 * @param {boolean} [is4k] - which track is being asked about
 * @returns {Set<number>}
 */
export const unavailableOrRequestedSeasons = (seasonAvailability, activeRequests, is4k) => {
	const taken = new Set();
	(seasonAvailability || []).forEach((season) => {
		// A blocklisted or deleted season isn't in the library, so it can be asked for again
		if (isAvailableStatus(is4k ? season?.status4k : season?.status)) taken.add(season.seasonNumber);
	});
	(activeRequests || []).forEach((request) => {
		(request?.seasons || []).forEach((season) => taken.add(season.seasonNumber));
	});
	return taken;
};

/**
 * Whether a track can still be asked for, and whether the ask reads as more.
 *
 * Asking wins over being told, so a partly available series with an open request still
 * offers more rather than only reporting the request. Full availability is final for a film
 * or a series that has ended, but a running series can always grow another season, so it
 * keeps offering more with every aired season already in the library. A season nobody has
 * asked for relaxes the one gate that would otherwise hide the button while a request on
 * some other season is open.
 *
 * @param {Object} params - status, hasExistingRequest, allowed, isTv, isContinuing and
 *   hasUnrequestedSeasons
 * @returns {{canRequest: boolean, wantsMore: boolean}}
 */
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

/**
 * Seerr's own delete rule: a request manager may take back any open request, and everyone
 * else only their own while it is still waiting on a decision. Offering more than that gets
 * a refusal from the server rather than a cancel.
 *
 * @param {Array} [activeRequests] - the requests still open on this track
 * @param {Object} params - canManageRequests and currentUserId
 * @returns {Array}
 */
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
