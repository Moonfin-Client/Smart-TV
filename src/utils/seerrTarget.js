// Which Seerr title a library item stands for.
//
// Movies and series match by their own ids. An episode or a season has none of its own for Seerr,
// so it stands for its series, which has to be looked up first.
//
// The id has to come out as a number. Jellyfin keeps provider ids as strings, while Seerr puts
// this straight into a request body and turns away anything that isn't a number.

export const IDLE = {mediaId: null, mediaType: null};

export const isSeerrOnlyItem = (item) => item?._seerrMediaId != null || item?._seerrImdbId != null;

// The search hit of the kind that was asked for. Seerr ranks a search by popularity across
// every kind of media, so the first hit for a film can easily be a series of the same name.
export const bestSearchMatch = (results, mediaType) => {
	if (!Array.isArray(results) || results.length === 0) return null;
	for (const result of results) {
		if (result.mediaType === mediaType) return result;
	}
	return results[0];
};

// Seerr hands back the media server's own id for a title it knows is already in
// the library. Opening that instead of the stand-in is what gives the screen its
// playback, ratings and everything else a synthetic item has none of.
export const libraryIdOf = (media) => media?.jellyfinMediaId || media?.jellyfinMediaId4k || null;

export const seerrTargetFor = (item) => {
	if (isSeerrOnlyItem(item)) {
		return {
			mediaId: item._seerrMediaId != null ? Number(item._seerrMediaId) : null,
			mediaType: item._seerrMediaType === 'tv' ? 'tv' : 'movie',
			imdbId: item._seerrImdbId || null,
			title: item._seerrTitle || null
		};
	}
	if (item?.Type !== 'Movie' && item?.Type !== 'Series') return IDLE;
	const tmdbId = Number(item.ProviderIds?.Tmdb);
	if (!Number.isFinite(tmdbId) || tmdbId <= 0) return IDLE;
	return {mediaId: tmdbId, mediaType: item.Type === 'Series' ? 'tv' : 'movie'};
};

export const isSeriesPart = (item) => (item?.Type === 'Season' || item?.Type === 'Episode') && Boolean(item.SeriesId);

// The series a season or episode belongs to, by TMDB id, or by IMDb id and name for a search to
// turn into one.
export const seriesTargetFrom = (series) => {
	const tmdbId = Number(series?.ProviderIds?.Tmdb);
	if (Number.isFinite(tmdbId) && tmdbId > 0) return {mediaId: tmdbId, mediaType: 'tv'};
	const imdbId = series?.ProviderIds?.Imdb;
	if (imdbId) return {mediaId: null, mediaType: 'tv', imdbId, title: series.Name || null};
	return IDLE;
};
