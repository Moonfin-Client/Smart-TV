// $L reaches for ilib, which a plain unit test has no way to load. Every key is its
// own English source string, so handing it straight back is faithful enough.
jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

import {MEDIA_STATUS, REQUEST_STATUS} from './seerrStatus';
import {
	cancelableRequests, isContinuingSeries, requestOfferFor, seasonNumbersOf,
	unavailableOrRequestedSeasons
} from './seerrRequestRules';

describe('isContinuingSeries', () => {
	it('counts a running show as continuing', () => {
		expect(isContinuingSeries('Returning Series')).toBe(true);
		expect(isContinuingSeries('In Production')).toBe(true);
	});

	it('counts a finished show as settled', () => {
		expect(isContinuingSeries('Ended')).toBe(false);
		expect(isContinuingSeries('Canceled')).toBe(false);
	});

	it('never guesses from a status it was not given', () => {
		expect(isContinuingSeries('')).toBe(false);
		expect(isContinuingSeries(null)).toBe(false);
	});
});

describe('seasonNumbersOf', () => {
	it('takes the numbers the server reports', () => {
		expect(seasonNumbersOf([{seasonNumber: 0}, {seasonNumber: 3}, {seasonNumber: 4}], 9)).toEqual([3, 4]);
	});

	it('counts off only when no season list came back', () => {
		expect(seasonNumbersOf([], 3)).toEqual([1, 2, 3]);
		expect(seasonNumbersOf(null, 0)).toEqual([]);
	});
});

describe('unavailableOrRequestedSeasons', () => {
	const availability = [
		{seasonNumber: 1, status: MEDIA_STATUS.AVAILABLE, status4k: MEDIA_STATUS.UNKNOWN},
		{seasonNumber: 2, status: MEDIA_STATUS.UNKNOWN, status4k: MEDIA_STATUS.AVAILABLE}
	];

	it('counts what the library holds for that track alone', () => {
		expect([...unavailableOrRequestedSeasons(availability, [], false)]).toEqual([1]);
		expect([...unavailableOrRequestedSeasons(availability, [], true)]).toEqual([2]);
	});

	it('counts what an open request already speaks for', () => {
		const requests = [{seasons: [{seasonNumber: 5}]}];
		expect([...unavailableOrRequestedSeasons([], requests, false)]).toEqual([5]);
	});

	it('leaves blocklisted and deleted seasons open to another request', () => {
		const gone = [
			{seasonNumber: 1, status: MEDIA_STATUS.PARTIALLY_AVAILABLE},
			{seasonNumber: 2, status: MEDIA_STATUS.BLOCKLISTED},
			{seasonNumber: 3, status: MEDIA_STATUS.DELETED}
		];
		expect([...unavailableOrRequestedSeasons(gone, [], false)]).toEqual([1]);
	});
});

describe('requestOfferFor', () => {
	it('offers a first ask on a title nobody has requested', () => {
		const offer = requestOfferFor({status: MEDIA_STATUS.UNKNOWN, allowed: true});
		expect(offer).toEqual({canRequest: true, wantsMore: false});
	});

	it('says nothing when the viewer is not allowed to ask', () => {
		expect(requestOfferFor({status: MEDIA_STATUS.UNKNOWN, allowed: false}).canRequest).toBe(false);
	});

	it('closes a film once it is fully in the library', () => {
		expect(requestOfferFor({status: MEDIA_STATUS.AVAILABLE, allowed: true}).canRequest).toBe(false);
	});

	it('keeps offering more on a running series that is fully in the library', () => {
		const offer = requestOfferFor({
			status: MEDIA_STATUS.AVAILABLE, allowed: true, isTv: true, isContinuing: true
		});
		expect(offer).toEqual({canRequest: true, wantsMore: true});
	});

	it('closes a series that has ended and is fully in the library', () => {
		expect(requestOfferFor({
			status: MEDIA_STATUS.AVAILABLE, allowed: true, isTv: true, isContinuing: false
		}).canRequest).toBe(false);
	});

	it('still offers more on a partly available title with a request open', () => {
		const offer = requestOfferFor({
			status: MEDIA_STATUS.PARTIALLY_AVAILABLE, allowed: true, hasExistingRequest: true
		});
		expect(offer).toEqual({canRequest: true, wantsMore: true});
	});

	it('hides the ask while a request is open with no season left to ask for', () => {
		expect(requestOfferFor({
			status: MEDIA_STATUS.PENDING, allowed: true, hasExistingRequest: true, isTv: true
		}).canRequest).toBe(false);
	});

	it('opens it again when a season nobody asked for is left', () => {
		expect(requestOfferFor({
			status: MEDIA_STATUS.PENDING,
			allowed: true,
			hasExistingRequest: true,
			isTv: true,
			hasUnrequestedSeasons: true
		}).canRequest).toBe(true);
	});
});

describe('cancelableRequests', () => {
	const mine = {id: 1, status: REQUEST_STATUS.PENDING, requestedBy: {id: 7}};
	const mineApproved = {id: 2, status: REQUEST_STATUS.APPROVED, requestedBy: {id: 7}};
	const theirs = {id: 3, status: REQUEST_STATUS.PENDING, requestedBy: {id: 8}};
	const all = [mine, mineApproved, theirs];

	it('lets a manager take back anything still open', () => {
		expect(cancelableRequests(all, {canManageRequests: true, currentUserId: 7})).toEqual(all);
	});

	it('lets everyone else take back only their own, and only while it waits', () => {
		expect(cancelableRequests(all, {canManageRequests: false, currentUserId: 7})).toEqual([mine]);
	});

	it('offers nothing when there is no viewer to match on', () => {
		expect(cancelableRequests(all, {canManageRequests: false, currentUserId: null})).toEqual([]);
	});
});
