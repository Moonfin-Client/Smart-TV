// Playback in the Vega WebView.
//
// The WebView plays through a plain HTML5 video element, so the element, its
// cleanup and the visibility handling are the webOS ones. What differs is which
// files it can take as they are, and that there is no hardware window, screen
// saver guard or audio output to drive from here.
import {videoRangeTypeOf} from '@moonfin/app/src/utils/videoRange';
import {getSharedVideoElement as sharedVideoElement} from '@moonfin/platform-webos/video';
import {onShellMessage} from './bridge';
import {MAX_BITRATE} from './deviceProfile';

export {
	getMimeType,
	canRenderEmbeddedPgsInBand,
	cleanupVideoElement,
	waitForDecoderRelease,
	setupVisibilityHandler
} from '@moonfin/platform-webos/video';
export {readTrailerManifest} from './youtubeManifest';

export const getSharedVideoElement = () => {
	const video = sharedVideoElement();
	video.disableRemotePlayback = true;
	return video;
};

// A backgrounded app may keep no more than 150 MB and loses the decoder, so the
// player lets go of playback and the user comes back to the details page.
export const leavesPlayerInBackground = true;

// The display coming and going is the shell's news, since the page only hears
// about its own visibility.
export const registerAppStateObserver = (onForeground, onBackground) => {
	const onVisibility = () => (document.hidden ? onBackground?.() : onForeground?.());
	document.addEventListener('visibilitychange', onVisibility);
	const removeDisplay = onShellMessage('DISPLAY_CHANGED', ({connected}) => (connected ? onForeground?.() : onBackground?.()));
	return () => {
		document.removeEventListener('visibilitychange', onVisibility);
		removeDisplay();
	};
};

// The page cant count on the WebView noticing a dropped network on its own, so
// the shell's word on it becomes the online and offline events the no
// connection screen listens for. The first message only says where things
// stand at boot. The remote's menu key arrives the same way, only as it is let
// go, and is raised on whatever has focus as the context menu key.
export const setupVegaLifecycle = () => {
	let connected = null;
	const removeNetwork = onShellMessage('NETWORK', (payload) => {
		const now = payload?.connected !== false;
		if (connected !== null && now !== connected) window.dispatchEvent(new Event(now ? 'online' : 'offline'));
		connected = now;
	});
	const removeKeys = onShellMessage('KEY', (payload) => {
		if (payload?.key !== 'Menu' || payload.action !== 'up') return;
		const target = document.activeElement || document.body;
		target.dispatchEvent(new window.KeyboardEvent('keydown', {key: 'ContextMenu', keyCode: 93, which: 93, bubbles: true, cancelable: true}));
	});
	return () => {
		removeNetwork();
		removeKeys();
	};
};

export const getSupportedAudioCodecs = (capabilities) => {
	const codecs = ['aac', 'mp3', 'mp2', 'flac', 'opus', 'vorbis', 'pcm_s16le', 'pcm_s24le'];
	if (capabilities.ac3) codecs.push('ac3');
	if (capabilities.eac3) codecs.push('eac3', 'ec3');
	if (capabilities.dts) codecs.push('dts', 'dca');
	return codecs;
};

export const isAudioStreamPlayable = (stream, capabilities) => {
	if (!stream) return false;
	const codec = (stream.Codec || '').toLowerCase();
	return !codec || getSupportedAudioCodecs(capabilities).includes(codec);
};

// No MPEG-TS, the WebView cant open one, so the server remuxes it
const VIDEO_CONTAINERS = ['mp4', 'm4v', 'mov', 'mkv', 'matroska', 'webm'];

// The decoder limits Amazon lists per stick. The 4K Select takes more H.264
// than the newer sticks and the HD stick takes less VP9. HEVC remuxes play far
// past the 35 Mbps Amazon gives, so HEVC goes up to what Auto asks the server for.
const BITRATE_CAPS = {
	AFTCA002: {h264: 30_000_000, hevc: MAX_BITRATE, vp9: 30_000_000},
	AFTCL001: {h264: 20_000_000, hevc: MAX_BITRATE, vp9: 20_000_000, av1: 25_000_000},
	default: {h264: 20_000_000, hevc: MAX_BITRATE, vp9: 30_000_000, av1: 25_000_000}
};
const CODEC_FAMILY = {h264: 'h264', avc: 'h264', hevc: 'hevc', h265: 'hevc', hev1: 'hevc', hvc1: 'hevc', dvh1: 'hevc', vp9: 'vp9', av1: 'av1', av01: 'av1'};

const decoderBitrateCap = (modelName, videoCodec) => {
	const caps = BITRATE_CAPS[modelName] || BITRATE_CAPS.default;
	return caps[CODEC_FAMILY[videoCodec]] || 40_000_000;
};
const AUDIO_CONTAINERS = ['mp3', 'aac', 'm4a', 'm4b', 'flac', 'ogg', 'oga', 'opus', 'wav', 'webma'];

// Without Dolby Vision of its own the WebView plays the base layer of a dual
// layer file and nothing else of the Dolby kind.
const rangeOk = (videoStream, capabilities) => {
	const rangeType = (videoRangeTypeOf(videoStream) || '').toUpperCase();
	if (!rangeType || rangeType === 'SDR') return true;
	// Profile 7 and DOVIInvalid play as their HDR10 base layer, though their names don't say HDR10
	if (rangeType === 'DOVIWITHEL' || rangeType === 'DOVIINVALID') return capabilities.hdr10;
	if (rangeType.startsWith('DOVIWITH')) {
		if (rangeType.includes('HDR10')) return capabilities.hdr10;
		if (rangeType.includes('HLG')) return capabilities.hlg;
		return rangeType.includes('SDR');
	}
	if (rangeType.includes('DOVI') || rangeType.includes('DOLBY') || rangeType === 'DV') return false;
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
	if (capabilities.hevc) videoCodecs.push('hevc', 'h265', 'hev1', 'hvc1', 'dvh1');
	if (capabilities.av1) videoCodecs.push('av1', 'av01');
	if (capabilities.vp9) videoCodecs.push('vp9');
	const videoCodec = (videoStream.Codec || '').toLowerCase();

	const videoOk = !videoCodec || videoCodecs.includes(videoCodec);
	const containerOk = !container || containerParts.some((part) => VIDEO_CONTAINERS.includes(part));
	const hdrOk = rangeOk(videoStream, capabilities);
	const maxBitrate = options.maxBitrate > 0 ? options.maxBitrate : decoderBitrateCap(capabilities.modelName, videoCodec);
	const bitrateOk = !videoStream.BitRate || videoStream.BitRate <= maxBitrate;

	console.log('[vegaVideo] Compatibility check:', {videoOk, audioOk, containerOk, hdrOk, bitrateOk});

	const playable = videoOk && audioOk && containerOk && hdrOk && bitrateOk;
	if (mediaSource.SupportsDirectPlay && playable) return 'DirectPlay';
	if (mediaSource.SupportsDirectStream && playable) return 'DirectStream';
	return 'Transcode';
};

export const setDisplayWindow = async () => false;

export const keepScreenOn = async () => true;

export const getAudioOutputInfo = async () => null;
