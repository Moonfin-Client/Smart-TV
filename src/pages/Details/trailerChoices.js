import {extractYouTubeIdFromUrl} from '../../services/youtubeTrailer';

const SUBTITLED = /\s*\[subtitled\]\s*$/i;

// TMDB marks a subtitled cut with a suffix on its name, which the picker shows as a pill instead.
const splitSubtitled = (name = '') => ({
	title: name.replace(SUBTITLED, ''),
	subtitled: SUBTITLED.test(name)
});

// What the trailer button can play: the server's own trailers first, then each YouTube video
// once, in the order the server lists them.
export const trailerChoicesFor = (localTrailers, remoteTrailers) => {
	const choices = (localTrailers || []).filter((t) => t?.Id).map((t) => ({key: t.Id, ...splitSubtitled(t.Name || ''), local: t}));
	const seen = new Set();
	(remoteTrailers || []).forEach((t) => {
		const videoId = extractYouTubeIdFromUrl(t?.Url || t?.url || '');
		if (videoId && !seen.has(videoId)) {
			seen.add(videoId);
			choices.push({key: videoId, ...splitSubtitled(t.Name || t.name || ''), videoId});
		}
	});
	return choices;
};
