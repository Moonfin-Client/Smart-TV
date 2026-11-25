// Client side on purpose. The server's MaxOfficialRating only exists on its item query, so resume,
// next up, episodes, similar items and search would all go unfiltered, and it can't let unrated
// items through.

import {parentalRatingSeverity, isRankedRatingSeverity} from './parentalRatingSeverity';

const normalizeRating = (rating) => (rating == null ? '' : String(rating).trim().toUpperCase());

// Blocking a rating blocks everything at or above it, so the picked set collapses to one ceiling,
// the mildest severity chosen. Ratings that can't be ranked are only ever matched by name.
const makeFilter = (literals, ceiling) => {
	const isBlockedRating = (rating) => {
		const normalized = normalizeRating(rating);
		// A server that rates nothing can't be told apart from an item nobody rated, so unrated
		// items always pass.
		if (!normalized) return false;
		if (literals.has(normalized)) return true;
		const severity = parentalRatingSeverity(normalized);
		if (!isRankedRatingSeverity(severity)) return false;
		return ceiling !== null && severity >= ceiling;
	};

	return {
		isActive: literals.size > 0,
		isBlockedRating,
		isBlockedRaw: (raw) => isBlockedRating(raw?.OfficialRating)
	};
};

export const NO_PARENTAL_FILTER = makeFilter(new Set(), null);

export const parentalFilterFromRatings = (ratings) => {
	const literals = new Set();
	let ceiling = null;
	for (const raw of ratings || []) {
		const normalized = normalizeRating(raw);
		if (!normalized) continue;
		literals.add(normalized);
		const severity = parentalRatingSeverity(normalized);
		// Letting an unranked label set the ceiling would put it above every real rating and empty
		// the library.
		if (!isRankedRatingSeverity(severity)) continue;
		if (ceiling === null || severity < ceiling) ceiling = severity;
	}
	if (literals.size === 0) return NO_PARENTAL_FILTER;
	return makeFilter(literals, ceiling);
};

export const normalizeBlockedRatings = (ratings) => {
	const seen = [];
	for (const raw of Array.isArray(ratings) ? ratings : []) {
		const normalized = normalizeRating(raw);
		if (normalized && seen.indexOf(normalized) < 0) seen.push(normalized);
	}
	return seen;
};

// Mildest first, so blocking reads down the list as "everything from here".
export const sortRatingsBySeverity = (ratings) => [...ratings].sort((a, b) => {
	const bySeverity = parentalRatingSeverity(a) - parentalRatingSeverity(b);
	if (bySeverity !== 0) return bySeverity;
	if (a < b) return -1;
	return a > b ? 1 : 0;
});

export const ratingIsRanked = (rating) => isRankedRatingSeverity(parentalRatingSeverity(rating));

// An item's own rating wins over the fallback, so an episode rated milder than its series is
// judged on its own. The same array comes back when nothing was dropped, so lists built from it
// don't redraw for nothing.
export const withoutBlocked = (items, filter, fallbackRating) => {
	if (!filter?.isActive || !Array.isArray(items)) return items;
	const kept = items.filter((item) => {
		const own = normalizeRating(item?.OfficialRating);
		return !filter.isBlockedRating(own || fallbackRating);
	});
	return kept.length === items.length ? items : kept;
};

// Titles from outside lists only carry a rating when the plugin looked one up, so once anything
// is blocked a title with no rating stays out. With `strict` off that applies only to the items
// marked _strictRating, which is how a row mixing library titles and outside ones is judged.
export const withoutBlockedOrUnrated = (items, filter, strict = true) => {
	if (!filter?.isActive || !Array.isArray(items)) return items;
	const kept = items.filter((item) => {
		const own = normalizeRating(item?.OfficialRating);
		if (!own) return !(strict || item?._strictRating);
		return !filter.isBlockedRating(own);
	});
	return kept.length === items.length ? items : kept;
};
