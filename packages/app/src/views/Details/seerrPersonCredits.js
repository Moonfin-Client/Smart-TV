import * as seerrApi from '../../services/seerrApi';
import {normalizeMediaItem} from '../../utils/seerrHomeRows';
import {sortCredits} from '../../utils/personCredits';

// Jobs that say nothing about what a person did on a title.
const EXCLUDED_JOBS = new Set(['thanks', 'special thanks']);

const posterOf = (credit) => credit.poster_path || credit.posterPath;

// The part of a credit worth naming: what a crew member did, or who an actor played.
const creditPart = (credit, isCrew) => (isCrew ? (credit.job || credit.department) : credit.character);

// Seerr lists a title once per credit, so somebody who wrote and directed the same film comes
// back twice. Folds the repeats into one entry naming everything they did on it.
export const groupSeerrCredits = (credits = [], isCrew = false) => {
	const grouped = new Map();
	credits.forEach((credit) => {
		// A movie and a show can share a TMDB id, so the type is part of the key.
		const key = `${credit.mediaType || credit.media_type || ''}:${credit.id}`;
		const bucket = grouped.get(key);
		if (bucket) bucket.push(credit);
		else grouped.set(key, [credit]);
	});

	return [...grouped.values()].map((entries) => {
		const first = entries[0];
		if (entries.length === 1) return {...first, _credit: creditPart(first, isCrew) || null};
		const parts = [];
		entries.forEach((entry) => {
			const part = creditPart(entry, isCrew);
			if (part && !parts.includes(part)) parts.push(part);
		});
		return {...first, _credit: parts.join(', ') || null};
	});
};

// Keeps the credits worth showing: the ones with artwork, minus the courtesy crew jobs.
export const filterSeerrCredits = (credits = [], isCrew = false) => credits
	.filter((credit) => Boolean(posterOf(credit)) &&
		!(isCrew && EXCLUDED_JOBS.has(String(credit.job || '').toLowerCase())));

// A credit as a card the grids can draw, carrying the roles or jobs that earned it a place.
export const creditAsCard = (credit) => ({
	...normalizeMediaItem(credit),
	_seerrCredit: credit._credit || null,
	cardKey: credit.credit_id || credit.creditId || `${credit.media_type || credit.mediaType || 'media'}-${credit.id}-${credit._credit || credit.job || credit.character || ''}`
});

// A person's combined credits, minus what the cards can't draw. Seerr is an extra here, so a
// failure leaves the page with whatever the library knows.
export const loadSeerrPersonCredits = async (tmdbId) => {
	const credits = await seerrApi.getPersonCombinedCredits(tmdbId);
	return {
		cast: filterSeerrCredits(credits?.cast || [], false),
		crew: filterSeerrCredits(credits?.crew || [], true)
	};
};

// The credits as cards, grouped and ordered the way the person page display options ask.
export const seerrPersonCards = (credits, isCrew, settings) => {
	const shaped = settings.personPageGroupItems
		? groupSeerrCredits(credits, isCrew)
		: credits.map((credit) => ({...credit, _credit: creditPart(credit, isCrew) || null}));
	return sortCredits(shaped, settings.personPageSortOption).map(creditAsCard);
};
