// The position in the TV's audioTracks list of a Jellyfin audio stream, or -1 when it can't be
// told, which sends the pick through the server. LG's player leaves out the tracks it can't play,
// TrueHD among them, so when the lists differ in length only the streams that pass playable are
// paired up.
export const matchAudioTrack = (nativeTracks, jellyfinStreams, targetIndex, playable) => {
	const selectedStream = jellyfinStreams.find(s => s.index === targetIndex);
	if (!selectedStream || !playable(selectedStream)) return -1;
	const streams = nativeTracks.length === jellyfinStreams.length ? jellyfinStreams : jellyfinStreams.filter(playable);
	if (streams.length !== nativeTracks.length) return -1;

	// Language first, falling back to array position if that's ambiguous or unavailable.
	const lang = (selectedStream.language || '').toLowerCase();
	if (lang && lang !== 'unknown' && lang !== 'und') {
		const langMatches = [];
		for (let i = 0; i < nativeTracks.length; i++) {
			const trackLang = (nativeTracks[i].language || '').toLowerCase();
			if (trackLang === lang || trackLang.startsWith(lang) || lang.startsWith(trackLang)) {
				langMatches.push(i);
			}
		}
		if (langMatches.length === 1) return langMatches[0];
		if (langMatches.length > 1) {
			const sameLanguageStreams = streams.filter(s => (s.language || '').toLowerCase() === lang);
			const posInSameLanguage = sameLanguageStreams.findIndex(s => s.index === targetIndex);
			if (posInSameLanguage >= 0 && posInSameLanguage < langMatches.length) {
				return langMatches[posInSameLanguage];
			}
		}
	}
	return streams.findIndex(s => s.index === targetIndex);
};
