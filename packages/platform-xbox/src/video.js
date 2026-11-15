// Playback on Xbox.
//
// The host has the console's own player behind the WebView, and that is what the
// page's video element drives unless the viewer turns it off, see nativeVideo.js.
// Otherwise the WebView plays through a plain HTML5 video element, and the element,
// its cleanup and the visibility handling are the webOS ones. Either way the screen,
// the app's comings and goings and the media remote are the host's to report.
import {isBurnInSubtitleCodec} from '@moonfin/app/src/utils/subtitleCodecs';
import {videoRangeTypeOf} from '@moonfin/app/src/utils/videoRange';
import {
	getSharedVideoElement as sharedVideoElement,
	cleanupVideoElement as cleanupWebVideoElement,
	waitForDecoderRelease as waitForWebDecoderRelease
} from '@moonfin/platform-webos/video';
import {onShellMessage, postToShell} from './bridge';
import {noteHevcRefusal} from './deviceProfile';
import {getState} from './hostPlayer';
import {pressOnFocused, raiseHostBack} from './keys';
import {closeNativeVideo, getNativeDisplay, getNativeVideoElement, isNativePlayerEnabled, isNativeVideoElement, isPassthroughEnabled, placeNativeVideo} from './nativeVideo';

export {giveControllerToGame} from './keys';

// A console has no remote with a Back key to open a game's menu with
export const controllerIsOnlyRemote = true;

export {
	getMimeType,
	canRenderEmbeddedPgsInBand,
	setupVisibilityHandler
} from '@moonfin/platform-webos/video';

const H264_NAMES = ['h264', 'avc'];
const HEVC_NAMES = ['hevc', 'h265', 'hev1', 'hvc1'];
// What the console player decodes besides H.264 and HEVC, none of it past 1080p
const NATIVE_ONLY_NAMES = ['mpeg2video', 'mpeg4', 'vc1'];

export const getSharedVideoElement = () => {
	if (isNativePlayerEnabled()) return getNativeVideoElement();
	const video = sharedVideoElement();
	video.disableRemotePlayback = true;
	return video;
};

// The console player's element is let go of through the host. Any other element,
// like the one trailers play in, is the WebView's and is cleaned the webOS way.
export const cleanupVideoElement = (video) => (isNativeVideoElement(video) ? closeNativeVideo(video) : cleanupWebVideoElement(video));

// DVD and DVB bitmap subtitles have no renderer in the page, and the console player draws
// them itself out of a file it plays as it is.
export const rendersSubtitleInHost = (codec) => isNativePlayerEnabled() && isBurnInSubtitleCodec(codec);
export const showHostSubtitle = (video, index) => isNativeVideoElement(video) && video.selectSubtitleNative(index);

// The WebView's decoder isnt in play with the console player, so there is nothing to wait for.
export const waitForDecoderRelease = () => (isNativePlayerEnabled() ? Promise.resolve() : waitForWebDecoderRelease());

// A suspended app is frozen and may be ended at any moment, so the player lets
// go of playback and the user comes back to the details page.
export const leavesPlayerInBackground = true;

const hasHevcVideo = (mediaSource) => {
	const video = (mediaSource?.MediaStreams || []).find((stream) => stream.Type === 'Video');
	return HEVC_NAMES.includes((video?.Codec || '').toLowerCase());
};

// In the WebView a seek made before the first frame has shown never lands for HEVC,
// though one made after it does. So such a file is opened at its start and the player
// seeks to the resume point once that frame is in. The console player opens at the
// resume point itself.
export const resumesAfterFirstFrame = (mediaSource) => !isNativePlayerEnabled() && hasHevcVideo(mediaSource);

// A console whose WebView decoder wont open an HEVC file says so in the error, and
// the profile wants to know.
export const notePlaybackError = (error, mediaSource, playMethod) => {
	if (isNativePlayerEnabled() || playMethod === 'Transcode' || !hasHevcVideo(mediaSource)) return;
	if (!/DECODER_ERROR_NOT_SUPPORTED/.test(error?.message || '')) return;
	noteHevcRefusal(mediaSource.Id);
};

// The page hears of its own visibility and the host of the app's, and one trip
// to the background can be told both ways, so only a change is passed on.
export const registerAppStateObserver = (onForeground, onBackground) => {
	let background = false;
	const set = (now) => {
		if (now === background) return;
		background = now;
		if (now) onBackground?.();
		else onForeground?.();
	};
	const onVisibility = () => set(document.hidden);
	document.addEventListener('visibilitychange', onVisibility);
	const removeState = onShellMessage('APP_STATE', (payload) => set(payload?.state !== 'active'));
	return () => {
		document.removeEventListener('visibilitychange', onVisibility);
		removeState();
	};
};

// What the host calls a button of the media remote, as the key the app handles for it.
const HOST_KEYS = {
	Play: 250,
	Pause: 19,
	Stop: 178,
	Rewind: 227,
	FastForward: 228
};

// The page cant count on the WebView noticing a dropped network on its own, so
// the host's word on it becomes the online and offline events the no connection
// screen listens for. The first message only says where things stand at boot.
// The media remote and a Back the system handed the host arrive the same way,
// and are raised on whatever has focus as the keys they stand for.
export const setupXboxLifecycle = () => {
	let connected = null;
	const removeNetwork = onShellMessage('NETWORK', (payload) => {
		const now = payload?.connected !== false;
		if (connected !== null && now !== connected) window.dispatchEvent(new Event(now ? 'online' : 'offline'));
		connected = now;
	});
	const removeKeys = onShellMessage('KEY', (payload) => {
		if (payload?.key === 'Back') raiseHostBack();
		else if (HOST_KEYS[payload?.key]) pressOnFocused({keyCode: HOST_KEYS[payload.key]});
	});
	return () => {
		removeNetwork();
		removeKeys();
	};
};

// The console player decodes every common sound format itself. The WebView plays
// the picture of a DTS or TrueHD file without a sound, so those arent offered there.
export const getSupportedAudioCodecs = (capabilities) => {
	const codecs = ['aac', 'mp3', 'flac', 'pcm_s16le', 'pcm_s24le'];
	if (capabilities.ac3) codecs.push('ac3');
	if (capabilities.eac3) codecs.push('eac3', 'ec3');
	if (capabilities.opus) codecs.push('opus');
	if (capabilities.vorbis) codecs.push('vorbis');
	if (capabilities.dts) codecs.push('dts', 'truehd');
	return codecs;
};

export const isAudioStreamPlayable = (stream, capabilities) => {
	if (!stream) return false;
	const codec = (stream.Codec || '').toLowerCase();
	return !codec || getSupportedAudioCodecs(capabilities).includes(codec);
};

// Chromium cant open an MPEG-TS or WebM file, so the server remuxes those for it
const VIDEO_CONTAINERS = ['mp4', 'm4v', 'mov', 'mkv', 'matroska'];
const NATIVE_VIDEO_CONTAINERS = [...VIDEO_CONTAINERS, 'webm', 'ts', 'mpegts'];
const AUDIO_CONTAINERS = ['mp3', 'aac', 'm4a', 'm4b', 'flac', 'wav', 'ogg', 'oga', 'opus'];

// Dolby Vision plays as its HDR10 base layer where there is one. The rest needs the console's
// Dolby Vision processor.
const HDR10_BASED_DOVI = ['DOVIWITHHDR10', 'DOVIWITHHDR10PLUS', 'DOVIWITHEL', 'DOVIWITHELHDR10PLUS', 'DOVIINVALID'];
const DOLBY_VISION_ONLY = ['DOVI', 'DOVIWITHHLG', 'DOVIWITHSDR'];

const rangeOk = (videoStream, capabilities) => {
	const rangeType = (videoRangeTypeOf(videoStream) || '').toUpperCase();
	if (!rangeType || rangeType === 'SDR') return true;
	if (HDR10_BASED_DOVI.includes(rangeType)) return !!capabilities.hdr10;
	if (DOLBY_VISION_ONLY.includes(rangeType)) return !!capabilities.dolbyVision;
	if (rangeType.includes('DOVI') || rangeType.includes('DOLBY') || rangeType === 'DV') return false;
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

	const videoCodec = (videoStream.Codec || '').toLowerCase();
	const isHevc = HEVC_NAMES.includes(videoCodec);
	const containers = capabilities.nativePlayer ? NATIVE_VIDEO_CONTAINERS : VIDEO_CONTAINERS;

	const videoOk = !videoCodec || H264_NAMES.includes(videoCodec) || (isHevc && !!capabilities.hevc) || (!!capabilities.nativePlayer && NATIVE_ONLY_NAMES.includes(videoCodec));
	const containerOk = !container || containerParts.some((part) => containers.includes(part));
	const hdrOk = rangeOk(videoStream, capabilities);
	// Only HEVC has the console's own decoder behind it, so nothing else goes past 1080p
	const sizeOk = !videoStream.Width || videoStream.Width <= 1920 || (capabilities.uhd && isHevc);
	const bitrateOk = !(options.maxBitrate > 0) || !videoStream.BitRate || videoStream.BitRate <= options.maxBitrate;

	const playable = videoOk && audioOk && containerOk && hdrOk && sizeOk && bitrateOk;
	if (mediaSource.SupportsDirectPlay && playable) return 'DirectPlay';
	if (mediaSource.SupportsDirectStream && playable) return 'DirectStream';
	return 'Transcode';
};

// The console player is put where the page laid its element out, so the subtitles
// drawn over it line up. The WebView's element needs nothing.
export const setDisplayWindow = async () => isNativePlayerEnabled() && placeNativeVideo();

// Only the host can keep the console from dimming the screen. The page says
// whether something is playing and the host holds or lets go of its request.
export const keepScreenOn = async (enable) => postToShell('KEEP_DISPLAY_ACTIVE', {active: !!enable});

export const getAudioOutputInfo = async () => null;

export const getHostDisplay = () => (isNativePlayerEnabled() ? getNativeDisplay() : null);

// The sound a receiver decodes itself. With passthrough on, the host hands it to the console
// as it is in the file, which passes it on.
const BITSTREAM_CODECS = ['truehd', 'dts', 'eac3', 'ac3'];
// What the console shows as HDR10, Dolby Vision over an HDR10 base included
const HDR10_RANGE = /^(HDR10|DOVIWith)/i;
// The profile the host opens each Dolby Vision range type with
const DOLBY_VISION_PROFILES = {DOVI: 5, DOVIWITHEL: 7, DOVIWITHELHDR10PLUS: 7, DOVIWITHHDR10: 8, DOVIWITHHDR10PLUS: 8, DOVIWITHHLG: 8, DOVIWITHSDR: 8};

const playingAudio = (session) => {
	const streams = (session?.mediaSource?.MediaStreams || []).filter((stream) => stream.Type === 'Audio');
	return streams.find((stream) => stream.Index === session.audioStreamIndex) || streams.find((stream) => stream.IsDefault) || streams[0];
};

// With passthrough on, a film played as it is whose sound a receiver decodes opens with
// the system's reader, and the host falls back to FFmpeg when that reader cant play it.
// A track switched to later stays with whichever opened the file. Only FFmpeg tags a
// Dolby Vision stream for the console's processor, so a film played as it is in Dolby
// Vision always opens with FFmpeg, which then passes the sound on itself.
export const chooseHostReader = (video, session) => {
	if (!isNativeVideoElement(video)) return;
	const picture = (session?.mediaSource?.MediaStreams || []).find((stream) => stream.Type === 'Video');
	const range = videoRangeTypeOf(picture);
	const directPlay = session?.playMethod === 'DirectPlay' && !!picture;
	const dolbyVision = directPlay && session.capabilities?.dolbyVision ? DOLBY_VISION_PROFILES[range.toUpperCase()] : null;
	const passthrough = isPassthroughEnabled() && directPlay && BITSTREAM_CODECS.includes((playingAudio(session)?.Codec || '').toLowerCase());
	const wanted = passthrough && !dolbyVision;
	video.useSystemReaderNative(wanted, wanted && HDR10_RANGE.test(range));
	video.useDolbyVisionNative(dolbyVision);
	video.usePassthroughNative(passthrough);
};

// Windows names the formats it has no short name for by a GUID
const FORMAT_NAMES = {
	'{EB27CEC4-163E-4CA3-8B74-8E25F91B517E}': 'TrueHD',
	'{A2E58EB7-0FA9-48BB-A40C-FA0E156D0645}': 'DTS',
	'{6D703461-767A-494D-B478-F29D25DC9037}': 'AAC'
};
const readableFormat = (format) => (format ? format.replace(/^\{[0-9A-F-]+\}/i, (guid) => FORMAT_NAMES[guid.toUpperCase()] || guid) : null);

// The decoder the console player plays the sound with, such as "truehd FFmpegSoftwareDecoder",
// and the format it gives the console, such as "TrueHD 8 ch 48000 Hz" or "PCM 8 ch 48000 Hz".
// Only a file FFmpeg opened names a decoder.
export const getHostAudioOutput = async () => {
	if (!isNativePlayerEnabled()) return null;
	try {
		const state = await getState();
		if (!state?.audioDecoder && !state?.audioFormat) return null;
		return {decoder: state.audioDecoder || null, format: readableFormat(state.audioFormat)};
	} catch (e) {
		return null;
	}
};
