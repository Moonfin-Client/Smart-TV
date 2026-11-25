// The facts panel beside the overview. Which facts exist depends on the media type and on
// what the server actually filled in, so anything missing is left out rather than shown blank.

import $L from '../services/i18n.js';

import {formatCurrency, formatDate, formatRuntime} from './seerrBadges';

const positive = (value) => {
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? number : null;
};

export const buildMediaFacts = (details, mediaType) => {
	if (!details) return [];
	const isTv = mediaType === 'tv';
	const facts = [];

	const tmdbScore = positive(details.voteAverage);
	if (tmdbScore) {
		facts.push({label: $L('TMDB Score'), value: `${Math.round(tmdbScore * 10)}%`});
	}

	if (details.status) {
		facts.push({label: $L('Status'), value: details.status});
	}

	const airDate = formatDate(isTv ? details.firstAirDate : details.releaseDate);
	if (airDate) {
		facts.push({label: isTv ? $L('First Air Date') : $L('Release Date'), value: airDate});
	}

	const budget = positive(details.budget);
	if (budget) {
		const formatted = formatCurrency(budget);
		if (formatted) facts.push({label: $L('Budget'), value: formatted});
	}

	const revenue = positive(details.revenue);
	if (revenue) {
		const formatted = formatCurrency(revenue);
		if (formatted) facts.push({label: $L('Revenue'), value: formatted});
	}

	const runtime = positive(details.runtime);
	if (runtime) {
		facts.push({label: $L('Runtime'), value: formatRuntime(runtime)});
	}

	if (isTv) {
		const seasons = positive(details.numberOfSeasons);
		if (seasons) facts.push({label: $L('Seasons'), value: String(seasons)});

		const episodes = positive(details.numberOfEpisodes);
		if (episodes) facts.push({label: $L('Episodes'), value: String(episodes)});
	}

	return facts;
};

// Whether the panel would draw anything, so a caller can drop the space around it too.
export const hasMediaFacts = (details, mediaType) => buildMediaFacts(details, mediaType).length > 0;
