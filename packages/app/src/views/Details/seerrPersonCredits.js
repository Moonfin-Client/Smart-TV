import * as seerrApi from '../../services/seerrApi';
import {normalizeMediaItem} from '../../utils/seerrHomeRows';

// Jobs that say nothing about what a person did on a title.
const EXCLUDED_JOBS = new Set(['thanks', 'special thanks']);

const displayTitle = (credit) => credit.title || credit.name || '';
const posterOf = (credit) => credit.poster_path || credit.posterPath;
const byTitle = (a, b) => displayTitle(a).localeCompare(displayTitle(b));

// The part of a credit worth naming: what a crew member did, or who an actor played.
const creditPart = (credit, isCrew) => (isCrew ? (credit.job || credit.department) : credit.character);

// Seerr lists a title once per credit, so somebody who wrote and directed the same film comes
// back twice. Folds the repeats into one entry naming everything they did on it.
export const groupSeerrCredits = (credits = [], isCrew = false) => {
	const grouped = new Map();
	credits.forEach((credit) => {
		const bucket = grouped.get(credit.id);
		if (bucket) bucket.push(credit);
		else grouped.set(credit.id, [credit]);
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
		!(isCrew && EXCLUDED_JOBS.has(String(credit.job || '').toLowerCase())))
	.sort(byTitle);

// A credit as a card the grids can draw, carrying the roles or jobs that earned it a place.
export const creditAsCard = (credit) => ({...normalizeMediaItem(credit), _seerrCredit: credit._credit || null});

// A person's combined credits, split the way the filmography card shows them. Seerr is an
// extra here, so a failure leaves the card with whatever the library knows.
export const loadSeerrPersonCredits = async (tmdbId) => {
	const credits = await seerrApi.getPersonCombinedCredits(tmdbId);
	return {
		appearances: groupSeerrCredits(filterSeerrCredits(credits?.cast || [], false), false).map(creditAsCard),
		crewCredits: groupSeerrCredits(filterSeerrCredits(credits?.crew || [], true), true).map(creditAsCard)
	};
};
