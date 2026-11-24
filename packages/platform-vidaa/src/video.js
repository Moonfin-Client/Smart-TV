// Playback in the VIDAA browser.
//
// The browser plays through a plain HTML5 video element backed by the TV's
// hardware pipeline, so the element, its cleanup and the visibility handling
// are the webOS ones. What differs is which files it takes as they are: MKV
// goes to the TV's media engine, MPEG-TS is remuxed by the server to fMP4 HLS.
import {videoRangeTypeOf} from '@moonfin/app/src/utils/videoRange';
import {getSharedVideoElement as sharedVideoElement} from '@moonfin/platform-webos/video';
import {MAX_BITRATE} from './deviceProfile';

export {
	getMimeType,
	canRenderEmbeddedPgsInBand,
	cleanupVideoElement,
	waitForDecoderRelease,
	setupVisibilityHandler
} from '@moonfin/platform-webos/video';

export const getSharedVideoElement = () => {
	const video = sharedVideoElement();
	video.disableRemotePlayback = true;
	return video;
};

export const registerAppStateObserver = (onForeground, onBackground) => {
	const onVisibility = () => (document.hidden ? onBackground?.() : onForeground?.());
	document.addEventListener('visibilitychange', onVisibility);
	return () => document.removeEventListener('visibilitychange', onVisibility);
};

export const getSupportedAudioCodecs = (capabilities) => {
	const codecs = ['aac', 'mp3', 'mp2', 'flac', 'opus', 'vorbis', 'pcm_s16le', 'pcm_s24le'];
	if (capabilities.ac3) codecs.push('ac3');
	if (capabilities.eac3) codecs.push('eac3', 'ec3');
	if (capabilities.dts) codecs.push('dts', 'dca');
	if (capabilities.truehd) codecs.push('truehd', 'mlp');
	return codecs;
};

export const isAudioStreamPlayable = (stream, capabilities) => {
	if (!stream) return false;
	const codec = (stream.Codec || '').toLowerCase();
	return !codec || getSupportedAudioCodecs(capabilities).includes(codec);
};

const VIDEO_CONTAINERS = ['mp4', 'm4v', 'mov', 'webm', 'mkv', 'matroska'];
const AUDIO_CONTAINERS = ['mp3', 'aac', 'm4a', 'm4b', 'flac', 'ogg', 'oga', 'opus', 'wav', 'webma'];

// Dolby Vision without the browser's word for it plays as its HDR10 base layer.
const rangeOk = (videoStream, capabilities) => {
	const rangeType = (videoRangeTypeOf(videoStream) || '').toUpperCase();
	if (!rangeType || rangeType === 'SDR') return true;
	if (rangeType === 'DOVIWITHEL' || rangeType === 'DOVIINVALID') return capabilities.hdr10;
	if (rangeType.startsWith('DOVIWITH')) {
		if (rangeType.includes('HDR10')) return capabilities.hdr10;
		if (rangeType.includes('HLG')) return capabilities.hlg;
		return rangeType.includes('SDR');
	}
	if (rangeType.includes('DOVI') || rangeType.includes('DOLBY') || rangeType === 'DV') return !!capabilities.dolbyVision;
	if (rangeType.includes('HLG')) return capabilities.hlg || capabilities.hdr10;
	if (rangeType.includes('HDR')) return capabilities.hdr10;
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

	const videoCodecs = ['h264', 'avc', 'vp8'];
	if (capabilities.hevc) videoCodecs.push('hevc', 'h265', 'hev1', 'hvc1', 'dvh1', 'dvhe');
	if (capabilities.av1) videoCodecs.push('av1', 'av01');
	if (capabilities.vp9) videoCodecs.push('vp9');
	const videoCodec = (videoStream.Codec || '').toLowerCase();

	const videoOk = !videoCodec || videoCodecs.includes(videoCodec);
	const containerOk = !container || containerParts.some((part) => VIDEO_CONTAINERS.includes(part));
	const hdrOk = rangeOk(videoStream, capabilities);
	const maxBitrate = options.maxBitrate > 0 ? options.maxBitrate : MAX_BITRATE;
	const bitrateOk = !videoStream.BitRate || videoStream.BitRate <= maxBitrate;

	console.log('[vidaaVideo] Compatibility check:', {videoOk, audioOk, containerOk, hdrOk, bitrateOk});

	const playable = videoOk && audioOk && containerOk && hdrOk && bitrateOk;
	if (mediaSource.SupportsDirectPlay && playable) return 'DirectPlay';
	if (mediaSource.SupportsDirectStream && playable) return 'DirectStream';
	return 'Transcode';
};

export const setDisplayWindow = async () => false;

export const keepScreenOn = async () => true;

export const getAudioOutputInfo = async () => null;
