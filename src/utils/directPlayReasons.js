import $L from '../services/i18n.js';
import {isVega, isXbox} from '../platform';
import {lower} from './mediaStreamFacts';

// Why a file can't direct play, in words, with a hint about the setting that would change it.
//
// The server's own reasons come first and keep their wording. It doesn't always give them, so the
// rest are worked out here by holding the file against the profile this set asked with.

const BITRATE_REASONS = [
	'videobitratenotsupported',
	'containerbitrateexceedslimit',
	'videobitrateexceedslimit',
	'bitratelimitexceeded',
	'containerbitratenotsupported',
	'audiobitratenotsupported'
];

// The methods that hand a subtitle over as it is. Anything else, Encode above all, means the server
// has to burn it into the picture.
const DIRECT_SUBTITLE_METHODS = ['embed', 'external', 'hls'];

const listOf = (value) => lower(value).split(',').map((part) => part.trim()).filter(Boolean);

const wholeNumber = (value) => {
	const number = typeof value === 'number' ? value : parseInt(value, 10);
	return isFinite(number) ? Math.trunc(number) : null;
};

const streamsOfType = (streams, type) => streams.filter((stream) => lower(stream?.Type) === type);

const codecOf = (stream) => lower(stream?.Codec) || null;

// The stream the server worked from, or the first of that type when nothing said which.
const selectedStream = (streams, type, index) => {
	const ofType = streamsOfType(streams, type);
	if (!ofType.length) return null;
	if (index != null) {
		for (let i = 0; i < ofType.length; i++) {
			if (ofType[i].Index === index) return ofType[i];
		}
	}
	return ofType[0];
};

// A profile that leaves the key off accepts anything, so an empty list is no opinion rather than a
// rejection.
const rejects = (profiles, key, value) => {
	const allowed = [];
	profiles.forEach((profile) => listOf(profile[key]).forEach((entry) => allowed.push(entry)));
	return allowed.length > 0 && allowed.indexOf(value) === -1;
};

const directPlayProfiles = (deviceProfile, type) =>
	(Array.isArray(deviceProfile?.DirectPlayProfiles) ? deviceProfile.DirectPlayProfiles : [])
		.filter((profile) => profile && lower(profile.Type) === type);

const codecProfiles = (deviceProfile, type, codec) =>
	(Array.isArray(deviceProfile?.CodecProfiles) ? deviceProfile.CodecProfiles : [])
		.filter((profile) => {
			if (!profile || lower(profile.Type) !== lower(type)) return false;
			const codecs = listOf(profile.Codec);
			return !codec || !codecs.length || codecs.indexOf(codec) !== -1;
		});

const conditionsOf = (profiles, property) => {
	const found = [];
	profiles.forEach((profile) => {
		(Array.isArray(profile.Conditions) ? profile.Conditions : []).forEach((condition) => {
			if (condition && condition.Property === property) found.push(condition);
		});
	});
	return found;
};

const normalizeRange = (token) => lower(token).replace(/_/g, '');

const subtitleNeedsBurnIn = (subtitleProfiles, format) => {
	for (let i = 0; i < subtitleProfiles.length; i++) {
		const profile = subtitleProfiles[i];
		if (listOf(profile?.Format).indexOf(format) === -1) continue;
		if (listOf(profile.Method).some((method) => DIRECT_SUBTITLE_METHODS.indexOf(method) !== -1)) return false;
	}
	return true;
};

// Every reason the source can't direct play, the server's first and then whatever the profile
// shows, each carrying what its message needs.
const resolveDirectPlayFailureDetails = ({
	serverReasons = [],
	mediaStreams = [],
	container,
	sourceBitrate,
	maxStreamingBitrate,
	audioStreamIndex,
	subtitleStreamIndex,
	deviceProfile
} = {}) => {
	const details = [];
	const seen = [];
	const add = (detail, alsoCovers = []) => {
		const key = lower(detail.reason);
		if (seen.indexOf(key) !== -1 || alsoCovers.some((covered) => seen.indexOf(covered) !== -1)) return;
		details.push(detail);
		seen.push(key);
	};

	const video = streamsOfType(mediaStreams, 'video');
	const audioOnly = !video.length && streamsOfType(mediaStreams, 'audio').length > 0;
	const profiles = directPlayProfiles(deviceProfile, audioOnly ? 'audio' : 'video');
	const normalizedContainer = lower(container) || null;

	const audioStream = selectedStream(mediaStreams, 'audio', audioStreamIndex);
	const audioCodec = codecOf(audioStream);
	const videoStream = video[0] || null;
	const videoCodec = codecOf(videoStream);
	const subtitleStream = subtitleStreamIndex != null && subtitleStreamIndex >= 0
		? selectedStream(mediaStreams, 'subtitle', subtitleStreamIndex)
		: null;
	const subtitleCodec = codecOf(subtitleStream);

	serverReasons.forEach((reason) => {
		if (!reason) return;
		const key = lower(reason);
		if (key === 'audiocodecnotsupported') {
			details.push({reason, codec: audioCodec});
		} else if (key === 'videocodecnotsupported') {
			details.push({reason, codec: videoCodec});
		} else if (key === 'subtitlecodecnotsupported') {
			details.push({reason, codec: subtitleCodec});
		} else if (key === 'containernotsupported') {
			details.push({reason, container: normalizedContainer});
		} else if (BITRATE_REASONS.indexOf(key) !== -1) {
			details.push({reason, sourceBitrate, maxStreamingBitrate});
		} else if (key === 'audiochannelsnotsupported') {
			details.push({reason, codec: audioCodec, audioChannels: audioStream ? wholeNumber(audioStream.Channels) : null});
		} else {
			details.push({reason});
		}
		seen.push(key);
	});

	if (maxStreamingBitrate != null && sourceBitrate != null && sourceBitrate > maxStreamingBitrate) {
		add({reason: 'VideoBitrateExceedsLimit', sourceBitrate, maxStreamingBitrate}, BITRATE_REASONS);
	}

	if (normalizedContainer && profiles.length && rejects(profiles, 'Container', normalizedContainer)) {
		add({reason: 'ContainerNotSupported', container: normalizedContainer});
	}

	if (!mediaStreams.length) return details;

	if (videoCodec && profiles.length && rejects(profiles, 'VideoCodec', videoCodec)) {
		add({reason: 'VideoCodecNotSupported', codec: videoCodec});
	}

	if (videoStream && videoCodec) {
		const videoProfiles = codecProfiles(deviceProfile, 'Video', videoCodec);

		const rangeType = String(videoStream.VideoRangeType || '').trim();
		if (rangeType) {
			const streamRange = normalizeRange(rangeType);
			conditionsOf(videoProfiles, 'VideoRangeType').some((condition) => {
				const tokens = String(condition.Value || '').split('|').map(normalizeRange).filter(Boolean);
				const listed = tokens.indexOf(streamRange) !== -1;
				if ((condition.Condition === 'NotEquals' && listed) || (condition.Condition === 'EqualsAny' && !listed)) {
					add({reason: 'VideoRangeTypeNotSupported', codec: videoCodec, rangeType});
					return true;
				}
				return false;
			});
		}

		const streamProfile = lower(videoStream.Profile);
		if (streamProfile) {
			conditionsOf(videoProfiles, 'VideoProfile').some((condition) => {
				const tokens = lower(condition.Value).split('|').map((token) => token.trim());
				const listed = tokens.indexOf(streamProfile) !== -1;
				if ((condition.Condition === 'EqualsAny' && !listed) || (condition.Condition === 'NotEquals' && listed)) {
					add({reason: 'VideoProfileNotSupported', codec: videoCodec, videoProfile: streamProfile});
					return true;
				}
				return false;
			});
		}

		const bitDepth = wholeNumber(videoStream.BitDepth);
		if (bitDepth != null) {
			conditionsOf(videoProfiles, 'VideoBitDepth').some((condition) => {
				const maxDepth = wholeNumber(condition.Value);
				if (condition.Condition === 'LessThanEqual' && maxDepth != null && bitDepth > maxDepth) {
					add({reason: 'VideoBitDepthNotSupported', codec: videoCodec});
					return true;
				}
				return false;
			});
		}
	}

	if (audioCodec && profiles.length && rejects(profiles, 'AudioCodec', audioCodec)) {
		add({reason: 'AudioCodecNotSupported', codec: audioCodec});
	}

	const channels = audioStream ? wholeNumber(audioStream.Channels) : null;
	if (channels != null && audioCodec) {
		conditionsOf(codecProfiles(deviceProfile, 'VideoAudio', audioCodec), 'AudioChannels').some((condition) => {
			const maxChannels = wholeNumber(condition.Value);
			if (condition.Condition === 'LessThanEqual' && maxChannels != null && channels > maxChannels) {
				add({reason: 'AudioChannelsNotSupported', codec: audioCodec, audioChannels: channels});
				return true;
			}
			return false;
		});
	}

	const subtitleProfiles = Array.isArray(deviceProfile?.SubtitleProfiles) ? deviceProfile.SubtitleProfiles : [];
	if (subtitleProfiles.length) {
		let targetIndex = subtitleStreamIndex;
		if (targetIndex == null) {
			const flagged = streamsOfType(mediaStreams, 'subtitle').find((stream) => stream.IsDefault === true || stream.IsForced === true);
			if (flagged) targetIndex = wholeNumber(flagged.Index);
		}
		if (targetIndex != null && targetIndex >= 0) {
			const codec = codecOf(selectedStream(mediaStreams, 'subtitle', targetIndex));
			if (codec && subtitleNeedsBurnIn(subtitleProfiles, codec)) {
				add({reason: 'SubtitleCodecNotSupported', codec});
			}
		}
	}

	if (!details.length && !serverReasons.length) details.push({reason: 'DirectPlayError'});

	return details;
};

const SHORT_LABELS = () => ({
	ContainerNotSupported: $L('Container format is not supported by the player.'),
	VideoCodecNotSupported: $L('Video codec is not supported.'),
	AudioCodecNotSupported: $L('Audio codec is not supported.'),
	SubtitleCodecNotSupported: $L('Subtitle format is not supported (requires burning).'),
	AudioProfileNotSupported: $L('Audio profile is not supported.'),
	VideoProfileNotSupported: $L('Video profile is not supported.'),
	VideoLevelNotSupported: $L('Video level is not supported.'),
	VideoResolutionNotSupported: $L('Video resolution is not supported by this device.'),
	VideoBitDepthNotSupported: $L('Video bit depth is not supported.'),
	VideoFramerateNotSupported: $L('Video framerate is not supported.'),
	ContainerBitrateExceedsLimit: $L('File bitrate exceeds player streaming limit.'),
	VideoBitrateExceedsLimit: $L('Video bitrate exceeds streaming limit.'),
	AudioBitrateExceedsLimit: $L('Audio bitrate exceeds streaming limit.'),
	AudioChannelsNotSupported: $L('Number of audio channels is not supported.')
});

// One server reason as a short phrase, or the reason itself for anything a server adds later.
export const transcodeReasonLabel = (reason) => SHORT_LABELS()[reason] || reason;

const mbps = (bitrate) => `${(bitrate / 1000000).toFixed(1)} Mbps`;

// The sentence for one reason, and the hint when a setting on this set would change it.
const formatDirectPlayReason = (detail, settings = {}) => {
	const reason = detail.reason;
	const codec = detail.codec ? detail.codec.toUpperCase() : null;
	const key = lower(reason);

	if (key === 'audiocodecnotsupported') {
		if (!codec) return {description: $L('Audio codec is not supported.')};
		const passthrough = settings.audioPassthroughMode || 'auto';
		return {
			description: $L('Audio codec ({codec}) is not supported directly.').replace('{codec}', codec),
			// Neither Fire TV nor Xbox has a passthrough setting that would let this codec play.
			hint: !isVega() && !isXbox() && (passthrough === 'disabled' || passthrough === 'auto')
				? $L('Tip: If your audio receiver or soundbar supports {codec}, enable Audio Passthrough in Audio Preferences.').replace('{codec}', codec)
				: null
		};
	}

	if (key === 'audiochannelsnotsupported') {
		return {
			description: detail.audioChannels != null
				? $L('Audio channel count ({channels}ch) exceeds the player limit.').replace('{channels}', detail.audioChannels)
				: $L('Number of audio channels is not supported.'),
			hint: $L('Tip: Adjust \'Max Audio Channels\' or multichannel downmixing in Audio Preferences.')
		};
	}

	if (key === 'subtitlecodecnotsupported') {
		const subtitleCodec = lower(detail.codec);
		if (subtitleCodec.indexOf('ass') !== -1 || subtitleCodec.indexOf('ssa') !== -1) {
			return settings.assDirectPlay === false
				? {
					description: $L('ASS/SSA subtitles require transcoding because direct play is turned off.'),
					hint: $L('Tip: Enable \'Direct play ASS/SSA subtitles\' in Subtitle Preferences to play directly without transcoding.')
				}
				: {description: $L('Subtitle format ({codec}) is not supported directly and must be burned in.').replace('{codec}', codec)};
		}
		if (subtitleCodec.indexOf('pgs') !== -1) {
			return settings.enablePgsRendering === false
				? {
					description: $L('PGS subtitles require transcoding because direct play is turned off.'),
					hint: $L('Tip: Enable \'Direct play PGS subtitles\' in Subtitle Preferences to play directly without transcoding.')
				}
				: {description: $L('Subtitle format ({codec}) is not supported directly and must be burned in.').replace('{codec}', 'PGS')};
		}
		return {
			description: codec
				? $L('Subtitle format ({codec}) is not supported directly and must be burned in.').replace('{codec}', codec)
				: $L('Subtitle format is not supported (requires burning).')
		};
	}

	if (key === 'audiobitratenotsupported' || key === 'audiobitrateexceedslimit') {
		return {
			description: $L('Audio bitrate exceeds streaming limit.'),
			hint: $L('Tip: Increase \'Max Streaming Bitrate\' in Video Playback Preferences to allow direct streaming.')
		};
	}

	if (BITRATE_REASONS.indexOf(key) !== -1) {
		let description;
		if (detail.sourceBitrate != null && detail.maxStreamingBitrate != null) {
			description = $L('File bitrate ({fileBitrate}) exceeds the configured streaming limit ({maxBitrate}).')
				.replace('{fileBitrate}', mbps(detail.sourceBitrate))
				.replace('{maxBitrate}', mbps(detail.maxStreamingBitrate));
		} else {
			description = key === 'containerbitrateexceedslimit'
				? $L('File bitrate exceeds player streaming limit.')
				: $L('Video bitrate exceeds streaming limit.');
		}
		return {
			description,
			hint: $L('Tip: Increase \'Max Streaming Bitrate\' in Video Playback Preferences to allow direct streaming.')
		};
	}

	const plain = {
		containernotsupported: () => $L('Container format is not supported by the player.'),
		videocodecnotsupported: () => $L('Video codec is not supported.'),
		videorangetypenotsupported: () => $L('Video dynamic range (e.g. Dolby Vision / HDR) is not supported by this display.'),
		audioprofilenotsupported: () => $L('Audio profile is not supported.'),
		videoprofilenotsupported: () => $L('Video profile is not supported.'),
		videolevelnotsupported: () => $L('Video level is not supported.'),
		videoresolutionnotsupported: () => $L('Video resolution is not supported by this device.'),
		videobitdepthnotsupported: () => $L('Video bit depth is not supported.'),
		videoframeratenotsupported: () => $L('Video framerate is not supported.'),
		audiosampleratenotsupported: () => $L('Audio sample rate is not supported.'),
		audiobitdepthnotsupported: () => $L('Audio bit depth is not supported.'),
		refframesnotsupported: () => $L('Video reference frames exceed player limits.'),
		anamorphicvideonotsupported: () => $L('Anamorphic video is not supported.'),
		interlacedvideonotsupported: () => $L('Interlaced video is not supported.'),
		secondaryaudionotsupported: () => $L('Secondary audio stream requires transcoding.'),
		directplayerror: () => $L('Direct play is not supported for this media format.')
	}[key];
	return {description: plain ? plain() : reason};
};

// Every reason the source can't direct play, as sentences with their hints.
export const buildDirectPlayReasonItems = ({
	serverReasons = [],
	mediaSource,
	deviceProfile,
	settings,
	audioStreamIndex,
	subtitleStreamIndex,
	maxStreamingBitrate
}) => resolveDirectPlayFailureDetails({
	serverReasons,
	mediaStreams: Array.isArray(mediaSource?.MediaStreams) ? mediaSource.MediaStreams : [],
	container: mediaSource?.Container,
	sourceBitrate: wholeNumber(mediaSource?.Bitrate),
	maxStreamingBitrate,
	audioStreamIndex,
	subtitleStreamIndex,
	deviceProfile
}).map((detail) => formatDirectPlayReason(detail, settings));
