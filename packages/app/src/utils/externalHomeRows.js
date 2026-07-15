import $L from '@enact/i18n/$L';
import seerrApi from '../services/seerrApi';
import {fetchCustomRow, constructSourceUrl} from '../services/externalRowsApi';

const HOME_ROW_LIMIT = 20;

// The 13 TMDB chart presets. `type` is the literal TMDB API path the plugin
// proxies (source=tmdb_chart).
export const TMDB_PRESETS = [
	{id: 'tmdb_popular_movies', title: $L('Popular Movies'), type: 'movie/popular'},
	{id: 'tmdb_top_rated_movies', title: $L('Top Rated Movies'), type: 'movie/top_rated'},
	{id: 'tmdb_now_playing_movies', title: $L('Now Playing Movies'), type: 'movie/now_playing'},
	{id: 'tmdb_upcoming_movies', title: $L('Upcoming Movies'), type: 'movie/upcoming'},
	{id: 'tmdb_popular_tv', title: $L('Popular TV'), type: 'tv/popular'},
	{id: 'tmdb_top_rated_tv', title: $L('Top Rated TV'), type: 'tv/top_rated'},
	{id: 'tmdb_airing_today_tv', title: $L('Airing Today TV'), type: 'tv/airing_today'},
	{id: 'tmdb_on_the_air_tv', title: $L('On The Air TV'), type: 'tv/on_the_air'},
	{id: 'tmdb_trending_movie_daily', title: $L('Trending Movies (Daily)'), type: 'trending/movie/day'},
	{id: 'tmdb_trending_movie_weekly', title: $L('Trending Movies (Weekly)'), type: 'trending/movie/week'},
	{id: 'tmdb_trending_tv_daily', title: $L('Trending TV (Daily)'), type: 'trending/tv/day'},
	{id: 'tmdb_trending_tv_weekly', title: $L('Trending TV (Weekly)'), type: 'trending/tv/week'},
	{id: 'tmdb_trending_all_weekly', title: $L('Trending All (Weekly)'), type: 'trending/all/week'}
];

// Descriptors for the preset toggle list. IMDb charts are handled separately by
// the existing Personalization IMDb Lists, so they are not repeated here. Custom
// rows and calendars are configured separately and carry their own descriptors.
export const getExternalHomeRowConfigs = () => ([
	...TMDB_PRESETS.map((p) => ({...p, source: 'tmdb_chart', section: 'tmdb'}))
]);

const findPreset = (id) => getExternalHomeRowConfigs().find((c) => c.id === id) || null;

const yearOf = (item) => {
	const year = parseInt(String(item.productionYear || '').slice(0, 4), 10);
	return Number.isFinite(year) ? year : undefined;
};

// Maps a plugin CustomRows item into a pseudo Jellyfin item. It carries
// ProviderIds so it can be resolved to a real library item, and _seerr markers
// so unresolved items fall back to the Seerr request detail.
const normalizeExternalItem = (item, rowId) => {
	const mediaType = item.type === 'Series' ? 'tv' : 'movie';
	const tmdbId = item.providerIds?.Tmdb || null;
	const imdbId = item.providerIds?.Imdb || null;
	const key = tmdbId || imdbId || item.name;
	return {
		Id: `ext-${rowId}-${key}`,
		Name: item.name,
		Type: item.type === 'Series' ? 'Series' : 'Movie',
		ProductionYear: yearOf(item),
		ProviderIds: item.providerIds,
		UserRating: item.userRating,
		_externalPosterUrl: item.posterUrl ? seerrApi.getImageUrl(item.posterUrl, 'w342') : null,
		_externalBackdropUrl: item.backdropUrl ? seerrApi.getImageUrl(item.backdropUrl, 'w780') : null,
		_external: true,
		mediaInfo: {},
		_seerr: true,
		_seerrType: 'item',
		_seerrMediaType: mediaType,
		_seerrRaw: tmdbId ? {mediaId: Number(tmdbId), mediaType} : null
	};
};

// Client side sorting for custom rows.
const applySorting = (items, sortBy, sortOrder) => {
	if (!sortBy || sortBy === 'none') return items;
	const sorted = [...items];
	if (sortBy === 'shuffle') {
		for (let i = sorted.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[sorted[i], sorted[j]] = [sorted[j], sorted[i]];
		}
		return sorted;
	}
	const dir = sortOrder === 'desc' ? -1 : 1;
	sorted.sort((a, b) => {
		let av;
		let bv;
		switch (sortBy) {
			case 'title': av = (a.name || '').toLowerCase(); bv = (b.name || '').toLowerCase(); break;
			case 'year': av = a.productionYear || 0; bv = b.productionYear || 0; break;
			case 'rating': av = a.rating || 0; bv = b.rating || 0; break;
			case 'popularity':
			default: av = a.rank || 0; bv = b.rank || 0; break;
		}
		if (av < bv) return -1 * dir;
		if (av > bv) return 1 * dir;
		return 0;
	});
	return sorted;
};

// Fetches a preset TMDB or IMDb chart row.
export const fetchExternalPresetRow = async (rowId, options = {}) => {
	const cfg = findPreset(rowId);
	if (!cfg) return [];
	const items = await fetchCustomRow({source: cfg.source, type: cfg.type, params: {}}, options);
	return items.slice(0, HOME_ROW_LIMIT).map((it) => normalizeExternalItem(it, rowId));
};

// Fetches a user configured custom row. `row` is the stored config
// {id, source, type, params, sortBy, sortOrder, showUserRatings}.
export const fetchCustomHomeRow = async (row, options = {}) => {
	const items = await fetchCustomRow({source: row.source, type: row.type, params: row.params}, options);
	const sorted = applySorting(items, row.sortBy, row.sortOrder);
	return sorted.slice(0, HOME_ROW_LIMIT).map((it) => {
		const norm = normalizeExternalItem(it, row.id);
		if (!row.showUserRatings) norm.UserRating = null;
		return norm;
	});
};

// Detects the source, type and params from a pasted list URL so the user can
// add a custom row by URL instead of picking source and type manually.
export const detectCustomSource = (url) => {
	const raw = String(url || '').trim();
	if (!raw) return {error: $L('Enter a list URL.')};

	let m = raw.match(/themoviedb\.org\/list\/(\d+)/i);
	if (m) return {source: 'tmdb', type: 'user_list', params: {id: m[1]}};

	m = raw.match(/themoviedb\.org\/collection\/(\d+)/i);
	if (m) return {source: 'tmdb', type: 'movie_collection', params: {id: m[1]}};

	m = raw.match(/mdblist\.com\/lists\/([^/]+)\/([^/?#]+)/i);
	if (m) return {source: 'mdblist', type: 'list_url', params: {username: m[1], listname: m[2]}};

	m = raw.match(/letterboxd\.com\/([^/?#]+)/i);
	if (m) return {source: 'letterboxd', type: 'user_diary', params: {user: m[1]}};

	return {error: $L('Unrecognized URL. Use a TMDB list/collection, MDBList list, or Letterboxd profile URL.')};
};

// Upcoming calendars are fetched directly from the arr servers using the
// connection details stored in Seerr. This is a cross origin request, so it
// depends on the TV webview allowing it.

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

const posterFrom = (images) => {
	if (!Array.isArray(images)) return null;
	const poster = images.find((i) => i.coverType === 'poster') || images.find((i) => i.coverType === 'fanart');
	return poster ? (poster.remoteUrl || poster.url || null) : null;
};

const formatCalendarDate = (dateStr) => {
	if (!dateStr) return '';
	const d = new Date(dateStr);
	if (Number.isNaN(d.getTime())) return '';
	return d.toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
};

const arrGet = async (url) => {
	try {
		const res = await fetch(url);
		if (!res.ok) return [];
		const data = await res.json();
		return Array.isArray(data) ? data : [];
	} catch (err) {
		console.warn('[Calendar] Fetch failed:', err);
		return [];
	}
};

const fetchRadarrItems = async (settings) => {
	let servers = [];
	try {
		servers = await seerrApi.getRadarrSettings();
	} catch (err) {
		void err;
		return [];
	}
	const server = pickDefaultServer(servers);
	if (!server || !server.apiKey) return [];

	const url = `${arrBaseUrl(server)}/api/v3/calendar?apikey=${encodeURIComponent(server.apiKey)}&start=${isoDate(0)}&end=${isoDate(90)}&unmonitored=true`;
	const items = await arrGet(url);

	const results = [];
	for (const m of items) {
		const dates = [];
		if (settings.radarrCalendarShowCinema && m.inCinemas) dates.push(m.inCinemas);
		if (settings.radarrCalendarShowDigital && m.digitalRelease) dates.push(m.digitalRelease);
		if (settings.radarrCalendarShowPhysical && m.physicalRelease) dates.push(m.physicalRelease);
		const upcoming = dates.map((d) => new Date(d)).filter((d) => !Number.isNaN(d.getTime()) && d >= new Date());
		if (!upcoming.length) continue;
		const soonest = upcoming.sort((a, b) => a - b)[0];
		const tmdbId = m.tmdbId ? String(m.tmdbId) : null;
		results.push({
			Id: `cal-radarr-${tmdbId || m.id}`,
			Name: m.title,
			Type: 'Movie',
			ProductionYear: m.year || undefined,
			ProviderIds: {Tmdb: tmdbId},
			_externalPosterUrl: posterFrom(m.images),
			_external: true,
			_calendarDate: soonest.toISOString(),
			Subtitle: settings.radarrCalendarShowDate ? formatCalendarDate(soonest.toISOString()) : '',
			mediaInfo: {},
			_seerr: true,
			_seerrType: 'item',
			_seerrMediaType: 'movie',
			_seerrRaw: tmdbId ? {mediaId: Number(tmdbId), mediaType: 'movie'} : null
		});
	}
	return results;
};

const fetchSonarrItems = async (settings) => {
	let servers = [];
	try {
		servers = await seerrApi.getSonarrSettings();
	} catch (err) {
		void err;
		return [];
	}
	const server = pickDefaultServer(servers);
	if (!server || !server.apiKey) return [];

	const url = `${arrBaseUrl(server)}/api/v3/calendar?apikey=${encodeURIComponent(server.apiKey)}&start=${isoDate(0)}&end=${isoDate(90)}&includeSeries=true`;
	const episodes = await arrGet(url);

	// Keep the earliest upcoming episode per series.
	const bySeries = {};
	for (const ep of episodes) {
		const series = ep.series || {};
		const key = series.tvdbId || series.id;
		if (!key) continue;
		const air = ep.airDateUtc || ep.airDate;
		if (!air) continue;
		const airDate = new Date(air);
		if (Number.isNaN(airDate.getTime()) || airDate < new Date()) continue;
		if (!bySeries[key] || airDate < new Date(bySeries[key].air)) {
			bySeries[key] = {ep, series, air};
		}
	}

	return Object.values(bySeries).map(({ep, series, air}) => {
		const tmdbId = series.tmdbId ? String(series.tmdbId) : null;
		const epInfo = settings.sonarrCalendarShowEpisodeInfo && ep.seasonNumber != null && ep.episodeNumber != null
			? `S${ep.seasonNumber}E${ep.episodeNumber}` : '';
		const dateStr = settings.sonarrCalendarShowDate ? formatCalendarDate(air) : '';
		const subtitle = [epInfo, dateStr].filter(Boolean).join(' - ');
		return {
			Id: `cal-sonarr-${tmdbId || series.id}`,
			Name: series.title,
			Type: 'Series',
			ProductionYear: series.year || undefined,
			ProviderIds: {Tmdb: tmdbId},
			_externalPosterUrl: posterFrom(series.images),
			_external: true,
			_calendarDate: new Date(air).toISOString(),
			Subtitle: subtitle,
			mediaInfo: {},
			_seerr: true,
			_seerrType: 'item',
			_seerrMediaType: 'tv',
			_seerrRaw: tmdbId ? {mediaId: Number(tmdbId), mediaType: 'tv'} : null
		};
	});
};

const byCalendarDate = (a, b) => new Date(a._calendarDate) - new Date(b._calendarDate);

// Builds the upcoming calendar rows from settings, honoring the merge option.
export const fetchCalendarRows = async (settings) => {
	const rows = [];
	const radarrItems = settings.enableRadarrCalendar ? await fetchRadarrItems(settings) : [];
	const sonarrItems = settings.enableSonarrCalendar ? await fetchSonarrItems(settings) : [];

	if (settings.enableRadarrCalendar && settings.enableSonarrCalendar && settings.mergeRadarrSonarrCalendars) {
		const merged = [...radarrItems, ...sonarrItems].sort(byCalendarDate);
		if (merged.length) rows.push({id: 'external-calendar-merged', title: $L('Upcoming Releases'), items: merged, isExternalRow: true});
		return rows;
	}

	if (radarrItems.length) rows.push({id: 'external-calendar-radarr', title: $L('Upcoming Movies'), items: radarrItems.sort(byCalendarDate), isExternalRow: true});
	if (sonarrItems.length) rows.push({id: 'external-calendar-sonarr', title: $L('Upcoming Episodes'), items: sonarrItems.sort(byCalendarDate), isExternalRow: true});
	return rows;
};

// Validates a configured custom row by fetching it. Returns {ok} or {error}.
export const validateCustomRow = async (row) => {
	const items = await fetchCustomRow({source: row.source, type: row.type, params: row.params}, {forceRefresh: true});
	if (items.length > 0) return {ok: true};
	return {error: $L('That list returned no items. Check the URL: {url}').replace('{url}', constructSourceUrl(row.source, row.type, row.params))};
};
