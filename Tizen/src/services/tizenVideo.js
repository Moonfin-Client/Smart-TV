/**
 * Tizen Video Service - Hardware-accelerated video playback using AVPlay APIs
 */
/* global webapis */
import {detectTizenVersion as _detectTizenVersion} from './deviceProfile';

let isAVPlayAvailable = false;

export const isTizen = () => {
	if (typeof window === 'undefined') return false;
	if (typeof window.tizen !== 'undefined') return true;
	const ua = navigator.userAgent.toLowerCase();
	return ua.includes('tizen');
};

// Delegate to the implementation in deviceProfile.js
export const getTizenVersion = () => _detectTizenVersion();

export const initTizenAPI = async () => {
	if (!isTizen()) {
		console.log('[tizenVideo] Not on Tizen platform');
		return false;
	}

	try {
		if (typeof webapis !== 'undefined' && webapis.avplay) {
			isAVPlayAvailable = true;
			console.log('[tizenVideo] AVPlay API initialized');
			return true;
		}
	} catch (e) {
		console.warn('[tizenVideo] AVPlay API not available:', e.message);
	}
	return false;
};

/**
 * Default capabilities fallback - aligned with Samsung spec tables.
 * These values are used when webapis is unavailable (e.g., browser testing).
 * Runtime detection in getMediaCapabilities() overrides where possible.
 *
 * Key Samsung documentation facts applied here:
 * - DTS: NOT supported on any Samsung TV (explicitly stated 2018-2025)
 * - TrueHD: Not documented in Samsung specifications
 * - Dolby Atmos: Not documented in Samsung audio specs
 * - DD+ (EAC3): Limited to 5.1 channels
 * - VP9: UHD models from 2018+, ALL models (incl FHD) from 2021+ (Tizen 6+)
 * - AV1: 2020+ (Tizen 5.5+) all tiers; WebM container for most, general containers on 8K Premium 2022+
 */
const getDefaultCapabilities = () => {
	const tizenVersion = getTizenVersion();
	return {
		tizenVersion,
		modelName: 'Unknown',
		uhd: true,
		uhd8K: false,
		hdr10: tizenVersion >= 4,
		dolbyVision: false, // Detect via avinfo API at runtime, not by version
		dolbyAtmos: false, // Not documented in Samsung audio specifications
		hevc: true,
		av1: tizenVersion >= 5.5,
		vp9: tizenVersion >= 4,
		ac3: true,
		eac3: true,
		truehd: false, // Not in Samsung specifications
		mkv: true,
		nativeHls: true,
		nativeHlsFmp4: true,
		hlsAc3: true
	};
};

export const getMediaCapabilities = async () => {
	const capabilities = getDefaultCapabilities();

	if (typeof webapis === 'undefined') {
		return capabilities;
	}

	try {
		// Get model info
		if (webapis.productinfo) {
			if (typeof webapis.productinfo.getModel === 'function') {
				capabilities.modelName = webapis.productinfo.getModel();
			}

			// Check resolution support
			if (typeof webapis.productinfo.is8KPanelSupported === 'function' &&
				webapis.productinfo.is8KPanelSupported()) {
				capabilities.uhd8K = true;
				capabilities.uhd = true;
			} else if (typeof webapis.productinfo.isUdPanelSupported === 'function' &&
				webapis.productinfo.isUdPanelSupported()) {
				capabilities.uhd = true;
			}
		}

		// Get HDR/Dolby Vision support
		if (webapis.avinfo) {
			if (typeof webapis.avinfo.isHdrTvSupport === 'function') {
				capabilities.hdr10 = webapis.avinfo.isHdrTvSupport();
			}
			if (typeof webapis.avinfo.isDolbyVisionSupport === 'function') {
				capabilities.dolbyVision = webapis.avinfo.isDolbyVisionSupport();
			}
		}
	} catch (e) {
		console.warn('[tizenVideo] Failed to get capabilities:', e.message);
	}

	return capabilities;
};

/**
 * Get the list of audio codecs supported by the TV hardware.
 */
export const getSupportedAudioCodecs = (capabilities) => {
	const codecs = ['aac', 'mp3', 'flac', 'opus', 'vorbis', 'pcm', 'wav'];
	if (capabilities.ac3) codecs.push('ac3');
	if (capabilities.eac3) codecs.push('eac3');
	// DTS: Samsung explicitly states not supported on any TV (2018-2025)
	// TrueHD: Not documented in Samsung specifications
	return codecs;
};

/**
 * Find the first compatible audio stream index for a media source.
 * Returns the index of the first audio stream whose codec is supported,
 * or -1 if no compatible audio stream exists.
 */
export const findCompatibleAudioStreamIndex = (mediaSource, capabilities) => {
	if (!mediaSource?.MediaStreams) return -1;
	const supported = getSupportedAudioCodecs(capabilities);
	const audioStreams = mediaSource.MediaStreams.filter(s => s.Type === 'Audio');
	for (const stream of audioStreams) {
		const codec = (stream.Codec || '').toLowerCase();
		if (!codec || supported.includes(codec)) {
			return stream.Index;
		}
	}
	return -1;
};

export const getPlayMethod = (mediaSource, capabilities) => {
	if (!mediaSource) return 'Transcode';

	const container = (mediaSource.Container || '').toLowerCase();
	const videoStream = mediaSource.MediaStreams?.find(s => s.Type === 'Video');

	const videoCodec = (videoStream?.Codec || '').toLowerCase();
	const supportedVideoCodecs = ['h264', 'avc'];
	if (capabilities.hevc) supportedVideoCodecs.push('hevc', 'h265', 'hev1', 'hvc1');
	if (capabilities.av1) supportedVideoCodecs.push('av1');
	if (capabilities.vp9) supportedVideoCodecs.push('vp9');
	if (capabilities.dolbyVision) supportedVideoCodecs.push('dvhe', 'dvh1');

	// Audio codecs per Samsung spec tables — DTS and TrueHD intentionally excluded
	const supportedAudioCodecs = getSupportedAudioCodecs(capabilities);

	// Check if ANY audio stream is compatible (not just the first/default one).
	// Samsung TVs can select audio tracks from containers like MKV/MP4.
	// A file with DTS primary + AC3 secondary should still DirectPlay.
	const audioStreams = mediaSource.MediaStreams?.filter(s => s.Type === 'Audio') || [];
	const hasCompatibleAudio = audioStreams.length === 0 || audioStreams.some(s => {
		const codec = (s.Codec || '').toLowerCase();
		return !codec || supportedAudioCodecs.includes(codec);
	});

	const supportedContainers = ['mp4', 'm4v', 'mov', 'ts', 'mpegts', 'mkv', 'matroska', 'webm', 'avi',
		// Audio containers
		'mp3', 'flac', 'aac', 'm4a', 'm4b', 'ogg', 'oga', 'opus', 'wav', 'wma', 'weba'];
	if (capabilities.nativeHls) supportedContainers.push('m3u8');

	const videoOk = !videoCodec || supportedVideoCodecs.includes(videoCodec);
	const audioOk = hasCompatibleAudio;
	const containerOk = !container || supportedContainers.includes(container);

	// Samsung docs: "HEVC: Supported only for MKV/MP4/TS containers"
	const hevcContainerOk = videoCodec === 'hevc' || videoCodec === 'h265' || videoCodec === 'hev1' || videoCodec === 'hvc1'
		? ['mp4', 'mkv', 'matroska', 'ts', 'mpegts', 'm4v'].includes(container)
		: true;

	// VP9 container support:
	// Samsung spec tables officially list WebM only, but the official Jellyfin
	// Web client (jellyfin-web) allows VP9 in MP4, MKV, and WebM on Tizen.
	// The hardware VP9 decoder is container-agnostic; Tizen's media framework
	// demuxes MKV/MP4/WebM equally well for VP9 content.
	const vp9ContainerOk = videoCodec === 'vp9'
		? ['webm', 'mkv', 'matroska', 'mp4', 'm4v'].includes(container)
		: true;

	// AV1 container support:
	// Same as VP9 — the official Jellyfin client allows AV1 in MP4, MKV, and WebM.
	// 8K Premium 2022+ models additionally support TS/AVI containers.
	const av1GeneralContainers = capabilities.uhd8K && capabilities.tizenVersion >= 6.5;
	const av1ContainerOk = videoCodec === 'av1'
		? (['webm', 'mkv', 'matroska', 'mp4', 'm4v'].includes(container) ||
			(av1GeneralContainers && ['ts', 'mpegts', 'avi'].includes(container)))
		: true;

	let hdrOk = true;
	if (videoStream?.VideoRangeType) {
		const rangeType = videoStream.VideoRangeType.toUpperCase();
		if (rangeType.includes('DOLBY') || rangeType.includes('DV')) {
			hdrOk = capabilities.dolbyVision;
		} else if (rangeType.includes('HDR')) {
			hdrOk = capabilities.hdr10;
		}
	}

	const defaultAudioCodec = (audioStreams[0]?.Codec || '').toLowerCase();
	console.log('[tizenVideo] getPlayMethod check:', {
		container,
		videoCodec,
		defaultAudioCodec,
		audioStreamCount: audioStreams.length,
		compatibleAudioStreams: audioStreams.filter(s => supportedAudioCodecs.includes((s.Codec || '').toLowerCase())).map(s => `${s.Index}:${s.Codec}`),
		videoRange: videoStream?.VideoRangeType,
		videoOk,
		audioOk,
		containerOk,
		hdrOk,
		hevcContainerOk,
		vp9ContainerOk,
		av1ContainerOk,
		serverSupportsDirectPlay: mediaSource.SupportsDirectPlay
	});

	const codecContainerOk = hevcContainerOk && vp9ContainerOk && av1ContainerOk;

	if (mediaSource.SupportsDirectPlay && videoOk && audioOk && containerOk && hdrOk && codecContainerOk) {
		return 'DirectPlay';
	}

	if (mediaSource.SupportsDirectStream && videoOk && containerOk && codecContainerOk) {
		return 'DirectStream';
	}

	return 'Transcode';
};

export const getMimeType = (container) => {
	const mimeTypes = {
		mp4: 'video/mp4',
		m4v: 'video/mp4',
		mkv: 'video/x-matroska',
		matroska: 'video/x-matroska',
		webm: 'video/webm',
		ts: 'video/mp2t',
		mpegts: 'video/mp2t',
		m2ts: 'video/mp2t',
		avi: 'video/x-msvideo',
		mov: 'video/quicktime',
		m3u8: 'application/x-mpegURL',
		mpd: 'application/dash+xml',
		// Audio formats
		mp3: 'audio/mpeg',
		flac: 'audio/flac',
		aac: 'audio/aac',
		m4a: 'audio/mp4',
		m4b: 'audio/mp4',
		ogg: 'audio/ogg',
		oga: 'audio/ogg',
		opus: 'audio/ogg',
		wav: 'audio/wav',
		wma: 'audio/x-ms-wma',
		webma: 'audio/webm'
	};
	return mimeTypes[container?.toLowerCase()] || 'video/mp4';
};

export const setDisplayWindow = async (rect) => {
	if (!isAVPlayAvailable) return false;

	try {
		webapis.avplay.setDisplayRect(
			rect.x || 0,
			rect.y || 0,
			rect.width || 1920,
			rect.height || 1080
		);
		return true;
	} catch (e) {
		console.warn('[tizenVideo] setDisplayRect failed:', e.message);
		return false;
	}
};

export const registerAppStateObserver = (onForeground, onBackground) => {
	if (typeof document === 'undefined') return () => {};

	const handleVisibilityChange = () => {
		if (document.hidden) {
			onBackground?.();
		} else {
			onForeground?.();
		}
	};

	document.addEventListener('visibilitychange', handleVisibilityChange);

	return () => {
		document.removeEventListener('visibilitychange', handleVisibilityChange);
	};
};

export const keepScreenOn = async () => {
	// Tizen handles screen keeping via app lifecycle
	// No explicit API needed - video playback keeps screen on automatically
	return true;
};

export const getAudioOutputInfo = async () => {
	// Tizen doesn't have a direct equivalent to LG's audio output info
	return null;
};

// AVPlay wrapper functions
export const avplayOpen = (url) => {
	if (!isAVPlayAvailable) throw new Error('AVPlay not available');
	webapis.avplay.open(url);
};

export const avplayPrepare = () => {
	return new Promise((resolve, reject) => {
		if (!isAVPlayAvailable) {
			reject(new Error('AVPlay not available'));
			return;
		}
		webapis.avplay.prepareAsync(resolve, reject);
	});
};

export const avplayPlay = () => {
	if (!isAVPlayAvailable) return;
	webapis.avplay.play();
};

export const avplayPause = () => {
	if (!isAVPlayAvailable) return;
	webapis.avplay.pause();
};

export const avplayStop = () => {
	if (!isAVPlayAvailable) return;
	try {
		const state = webapis.avplay.getState();
		if (state !== 'NONE' && state !== 'IDLE') {
			webapis.avplay.stop();
		}
	} catch (e) {
		// Ignore
	}
};

export const avplayClose = () => {
	if (!isAVPlayAvailable) return;
	try {
		webapis.avplay.close();
	} catch (e) {
		// Ignore
	}
};

export const avplaySeek = (timeMs) => {
	return new Promise((resolve, reject) => {
		if (!isAVPlayAvailable) {
			reject(new Error('AVPlay not available'));
			return;
		}
		webapis.avplay.seekTo(timeMs, resolve, reject);
	});
};

export const avplayGetCurrentTime = () => {
	if (!isAVPlayAvailable) return 0;
	try {
		return webapis.avplay.getCurrentTime();
	} catch (e) {
		return 0;
	}
};

export const avplayGetDuration = () => {
	if (!isAVPlayAvailable) return 0;
	try {
		return webapis.avplay.getDuration();
	} catch (e) {
		return 0;
	}
};

export const avplayGetState = () => {
	if (!isAVPlayAvailable) return 'NONE';
	try {
		return webapis.avplay.getState();
	} catch (e) {
		return 'NONE';
	}
};

export const avplaySetListener = (listener) => {
	if (!isAVPlayAvailable) return;
	webapis.avplay.setListener(listener);
};

export const avplaySetSpeed = (speed) => {
	if (!isAVPlayAvailable) return;
	try {
		webapis.avplay.setSpeed(speed);
	} catch (e) {
		console.log('[tizenVideo] setSpeed not supported:', e);
	}
};

export const avplaySetDisplayMethod = (mode) => {
	if (!isAVPlayAvailable) return;
	try {
		webapis.avplay.setDisplayMethod(mode);
		console.log(`[tizenVideo] Display method set to: ${mode}`);
	} catch (e) {
		console.warn('[tizenVideo] setDisplayMethod failed:', e.message);
	}
};

/**
 * Fully stop and close AVPlay, releasing all hardware resources.
 * Safe to call in any state.
 */
export const cleanupAVPlay = () => {
	try {
		const state = avplayGetState();
		if (state !== 'NONE' && state !== 'IDLE') {
			avplayStop();
		}
		if (state !== 'NONE') {
			avplayClose();
		}
		console.log('[tizenVideo] AVPlay cleanup complete');
	} catch (e) {
		console.warn('[tizenVideo] AVPlay cleanup error:', e);
	}
};

export const avplaySetDrm = (drmType, operation, drmData) => {
	if (!isAVPlayAvailable) return;
	webapis.avplay.setDrm(drmType, operation, drmData);
};

export const avplayGetTracks = () => {
	if (!isAVPlayAvailable) return [];
	try {
		const trackInfo = webapis.avplay.getTotalTrackInfo();
		console.log('[tizenVideo] Track Info:', JSON.stringify(trackInfo));
		return trackInfo;
	} catch (e) {
		console.warn('[tizenVideo] Failed to get track info:', e);
		return [];
	}
};

export const avplaySelectTrack = (type, index) => {
	if (!isAVPlayAvailable) return;
	try {
		// type: 'AUDIO' or 'SUBTITLE'
		webapis.avplay.setSelectTrack(type, index);
		console.log(`[tizenVideo] Selected ${type} track index: ${index}`);
	} catch (e) {
		console.warn(`[tizenVideo] Failed to select ${type} track:`, e);
	}
};

export const avplaySetSilentSubtitle = (silent) => {
	if (!isAVPlayAvailable) return;
	try {
		webapis.avplay.setSilentSubtitle(silent);
		console.log(`[tizenVideo] Set silent subtitle: ${silent}`);
	} catch (e) {
		console.warn('[tizenVideo] Failed to set silent subtitle:', e);
	}
};

/**
 * Release hardware video resources and reset HDR display mode.
 * Critical on Tizen due to limited hardware decoder instances.
 *
 * Samsung Tizen TVs automatically enter HDR mode when HDR content plays
 * through the HTML5 <video> element. To force the TV back to SDR mode
 * after playback stops, we must:
 * 1. Pause the HDR video
 * 2. Load a minimal SDR video (base64 1x1 h264) to switch the decoder pipeline to SDR
 * 3. Clear the source entirely and call load() to release the decoder
 *
 * Without step 2, the TV may remain stuck in HDR mode on the home screen.
 */

// Minimal 1x1 black H.264 SDR video (base64) - forces decoder pipeline to SDR
const SDR_RESET_VIDEO = 'data:video/mp4;base64,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';

export const cleanupVideoElement = (videoElement, options = {}) => {
	if (!videoElement) {
		console.log('[tizenVideo] No video element to cleanup');
		return false;
	}

	try {
		console.log('[tizenVideo] Cleaning up video element resources');

		if (!videoElement.paused) {
			videoElement.pause();
		}

		// Force HDR-to-SDR transition: briefly load a minimal SDR video
		// This switches the Tizen decoder pipeline from HDR back to SDR
		// before we fully release the hardware decoder
		if (isTizen()) {
			try {
				videoElement.src = SDR_RESET_VIDEO;
				videoElement.load();
				console.log('[tizenVideo] Loaded SDR reset video to force HDR-to-SDR transition');
			} catch (e) {
				console.warn('[tizenVideo] SDR reset video failed, continuing cleanup:', e);
			}
		}

		// Now fully clear the source and release the hardware decoder
		videoElement.removeAttribute('src');
		if (videoElement.srcObject) {
			videoElement.srcObject = null;
		}
		videoElement.load();

		if (options.removeFromDOM && videoElement.parentNode) {
			videoElement.parentNode.removeChild(videoElement);
		}

		console.log('[tizenVideo] Video element cleanup complete');
		return true;
	} catch (err) {
		console.error('[tizenVideo] Error during video cleanup:', err);
		return false;
	}
};

/**
 * Handle visibility changes for app suspend/resume.
 * Uses webkit prefix for Tizen 4 compatibility.
 */
export const setupVisibilityHandler = (onHidden, onVisible) => {
	let hidden, visibilityChange;

	if (typeof document.hidden !== 'undefined') {
		hidden = 'hidden';
		visibilityChange = 'visibilitychange';
	} else if (typeof document.webkitHidden !== 'undefined') {
		hidden = 'webkitHidden';
		visibilityChange = 'webkitvisibilitychange';
	} else {
		console.warn('[tizenVideo] Visibility API not supported');
		return () => {};
	}

	const handleVisibilityChange = () => {
		if (document[hidden]) {
			console.log('[tizenVideo] App hidden/suspended - triggering cleanup');
			onHidden?.();
		} else {
			console.log('[tizenVideo] App visible - resuming');
			onVisible?.();
		}
	};

	document.addEventListener(visibilityChange, handleVisibilityChange, true);

	// Listen to both variants for maximum compatibility
	const altVisibilityChange = visibilityChange === 'visibilitychange'
		? 'webkitvisibilitychange'
		: 'visibilitychange';

	if (visibilityChange !== altVisibilityChange) {
		document.addEventListener(altVisibilityChange, handleVisibilityChange, true);
	}

	console.log('[tizenVideo] Visibility handler registered');

	// Return cleanup function
	return () => {
		document.removeEventListener(visibilityChange, handleVisibilityChange, true);
		document.removeEventListener(altVisibilityChange, handleVisibilityChange, true);
		console.log('[tizenVideo] Visibility handler removed');
	};
};

/**
 * Handle tizenRelaunch event (app re-launched while already running).
 */
export const setupTizenLifecycle = (onRelaunch) => {
	if (!isTizen()) {
		return () => {};
	}

	const handleRelaunch = (event) => {
		console.log('[tizenVideo] tizenRelaunch event received', event?.detail);
		onRelaunch?.(event?.detail);
	};

	document.addEventListener('tizenRelaunch', handleRelaunch, true);
	console.log('[tizenVideo] tizen lifecycle handler registered');

	return () => {
		document.removeEventListener('tizenRelaunch', handleRelaunch, true);
		console.log('[tizenVideo] tizen lifecycle handler removed');
	};
}

export default {
	isTizen,
	getTizenVersion,
	initTizenAPI,
	getMediaCapabilities,
	getPlayMethod,
	getMimeType,
	getSupportedAudioCodecs,
	findCompatibleAudioStreamIndex,
	setDisplayWindow,
	registerAppStateObserver,
	keepScreenOn,
	getAudioOutputInfo,
	avplayOpen,
	avplayPrepare,
	avplayPlay,
	avplayPause,
	avplayStop,
	avplayClose,
	avplaySeek,
	avplayGetCurrentTime,
	avplayGetDuration,
	avplayGetState,
	avplaySetListener,
	avplaySetSpeed,
	avplaySetDrm,
	avplaySelectTrack,
	avplaySetSilentSubtitle,
	avplayGetTracks,
	avplaySetDisplayMethod,
	cleanupAVPlay
};
