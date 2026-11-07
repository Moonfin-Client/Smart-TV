// The Sonarr and Radarr calendars that Moonbase hands out, turned into one list of entries the
// Calendar screen filters and draws.

import $L from '@enact/i18n/$L';
import {formatShortDate} from './dateFormat';

export const BADGE = {
	seriesPremiere: 'seriesPremiere',
	seasonPremiere: 'seasonPremiere',
	midseasonFinale: 'midseasonFinale',
	seasonFinale: 'seasonFinale',
	seriesFinale: 'seriesFinale'
};

export const PROBLEM = {
	adminsOnly: 'adminsOnly',
	needsAdminSeerr: 'needsAdminSeerr',
	notConfigured: 'notConfigured',
	failed: 'failed'
};

export const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
export const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
export const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const pad = (n) => (n < 10 ? `0${n}` : String(n));
// The local day as the plugin's query wants it.
export const isoDay = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const text = (value) => {
	if (value == null) return null;
	const s = String(value).trim();
	return s ? s : null;
};

const int = (value) => {
	if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
	const n = parseInt(value, 10);
	return Number.isNaN(n) ? null : n;
};

const positive = (value) => {
	const n = int(value);
	return n == null || n <= 0 ? null : n;
};

const ids = (value) => (Array.isArray(value) ? value.filter((v) => v != null).map(String) : []);

// Local arr image paths need the arr's API key and can't be reached from the TV, so only remote
// ones count.
const images = (raw) => {
	const out = {};
	if (!Array.isArray(raw)) return out;
	raw.forEach((image) => {
		if (!image || typeof image !== 'object') return;
		const url = image.remoteUrl || image.url;
		if (typeof image.coverType === 'string' && typeof url === 'string' && url.indexOf('http') === 0 && !out[image.coverType]) {
			out[image.coverType] = url;
		}
	});
	return out;
};

// TMDB serves the original file unless the path names a size.
const sized = (url, size) => (url ? url.replace('/t/p/original/', `/t/p/${size}/`) : null);

// A whole day written as UTC midnight is that calendar day, read before any time zone shift.
const dayOf = (value) => {
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof value === 'string' ? value : '');
	return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

const instantOf = (value) => {
	if (typeof value !== 'string' || !value) return null;
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? null : d;
};

const episodeBadge = (finale, season, episode) => {
	if (finale === 'series') return BADGE.seriesFinale;
	if (finale === 'season') return BADGE.seasonFinale;
	if (finale === 'midseason') return BADGE.midseasonFinale;
	if (episode !== 1 || season == null || season < 1) return null;
	return season === 1 ? BADGE.seriesPremiere : BADGE.seasonPremiere;
};

/** One Sonarr calendar element, or null without an air date or a series. */
export const parseSonarrEntry = (json) => {
	const series = json?.series;
	if (!series || typeof series !== 'object') return null;
	const airUtc = instantOf(json.airDateUtc);
	const airDay = dayOf(json.airDate);
	if (!airUtc && !airDay) return null;
	const season = int(json.seasonNumber);
	const episode = int(json.episodeNumber);
	const seriesImages = images(series.images);
	const episodeImages = images(json.images);
	const date = airUtc || airDay;
	const episodeTitle = text(json.title);
	return {
		key: `sonarr:${json.id != null ? json.id : `${series.tvdbId}:${season}:${episode}`}`,
		kind: 'episode',
		release: 'airing',
		date,
		day: startOfDay(date),
		hasTime: Boolean(airUtc),
		title: text(series.title) || '',
		episodeTitle: episodeTitle === 'TBA' ? null : episodeTitle,
		seasonNumber: season,
		episodeNumber: episode,
		overview: text(json.overview),
		posterUrl: sized(seriesImages.poster, 'w500'),
		backdropUrl: sized(seriesImages.fanart, 'w1280'),
		stillUrl: sized(episodeImages.screenshot, 'w780'),
		network: text(series.network),
		runtimeMinutes: int(json.runtime) ?? int(series.runtime),
		year: int(series.year),
		tvdbId: positive(series.tvdbId),
		tmdbId: positive(series.tmdbId),
		imdbId: text(series.imdbId),
		hasFile: json.hasFile === true,
		monitored: json.monitored !== false && series.monitored !== false,
		itemId: text(json.moonfinItemId),
		episodeId: text(json.moonfinEpisodeId),
		libraryIds: ids(json.moonfinLibraryIds),
		badge: episodeBadge(text(json.finaleType), season, episode)
	};
};

const RELEASES = [['inCinemas', 'cinema'], ['digitalRelease', 'digital'], ['physicalRelease', 'physical']];

/** One Radarr calendar element as an entry per release date on a local day from start up to end. */
export const parseRadarrEntries = (json, start, end) => {
	const title = text(json?.title);
	if (!title) return [];
	const art = images(json.images);
	const tmdbId = positive(json.tmdbId);
	const out = [];
	RELEASES.forEach(([field, release]) => {
		const day = dayOf(json[field]);
		if (!day || day < start || day >= end) return;
		out.push({
			key: `radarr:${tmdbId != null ? tmdbId : json.id}:${release}`,
			kind: 'movie',
			release,
			date: day,
			day,
			hasTime: false,
			title,
			episodeTitle: null,
			seasonNumber: null,
			episodeNumber: null,
			overview: text(json.overview),
			posterUrl: sized(art.poster, 'w500'),
			backdropUrl: sized(art.fanart, 'w1280'),
			stillUrl: null,
			network: text(json.studio),
			runtimeMinutes: int(json.runtime),
			year: int(json.year),
			tvdbId: null,
			tmdbId,
			imdbId: text(json.imdbId),
			hasFile: json.hasFile === true,
			monitored: json.monitored !== false,
			itemId: text(json.moonfinItemId),
			episodeId: null,
			libraryIds: ids(json.moonfinLibraryIds),
			badge: null
		});
	});
	return out;
};

export const isEpisode = (e) => e.kind === 'episode';
export const isMovie = (e) => e.kind === 'movie';

// What Play opens. A movie counts once its file is on the server.
export const playableId = (e) => (isEpisode(e) ? e.episodeId : (e.hasFile ? e.itemId : null));
export const inLibrary = (e) => playableId(e) != null;

// Movies have no time of day, so one counts as aired once its day is over.
const airedAt = (e) => (e.hasTime ? e.date : addDays(e.day, 1));

export const statusAt = (e, now) => {
	if (inLibrary(e)) return 'ready';
	return airedAt(e) > now ? 'upcoming' : 'missing';
};

const compareCalendarEntries = (a, b) => {
	const byDay = a.day - b.day;
	if (byDay !== 0) return byDay;
	// Episodes with a time come in time order. Movie days have none and sort after them.
	if (a.hasTime !== b.hasTime) return a.hasTime ? -1 : 1;
	const byTime = a.date - b.date;
	if (byTime !== 0) return byTime;
	const at = a.title.toLowerCase();
	const bt = b.title.toLowerCase();
	if (at !== bt) return at < bt ? -1 : 1;
	return (a.episodeNumber || 0) - (b.episodeNumber || 0);
};

/** Both arr answers as one list sorted by date, keeping only local days from start up to end. */
export const buildEntries = (sonarr, radarr, start, end) => {
	const entries = [];
	(sonarr || []).forEach((raw) => {
		const entry = raw && typeof raw === 'object' ? parseSonarrEntry(raw) : null;
		if (entry && entry.day >= start && entry.day < end) entries.push(entry);
	});
	(radarr || []).forEach((raw) => {
		if (raw && typeof raw === 'object') entries.push(...parseRadarrEntries(raw, start, end));
	});
	return entries.sort(compareCalendarEntries);
};

/** Why a source didn't answer, from the plugin's status and body. */
export const problemFrom = (status, body) => {
	if (status === 403) return PROBLEM.adminsOnly;
	if (status === 503 && String(body || '').indexOf('admin Seerr session') >= 0) return PROBLEM.needsAdminSeerr;
	if (status === 404 || status === 503) return PROBLEM.notConfigured;
	return PROBLEM.failed;
};

const PROBLEM_ORDER = [PROBLEM.adminsOnly, PROBLEM.needsAdminSeerr, PROBLEM.failed, PROBLEM.notConfigured];

// The more telling of two problems, so a missing Radarr doesn't hide that Sonarr needs an admin.
export const worstProblem = (a, b) => PROBLEM_ORDER.find((p) => p === a || p === b) || PROBLEM.failed;

/**
 * Whether the user's calendar settings keep an entry. followedSeriesIds is a Set of the series the
 * user favorited or started, for My shows.
 */
export const calendarAllows = (e, settings, followedSeriesIds) => {
	if (isEpisode(e)) {
		if (settings.calendarShowEpisodes === false) return false;
		if (settings.calendarShowSpecials !== true && e.seasonNumber === 0) return false;
		if (settings.calendarScope === 'myShows' && !(followedSeriesIds && followedSeriesIds.has(e.itemId))) return false;
	} else {
		if (settings.calendarShowMovies === false) return false;
		if (e.release === 'cinema' && settings.radarrCalendarShowCinema === false) return false;
		if (e.release === 'digital' && settings.radarrCalendarShowDigital === false) return false;
		if (e.release === 'physical' && settings.radarrCalendarShowPhysical === false) return false;
	}
	// A picked library hides titles the server couldn't place in any library.
	const libraries = Array.isArray(settings.calendarLibraryIds) ? settings.calendarLibraryIds : [];
	if (libraries.length && !e.libraryIds.some((id) => libraries.indexOf(id) >= 0)) return false;
	return true;
};

/** A series' watch state as the calendar reads it, from the item the server sends with user data. */
export const seriesProgressOf = (item) => {
	const data = item?.UserData;
	if (!data) return null;
	const unplayed = int(data.UnplayedItemCount) || 0;
	const total = int(item.RecursiveItemCount);
	return {
		favorite: data.IsFavorite === true,
		started: data.Played === true || (total != null && unplayed < total) || data.LastPlayedDate != null,
		unplayed
	};
};

export const followsSeries = (p) => Boolean(p && (p.favorite || p.started));
export const behindOnSeries = (p) => Boolean(p && p.started && p.unplayed > 0);

export const entriesOn = (entries, day) => entries.filter((e) => sameDay(e.day, day));

export const upcomingOf = (entries, today) => entries.filter((e) => e.day >= today);

export const recentOf = (entries, today) => entries.filter((e) => e.day < today).reverse();

export const nextOf = (entries, now) => entries.find((e) => !inLibrary(e) && airedAt(e) > now) || null;

export const readyToWatchOf = (entries, today) => {
	const cutoff = addDays(today, 1);
	return entries.filter((e) => e.day < cutoff && inLibrary(e)).reverse();
};

export const thisWeekOf = (entries, today, now) => {
	const end = addDays(today, 7);
	return entries.filter((e) => e.day >= today && e.day < end && !inLibrary(e) && (!e.hasTime || e.date > now));
};

/** The local days the month grid draws for the month holding monthStart, whole weeks from weekStart (0 Sunday). */
export const monthGridDays = (monthStart, weekStart) => {
	const first = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
	const lead = (first.getDay() - weekStart + 7) % 7;
	const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
	const rows = Math.ceil((lead + daysInMonth) / 7);
	const out = [];
	for (let i = 0; i < rows * 7; i++) out.push(new Date(first.getFullYear(), first.getMonth(), 1 - lead + i));
	return out;
};

// Whether an upcoming episode is the one right after season, episode. A next season already in the
// library only plays once the finale ends, so anything further along means more to watch first.
export const followsEpisode = (info, season, episode) => {
	if (!info || season == null || episode == null) return false;
	return (info.seasonNumber === season && info.episodeNumber === episode + 1) ||
		(info.seasonNumber === season + 1 && info.episodeNumber === 1);
};

/** Calendar days from from's date to to's date, 1 for tomorrow, safe across a daylight saving change. */
export const daysBetween = (from, to) => Math.round(
	(Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / 86400000
);

/** Like "Today (Nov 3)" or "In 6 days (Nov 11)". */
export const airsText = (date, now = new Date(), dateFormat) => {
	const days = daysBetween(now, date);
	const when = days === 0 ? $L('Today') : days === 1 ? $L('Tomorrow') : $L('In {days} days').replace('{days}', String(days));
	return `${when} (${formatShortDate(date, dateFormat)})`;
};
