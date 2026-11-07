import $L from '@enact/i18n/$L';
import seerrApi from '../services/seerrApi';
import {fetchCustomRow, constructSourceUrl} from '../services/externalRowsApi';
import {airsText, daysBetween} from './calendarEntries';
import {fetchWithTimeout} from './fetchTimeout';
import {seasonalTitle} from './seasonalTitles';

const HOME_ROW_LIMIT = 20;
const VALIDATE_TIMEOUT_MS = 45000;

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

export const IMDB_PRESETS = [
	{id: 'imdb-top250-movies', title: $L('IMDb Top 250 Movies'), type: 'imdb_top_250_movies'},
	{id: 'imdb-top250-tv', title: $L('IMDb Top 250 TV Shows'), type: 'imdb_top_250_tv_shows'},
	{id: 'imdb-popular-movies', title: $L('IMDb Most Popular Movies'), type: 'imdb_most_popular_movies'},
	{id: 'imdb-popular-tv', title: $L('IMDb Most Popular TV Shows'), type: 'imdb_most_popular_tv_shows'},
	{id: 'imdb-lowest-rated', title: $L('IMDb Lowest Rated Movies'), type: 'imdb_lowest_rated_movies'},
	{id: 'imdb-top-english', title: $L('IMDb Top Rated English Movies'), type: 'imdb_top_english_movies'}
];

// Descriptors for the preset toggle list. Custom rows and calendars are configured
// separately and carry their own descriptors.
export const getExternalHomeRowConfigs = () => ([
	...TMDB_PRESETS.map((p) => ({...p, source: 'tmdb_chart', section: 'tmdb'})),
	...IMDB_PRESETS.map((p) => ({...p, source: 'imdb', section: 'imdb'}))
]);

const findPreset = (id) => getExternalHomeRowConfigs().find((c) => c.id === id) || null;

const yearOf = (item) => {
	const year = parseInt(String(item.productionYear || item.year || item.release_date || '').slice(0, 4), 10);
	return Number.isFinite(year) ? year : undefined;
};

const getSourceName = (source, rowId) => {
	const src = String(source || rowId || '').toLowerCase();
	if (src.includes('tmdb')) return 'TMDB';
	if (src.includes('imdb')) return 'IMDb';
	if (src.includes('letterboxd')) return 'Letterboxd';
	if (src.includes('trakt')) return 'Trakt';
	if (src.includes('mdblist')) return 'MDBList';
	if (src.includes('radarr')) return 'Radarr';
	if (src.includes('sonarr')) return 'Sonarr';
	if (src.includes('seerr')) return 'Seerr';
	return source || rowId || '';
};

// What a tap on the item hands to Seerr. A TMDB id names the title directly, an
// IMDb id needs the detail screen to resolve it by search, so the title rides
// along as the fallback query.
const seerrRawFor = (tmdbId, imdbId, title, mediaType) => {
	if (tmdbId) return {mediaId: Number(tmdbId), mediaType};
	if (imdbId) return {imdbId, title, mediaType};
	return null;
};

// Maps a plugin CustomRows item into a pseudo Jellyfin item. It carries
// ProviderIds so it can be resolved to a real library item, and _seerr markers
// so unresolved items fall back to the Seerr request detail.
const normalizeExternalItem = (item, rowId, source) => {
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
		OfficialRating: item.officialRating ?? null,
		Overview: item.overview || null,
		CommunityRating: item.rating ?? null,
		Popularity: item.popularity ?? null,
		Genres: Array.isArray(item.genres) ? item.genres : [],
		RunTimeTicks: item.runTimeTicks ?? null,
		_externalPosterUrl: item.posterUrl ? seerrApi.getImageUrl(item.posterUrl, 'w342') : null,
		_externalBackdropUrl: item.backdropUrl ? seerrApi.getImageUrl(item.backdropUrl, 'w780') : null,
		_external: true,
		_serverName: getSourceName(source, rowId),
		mediaInfo: {},
		_seerr: true,
		_seerrType: 'item',
		_seerrMediaType: mediaType,
		_seerrRaw: seerrRawFor(tmdbId, imdbId, item.name, mediaType)
	};
};

// The seasonal row as Browse draws it. Owned movies are library items already and stay as
// they came, so their cards build server image URLs and a select opens them to play.
// Suggestions become Seerr cards, marked so a blocked rating also hides an unrated one.
export const buildSeasonalRow = (payload, hiddenHolidays = []) => {
	if (!payload?.holiday || hiddenHolidays.includes(payload.holiday)) return null;
	const owned = (payload.items || []).filter((item) => item && item.Id);
	const suggestions = (payload.suggestions || []).map((item) => ({
		...normalizeExternalItem(item, 'seasonal', 'seerr'),
		_strictRating: true
	}));
	const items = [...owned, ...suggestions];
	if (items.length === 0) return null;
	return {
		id: 'seasonal',
		holiday: payload.holiday,
		// Silo names its own seasonal section.
		title: payload.title || seasonalTitle(payload.holiday),
		items,
		isExternalRow: true,
		isSeasonalRow: true
	};
};

export const formatWatchingNowSubtitle = (data) => {
	if (!data) return '';
	const usersStr = Number(data.users || 0).toLocaleString();
	const moviesStr = Number(data.movies || 0).toLocaleString();
	const showsStr = Number(data.shows || 0).toLocaleString();
	if (data.mode === 'today') {
		return $L('{users} watched today \u00b7 {movies} movies \u00b7 {shows} shows')
			.replace('{users}', usersStr)
			.replace('{movies}', moviesStr)
			.replace('{shows}', showsStr);
	}
	return $L('{users} watching now \u00b7 {movies} movies \u00b7 {shows} shows')
		.replace('{users}', usersStr)
		.replace('{movies}', moviesStr)
		.replace('{shows}', showsStr);
};

export const normalizeWatchingNowItem = (item, index) => {
	const isShow = item.media_type === 'show';
	const mediaType = isShow ? 'tv' : 'movie';
	const tmdbId = item.tmdb_id ? String(item.tmdb_id) : null;
	const imdbId = item.imdb_id || null;
	const key = imdbId || tmdbId || item.public_id || String(index);
	const rank = index + 1;
	return {
		Id: `ext-mdblist-watching-${key}`,
		Name: item.title,
		Type: isShow ? 'Series' : 'Movie',
		ProductionYear: yearOf(item),
		Rank: rank,
		Watchers: item.watchers || 0,
		ProviderIds: {
			...(imdbId ? {Imdb: imdbId} : {}),
			...(tmdbId ? {Tmdb: tmdbId} : {})
		},
		_externalBackdropUrl: item.backdrop || null,
		_externalPosterUrl: item.backdrop || item.poster || null,
		_externalLogoUrl: item.logo || null,
		_external: true,
		mediaInfo: {},
		_seerr: true,
		_seerrType: 'item',
		_seerrMediaType: mediaType,
		_seerrRaw: seerrRawFor(tmdbId, imdbId, item.title, mediaType)
	};
};

const shuffled = (items) => {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
};

// Client side sorting for custom rows.
const applySorting = (items, sortBy, sortOrder) => {
	if (!sortBy || sortBy === 'none') return items;
	if (sortBy === 'shuffle') return shuffled(items);
	const sorted = [...items];
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

const EXTERNAL_SORT_KEYS = {
	releaseDate: (item) => item.ProductionYear || 0,
	rating: (item) => item.CommunityRating || 0,
	popularity: (item) => item.Popularity || 0
};

// The order the IMDb, TMDB and Seerr rows' sort settings ask for. Ties go to the name, since a
// release date is often only a year.
export const sortExternalItems = (items, sortBy, sortOrder) => {
	if (!sortBy || sortBy === 'none' || !items.length) return items;
	if (sortBy === 'shuffle') return shuffled(items);
	const byName = (a, b) => {
		const x = (a.Name || '').toLowerCase();
		const y = (b.Name || '').toLowerCase();
		return x < y ? -1 : x > y ? 1 : 0;
	};
	const key = EXTERNAL_SORT_KEYS[sortBy];
	const dir = sortOrder === 'descending' ? -1 : 1;
	return [...items].sort((a, b) => {
		const cmp = key ? key(a) - key(b) : byName(a, b);
		return cmp === 0 ? byName(a, b) : cmp * dir;
	});
};

// TMDB's movie and TV charts don't say what each result is, so the chart's path decides.
// Trending says per result, which matters for the list that mixes both.
const chartItemType = (path) => {
	if (/^(trending\/)?tv\//.test(path)) return 'Series';
	if (/^(trending\/)?movie\//.test(path)) return 'Movie';
	return null;
};

// Fetches a preset TMDB or IMDb chart row. The whole chart is sorted before the row is cut to size.
export const fetchExternalPresetRow = async (rowId, options = {}) => {
	const cfg = findPreset(rowId);
	if (!cfg) return [];
	const items = await fetchCustomRow({source: cfg.source, type: cfg.type, params: {}}, options);
	const type = chartItemType(cfg.type);
	const limit = options.limit || HOME_ROW_LIMIT;
	const pool = options.sortBy && options.sortBy !== 'none' ? items : items.slice(0, limit);
	const normalized = pool.map((it) => normalizeExternalItem(type ? {...it, type} : it, rowId, cfg.source));
	return sortExternalItems(normalized, options.sortBy, options.sortOrder).slice(0, limit);
};

// Fetches a user configured custom row. `row` is the stored config
// {id, source, type, params, sortBy, sortOrder, showUserRatings}.
export const fetchCustomHomeRow = async (row, options = {}) => {
	const items = await fetchCustomRow({source: row.source, type: row.type, params: row.params}, options);
	const sorted = applySorting(items, row.sortBy, row.sortOrder);
	return sorted.slice(0, options.limit || HOME_ROW_LIMIT).map((it) => {
		const norm = normalizeExternalItem(it, row.id, row.source);
		if (row.showUserRatings === false) norm.UserRating = null;
		return norm;
	});
};

// The manual builder picks a source instead of pasting a URL. Each key maps to
// the same source and type shapes detectCustomSource produces.
export const buildManualCustomSource = (sourceKey, paramA, paramB) => {
	const a = String(paramA || '').trim();
	const b = String(paramB || '').trim();
	if (sourceKey === 'tmdb_list') {
		if (!/^\d+$/.test(a)) return {error: $L('Enter a numeric TMDB list ID.')};
		return {source: 'tmdb', type: 'user_list', params: {id: a}};
	}
	if (sourceKey === 'tmdb_collection') {
		if (!/^\d+$/.test(a)) return {error: $L('Enter a numeric TMDB collection ID.')};
		return {source: 'tmdb', type: 'movie_collection', params: {id: a}};
	}
	if (sourceKey === 'mdblist') {
		if (!a || !b) return {error: $L('Enter the MDBList username and list name.')};
		return {source: 'mdblist', type: 'list_url', params: {username: a, listname: b}};
	}
	if (sourceKey === 'letterboxd') {
		if (!a) return {error: $L('Enter a Letterboxd username.')};
		return {source: 'letterboxd', type: 'user_diary', params: {user: a.toLowerCase()}};
	}
	return {error: $L('Pick a source.')};
};

// Which builder source key a stored row belongs to, for the edit flow.
export const sourceKeyForRow = (row) => {
	if (row?.source === 'tmdb') return row.type === 'movie_collection' ? 'tmdb_collection' : 'tmdb_list';
	if (row?.source === 'mdblist') return 'mdblist';
	if (row?.source === 'letterboxd') return 'letterboxd';
	return 'tmdb_list';
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

// Radarr gives a release as midnight UTC on its day, which is the day before anywhere west of
// UTC, so the day is read as it's written.
const releaseDay = (date) => new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

const arrGet = async (url) => {
	try {
		const res = await fetchWithTimeout(url, {}, 5000);
		if (!res.ok) return [];
		const data = await res.json();
		return Array.isArray(data) ? data : [];
	} catch (err) {
		console.warn('[Calendar] Fetch failed:', err);
		return [];
	}
};

// Moonbase answers with the arr's own JSON and keeps the API key on the server. A plugin without
// the route, or a server the arr isn't linked to, falls back to asking the arr directly.
const radarrCalendar = async () => {
	const proxied = await seerrApi.getArrCalendar('Radarr', {start: isoDate(0), end: isoDate(90), unmonitored: true});
	if (proxied.items) return proxied.items;
	let servers = [];
	try {
		servers = await seerrApi.getRadarrSettings();
	} catch (err) {
		void err;
		return [];
	}
	const server = pickDefaultServer(servers);
	if (!server || !server.apiKey) return [];
	return arrGet(`${arrBaseUrl(server)}/api/v3/calendar?apikey=${encodeURIComponent(server.apiKey)}&start=${isoDate(0)}&end=${isoDate(90)}&unmonitored=true`);
};

const fetchRadarrItems = async (settings) => {
	// On Silo, Silo's own calendar in Radarr's shape.
	const items = await (seerrApi.getSiloCalendar('movie', isoDate(0), isoDate(90)) || radarrCalendar());

	const today = new Date();
	// Cinema dates keep their label, so a date alone never reads as a release on the server. Digital
	// and physical together keep it too, since a stream and a disc can come out months apart.
	const showFormat = settings.radarrCalendarShowCinema || (settings.radarrCalendarShowDigital && settings.radarrCalendarShowPhysical);

	const results = [];
	for (const m of items) {
		// Radarr already has a file for it, so it's on the server and not upcoming.
		if (settings.radarrCalendarHideDownloaded && m.hasFile === true) continue;
		const releases = [];
		if (settings.radarrCalendarShowCinema && m.inCinemas) releases.push({date: new Date(m.inCinemas), format: $L('Cinema')});
		if (settings.radarrCalendarShowDigital && m.digitalRelease) releases.push({date: new Date(m.digitalRelease), format: $L('Digital')});
		if (settings.radarrCalendarShowPhysical && m.physicalRelease) releases.push({date: new Date(m.physicalRelease), format: $L('Physical')});
		// A release stays on the row through its own day.
		const upcoming = releases.filter(({date}) => !Number.isNaN(date.getTime()) && daysBetween(today, releaseDay(date)) >= 0);
		if (!upcoming.length) continue;
		// Two releases on one day go by the later kind, so physical wins.
		const {date: soonest, format} = upcoming.reduce((best, next) => (next.date <= best.date ? next : best));
		const tmdbId = m.tmdbId ? String(m.tmdbId) : null;
		const imdbId = m.imdbId || null;

		const release = airsText(releaseDay(soonest), today, settings.dateFormat);
		const subtitle = settings.radarrCalendarShowDate ? (showFormat ? `${format} \u00b7 ${release}` : release) : '';
		const fanart = m.images?.find((i) => i.coverType === 'fanart');

		results.push({
			Id: `cal-radarr-${tmdbId || m.id}`,
			Name: m.title,
			Type: 'Movie',
			ProductionYear: m.year || undefined,
			ProviderIds: {Tmdb: tmdbId},
			_externalPosterUrl: posterFrom(m.images),
			_externalBackdropUrl: fanart ? (fanart.remoteUrl || fanart.url || null) : null,
			_external: true,
			_calendarDate: soonest.toISOString(),
			Subtitle: subtitle,
			Overview: m.overview || '',
			_serverName: 'Radarr',
			mediaInfo: {},
			_seerr: true,
			_seerrType: 'item',
			_seerrMediaType: 'movie',
			_seerrRaw: seerrRawFor(tmdbId, imdbId, m.title, 'movie')
		});
	}
	return results;
};

const sonarrCalendar = async () => {
	const proxied = await seerrApi.getArrCalendar('Sonarr', {start: isoDate(0), end: isoDate(90)});
	if (proxied.items) return proxied.items;
	let servers = [];
	try {
		servers = await seerrApi.getSonarrSettings();
	} catch (err) {
		void err;
		return [];
	}
	const server = pickDefaultServer(servers);
	if (!server || !server.apiKey) return [];
	return arrGet(`${arrBaseUrl(server)}/api/v3/calendar?apikey=${encodeURIComponent(server.apiKey)}&start=${isoDate(0)}&end=${isoDate(90)}&includeSeries=true`);
};

const fetchSonarrItems = async (settings) => {
	// On Silo, Silo's own calendar in Sonarr's shape.
	const episodes = await (seerrApi.getSiloCalendar('tv', isoDate(0), isoDate(90)) || sonarrCalendar());

	// The first episode per series airing today or later, past the downloaded ones when those are
	// hidden. A series with nothing left drops out of the row.
	const today = new Date();
	const bySeries = {};
	for (const ep of episodes) {
		const series = ep.series || {};
		const key = series.tvdbId || series.id;
		if (!key) continue;
		if (settings.sonarrCalendarHideDownloaded && ep.hasFile === true) continue;
		const air = ep.airDateUtc || ep.airDate;
		if (!air) continue;
		const airDate = new Date(air);
		if (Number.isNaN(airDate.getTime()) || daysBetween(today, airDate) < 0) continue;
		if (!bySeries[key] || airDate < new Date(bySeries[key].air)) {
			bySeries[key] = {ep, series, air};
		}
	}

	return Object.values(bySeries).map(({ep, series, air}) => {
		const tmdbId = series.tmdbId ? String(series.tmdbId) : null;
		const imdbId = series.imdbId || null;
		const epInfo = settings.sonarrCalendarShowEpisodeInfo ? `S${ep.seasonNumber ?? 0}:E${ep.episodeNumber ?? 0}` : '';
		const dateStr = settings.sonarrCalendarShowDate ? airsText(new Date(air), today, settings.dateFormat) : '';
		const subtitle = [epInfo, dateStr].filter(Boolean).join(' \u00b7 ');
		const fanart = series.images?.find((i) => i.coverType === 'fanart');

		return {
			Id: `cal-sonarr-${tmdbId || series.id}`,
			Name: series.title,
			Type: 'Series',
			ProductionYear: series.year || undefined,
			ProviderIds: {Tmdb: tmdbId},
			_externalPosterUrl: posterFrom(series.images),
			_externalBackdropUrl: fanart ? (fanart.remoteUrl || fanart.url || null) : null,
			_external: true,
			_calendarDate: new Date(air).toISOString(),
			Subtitle: subtitle,
			Overview: series.overview || ep.overview || '',
			_serverName: 'Sonarr',
			mediaInfo: {},
			_seerr: true,
			_seerrType: 'item',
			_seerrMediaType: 'tv',
			_seerrRaw: seerrRawFor(tmdbId, imdbId, series.title, 'tv')
		};
	});
};

const byCalendarDate = (a, b) => new Date(a._calendarDate) - new Date(b._calendarDate);

// Builds the upcoming calendar rows, honoring the merge option. The radarr and
// sonarr enable flags come from the unified home layout. Row ids match the plugin
// section names so they share the layout ordering with the built-in rows.
export const fetchCalendarRows = async (settings, {radarrEnabled = false, sonarrEnabled = false} = {}) => {
	const rows = [];
	const radarrItems = radarrEnabled ? await fetchRadarrItems(settings) : [];
	const sonarrItems = sonarrEnabled ? await fetchSonarrItems(settings) : [];

	if (radarrEnabled && sonarrEnabled && settings.mergeRadarrSonarrCalendars) {
		const merged = [...radarrItems, ...sonarrItems].sort(byCalendarDate);
		if (merged.length) rows.push({id: 'radarr_calendar', title: $L('Upcoming Releases'), items: merged, isExternalRow: true, isCalendarMerged: true});
		return rows;
	}

	if (radarrItems.length) rows.push({id: 'radarr_calendar', title: $L('Upcoming Movies'), items: radarrItems.sort(byCalendarDate), isExternalRow: true});
	if (sonarrItems.length) rows.push({id: 'sonarr_calendar', title: $L('Upcoming Episodes'), items: sonarrItems.sort(byCalendarDate), isExternalRow: true});
	return rows;
};

// Validates a configured custom row by fetching it. Returns {ok} or {error}. The first
// fetch of a large list can take the server a while, so this waits longer than a home
// row. It doesn't force a refresh either, so a retry gets the copy the server cached
// after an earlier attempt gave up.
export const validateCustomRow = async (row, options = {}) => {
	const items = await fetchCustomRow(
		{source: row.source, type: row.type, params: row.params},
		{timeoutMs: VALIDATE_TIMEOUT_MS, ...options}
	);
	if (items.length > 0) return {ok: true};
	return {error: $L('That list returned no items. Check the URL: {url}').replace('{url}', constructSourceUrl(row.source, row.type, row.params))};
};
