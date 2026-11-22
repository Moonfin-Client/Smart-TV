// The Moonbase dashboard and Core store a few rating source ids in camelCase, where this
// app uses lowercase. This is the same table Core keeps in plugin_sync_service.dart, and
// the send direction is its inverse so the two can't drift apart.
const SERVER_TO_LOCAL = {
	metacriticUser: 'metacriticuser',
	myAnimeList: 'myanimelist',
	rogerEbert: 'rogerebert',
	// AniList is no longer offered anywhere, but old profiles may still carry it, so it
	// keeps round-tripping harmlessly.
	aniList: 'anilist'
};
const LOCAL_TO_SERVER = Object.fromEntries(
	Object.entries(SERVER_TO_LOCAL).map(([server, local]) => [local, server])
);

// The RT audience score has had two older ids. Both fold into the shared key on the way
// in and are never sent back out.
const LEGACY_IDS = {popcorn: 'tomatoes_audience', rtAudience: 'tomatoes_audience'};

/**
 * Puts a stored or synced source list into the ids this app filters on. A list that names
 * one source under two spellings keeps only the first, since the picker used to append the
 * lowercase id next to a camelCase one it didn't recognise.
 */
export const normalizeRatingSources = (sources) => {
	if (!Array.isArray(sources)) return sources;
	const result = [];
	for (const source of sources) {
		const local = LEGACY_IDS[source] || SERVER_TO_LOCAL[source] || source;
		if (!result.includes(local)) result.push(local);
	}
	return result;
};

export const ratingSourcesToServer = (sources) =>
	Array.isArray(sources) ? sources.map((source) => LOCAL_TO_SERVER[source] || source) : sources;

// Home rows and the media bar keep their own copies of these, named with the surface in front.
export const RATING_SETTING_KEYS = ['mdblistEnabled', 'mdblistRatingSources', 'tmdbEpisodeRatingsEnabled', 'showRatingLabels', 'showRatingBadges'];

export const ratingKey = (surface, key) => (surface ? surface + key[0].toUpperCase() + key.slice(1) : key);
