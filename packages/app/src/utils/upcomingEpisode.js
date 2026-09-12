import $L from '@enact/i18n/$L';
import * as seerrApi from '../services/seerrApi';
import {fetchWithTimeout} from './fetchTimeout';

const DAYS = [
	'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];
const MONTHS = [
	'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
	'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/**
 * Formats an upcoming episode release into intuitive relative dates
 * (Today, Tomorrow, localized weekday, or localized month + day)
 * alongside season and episode code (e.g. Next: Today (S2:E1)).
 */
export const formatUpcomingEpisode = (info, now = new Date()) => {
	if (!info || !info.airDate) return null;
	const {airDate, seasonNumber, episodeNumber} = info;
	const target = new Date(airDate);
	if (Number.isNaN(target.getTime())) return null;

	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
	const diffDays = Math.round((targetDay - today) / (1000 * 60 * 60 * 24));

	let dateStr;
	if (diffDays === 0) {
		dateStr = $L('Today');
	} else if (diffDays === 1) {
		dateStr = $L('Tomorrow');
	} else if (diffDays > 1 && diffDays < 7) {
		dateStr = $L(DAYS[target.getDay()]);
	} else {
		dateStr = `${$L(MONTHS[target.getMonth()])} ${target.getDate()}`;
	}

	const epCode = seasonNumber != null && episodeNumber != null ? ` (S${seasonNumber}:E${episodeNumber})` : '';
	return `${$L('Next')}: ${dateStr}${epCode}`;
};

// In-memory cache per series Id (resets on app reload / session)
const seriesCache = new Map();

// In-memory Sonarr calendar cache: tvdbId -> earliest UpcomingEpisode
let sonarrCalendarByTvdb = new Map();
let sonarrCalendarByTmdb = new Map();
let lastSonarrFetch = 0;
const SONARR_CACHE_TTL_MS = 30 * 60 * 1000;

export const clearUpcomingEpisodeCache = () => {
	seriesCache.clear();
	sonarrCalendarByTvdb.clear();
	sonarrCalendarByTmdb.clear();
	lastSonarrFetch = 0;
};

const pickDefaultServer = (servers) => {
	if (!Array.isArray(servers) || servers.length === 0) return null;
	return servers.find((s) => s.isDefault && !s.is4k) || servers.find((s) => !s.is4k) || servers[0];
};

const arrBaseUrl = (server) => {
	const scheme = server.useSsl ? 'https' : 'http';
	const base = (server.baseUrl || '').replace(/\/$/, '');
	return `${scheme}://${server.hostname}:${server.port}${base}`;
};

const isoDate = (offsetDays) => {
	const d = new Date();
	d.setDate(d.getDate() + offsetDays);
	return d.toISOString().slice(0, 10);
};

const ensureSonarrCalendar = async () => {
	const now = Date.now();
	if (lastSonarrFetch && (now - lastSonarrFetch < SONARR_CACHE_TTL_MS) && sonarrCalendarByTvdb.size > 0) {
		return;
	}

	let servers = [];
	try {
		servers = await seerrApi.getSonarrSettings();
	} catch (err) {
		void err;
		return;
	}

	const server = pickDefaultServer(servers);
	if (!server || !server.apiKey) return;

	const url = `${arrBaseUrl(server)}/api/v3/calendar?apikey=${encodeURIComponent(server.apiKey)}&start=${isoDate(0)}&end=${isoDate(90)}&includeSeries=true`;
	let episodes = [];
	try {
		const res = await fetchWithTimeout(url, {}, 5000);
		if (res.ok) {
			const data = await res.json();
			if (Array.isArray(data)) episodes = data;
		}
	} catch (err) {
		void err;
		return;
	}

	sonarrCalendarByTvdb.clear();
	sonarrCalendarByTmdb.clear();

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	for (const ep of episodes) {
		const series = ep.series || {};
		const tvdbId = series.tvdbId ? String(series.tvdbId) : null;
		const tmdbId = series.tmdbId ? String(series.tmdbId) : null;
		if (!tvdbId && !tmdbId) continue;

		const air = ep.airDateUtc || ep.airDate;
		if (!air) continue;
		const airDate = new Date(air);
		if (Number.isNaN(airDate.getTime()) || airDate < today) continue;

		const info = {
			seasonNumber: ep.seasonNumber ?? 1,
			episodeNumber: ep.episodeNumber ?? 1,
			airDate: air,
			title: ep.title || null
		};

		if (tvdbId) {
			const existing = sonarrCalendarByTvdb.get(tvdbId);
			if (!existing || new Date(existing.airDate) > airDate) {
				sonarrCalendarByTvdb.set(tvdbId, info);
			}
		}

		if (tmdbId) {
			const existing = sonarrCalendarByTmdb.get(tmdbId);
			if (!existing || new Date(existing.airDate) > airDate) {
				sonarrCalendarByTmdb.set(tmdbId, info);
			}
		}
	}

	lastSonarrFetch = Date.now();
};

/**
 * Resolves upcoming episode release information for a series.
 * Prioritizes Sonarr Calendar, falling back to TMDB.
 */
export const fetchUpcomingEpisode = async ({item, settings, serverUrl, serverToken}) => {
	if (!item) return null;
	const seriesId = item.Type === 'Series' ? item.Id : (item.SeriesId || item.Id);
	if (!seriesId) return null;

	if (seriesCache.has(seriesId)) {
		return seriesCache.get(seriesId);
	}

	const providerIds = item.ProviderIds || {};
	const tvdbId = providerIds.Tvdb || providerIds.tvdb;
	const tmdbId = providerIds.Tmdb || providerIds.tmdb;

	// 1. Tier 1: Sonarr Calendar
	try {
		await ensureSonarrCalendar();
		let sonarrMatch = null;
		if (tvdbId && sonarrCalendarByTvdb.has(String(tvdbId))) {
			sonarrMatch = sonarrCalendarByTvdb.get(String(tvdbId));
		} else if (tmdbId && sonarrCalendarByTmdb.has(String(tmdbId))) {
			sonarrMatch = sonarrCalendarByTmdb.get(String(tmdbId));
		}

		if (sonarrMatch) {
			seriesCache.set(seriesId, sonarrMatch);
			return sonarrMatch;
		}
	} catch (err) {
		console.warn('[UpcomingEpisode] Sonarr lookup failed:', err);
	}

	// 2. Tier 2: TMDB Fallback
	if (tmdbId) {
		// Option A: Direct TMDB API key if configured
		if (settings?.tmdbApiKey) {
			try {
				const res = await fetchWithTimeout(
					`https://api.themoviedb.org/3/tv/${encodeURIComponent(tmdbId)}?api_key=${encodeURIComponent(settings.tmdbApiKey)}`,
					{},
					5000
				);
				if (res.ok) {
					const data = await res.json();
					const nextEp = data.next_episode_to_air;
					if (nextEp?.air_date) {
						const info = {
							seasonNumber: nextEp.season_number ?? 1,
							episodeNumber: nextEp.episode_number ?? 1,
							airDate: nextEp.air_date,
							title: nextEp.name || null
						};
						seriesCache.set(seriesId, info);
						return info;
					}
				}
			} catch (err) {
				console.warn('[UpcomingEpisode] TMDB direct fetch failed:', err);
			}
		}

		// Option B: Moonbase server proxy
		if (settings?.useMoonfinPlugin && serverUrl && serverToken) {
			try {
				const proxyUrl = `${serverUrl}/Moonfin/Tmdb/NextEpisode?tmdbId=${encodeURIComponent(tmdbId)}`;
				const res = await fetchWithTimeout(
					proxyUrl,
					{
						headers: {
							Authorization: `MediaBrowser Token="${serverToken}"`
						}
					},
					5000
				);
				if (res.ok) {
					const data = await res.json();
					if (data.success && data.airDate) {
						const info = {
							seasonNumber: data.seasonNumber ?? 1,
							episodeNumber: data.episodeNumber ?? 1,
							airDate: data.airDate,
							title: data.name || null
						};
						seriesCache.set(seriesId, info);
						return info;
					}
				}
			} catch (err) {
				console.warn('[UpcomingEpisode] Moonbase proxy fetch failed:', err);
			}
		}
	}

	// Cache negative result to prevent duplicate network calls
	seriesCache.set(seriesId, null);
	return null;
};
