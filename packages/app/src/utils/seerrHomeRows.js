import $L from '@enact/i18n/$L';
import seerrApi from '../services/seerrApi';
import hydrateRequestMediaItems from './seerrHydration';

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
	{id: 'myRequests', title: $L('Recent Requests'), type: 'request', cardType: 'portrait'},
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
	seerr_recent_requests: 'myRequests',
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
	return {
		Id: `seerr-${mediaType}-${item.id}`,
		Name: item.title || item.name,
		Type: mediaType === 'movie' ? 'Movie' : 'Series',
		ProductionYear: yearOf(item),
		Overview: item.overview || '',
		_externalPosterUrl: poster ? seerrApi.getImageUrl(poster, 'w342') : null,
		_externalBackdropUrl: backdrop ? seerrApi.getImageUrl(backdrop, 'w1280') : null,
		mediaInfo: {status: item.mediaInfo?.status},
		_seerr: true,
		_seerrType: 'item',
		_seerrMediaType: mediaType,
		_seerrRaw: {mediaId: item.id, mediaType}
	};
};

const normalizeRequestItem = (request) => {
	const media = request.media || {};
	const mediaType = request.type || media.mediaType || 'movie';
	const poster = media.posterPath || media.poster_path;
	const backdrop = media.backdropPath || media.backdrop_path;
	return {
		Id: `seerr-${mediaType}-${media.tmdbId}`,
		Name: media.title || media.name || $L('Unknown'),
		Type: mediaType === 'movie' ? 'Movie' : 'Series',
		Overview: media.overview || request.overview || '',
		_externalPosterUrl: poster ? seerrApi.getImageUrl(poster, 'w342') : null,
		_externalBackdropUrl: backdrop ? seerrApi.getImageUrl(backdrop, 'w1280') : null,
		mediaInfo: {status: media.status},
		_seerr: true,
		_seerrType: 'item',
		_seerrMediaType: mediaType,
		_seerrRaw: {mediaId: media.tmdbId, mediaType}
	};
};

const normalizeGenreItem = (genre, mediaType) => ({
	Id: `seerr-genre-${mediaType}-${genre.id}`,
	Name: genre.name,
	_externalBackdropUrl: genre.backdrops?.[0] ? seerrApi.getImageUrl(genre.backdrops[0], 'w780') : null,
	_seerr: true,
	_seerrType: 'genre',
	_seerrMediaType: mediaType,
	_seerrRaw: {genreId: genre.id, genreName: genre.name, mediaType}
});

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
			case 'trending':
				return ((await seerrApi.trending(1)).results || []).slice(0, HOME_ROW_LIMIT).map(normalizeMediaItem);
			case 'recentlyAdded':
				return ((await seerrApi.getRecentlyAdded(HOME_ROW_LIMIT)).results || []).map(normalizeMediaItem);
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
