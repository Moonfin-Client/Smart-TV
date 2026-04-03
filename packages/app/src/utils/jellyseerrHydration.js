import jellyseerrApi from '../services/jellyseerrApi';

const HYDRATION_BATCH_SIZE = 6;

const hydrateRequestMediaItems = async (requests = []) => {
	if (!Array.isArray(requests) || requests.length === 0) return [];

	const movieCache = new Map();
	const tvCache = new Map();

	const hydrateOne = async (request) => {
		const media = request?.media;
		const requestType = request?.type || media?.mediaType;
		const tmdbId = media?.tmdbId;
		const hasDisplayData = Boolean((media?.title || media?.name) && (media?.posterPath || media?.backdropPath));

		if (!tmdbId || hasDisplayData || (requestType !== 'movie' && requestType !== 'tv')) {
			return request;
		}

		const cache = requestType === 'movie' ? movieCache : tvCache;
		if (!cache.has(tmdbId)) {
			const detailsPromise = (requestType === 'movie'
				? jellyseerrApi.getMovie(tmdbId)
				: jellyseerrApi.getTv(tmdbId)
			).catch(() => null);
			cache.set(tmdbId, detailsPromise);
		}

		const details = await cache.get(tmdbId);
		if (!details) return request;

		return {
			...request,
			media: {
				...media,
				title: media?.title || details.title || details.name,
				name: media?.name || details.name || details.title,
				posterPath: media?.posterPath || details.posterPath || details.poster_path,
				backdropPath: media?.backdropPath || details.backdropPath || details.backdrop_path,
				overview: media?.overview || details.overview,
				releaseDate: media?.releaseDate || details.releaseDate || details.release_date,
				firstAirDate: media?.firstAirDate || details.firstAirDate || details.first_air_date
			}
		};
	};

	const hydrated = [];
	for (let i = 0; i < requests.length; i += HYDRATION_BATCH_SIZE) {
		const batch = requests.slice(i, i + HYDRATION_BATCH_SIZE);
		const hydratedBatch = await Promise.all(batch.map(hydrateOne));
		hydrated.push(...hydratedBatch);
	}

	return hydrated;
};

export default hydrateRequestMediaItems;
