import {getItemAudioPref, getSeriesAudioPref} from '../../services/subtitlePrefs';
import {matchSeriesTrackIndex} from '../../utils/seriesTrackPrefs';

/**
 * The audio track remembered for this title, or else for its series when one of the
 * episode's own tracks can still be it. Null leaves the choice to the language preferences.
 */
export const resolveSeriesAudio = async (item, audioStreams) => {
	if (!item?.Id || !audioStreams?.length) return null;

	const itemIndex = await getItemAudioPref(item.Id);
	const itemTrack = itemIndex != null ? audioStreams.find((stream) => stream.index === itemIndex) : null;
	if (itemTrack) return itemTrack;
	if (!item.SeriesId) return null;

	const pref = await getSeriesAudioPref(item.SeriesId);
	if (!pref) return null;

	const matched = matchSeriesTrackIndex(audioStreams, pref);
	if (matched === null || matched < 0) return null;

	return audioStreams.find((stream) => stream.index === matched) || null;
};

// A player track in the server's spelling, which is what the playability check reads.
export const asServerAudioStream = (stream) => (stream
	? {Codec: stream.codec, Profile: stream.profile, Title: stream.title, DisplayTitle: stream.displayTitle, ChannelLayout: stream.channelLayout, Channels: stream.channels}
	: null);

/**
 * The track direct play starts on. AVPlay leaves a track the set cant decode out of its own list,
 * so a remembered or default pick like that would show as playing while another track plays. The
 * track the server settled on stands in for it.
 */
export const directPlayAudio = async (pick, audioStreams, negotiatedIndex, canPlay) => {
	if (!pick || pick.index === negotiatedIndex || await canPlay(pick)) return pick;
	return audioStreams?.find((stream) => stream.index === negotiatedIndex) || pick;
};
