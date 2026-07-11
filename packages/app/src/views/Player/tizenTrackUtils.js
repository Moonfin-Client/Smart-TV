import {DTS_FAMILY_CODECS} from '@moonfin/platform-tizen/video';
import {PGS_SUBTITLE_CODECS, BURN_IN_SUBTITLE_CODECS} from '../../utils/subtitleCodecs';

// AVPlay omits tracks it cant decode from getTotalTrackInfo, so a plain
// positional pairing against the full Jellyfin stream list drifts off by one
// whenever such a track sits before the target. When the counts disagree we
// drop the codecs AVPlay is known to hide and pair against what remains.
const HIDDEN_AUDIO_CODECS = [...DTS_FAMILY_CODECS, 'truehd', 'mlp'];
const HIDDEN_TEXT_CODECS = [...PGS_SUBTITLE_CODECS, ...BURN_IN_SUBTITLE_CODECS, 'vobsub'];
const TIZEN_TEXT_TRACK_LIMIT = 30;

export const mapJellyfinTrackToTizen = (avplayTracks, jellyfinStreams, type, jellyfinIndex) => {
	const tracks = (Array.isArray(avplayTracks) ? avplayTracks : []).filter((t) => t.type === type);
	if (tracks.length === 0) return null;

	let streams = Array.isArray(jellyfinStreams) ? jellyfinStreams : [];
	if (streams.length !== tracks.length) {
		const hidden = type === 'AUDIO' ? HIDDEN_AUDIO_CODECS : HIDDEN_TEXT_CODECS;
		streams = streams.filter((s) => !hidden.includes((s.codec || '').toLowerCase()));
	}
	if (type === 'TEXT') {
		streams = streams.slice(0, TIZEN_TEXT_TRACK_LIMIT);
	}

	const pos = streams.findIndex((s) => s.index === jellyfinIndex);
	if (pos < 0 || pos >= tracks.length) return null;
	return tracks[pos].index;
};
