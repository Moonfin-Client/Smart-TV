// Decides whether an item may be opened or played. An episode usually has no rating of its own,
// so it's judged by its series, which may need looking up first.
//
// Fails open when it can't tell, since blanking the app is worse than the gap. The exception is
// a series already seen with a blocked rating, which stays blocked.

import * as jellyfinApi from './jellyfinApi';
import {getApiForItem} from './connectionPool';
import {getBlockedSeriesIds, isRatingBlocked, loadParentalControls, rememberSeriesBlocked} from './parentalControls';

const LOOKUP_TIMEOUT_MS = 3000;

// seriesId to its rating, or null when it has none.
const seriesRatings = new Map();
const inFlight = new Map();

const ownRating = (item) => {
	const rating = typeof item?.OfficialRating === 'string' ? item.OfficialRating.trim() : '';
	return rating || null;
};

export const resetBlockedContentGate = () => {
	seriesRatings.clear();
	inFlight.clear();
};

// Saves a lookup for a series the app already has in hand.
export const observeItem = (item) => {
	if (item?.Type !== 'Series' || !item.Id) return;
	seriesRatings.set(item.Id, ownRating(item));
};

// No network, so a whole queue can go through it. A miss reads as allowed and isBlocked catches it
// for the one item about to play.
export const isBlockedNow = (item) => {
	const own = ownRating(item);
	if (own) return isRatingBlocked(own);

	const seriesId = item?.SeriesId;
	if (!seriesId) return false;
	if (getBlockedSeriesIds().indexOf(seriesId) >= 0) return true;

	return isRatingBlocked(seriesRatings.get(seriesId));
};

const withTimeout = (promise) => new Promise((resolve, reject) => {
	const timer = setTimeout(() => reject(new Error('Series lookup timed out')), LOOKUP_TIMEOUT_MS);
	promise.then((value) => {
		clearTimeout(timer);
		resolve(value);
	}, (err) => {
		clearTimeout(timer);
		reject(err);
	});
});

// A failed lookup isn't the same as a series with no rating, so it's reported apart and never
// cached.
const resolveSeriesRating = async (item) => {
	const seriesId = item.SeriesId;
	if (seriesRatings.has(seriesId)) {
		return {rating: seriesRatings.get(seriesId), resolved: true};
	}

	// One request even when a whole season is queued.
	if (!inFlight.has(seriesId)) {
		const api = getApiForItem(item) || jellyfinApi.api;
		inFlight.set(seriesId, withTimeout(Promise.resolve().then(() => api.getItem(seriesId))).then(ownRating));
	}

	try {
		const rating = await inFlight.get(seriesId);
		seriesRatings.set(seriesId, rating);
		return {rating, resolved: true};
	} catch {
		return {rating: null, resolved: false};
	} finally {
		inFlight.delete(seriesId);
	}
};

// The answer for the one item about to open or play, looking the series up when it has to.
export const isBlocked = async (item) => {
	await loadParentalControls();

	const own = ownRating(item);
	if (own) return isRatingBlocked(own);

	const seriesId = item?.SeriesId;
	if (!seriesId) return false;

	const {rating, resolved} = await resolveSeriesRating(item);
	// A lookup that worked always wins, so unblocking a rating releases the series.
	if (resolved) {
		const blocked = isRatingBlocked(rating);
		rememberSeriesBlocked(seriesId, blocked);
		return blocked;
	}

	return getBlockedSeriesIds().indexOf(seriesId) >= 0;
};
