import {getDeviceCapabilities} from '../../services/deviceProfile';

const STREAM_URL_KEYS = /^(container|segmentcontainer|videocodec|audiocodec|audiochannels|maxaudiochannels|transcodingmaxaudiochannels|videobitrate|maxwidth|maxheight|maxframerate|transcodereasons)$|-(level|profile|rangetype|audiochannels|videobitdepth)$/i;

const decode = (value) => {
	try {
		return decodeURIComponent(value);
	} catch (e) {
		return value;
	}
};

// What a stream URL asks the server to send, so a report of the player refusing a stream says what
// it was given. Only the format keys are kept, never the token.
export const describeStreamUrl = (url) => {
	if (!url) return null;
	const [path, query = ''] = String(url).split('?');
	const format = {file: path.split('/').pop()};
	query.split('&').forEach((pair) => {
		const [key, value = ''] = pair.split('=');
		if (STREAM_URL_KEYS.test(key)) format[key] = decode(value);
	});
	return format;
};

// The fields a device profile turns a stream away on. Without the range type and the bit
// depth beside them, a report of a forced transcode leaves the reason to guesswork.
export const describeVideoStream = (stream) => {
	if (!stream) return null;
	return {
		codec: stream.Codec,
		profile: stream.Profile,
		level: stream.Level,
		bitDepth: stream.BitDepth,
		videoRange: stream.VideoRange,
		videoRangeType: stream.VideoRangeType,
		dvProfile: stream.DvProfile,
		dvLevel: stream.DvLevel,
		dvBlSignalCompatibilityId: stream.DvBlSignalCompatibilityId,
		width: stream.Width,
		height: stream.Height,
		bitRate: stream.BitRate
	};
};

// What the set told the app it can show. The ranges the profile offers are built from
// these, and the panel size decides the level and bitrate ceilings that go with them.
export const describeVideoSupport = (caps) => {
	if (!caps) return null;
	return {
		hdr10: caps.hdr10,
		hdr10Plus: caps.hdr10Plus,
		hlg: caps.hlg,
		dolbyVision: caps.dolbyVision,
		uhd: caps.uhd,
		uhd8K: caps.uhd8K
	};
};

// Capabilities are read once and held, so this costs nothing after the profile is built.
// A set that fails to answer leaves the report without them rather than stopping playback.
export const readVideoSupport = async () =>
	describeVideoSupport(await getDeviceCapabilities().catch(() => null));
