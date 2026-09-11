import {isCommentaryAudioStream, isAudioDescriptionAudioStream} from './audioTrackSelection';

/**
 * Picks a stand-in for a default audio track the set cannot decode.
 *
 * The file marks one track as default and that is the one the TV decodes on its
 * own. When it cannot, the negotiation looks for another track of the same
 * language it can decode, so the video still direct plays instead of the server
 * re-encoding it.
 *
 * Commentary and description tracks are ruled out by name. They carry the same
 * language as the main mix and can be a full surround mix of their own, so the
 * channel count cannot tell them apart, and opening an episode on the director's
 * commentary is worse than transcoding it.
 *
 * Reads the raw MediaStreams of a PlaybackInfo response, the shape the
 * negotiation still holds when this runs.
 *
 * @param {Array} mediaStreams - every stream the media source lists
 * @param {Object} defaultStream - the audio track the file marks as default
 * @param {Function} isPlayable - tells whether this set can decode a track
 * @returns {Object|null} the track to negotiate on, or null to transcode
 */
export const selectCompatibleAlternateAudio = (mediaStreams, defaultStream, isPlayable) => {
	if (!defaultStream) return null;

	const language = defaultStream.Language;

	return (mediaStreams || [])
		.filter((s) => s.Type === 'Audio' && s.Index !== defaultStream.Index &&
			(!language || s.Language === language) &&
			!isCommentaryAudioStream(s) && !isAudioDescriptionAudioStream(s) &&
			isPlayable(s))
		.sort((a, b) => (b.Channels || 0) - (a.Channels || 0))[0] || null;
};
