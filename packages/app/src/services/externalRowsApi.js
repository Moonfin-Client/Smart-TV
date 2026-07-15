import {getAuthHeader, getServerUrl} from './jellyfinApi';
import {fetchWithTimeout} from '../utils/fetchTimeout';

// Thin client for the Moonfin plugin external home row endpoints. Everything
// except the Radarr and Sonarr calendars comes from one generic endpoint,
// GET /Moonfin/CustomRows/Items, which multiplexes TMDB, IMDb, Letterboxd and
// MDBList behind a source and type. Items are returned as provider ids that the
// caller resolves against the local library.

const cache = {};
const CACHE_TTL_MS = 30 * 60 * 1000;

const cacheKeyFor = (source, type, params) => `${source}:${type}:${JSON.stringify(params || {})}`;

const normalizeItem = (raw) => {
	const providerIds = raw.providerIds || raw.ProviderIds || {};
	return {
		name: raw.name ?? raw.Name ?? '',
		type: raw.type ?? raw.Type ?? 'Movie',
		productionYear: raw.productionYear ?? raw.ProductionYear ?? null,
		rank: raw.rank ?? raw.Rank ?? null,
		posterUrl: raw.posterUrl ?? raw.PosterUrl ?? null,
		backdropUrl: raw.backdropUrl ?? raw.BackdropUrl ?? null,
		userRating: raw.userRating ?? raw.UserRating ?? null,
		rating: raw.rating ?? raw.Rating ?? null,
		overview: raw.overview ?? raw.Overview ?? raw.description ?? raw.Description ?? '',
		providerIds: {
			Tmdb: providerIds.Tmdb ?? providerIds.tmdb ?? null,
			Imdb: providerIds.Imdb ?? providerIds.imdb ?? null,
			Tvdb: providerIds.Tvdb ?? providerIds.tvdb ?? null
		}
	};
};

// Fetches one external list. params is the plugin params object such as
// {id} or {username, listname}, sent url-encoded as JSON.
export const fetchCustomRow = async ({source, type, params = {}}, options = {}) => {
	if (!source || !type) return [];

	const key = cacheKeyFor(source, type, params);
	if (!options.forceRefresh) {
		const cached = cache[key];
		if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
			return cached.items;
		}
	}

	const baseUrl = getServerUrl();
	if (!baseUrl) return [];

	// The plugin caches on source:type:sha256(params), so a nocache marker forces
	// a fresh fetch when the user asks to refresh.
	const sentParams = options.forceRefresh ? {...params, _nocache: String(Date.now())} : params;

	try {
		const url = `${baseUrl}/Moonfin/CustomRows/Items`
			+ `?source=${encodeURIComponent(source)}`
			+ `&type=${encodeURIComponent(type)}`
			+ `&params=${encodeURIComponent(JSON.stringify(sentParams))}`;

		const fetchOptions = {headers: {'Authorization': getAuthHeader()}};
		if (options.signal) fetchOptions.signal = options.signal;

		const response = await fetchWithTimeout(url, fetchOptions, options.timeoutMs || 10000);
		if (!response.ok) return cache[key]?.items || [];

		const data = await response.json();
		const success = data.success ?? data.Success;
		const rawItems = data.items || data.Items;
		if (success === false || !Array.isArray(rawItems)) return cache[key]?.items || [];

		const items = rawItems.map(normalizeItem);
		cache[key] = {items, fetchedAt: Date.now()};
		return items;
	} catch (err) {
		console.warn('[ExternalRows] Fetch failed:', err);
		return cache[key]?.items || [];
	}
};

// Builds the human readable third party URL for a configured source. Used only
// to show the user where a failing custom row points, never for fetching.
export const constructSourceUrl = (source, type, params = {}) => {
	switch (source) {
		case 'tmdb':
			if (type === 'movie_collection') return `https://www.themoviedb.org/collection/${params.id || ''}`;
			return `https://www.themoviedb.org/list/${params.id || ''}`;
		case 'imdb':
			return `https://www.imdb.com/chart/${type || ''}`;
		case 'letterboxd':
			return `https://letterboxd.com/${params.user || ''}/`;
		case 'mdblist':
			return `https://mdblist.com/lists/${params.username || ''}/${params.listname || ''}`;
		default:
			return '';
	}
};
