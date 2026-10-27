import seerrApi from '../services/seerrApi';

const HYDRATION_BATCH_SIZE = 6;

// One details request per title, however many entries share it.
const detailsLookup = () => {
	const cache = new Map();
	return (type, tmdbId) => {
		const key = `${type}:${tmdbId}`;
		if (!cache.has(key)) {
			cache.set(key, (type === 'movie' ? seerrApi.getMovie(tmdbId) : seerrApi.getTv(tmdbId)).catch(() => null));
		}
		return cache.get(key);
	};
};

const inBatches = async (items, hydrateOne) => {
	const hydrated = [];
	for (let i = 0; i < items.length; i += HYDRATION_BATCH_SIZE) {
		const batch = items.slice(i, i + HYDRATION_BATCH_SIZE);
		hydrated.push(...await Promise.all(batch.map(hydrateOne)));
	}
	return hydrated;
};

const hydrateRequestMediaItems = async (requests = []) => {
	if (!Array.isArray(requests) || requests.length === 0) return [];

	const lookup = detailsLookup();

	return inBatches(requests, async (request) => {
		const media = request?.media;
		const requestType = request?.type || media?.mediaType;
		const tmdbId = media?.tmdbId;
		const hasDisplayData = Boolean((media?.title || media?.name) && (media?.posterPath || media?.backdropPath));

		if (!tmdbId || hasDisplayData || (requestType !== 'movie' && requestType !== 'tv')) {
			return request;
		}

		const details = await lookup(requestType, tmdbId);
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
				firstAirDate: media?.firstAirDate || details.firstAirDate || details.first_air_date,
				voteAverage: media?.voteAverage ?? details.voteAverage,
				popularity: media?.popularity ?? details.popularity
			}
		};
	});
};

// Seerr's watchlist gives the TMDB id and type but no artwork, and a Jellyfin user's own
// list leaves the title empty too, so the card is filled in from the title's details.
export const hydrateWatchlistItems = async (items = []) => {
	if (!Array.isArray(items) || items.length === 0) return [];

	const lookup = detailsLookup();

	return inBatches(items, async (item) => {
		const type = item?.mediaType;
		if (!item?.id || item.posterPath || (type !== 'movie' && type !== 'tv')) return item;

		const details = await lookup(type, item.id);
		if (!details) return item;

		return {
			...item,
			title: item.title || details.title,
			name: item.name || details.name,
			posterPath: details.posterPath,
			backdropPath: item.backdropPath || details.backdropPath,
			overview: item.overview || details.overview,
			releaseDate: item.releaseDate || details.releaseDate,
			firstAirDate: item.firstAirDate || details.firstAirDate,
			voteAverage: item.voteAverage ?? details.voteAverage,
			popularity: item.popularity ?? details.popularity,
			mediaInfo: item.mediaInfo || details.mediaInfo
		};
	});
};

// Seerr's recently added list is its own media records, which carry the TMDB id but no title or
// artwork, so each becomes a card filled in from the title's details.
export const hydrateRecentlyAddedItems = async (records = []) => {
	if (!Array.isArray(records) || records.length === 0) return [];

	const lookup = detailsLookup();

	return inBatches(records, async (record) => {
		const type = record?.mediaType;
		const item = {id: record?.tmdbId ?? record?.id, mediaType: type, mediaInfo: record};
		if (!record?.tmdbId || (type !== 'movie' && type !== 'tv')) return item;

		const details = await lookup(type, record.tmdbId);
		if (!details) return item;

		return {
			...item,
			title: details.title,
			name: details.name,
			posterPath: details.posterPath,
			backdropPath: details.backdropPath,
			overview: details.overview,
			releaseDate: details.releaseDate,
			firstAirDate: details.firstAirDate,
			voteAverage: details.voteAverage,
			popularity: details.popularity
		};
	});
};

export default hydrateRequestMediaItems;
