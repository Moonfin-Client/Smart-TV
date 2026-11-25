// Blocked ratings, kept per server and per user rather than on the settings blob, which is one
// per TV and gets pushed to the profile. The list deliberately doesn't sync, so locking down the
// kids' TV doesn't lock down a parent's phone.

import {getFromStorage, saveToStorage} from './storage';
import {NO_PARENTAL_FILTER, normalizeBlockedRatings, parentalFilterFromRatings, withoutBlocked} from '../utils/parentalFilter';

const STORAGE_KEY = 'parentalControls';

// {[scope]: {blockedRatings, blockedSeriesIds}}
let scopes = {};
let activeScope = null;
let loadPromise = null;

let cachedRatings = null;
let cachedFilter = NO_PARENTAL_FILTER;

const EMPTY = [];

export const loadParentalControls = () => {
	if (!loadPromise) {
		loadPromise = Promise.resolve()
			.then(() => getFromStorage(STORAGE_KEY))
			.then((stored) => {
				// A write that beat the load is newer than the disk copy, so it wins field by field.
				if (stored && stored.scopes && typeof stored.scopes === 'object') {
					const merged = {...stored.scopes};
					Object.keys(scopes).forEach((key) => {
						merged[key] = {...(merged[key] || {}), ...scopes[key]};
					});
					scopes = merged;
				}
			})
			.catch(() => {});
	}
	return loadPromise;
};

// Every account shares one record, so a save waits for the load or it would drop the others.
const persist = () => {
	loadParentalControls()
		.then(() => saveToStorage(STORAGE_KEY, {scopes}))
		.catch((err) => {
			console.warn('[ParentalControls] Could not save:', err);
		});
};

// The server address without its scheme, which is known even when the server can't be reached.
export const parentalScopeKey = (serverUrl, userId) => {
	const server = (serverUrl || '')
		.replace(/^https?:\/\//i, '')
		.replace(/\/+$/, '')
		.toLowerCase();
	return server && userId ? `${server}_${userId}` : null;
};

export const setParentalScope = (scope) => {
	if (scope === activeScope) return;
	activeScope = scope || null;
};

const activeEntry = () => (activeScope ? scopes[activeScope] : null);

const writeEntry = (changes) => {
	if (!activeScope) return;
	scopes = {...scopes, [activeScope]: {...(scopes[activeScope] || {}), ...changes}};
	persist();
};

export const getBlockedRatings = () => activeEntry()?.blockedRatings || EMPTY;

export const setBlockedRatings = (ratings) => {
	writeEntry({blockedRatings: normalizeBlockedRatings(ratings)});
};

// Earlier versions kept the list on the settings blob for the whole TV. It moves to whoever is
// signed in unless they already have one, and the caller drops the old copy either way.
export const adoptLegacyBlockedRatings = (ratings) => {
	if (!activeScope) return false;
	if (activeEntry()?.blockedRatings !== undefined) return true;
	setBlockedRatings(ratings);
	return true;
};

// Memoized on the stored list, since the home screen runs every row through it on each build.
export const getActiveParentalFilter = () => {
	const ratings = getBlockedRatings();
	if (ratings !== cachedRatings) {
		cachedRatings = ratings;
		cachedFilter = parentalFilterFromRatings(ratings);
	}
	return cachedFilter;
};

export const isRatingBlocked = (rating) => getActiveParentalFilter().isBlockedRating(rating);

export const withoutBlockedItems = (items, fallbackRating) =>
	withoutBlocked(items, getActiveParentalFilter(), fallbackRating);

// Series last seen with a blocked rating. They stay blocked until a lookup succeeds and says
// otherwise, so a dropped connection can't undo a refusal.
export const getBlockedSeriesIds = () => activeEntry()?.blockedSeriesIds || EMPTY;

export const rememberSeriesBlocked = (seriesId, blocked) => {
	const current = getBlockedSeriesIds();
	if (blocked === (current.indexOf(seriesId) >= 0)) return;
	writeEntry({
		blockedSeriesIds: blocked
			? [...current, seriesId]
			: current.filter((id) => id !== seriesId)
	});
};
