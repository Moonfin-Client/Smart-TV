// /discover/watchlist is the one discover endpoint that doesn't return TMDB shaped results. It uses tmdbId where the
// others use id, and media where they use mediaInfo. For a user without Plex, Seerr hands back its own watchlist rows,
// where id is the row's key, so tmdbId always wins. normalizeMediaItem reads item.id for the card and for what opens
// on select.
export const normalizeWatchlistBody = (body) => {
	const results = (body?.results || []).map((raw) => {
		const item = {...raw};
		if (item.tmdbId != null) item.id = item.tmdbId;
		if (item.media && !item.mediaInfo) item.mediaInfo = item.media;
		return item;
	});
	return {...body, results};
};
