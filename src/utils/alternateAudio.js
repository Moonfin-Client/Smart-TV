import {isCommentaryAudioStream, isAudioDescriptionAudioStream} from './audioTrackSelection';

// Picks another track in the same language when the set can't decode the default one, so the
// video still direct plays instead of the server re-encoding it. Null means transcode.
// Commentary and description tracks are ruled out by name, since they share the main mix's
// language and can match its channel count, and opening on the director's commentary is worse
// than a transcode.
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
