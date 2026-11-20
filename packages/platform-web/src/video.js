// The element, its cleanup and the visibility handling are the webOS ones, which never touch Luna.
import {videoRangeTypeOf} from '@moonfin/app/src/utils/videoRange';

export {
	getMimeType,
	canRenderEmbeddedPgsInBand,
	cleanupVideoElement,
	waitForDecoderRelease,
	setupVisibilityHandler,
	getSharedVideoElement
} from '@moonfin/platform-webos/video';

export const registerAppStateObserver = (onForeground, onBackground) => {
	const onVisibility = () => (document.hidden ? onBackground?.() : onForeground?.());
	document.addEventListener('visibilitychange', onVisibility);
	return () => document.removeEventListener('visibilitychange', onVisibility);
};

export const getSupportedAudioCodecs = (capabilities) => {
	const codecs = ['aac', 'mp3'];
	if (capabilities.ac3) codecs.push('ac3');
	if (capabilities.eac3) codecs.push('eac3', 'ec3');
	if (capabilities.flac) codecs.push('flac');
	if (capabilities.opus) codecs.push('opus', 'vorbis');
	return codecs;
};

export const isAudioStreamPlayable = (stream, capabilities) => {
	if (!stream) return false;
	const codec = (stream.Codec || '').toLowerCase();
	return !codec || getSupportedAudioCodecs(capabilities).includes(codec);
};

const AUDIO_CONTAINERS = ['mp3', 'aac', 'm4a', 'm4b', 'wav', 'flac', 'ogg', 'oga', 'opus', 'webma', 'webm'];

const videoContainers = (capabilities) => ['mp4', 'm4v'].concat(
	capabilities.webm ? ['webm'] : [],
	capabilities.mkv ? ['mkv', 'matroska'] : [],
	capabilities.ts ? ['ts', 'mpegts'] : []
);

// Dolby Vision only plays where a device has been seen to do it, and none has yet.
const rangeOk = (videoStream, capabilities) => {
	const rangeType = (videoRangeTypeOf(videoStream) || '').toUpperCase();
	if (!rangeType || rangeType === 'SDR') return true;
	if (rangeType.includes('DOVI') || rangeType.includes('DOLBY') || rangeType === 'DV') return !!capabilities.dolbyVision;
	if (rangeType.includes('HLG')) return !!capabilities.hlg;
	if (rangeType.includes('HDR')) return !!capabilities.hdr10;
	return true;
};

export const getPlayMethod = (mediaSource, capabilities, options = {}) => {
	if (!mediaSource) return 'Transcode';

	const container = (mediaSource.Container || '').toLowerCase();
	const containerParts = container.split(',').map((part) => part.trim());
	const streams = mediaSource.MediaStreams || [];
	const videoStream = streams.find((stream) => stream.Type === 'Video');
	const audioStreams = streams.filter((stream) => stream.Type === 'Audio');

	const audioOk = audioStreams.length === 0 || audioStreams.some((stream) => isAudioStreamPlayable(stream, capabilities));

	if (!videoStream) {
		const audioContainerOk = !container || containerParts.some((part) => AUDIO_CONTAINERS.includes(part));
		if (mediaSource.SupportsDirectPlay && audioOk && audioContainerOk) return 'DirectPlay';
		if (mediaSource.SupportsDirectStream && audioOk) return 'DirectStream';
		return 'Transcode';
	}

	const videoCodecs = ['h264', 'avc'];
	if (capabilities.hevc) videoCodecs.push('hevc', 'h265', 'hev1', 'hvc1');
	if (capabilities.av1) videoCodecs.push('av1', 'av01');
	if (capabilities.webm) videoCodecs.push('vp8', 'vp9');
	const videoCodec = (videoStream.Codec || '').toLowerCase();

	const videoOk = !videoCodec || videoCodecs.includes(videoCodec);
	const containerOk = !container || containerParts.some((part) => videoContainers(capabilities).includes(part));
	const hdrOk = rangeOk(videoStream, capabilities);
	const maxBitrate = options.maxBitrate > 0 ? options.maxBitrate : capabilities.maxBitrate;
	const bitrateOk = !videoStream.BitRate || !maxBitrate || videoStream.BitRate <= maxBitrate;

	console.log('[webVideo] Compatibility check:', {videoOk, audioOk, containerOk, hdrOk, bitrateOk});

	const playable = videoOk && audioOk && containerOk && hdrOk && bitrateOk;
	if (mediaSource.SupportsDirectPlay && playable) return 'DirectPlay';
	if (mediaSource.SupportsDirectStream && playable) return 'DirectStream';
	return 'Transcode';
};

export const setDisplayWindow = async () => false;

// The screen saver is the browser's or the TV's, and a wake lock is the only way a
// page has to hold it off. It's let go whenever the page is hidden.
let wakeLock = null;
export const keepScreenOn = async (enable) => {
	try {
		if (!enable) {
			await wakeLock?.release();
			wakeLock = null;
		} else if (!wakeLock && navigator.wakeLock) {
			wakeLock = await navigator.wakeLock.request('screen');
			wakeLock.addEventListener('release', () => {
				wakeLock = null;
			});
		}
	} catch (e) {
		// A wake lock is best effort and refused on a hidden page.
	}
	return true;
};

export const getAudioOutputInfo = async () => null;
