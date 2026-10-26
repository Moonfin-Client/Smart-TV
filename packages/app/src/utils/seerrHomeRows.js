import $L from '@enact/i18n/$L';
import seerrApi from '../services/seerrApi';
import {seerrGenreBackdrop} from './seerrGenreArt';
import hydrateRequestMediaItems, {hydrateRecentlyAddedItems, hydrateWatchlistItems} from './seerrHydration';
import {libraryIdOf} from './seerrTarget';

const HOME_ROW_LIMIT = 20;

export const STREAMING_NETWORKS = [
	{id: 213, name: 'Netflix', logo: 'wwemzKWzjKYJFfCeiB57q3r4Bcm.png'},
	{id: 2739, name: 'Disney+', logo: 'gJ8VX6JSu3ciXHuC2dDGAo2lvwM.png'},
	{id: 1024, name: 'Prime Video', logo: 'ifhbNuuVnlwYy5oXA5VIb2YR8AZ.png'},
	{id: 2552, name: 'Apple TV+', logo: '4KAy34EHvRM25Ih8wb82AuGU7zJ.png'},
	{id: 453, name: 'Hulu', logo: 'pqUTCleNUiTLAVlelGxUgWn1ELh.png'},
	{id: 49, name: 'HBO', logo: 'tuomPhY2UtuPTqqFnKMVHvSb724.png'},
	{id: 4330, name: 'Paramount+', logo: 'fi83B1oztoS47xxcemFdPMhIzK.png'},
	{id: 3353, name: 'Peacock', logo: 'gIAcGTjKKr0KOHL5s4O36roJ8p7.png'}
];

export const MOVIE_STUDIOS = [
	{id: 2, name: 'Disney', logo: 'wdrCwmRnLFJhEoH8GSfymY85KHT.png'},
	{id: 127928, name: '20th Century', logo: 'h0rjX5vjW5r8yEnUBStFarjcLT4.png'},
	{id: 34, name: 'Sony Pictures', logo: 'GagSvqWlyPdkFHMfQ3pNq6ix9P.png'},
	{id: 174, name: 'Warner Bros.', logo: 'ky0xOc5OrhzkZ1N6KyUxacfQsCk.png'},
	{id: 33, name: 'Universal', logo: '8lvHyhjr8oUKOOy2dKXoALWKdp0.png'},
	{id: 4, name: 'Paramount', logo: 'fycMZt242LVjagMByZOLUGbCvv3.png'},
	{id: 420, name: 'Marvel', logo: 'hUzeosd33nzE5MCNsZxCGEKTXaQ.png'},
	{id: 9993, name: 'DC', logo: '2Tc1P3Ac8M479naPp1kYT3izLS5.png'},
	{id: 41077, name: 'A24', logo: '1ZXsGaFPgrgS6ZZGS37AqD5uU12.png'}
];

export const getSeerrHomeRowConfigs = () => [
	{id: 'shortcuts', title: $L('Seerr Browse'), type: 'shortcut', cardType: 'landscape'},
	{id: 'myRequests', title: $L('Recent Requests'), type: 'request', cardType: 'portrait'},
	{id: 'yourWatchlist', title: $L('Your Watchlist'), type: 'media', cardType: 'portrait'},
	{id: 'recentlyAdded', title: $L('Recently Added'), type: 'media', cardType: 'portrait'},
	{id: 'trending', title: $L('Trending Now'), type: 'media', cardType: 'portrait'},
	{id: 'popularMovies', title: $L('Popular Movies'), type: 'media', cardType: 'portrait'},
	{id: 'popularTv', title: $L('Popular TV Shows'), type: 'media', cardType: 'portrait'},
	{id: 'upcomingMovies', title: $L('Upcoming Movies'), type: 'media', cardType: 'portrait'},
	{id: 'upcomingTv', title: $L('Upcoming TV Shows'), type: 'media', cardType: 'portrait'},
	{id: 'genreMovies', title: $L('Browse Movies by Genre'), type: 'genre', mediaType: 'movie', cardType: 'landscape'},
	{id: 'genreTv', title: $L('Browse TV by Genre'), type: 'genre', mediaType: 'tv', cardType: 'landscape'},
	{id: 'studios', title: $L('Browse by Studio'), type: 'studio', cardType: 'logo'},
	{id: 'networks', title: $L('Browse by Network'), type: 'network', cardType: 'logo'}
];

// Maps the plugin home section serialized names to the local seerr row config ids
// so seerr rows share the unified home layout with the built-in rows.
export const SEERR_SECTION_TO_CONFIG = {
	seerr_shortcuts: 'shortcuts',
	seerr_recent_requests: 'myRequests',
	seerr_watchlist: 'yourWatchlist',
	seerr_recently_added: 'recentlyAdded',
	seerr_trending: 'trending',
	seerr_popular_movies: 'popularMovies',
	seerr_popular_series: 'popularTv',
	seerr_upcoming_movies: 'upcomingMovies',
	seerr_upcoming_series: 'upcomingTv',
	seerr_movie_genres: 'genreMovies',
	seerr_series_genres: 'genreTv',
	seerr_studios: 'studios',
	seerr_networks: 'networks'
};

export const SEERR_CONFIG_TO_SECTION = Object.fromEntries(
	Object.entries(SEERR_SECTION_TO_CONFIG).map(([section, config]) => [config, section])
);

const yearOf = (item) => {
	const date = item.release_date || item.releaseDate || item.first_air_date || item.firstAirDate || '';
	const year = parseInt(String(date).slice(0, 4), 10);
	return Number.isFinite(year) ? year : undefined;
};

export const normalizeMediaItem = (item) => {
	const mediaType = item.media_type || item.mediaType || (item.title ? 'movie' : 'tv');
	const poster = item.poster_path || item.posterPath;
	const backdrop = item.backdrop_path || item.backdropPath;
	const releaseDate = item.release_date || item.releaseDate || item.first_air_date || item.firstAirDate || '';
	return {
		Id: `seerr-${mediaType}-${item.id}`,
		Name: item.title || item.name,
		Type: mediaType === 'movie' ? 'Movie' : 'Series',
		ProductionYear: yearOf(item),
		PremiereDate: releaseDate || undefined,
		Overview: item.overview || '',
		CommunityRating: item.vote_average || item.voteAverage,
		Popularity: item.popularity,
		_externalPosterUrl: poster ? seerrApi.getImageUrl(poster, 'w342') : null,
		_externalBackdropUrl: backdrop ? seerrApi.getImageUrl(backdrop, 'w1280') : null,
		mediaInfo: {status: item.mediaInfo?.status},
		_seerrLibraryId: libraryIdOf(item.mediaInfo),
		_seerr: true,
		_seerrType: 'item',
		_seerrMediaType: mediaType,
		_seerrRaw: {mediaId: item.id, mediaType}
	};
};

export const normalizeRequestItem = (request) => {
	const media = request.media || {};
	const mediaType = request.type || media.mediaType || 'movie';
	const poster = media.posterPath || media.poster_path;
	const backdrop = media.backdropPath || media.backdrop_path;
	const releaseDate = media.releaseDate || media.release_date || media.firstAirDate || media.first_air_date || '';
	return {
		Id: `seerr-${mediaType}-${media.tmdbId}`,
		Name: media.title || media.name || $L('Unknown'),
		Type: mediaType === 'movie' ? 'Movie' : 'Series',
		ProductionYear: yearOf(media),
		PremiereDate: releaseDate || undefined,
		Overview: media.overview || request.overview || '',
		CommunityRating: media.voteAverage || media.vote_average,
		Popularity: media.popularity,
		_externalPosterUrl: poster ? seerrApi.getImageUrl(poster, 'w342') : null,
		_externalBackdropUrl: backdrop ? seerrApi.getImageUrl(backdrop, 'w1280') : null,
		mediaInfo: {status: media.status},
		_seerrLibraryId: libraryIdOf(media),
		_seerr: true,
		_seerrType: 'item',
		_seerrMediaType: mediaType,
		_seerrRaw: {mediaId: media.tmdbId, mediaType}
	};
};

// The jump tiles the shortcuts row holds. Static, so the row renders complete
// without a fetch.
export const SEERR_SHORTCUTS = [
	{key: 'discover', name: () => $L('Discover')},
	{key: 'movies', name: () => $L('Movies')},
	{key: 'series', name: () => $L('TV Shows')},
	{key: 'requests', name: () => $L('Requests')},
	{key: 'issues', name: () => $L('Issues')}
];

// A tile is a fraction of the screen, so it asks for a still cut to its own size.
// The full size one is kept alongside, since focusing a tile is what paints the
// screen behind it.
const TILE_STILL = 'w300';
const BACKDROP_STILL = 'w780';

const normalizeShortcutItem = (shortcut, backdrop) => ({
	Id: `seerr-shortcut-${shortcut.key}`,
	Name: shortcut.name(),
	_externalTileUrl: backdrop ? seerrApi.getImageUrl(backdrop, TILE_STILL) : null,
	_externalBackdropUrl: backdrop ? seerrApi.getImageUrl(backdrop, BACKDROP_STILL) : null,
	_seerr: true,
	_seerrType: 'shortcut',
	_seerrRaw: {shortcut: shortcut.key}
});

// Picks one still per shortcut so the tiles carry artwork rather than a flat
// colour. Movies and TV Shows get one of their own kind, the rest take what is
// left, and nothing repeats while there is still art to go round.
export const pickShortcutBackdrops = (shortcuts, results) => {
	const pathOf = (item) => item.backdrop_path || item.backdropPath;
	const ofType = (type) => results
		.filter((item) => (item.media_type || item.mediaType) === type && pathOf(item))
		.map(pathOf);
	const movies = ofType('movie');
	const tv = ofType('tv');
	const mixed = [];
	for (let i = 0; i < Math.max(movies.length, tv.length); i++) {
		if (i < tv.length) mixed.push(tv[i]);
		if (i < movies.length) mixed.push(movies[i]);
	}

	const used = new Set();
	const take = (...pools) => {
		for (const pool of pools) {
			for (const path of pool) {
				if (!used.has(path)) {
					used.add(path);
					return path;
				}
			}
		}
		return null;
	};

	// Movies and TV Shows claim first, so a short pool cannot leave them bare
	// while a tile with no kind of its own takes the only still.
	const picked = {};
	shortcuts.forEach((shortcut) => {
		if (shortcut.key === 'movies') picked[shortcut.key] = take(movies, tv);
		else if (shortcut.key === 'series') picked[shortcut.key] = take(tv, movies);
	});
	shortcuts.forEach((shortcut) => {
		if (picked[shortcut.key] === undefined) picked[shortcut.key] = take(mixed);
	});
	return picked;
};

const normalizeGenreItem = (genre, mediaType) => {
	// The duotone art gives every genre its own color, and the Genre type puts
	// the name across the card the way the library genre row draws it.
	const art = seerrGenreBackdrop(genre.id, genre.backdrops);
	const artUrl = art ? seerrApi.getImageUrl(art.path, art.size) : null;
	return {
		Id: `seerr-genre-${mediaType}-${genre.id}`,
		Name: genre.name,
		Type: 'Genre',
		_externalTileUrl: artUrl,
		_externalBackdropUrl: artUrl,
		_seerr: true,
		_seerrType: 'genre',
		_seerrMediaType: mediaType,
		_seerrRaw: {genreId: genre.id, genreName: genre.name, mediaType}
	};
};

const normalizeStudioItem = (studio) => ({
	Id: `seerr-studio-${studio.id}`,
	Name: studio.name,
	_externalLogoUrl: seerrApi.getImageUrl('/' + studio.logo, 'w185'),
	_seerr: true,
	_seerrType: 'studio',
	_seerrRaw: {studioId: studio.id, studioName: studio.name}
});

const normalizeNetworkItem = (network) => ({
	Id: `seerr-network-${network.id}`,
	Name: network.name,
	_externalLogoUrl: seerrApi.getImageUrl('/' + network.logo, 'w185'),
	_seerr: true,
	_seerrType: 'network',
	_seerrRaw: {networkId: network.id, networkName: network.name}
});

export const fetchSeerrHomeRow = async (rowId, {userId} = {}) => {
	try {
		switch (rowId) {
			case 'shortcuts': {
				// Artwork is the only thing the read adds, so a failure still
				// leaves a usable row.
				const trending = await seerrApi.trending(1).catch(() => ({results: []}));
				const results = (trending.results || []).slice().sort(() => Math.random() - 0.5);
				const backdrops = pickShortcutBackdrops(SEERR_SHORTCUTS, results);
				return SEERR_SHORTCUTS.map((shortcut) => normalizeShortcutItem(shortcut, backdrops[shortcut.key]));
			}
			case 'trending':
				return ((await seerrApi.trending(1)).results || []).slice(0, HOME_ROW_LIMIT).map(normalizeMediaItem);
			case 'recentlyAdded':
				return (await hydrateRecentlyAddedItems((await seerrApi.getRecentlyAdded(HOME_ROW_LIMIT)).results || [])).map(normalizeMediaItem);
			case 'yourWatchlist': {
				const results = ((await seerrApi.getWatchlist(1)).results || []).slice(0, HOME_ROW_LIMIT);
				return (await hydrateWatchlistItems(results)).map(normalizeMediaItem);
			}
			case 'popularMovies':
				return ((await seerrApi.trendingMovies(1)).results || []).slice(0, HOME_ROW_LIMIT).map(normalizeMediaItem);
			case 'popularTv':
				return ((await seerrApi.trendingTv(1)).results || []).slice(0, HOME_ROW_LIMIT).map(normalizeMediaItem);
			case 'upcomingMovies':
				return ((await seerrApi.upcomingMovies(1)).results || []).slice(0, HOME_ROW_LIMIT).map(normalizeMediaItem);
			case 'upcomingTv':
				return ((await seerrApi.upcomingTv(1)).results || []).slice(0, HOME_ROW_LIMIT).map(normalizeMediaItem);
			case 'genreMovies':
				return ((await seerrApi.getGenreSliderMovies()) || []).map((g) => normalizeGenreItem(g, 'movie'));
			case 'genreTv':
				return ((await seerrApi.getGenreSliderTv()) || []).map((g) => normalizeGenreItem(g, 'tv'));
			case 'studios':
				return MOVIE_STUDIOS.map(normalizeStudioItem);
			case 'networks':
				return STREAMING_NETWORKS.map(normalizeNetworkItem);
			case 'myRequests': {
				let resolvedUserId = userId;
				if (!resolvedUserId) {
					const apiUser = await seerrApi.getUser().catch(() => null);
					resolvedUserId = apiUser?.id;
				}
				if (!resolvedUserId) return [];
				const data = await seerrApi.getMyRequests(resolvedUserId, HOME_ROW_LIMIT);
				const hydrated = await hydrateRequestMediaItems(data.results || []);
				return hydrated.filter((r) => r?.media?.tmdbId).map(normalizeRequestItem);
			}
			default:
				return [];
		}
	} catch {
		return [];
	}
};
