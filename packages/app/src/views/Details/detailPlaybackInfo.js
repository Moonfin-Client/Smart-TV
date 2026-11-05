import {getDeviceProfile} from '../../services/deviceProfile';

// Some servers list the reasons on the source. Jellyfin leaves them off and only writes them into
// the url it would transcode from.
const transcodeReasonsOf = (source, result) => {
	const listed = source.TranscodeReasons || source.TranscodingReasons || result?.TranscodeReasons;
	if (Array.isArray(listed) && listed.length) return listed;
	if (typeof listed === 'string' && listed) return listed.split(',');
	const match = /[?&]TranscodeReasons=([^&]+)/.exec(source.TranscodingUrl || '');
	return match ? decodeURIComponent(match[1]).split(',') : [];
};

// Asks the server how it would play this item with the tracks the screen currently has selected,
// which is what the direct play line and the reasons under it are read from.
//
// This deliberately does not go through services/playback. That one gathers device capabilities,
// negotiates codecs, opens a live stream and takes the current session over, none of which a
// details screen should set in motion just to print a word.
export const fetchDetailPlaybackInfo = async (api, {
	itemId,
	serverType,
	mediaSourceId,
	audioStreamIndex,
	subtitleStreamIndex,
	maxBitrate
} = {}) => {
	if (!api?.getPlaybackInfo || !itemId) return null;

	// Asked without a profile the server answers that it supports everything, so the line would
	// read as direct play for every title on every set.
	const deviceProfile = await getDeviceProfile(serverType, {}, api).catch(() => null);
	// The cap playback itself asks with, the viewer's own when they set one and the set's otherwise. Silo
	// gets only the viewer's own, as in playback.
	const maxStreamingBitrate = maxBitrate > 0 ? maxBitrate : serverType === 'silo' ? null : deviceProfile?.MaxStreamingBitrate;

	const body = {
		EnableDirectPlay: true,
		EnableDirectStream: true,
		EnableTranscoding: true
	};
	if (deviceProfile) body.DeviceProfile = deviceProfile;
	if (maxStreamingBitrate) body.MaxStreamingBitrate = maxStreamingBitrate;
	if (mediaSourceId) body.MediaSourceId = mediaSourceId;
	if (audioStreamIndex != null) body.AudioStreamIndex = audioStreamIndex;
	if (subtitleStreamIndex != null) body.SubtitleStreamIndex = subtitleStreamIndex;

	// Only Silo has previewPlaybackInfo, since its getPlaybackInfo opens a playback session.
	const result = await (api.previewPlaybackInfo || api.getPlaybackInfo)(itemId, body);
	const sources = result?.MediaSources || [];
	const source = (mediaSourceId && sources.find((s) => s.Id === mediaSourceId)) || sources[0];
	if (!source) return null;

	return {
		supportsDirectPlay: source.SupportsDirectPlay === true,
		supportsDirectStream: source.SupportsDirectStream === true,
		// Only some servers say why they would transcode, so nothing here means no reason was
		// given rather than that there is no reason.
		transcodeReasons: transcodeReasonsOf(source, result),
		source,
		deviceProfile,
		maxStreamingBitrate
	};
};
