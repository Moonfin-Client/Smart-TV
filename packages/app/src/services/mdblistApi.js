import {getAuthHeader, getServerUrl} from './jellyfinApi';
import {mediaServerQueue} from '../utils/requestQueue';

const cache = {};
const CACHE_TTL_MS = 30 * 60 * 1000;

export const RATING_SOURCES = {
	imdb:           {name: 'IMDb',                     iconFile: 'imdb.svg',            color: '#F5C518', textColor: '#000'},
	tmdb:           {name: 'TMDb',                     iconFile: 'tmdb.svg',            color: '#01D277', textColor: '#fff'},
	trakt:          {name: 'Trakt',                    iconFile: 'trakt.svg',           color: '#ED1C24', textColor: '#fff'},
	tomatoes:       {name: 'Rotten Tomatoes (Critics)', iconFile: 'rt-fresh.svg',        color: '#FA320A', textColor: '#fff'},
	tomatoes_audience: {name: 'Rotten Tomatoes (Audience)', iconFile: 'rt-audience-up.svg', color: '#FA320A', textColor: '#fff'},
	metacritic:     {name: 'Metacritic',               iconFile: 'metacritic.svg',      color: '#FFCC34', textColor: '#000'},
	metacriticuser: {name: 'Metacritic User',          iconFile: 'metacritic-user.svg', color: '#00CE7A', textColor: '#000'},
	letterboxd:     {name: 'Letterboxd',               iconFile: 'letterboxd.svg',      color: '#00E054', textColor: '#fff'},
	rogerebert:     {name: 'Roger Ebert',              iconFile: 'rogerebert.svg',      color: '#E50914', textColor: '#fff'},
	myanimelist:    {name: 'MyAnimeList',              iconFile: 'mal.svg',             color: '#2E51A2', textColor: '#fff'},
	anilist:        {name: 'AniList',                  iconFile: 'anilist.svg',         color: '#02A9FF', textColor: '#fff'}
};

/**
 * Get the icon URL for a rating source, with variant based on score.
 */
export const getIconUrl = (baseUrl, source, rating) => {
	const info = RATING_SOURCES[source];
	if (!info) return '';

	const score = rating?.score;

	if (source === 'tomatoes' && score != null && score > 0) {
		if (score >= 75) return `${baseUrl}/Moonfin/Assets/rt-certified.svg`;
		if (score < 60) return `${baseUrl}/Moonfin/Assets/rt-rotten.svg`;
	}

	if (source === 'tomatoes_audience' && score != null && score > 0) {
		if (score >= 90) return `${baseUrl}/Moonfin/Assets/rt-verified.svg`;
		if (score < 60) return `${baseUrl}/Moonfin/Assets/rt-audience-down.svg`;
	}

	if (source === 'metacritic' && score != null && score >= 81) {
		return `${baseUrl}/Moonfin/Assets/metacritic-score.svg`;
	}

	return `${baseUrl}/Moonfin/Assets/${info.iconFile}`;
};

/**
 * Returns 'movie' or 'show', or null if unsupported type.
 */
export const getContentType = (item) => {
	if (!item) return null;
	const type = item.Type;
	if (type === 'Movie') return 'movie';
	if (type === 'Series') return 'show';
	if (type === 'Episode' || type === 'Season') return 'show';
	return null;
};

export const getTmdbId = (item) => {
	if (!item) return null;
	const providerIds = item.ProviderIds;
	if (!providerIds) return null;
	return providerIds.Tmdb || providerIds.tmdb || null;
};

export const formatRating = (rating) => {
	if (!rating || !rating.source) return null;
	const source = rating.source.toLowerCase();
	const value = rating.value;
	const score = rating.score;

	if (value == null && score == null) return null;

	switch (source) {
		case 'imdb':
			return value != null ? Number(value).toFixed(1) : (score != null ? (score / 10).toFixed(1) : null);
		case 'tmdb':
			return value != null ? `${Number(value).toFixed(0)}%` : (score != null ? `${Number(score).toFixed(0)}%` : null);
		case 'trakt':
			return score != null ? `${Number(score).toFixed(0)}%` : null;
		case 'tomatoes':
		case 'tomatoes_audience':
		case 'metacritic':
		case 'metacriticuser':
			return score != null ? `${Number(score).toFixed(0)}%` : (value != null ? `${Number(value).toFixed(0)}%` : null);
		case 'letterboxd':
			return value != null ? Number(value).toFixed(1) : (score != null ? (score / 20).toFixed(1) : null);
		case 'rogerebert':
			return value != null ? `${Number(value).toFixed(1)}/4` : (score != null ? `${Number(score).toFixed(0)}%` : null);
		case 'myanimelist':
			return value != null ? Number(value).toFixed(1) : (score != null ? (score / 10).toFixed(1) : null);
		case 'anilist':
			return score != null ? `${Number(score).toFixed(0)}%` : null;
		default:
			return score != null ? `${Number(score).toFixed(0)}%` : (value != null ? String(value) : null);
	}
};

export const fetchRatings = async (serverUrl, item, options = {}) => {
	const contentType = getContentType(item);
	const tmdbId = getTmdbId(item);

	if (!contentType || !tmdbId) return [];

	const cacheKey = `${contentType}:${tmdbId}`;

	const cached = cache[cacheKey];
	if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
		return cached.ratings;
	}

	const baseUrl = serverUrl || getServerUrl();
	if (!baseUrl) return [];

	try {
		const url = `${baseUrl}/Moonfin/MdbList/Ratings?type=${encodeURIComponent(contentType)}&tmdbId=${encodeURIComponent(tmdbId)}`;
		const fetchOptions = {
			headers: {
				'Authorization': getAuthHeader()
			}
		};
		if (options.signal) {
			fetchOptions.signal = options.signal;
		}
		// Share the media server concurrency cap so arrowing across a row doesn't
		// spawn a burst of uncapped requests competing with image loads.
		const response = await mediaServerQueue.run(() => fetch(url, fetchOptions));

		if (!response.ok) return [];

		const data = await response.json();
		const ratingsArr = data.ratings || data.Ratings;
		const success = data.success ?? data.Success;
		if (data && success !== false && ratingsArr) {
			const ratings = ratingsArr.map(r => {
				let source = r.Source || r.source;
				// MDBList returns the RT audience score under `popcorn`; normalize
				// to the shared `tomatoes_audience` key used by the server and the
				// other clients so it matches the user's enabled sources.
				if (typeof source === 'string' && source.toLowerCase() === 'popcorn') {
					source = 'tomatoes_audience';
				}
				return {
					source,
					value: r.Value ?? r.value,
					score: r.Score ?? r.score,
					votes: r.Votes ?? r.votes,
					url: r.Url || r.url
				};
			});
			cache[cacheKey] = {ratings, fetchedAt: Date.now()};
			return ratings;
		}
		return [];
	} catch (err) {
		console.warn('[MDBList] Fetch failed:', err);
		return [];
	}
};

export const buildDisplayRatings = (ratings, serverUrl) => {
	if (!ratings || ratings.length === 0) return [];

	const result = [];

	for (const rating of ratings) {
		const source = rating.source && rating.source.toLowerCase();
		if (!source) continue;

		const formatted = formatRating(rating);
		if (!formatted) continue;

		const info = RATING_SOURCES[source] || {name: source, iconFile: '', color: '#666', textColor: '#fff'};
		const iconUrl = getIconUrl(serverUrl, source, rating);

		result.push({
			source,
			name: info.name,
			formatted,
			iconUrl,
			color: info.color,
			textColor: info.textColor,
			score: rating.score,
			value: rating.value
		});
	}

	return result;
};

const tmdbSeasonCache = {};
const TMDB_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const fetchTmdbSeasonRatings = async (serverUrl, tmdbId, season, options = {}) => {
	if (!tmdbId || season == null) return null;
	const cacheKey = `${tmdbId}:${season}`;
	const cached = tmdbSeasonCache[cacheKey];
	if (cached && (Date.now() - cached.fetchedAt) < TMDB_CACHE_TTL_MS) {
		return cached.data;
	}
	const baseUrl = serverUrl || getServerUrl();
	if (!baseUrl) return null;
	try {
		const url = `${baseUrl}/Moonfin/Tmdb/SeasonRatings?tmdbId=${encodeURIComponent(tmdbId)}&season=${encodeURIComponent(season)}`;
		const fetchOptions = {
			headers: {'Authorization': getAuthHeader()}
		};
		if (options.signal) fetchOptions.signal = options.signal;
		const response = await fetch(url, fetchOptions);
		if (!response.ok) return null;
		const data = await response.json();
		if (data?.success) {
			tmdbSeasonCache[cacheKey] = {data, fetchedAt: Date.now()};
			return data;
		}
		return null;
	} catch {
		return null;
	}
};

