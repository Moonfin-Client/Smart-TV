import $L from '@enact/i18n/$L';
import {fetchArrCalendar} from '../services/externalRowsApi';
import {fetchWithTimeout} from './fetchTimeout';

const DAYS = [
	'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];
const MONTHS = [
	'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
	'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

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

const seriesCache = new Map();

const sonarrCalendarByTvdb = new Map();
const sonarrCalendarByTmdb = new Map();
let lastSonarrFetch = 0;
const SONARR_CACHE_TTL_MS = 30 * 60 * 1000;

export const clearUpcomingEpisodeCache = () => {
	seriesCache.clear();
	sonarrCalendarByTvdb.clear();
	sonarrCalendarByTmdb.clear();
	lastSonarrFetch = 0;
};

const isoDate = (offsetDays) => {
	const d = new Date();
	d.setDate(d.getDate() + offsetDays);
	return d.toISOString().slice(0, 10);
};

const ensureSonarrCalendar = async () => {
	const now = Date.now();
	if (lastSonarrFetch && (now - lastSonarrFetch < SONARR_CACHE_TTL_MS)) {
		return;
	}

	const episodes = await fetchArrCalendar('sonarr', isoDate(0), isoDate(90));

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
		void err;
	}

	if (tmdbId) {
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
				void err;
			}
		}

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
				void err;
			}
		}
	}

	// A miss is worth remembering too, so the same series is not looked up again.
	seriesCache.set(seriesId, null);
	return null;
};
