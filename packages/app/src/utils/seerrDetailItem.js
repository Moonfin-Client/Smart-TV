// A Seerr title dressed up in the shape the detail screen reads.
//
// There is no Jellyfin item behind one of these, and the screen is built around one, so the
// payload Seerr returns is mapped across rather than teaching every part of the screen a second
// shape. Artwork comes as a finished url, since these images live on TMDB.

import seerrApi from '../services/seerrApi';

const TICKS_PER_MINUTE = 600000000;

const yearOf = (details) => {
	const date = details.releaseDate || details.firstAirDate;
	const year = date ? Number(String(date).slice(0, 4)) : NaN;
	return Number.isFinite(year) && year > 0 ? year : null;
};

// Seerr gives a rating out of 10, which is what the library uses too.
const ratingOf = (details) => {
	const vote = Number(details.voteAverage);
	return Number.isFinite(vote) && vote > 0 ? vote : null;
};

// Seerr sends every clip TMDB holds, teasers and featurettes included, so the one a viewer means
// by a trailer has to be picked out of the pile.
const bestTrailerOf = (details) => {
	const videos = Array.isArray(details.relatedVideos) ? details.relatedVideos : [];
	let anyTrailer = null;
	let anyYoutube = null;
	for (const video of videos) {
		const isYoutube = String(video?.site || '').toLowerCase() === 'youtube';
		const isTrailer = String(video?.type || '').toLowerCase() === 'trailer';
		if (isYoutube && isTrailer) return video;
		if (isTrailer) anyTrailer = anyTrailer || video;
		else if (isYoutube) anyYoutube = anyYoutube || video;
	}
	return anyTrailer || anyYoutube || videos[0] || null;
};

// Shaped like the library's own remote trailers, so the screen and the overlay that plays them
// need to know nothing about where this one came from.
const trailersOf = (details) => {
	const video = bestTrailerOf(details);
	if (!video) return [];
	const url = video.url || (video.key ? `https://www.youtube.com/watch?v=${video.key}` : '');
	return url ? [{Name: video.name || '', Url: url}] : [];
};

const castOf = (details) => (details.credits?.cast || []).slice(0, 20).map((person) => ({
	Id: String(person.id),
	Name: person.name,
	Role: person.character,
	Type: 'Actor',
	_externalImageUrl: person.profilePath ? seerrApi.getImageUrl(person.profilePath, 'w185') : null
}));

export const buildSeerrDetailItem = (details, mediaType) => {
	if (!details) return null;
	const isTv = mediaType === 'tv';
	const runtime = isTv ? details.episodeRunTime?.[0] : details.runtime;

	return {
		Id: `seerr-${mediaType}-${details.id}`,
		Name: details.title || details.name || '',
		Type: isTv ? 'Series' : 'Movie',
		Overview: details.overview || '',
		ProductionYear: yearOf(details),
		CommunityRating: ratingOf(details),
		RunTimeTicks: runtime > 0 ? runtime * TICKS_PER_MINUTE : null,
		Genres: (details.genres || []).map((g) => g.name),
		Taglines: details.tagline ? [details.tagline] : [],
		RemoteTrailers: trailersOf(details),
		People: castOf(details),
		ChildCount: isTv ? details.numberOfSeasons || 0 : 0,
		// The screen reads this for the Continuing badge, which only a series shows. TMDB calls
		// that state a returning series.
		Status: isTv ? (details.status === 'Returning Series' ? 'Continuing' : details.status) : null,
		ProviderIds: {Tmdb: String(details.id)},
		_externalPosterUrl: details.posterPath ? seerrApi.getImageUrl(details.posterPath, 'w500') : null,
		_externalBackdropUrl: details.backdropPath ? seerrApi.getImageUrl(details.backdropPath, 'w1280') : null,
		// Nothing here is in the library, so there is no playback state and nothing to play.
		UserData: {},
		MediaSources: []
	};
};
