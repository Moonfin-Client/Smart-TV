import {DTS_FAMILY_CODECS} from '../../platform/tizen/video.js';
import {PGS_SUBTITLE_CODECS, BURN_IN_SUBTITLE_CODECS} from '../../utils/subtitleCodecs.js';

// AVPlay leaves tracks it can't decode out of getTotalTrackInfo, so pairing by
// position against the full Jellyfin list drifts whenever one sits before the
// target. When the counts disagree, the codecs AVPlay hides are dropped first.
const HIDDEN_AUDIO_CODECS = [...DTS_FAMILY_CODECS, 'truehd', 'mlp'];
const HIDDEN_TEXT_CODECS = [...PGS_SUBTITLE_CODECS, ...BURN_IN_SUBTITLE_CODECS, 'vobsub'];
const TIZEN_TEXT_TRACK_LIMIT = 30;

export const mapJellyfinTrackToTizen = (avplayTracks, jellyfinStreams, type, jellyfinIndex) => {
	const tracks = (Array.isArray(avplayTracks) ? avplayTracks : []).filter((t) => t.type === type);
	if (tracks.length === 0) return null;

	let streams = Array.isArray(jellyfinStreams) ? jellyfinStreams : [];
	if (streams.length !== tracks.length) {
		const hidden = type === 'AUDIO' ? HIDDEN_AUDIO_CODECS : HIDDEN_TEXT_CODECS;
		const isHidden = (s) => hidden.includes((s.codec || '').toLowerCase());
		// AVPlay does decode some of these once the experimental codecs are on, and there
		// dropping the target resolved a TrueHD pick to nothing. Keeping it only holds while
		// the lists line up, since a short list pairs it with the wrong track.
		const withTarget = streams.filter((s) => s.index === jellyfinIndex || !isHidden(s));
		streams = withTarget.length === tracks.length
			? withTarget
			: withTarget.filter((s) => !isHidden(s));
	}
	if (type === 'TEXT') {
		streams = streams.slice(0, TIZEN_TEXT_TRACK_LIMIT);
	}

	const pos = streams.findIndex((s) => s.index === jellyfinIndex);
	if (pos < 0 || pos >= tracks.length) return null;
	return tracks[pos].index;
};
