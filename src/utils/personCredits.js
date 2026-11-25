import $L from '../services/i18n.js';

import {SHOWS_EVERYTHING} from './detailSectionLayout';
import {localeDate} from './dateFormat';
import {parseServerDate} from './serverDate';

// A birthday is a calendar date, not a moment. Both servers send it anchored to
// UTC, so reading it back in the viewer's zone moves it a day earlier for
// anyone west of it. The parts are taken as written and rebuilt locally.
export const personCalendarDate = (value) => {
	const parsed = parseServerDate(value);
	return parsed ? new Date(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()) : null;
};

const sortByOption = (list, sortOption, titleOf, dateOf) => {
	const sorted = (Array.isArray(list) ? list : []).slice();
	const byTitle = (a, b) => titleOf(a).toLowerCase().localeCompare(titleOf(b).toLowerCase());

	if (sortOption === 'alphabetical') {
		sorted.sort(byTitle);
		return sorted;
	}

	// A title with no date on file sorts to the end either way, so the row never
	// opens on something that can't be placed.
	const direction = sortOption === 'releaseDateAsc' ? 1 : -1;
	sorted.sort((a, b) => {
		const dateA = dateOf(a);
		const dateB = dateOf(b);
		if (!dateA && !dateB) return byTitle(a, b);
		if (!dateA) return 1;
		if (!dateB) return -1;
		return direction * ((dateA - dateB) || byTitle(a, b));
	});
	return sorted;
};

const formatPersonDate = (value) => {
	const date = personCalendarDate(value);
	if (!date) return null;
	return localeDate(date, {year: 'numeric', month: 'long', day: 'numeric'});
};

const personAge = (birthValue, deathValue) => {
	const birth = personCalendarDate(birthValue);
	if (!birth) return null;
	const end = personCalendarDate(deathValue) || new Date();
	let age = end.getFullYear() - birth.getFullYear();
	const monthDiff = end.getMonth() - birth.getMonth();
	if (monthDiff < 0 || (monthDiff === 0 && end.getDate() < birth.getDate())) age -= 1;
	return age > 0 ? age : null;
};

// Born, then either the date they died or how old they are now. Someone with
// neither date on file gets no lines at all rather than an empty row.
export const personDateLines = (birthValue, deathValue) => {
	const lines = [];
	const born = formatPersonDate(birthValue);
	if (born) lines.push($L('Born {date}').replace('{date}', born));

	const died = formatPersonDate(deathValue);
	if (died) {
		lines.push($L('Died {date}').replace('{date}', died));
	} else if (born) {
		const age = personAge(birthValue);
		if (age) lines.push($L('Age {age}').replace('{age}', age));
	}

	return lines;
};

const itemDate = (item) => parseServerDate(item.PremiereDate) || (item.ProductionYear ? new Date(item.ProductionYear, 0, 1) : null);

const sortFilmography = (items, sortOption = 'alphabetical') => sortByOption(items, sortOption, (item) => item.Name || '', itemDate);

// The filmography comes back as one list, and each kind of work gets its own
// row. An episode of a series the person is billed on is already covered by
// that series, so only the rest count as a guest appearance. Guest appearances
// and music videos each have a switch in the detail sections setting, and a
// hidden one comes back empty.
export const splitFilmography = (items, showsSection = SHOWS_EVERYTHING, sortOption = 'alphabetical') => {
	const all = sortFilmography(Array.isArray(items) ? items : [], sortOption);
	const movies = all.filter((item) => item.Type === 'Movie');
	const series = all.filter((item) => item.Type === 'Series');
	const musicVideos = showsSection('musicVideos') ? all.filter((item) => item.Type === 'MusicVideo') : [];
	const seriesIds = new Set(series.map((item) => item.Id));
	const guestAppearances = showsSection('guestAppearances')
		? all.filter((item) => item.Type === 'Episode' && (!item.SeriesId || !seriesIds.has(item.SeriesId)))
		: [];

	return {movies, series, guestAppearances, musicVideos};
};

// What the person plays in each title rides along as the card's second line,
// and the rest of the cast is let go. Several roles arrive one per line.
export const withPersonRoles = (items, personId) => items.map(({People, ...item}) => {
	const role = (People || [])
		.filter((person) => person.Id === personId)
		.map((person) => String(person.Role || '').split('\n').map((line) => line.trim()).filter(Boolean).join(', '))
		.find(Boolean);
	return role ? {...item, Subtitle: role} : item;
});

const creditTitle = (credit) => credit.title || credit.name || credit.originalTitle || credit.originalName || '';

const creditDate = (credit) => credit.releaseDate || credit.release_date || credit.firstAirDate || credit.first_air_date || null;

const creditPosterPath = (credit) => credit.posterPath || credit.poster_path || null;

// Only what can be drawn as a poster, and never a job that amounts to a credit
// list mention rather than work on the title.
const EXCLUDED_JOBS = ['thanks', 'special thanks'];

const usableCredits = (credits, isCrew = false) => (Array.isArray(credits) ? credits : []).filter((credit) => {
	if (!creditPosterPath(credit)) return false;
	if (!isCrew) return true;
	const job = (credit.job || '').toLowerCase();
	return !EXCLUDED_JOBS.includes(job);
});

// The same title turns up once per role, so the roles are joined onto a single
// entry rather than repeating the poster down the row.
const groupCredits = (credits, isCrew = false) => {
	const list = Array.isArray(credits) ? credits : [];
	const byId = new Map();

	for (const credit of list) {
		// A movie and a show can share a TMDB id, so the type is part of the key.
		const key = `${credit.mediaType || credit.media_type || ''}:${credit.id}`;
		const existing = byId.get(key);
		if (existing) existing.push(credit);
		else byId.set(key, [credit]);
	}

	const grouped = [];
	for (const entries of byId.values()) {
		const first = entries[0];
		if (entries.length === 1) {
			grouped.push(first);
			continue;
		}

		const roles = [];
		for (const entry of entries) {
			const role = isCrew ? (entry.job || entry.department) : entry.character;
			if (role && roles.indexOf(role) === -1) roles.push(role);
		}

		const joined = roles.join(', ');
		grouped.push(isCrew
			? {...first, job: joined || first.job}
			: {...first, character: joined || first.character});
	}

	return grouped;
};

export const sortCredits = (credits, sortOption = 'alphabetical') =>
	sortByOption(credits, sortOption, creditTitle, (credit) => personCalendarDate(creditDate(credit)));

export const prepareCredits = (credits, {isCrew = false, group = false, sortOption = 'alphabetical'} = {}) => {
	const usable = usableCredits(credits, isCrew);
	return sortCredits(group ? groupCredits(usable, isCrew) : usable, sortOption);
};
