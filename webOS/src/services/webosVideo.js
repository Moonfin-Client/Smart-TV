/* global navigator */
// webOS Video Service - Luna API interface for hardware video playback

let lunaClient = null;
let isLunaAvailable = false;

export const isWebOS = () => {
	if (typeof window === 'undefined') return false;
	if (typeof window.webOS !== 'undefined') return true;
	const ua = navigator.userAgent.toLowerCase();
	return ua.includes('webos') || ua.includes('web0s');
};

export const getWebOSVersion = () => {
	const ua = navigator.userAgent.toLowerCase();
	const chromeMatch = /chrome\/(\d+)/.exec(ua);
	if (chromeMatch) {
		const chromeVersion = parseInt(chromeMatch[1], 10);
		if (chromeVersion >= 120) return 25;
		if (chromeVersion >= 108) return 24;
		if (chromeVersion >= 94) return 23;
		if (chromeVersion >= 87) return 22;
		if (chromeVersion >= 79) return 6;
		if (chromeVersion >= 68) return 5;
		if (chromeVersion >= 53) return 4;
		if (chromeVersion >= 38) return 3;
		return 2;
	}
	return 4; // Default assumption
};

export const initLunaAPI = async () => {
	if (!isWebOS()) {
		console.log('[webosVideo] Not on webOS platform');
		return false;
	}

	try {
		const LS2Request = (await import('@enact/webos/LS2Request')).default;
		lunaClient = LS2Request;
		isLunaAvailable = true;
		console.log('[webosVideo] Luna API initialized');
		return true;
	} catch (e) {
		console.warn('[webosVideo] Luna API not available:', e.message);
		return false;
	}
};

const lunaCall = (service, method, parameters = {}) => {
	return new Promise((resolve, reject) => {
		if (!lunaClient) {
			reject(new Error('Luna API not initialized'));
			return;
		}

		// eslint-disable-next-line @babel/new-cap
		new lunaClient().send({
			service: `luna://${service}`,
			method,
			parameters,
			onSuccess: resolve,
			onFailure: (err) => reject(new Error(err.errorText || 'Luna call failed'))
		});
	});
};

// Per LG developer documentation, DTS support varies by webOS version AND container.
// This mirrors getDtsContainerSupport() from deviceProfile.js for local use.
// DTS support is detected from tv.model.edidType containing 'dts'.
const getDtsContainerSupportLocal = (webosVersion, edidHasDts = false) => {
	if (webosVersion >= 23) {
		const dtsEnabled = edidHasDts || edidHasDts === null;
		return { mkv: dtsEnabled, mp4: dtsEnabled, ts: dtsEnabled, avi: false };
	}
	if (webosVersion >= 5) {
		return { mkv: true, mp4: false, ts: false, avi: false };
	}
	return { mkv: true, mp4: false, ts: false, avi: true };
};

const getDefaultCapabilities = () => {
	const webosVersion = getWebOSVersion();
	return {
		webosVersion,
		modelName: 'Unknown',
		uhd: true,
		uhd8K: webosVersion >= 5,
		oled: false,
		hdr10: webosVersion >= 4,
	hdr10Plus: webosVersion >= 6,
		hlg: webosVersion >= 4,
		dolbyVision: false,
		dolbyAtmos: false,
		hevc: webosVersion >= 4,
		av1: webosVersion >= 5,
		vp9: webosVersion >= 4,
		dts: getDtsContainerSupportLocal(webosVersion, null),
		ac3: true,
		eac3: true, // DD+ supported on all webOS 4+
		truehd: false,
		mp4: true,
		m4v: true,
		ts: true,
		mov: true,
		avi: true,
		'3gp': true,
		mpg: true,
		vob: true,
		asf: true,
		wmv: true,
		mkv: webosVersion >= 4,
		webm: webosVersion >= 5,
		nativeHls: true,
		nativeHlsFmp4: webosVersion >= 5,
		hlsAc3: webosVersion >= 5,
		hlsByteRange: webosVersion >= 4
	};
};

export const getMediaCapabilities = async () => {
	if (!isLunaAvailable) {
		return getDefaultCapabilities();
	}

	try {
		const result = await lunaCall('com.webos.service.config', 'getConfigs', {
			configNames: [
				'tv.model.*',
				'tv.hw.*'
			]
		});

		const cfg = result.configs || {};
		const webosVersion = getWebOSVersion();

		// HDR detection
		// - All webOS 4+ TVs support HDR10 and HLG via HEVC Main10 profile
		// - Dolby Vision only via tv.model.supportDolbyVisionHDR
		const hasHdr = cfg['tv.model.supportHDR'] === true || webosVersion >= 4;
		const hasHlg = hasHdr;
		const hasDolbyVision = cfg['tv.model.supportDolbyVisionHDR'] === true;

		// DTS detection: tv.model.edidType contains 'dts' when DTS is supported
		// e.g. "TrueHD+dts" = DTS supported, plain "TrueHD" = no DTS
		// null = key not present (unknown), true/false = detected from edidType
		const rawEdidType = cfg['tv.model.edidType'];
		const edidHasDts = rawEdidType != null ? rawEdidType.toLowerCase().includes('dts') : null;

		console.log('[webosVideo] HDR detection:', {
			webosVersion,
			'tv.model.supportHDR': cfg['tv.model.supportHDR'],
			'tv.model.supportDolbyVisionHDR': cfg['tv.model.supportDolbyVisionHDR'],
			'tv.model.edidType': cfg['tv.model.edidType'],
			resultHdr10: hasHdr,
			resultHlg: hasHlg,
			resultDolbyVision: hasDolbyVision,
			resultDts: edidHasDts
		});

		return {
			webosVersion,
			modelName: cfg['tv.model.modelname'] || 'Unknown',
			uhd: cfg['tv.hw.panelResolution'] === 'UD' || cfg['tv.hw.panelResolution'] === '8K',
			uhd8K: cfg['tv.hw.panelResolution'] === '8K' || cfg['tv.hw.bSupport_8K_resolution'] === true,
			oled: cfg['tv.hw.displayType'] === 'OLED' || (cfg['tv.model.moduleBackLightType'] || '').toLowerCase() === 'oled',
			hdr10: hasHdr,
			hdr10Plus: webosVersion >= 6,
			hlg: hasHlg,
			dolbyVision: hasDolbyVision,
			dolbyAtmos: (cfg['tv.model.soundModeType'] || '').includes('Dolby Atmos'),
			// Video codecs - version-based detection
			hevc: webosVersion >= 4,
			av1: webosVersion >= 5,
			vp9: webosVersion >= 4,
			dts: getDtsContainerSupportLocal(webosVersion, edidHasDts),
			ac3: true,
			eac3: true, // DD+ supported on all webOS 4+
			// TrueHD/DTS-HD: webOS can only PASSTHROUGH these to AV receiver, not decode internally
			// Note: tv.model.edidType may say "TrueHD" but this does NOT mean actual TrueHD decode support
			truehd: false,
			dtshd: false,
			// Containers
			mp4: true,
			m4v: true,
			ts: true,
			mov: true,
			avi: true,
			'3gp': true,
			mpg: true,
			vob: true,
			asf: true,
			wmv: true,
			mkv: webosVersion >= 4,
			webm: webosVersion >= 5,
			// HLS
			nativeHls: true,
			nativeHlsFmp4: webosVersion >= 5,
			hlsAc3: webosVersion >= 5,
			hlsByteRange: webosVersion >= 4
		};
	} catch (e) {
		console.warn('[webosVideo] Failed to get capabilities:', e.message);
		return getDefaultCapabilities();
	}
};

/**
 * Get the list of audio codecs supported by the TV hardware for a given container.
 * Container-specific restrictions (DTS per-container) are applied.
 * @param {object} capabilities - Device capabilities from getMediaCapabilities()
 * @param {string} [container=''] - Container format (e.g., 'mkv', 'mp4'). Empty = no container restriction.
 * @returns {string[]} Array of supported audio codec strings
 */
export const getSupportedAudioCodecs = (capabilities, container = '') => {
	const codecs = ['aac', 'mp3', 'mp2', 'mp1', 'flac', 'pcm_s16le', 'pcm_s24le', 'lpcm', 'wav'];

	const ac3Ok = capabilities.ac3;
	const eac3Ok = capabilities.eac3;

	if (ac3Ok) codecs.push('ac3', 'dolby');
	if (eac3Ok) codecs.push('eac3', 'ec3');

	// DTS: per-container support based on webOS version
	if (capabilities.dts) {
		const dtsObj = capabilities.dts;
		let dtsOk = false;
		if (!container) {
			// No container context — include DTS if supported in any container
			dtsOk = !!(dtsObj.mkv || dtsObj.mp4 || dtsObj.ts || dtsObj.avi);
		} else if (['mkv', 'matroska'].includes(container)) {
			dtsOk = !!dtsObj.mkv;
		} else if (['mp4', 'm4v', 'mov'].includes(container)) {
			dtsOk = !!dtsObj.mp4;
		} else if (['ts', 'mpegts', 'mts', 'm2ts'].includes(container)) {
			dtsOk = !!dtsObj.ts;
		} else if (container === 'avi') {
			dtsOk = !!dtsObj.avi;
		}
		if (dtsOk) codecs.push('dts', 'dca', 'dts-hd', 'dtshd');
	}

	if (capabilities.truehd) codecs.push('truehd', 'mlp');
	if (capabilities.webosVersion >= 24) codecs.push('opus');
	codecs.push('vorbis', 'wma', 'amr', 'amrnb', 'amrwb');

	return codecs;
};

/**
 * Find the first compatible audio stream index for a media source.
 * Returns the index of the first audio stream whose codec is supported,
 * or -1 if no compatible audio stream exists.
 */
export const findCompatibleAudioStreamIndex = (mediaSource, capabilities) => {
	if (!mediaSource?.MediaStreams) return -1;
	const container = (mediaSource.Container || '').toLowerCase();
	const supported = getSupportedAudioCodecs(capabilities, container);
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
	console.log('[webosVideo] getPlayMethod called with capabilities.truehd:', capabilities?.truehd, 'capabilities.dtshd:', capabilities?.dtshd);

	if (!mediaSource) {
		console.log('[webosVideo] No media source provided');
		return 'Transcode';
	}

	const container = (mediaSource.Container || '').toLowerCase();
	const videoStream = mediaSource.MediaStreams?.find(s => s.Type === 'Video');

	// Get the audio stream that will actually be used for playback
	// Priority: DefaultAudioStreamIndex > first audio stream marked as default > first audio stream
	const audioStreams = mediaSource.MediaStreams?.filter(s => s.Type === 'Audio') || [];
	let audioStream = null;
	if (mediaSource.DefaultAudioStreamIndex !== undefined && mediaSource.DefaultAudioStreamIndex !== null) {
		audioStream = mediaSource.MediaStreams?.find(s => s.Index === mediaSource.DefaultAudioStreamIndex);
	}
	if (!audioStream) {
		audioStream = audioStreams.find(s => s.IsDefault) || audioStreams[0];
	}

	console.log('[webosVideo] Media source analysis:', JSON.stringify({
		container,
		videoCodec: videoStream?.Codec,
		defaultAudioIndex: mediaSource.DefaultAudioStreamIndex,
		audioStreamIndex: audioStream?.Index,
		audioCodec: audioStream?.Codec,
		allAudioCodecs: audioStreams.map(s => ({ index: s.Index, codec: s.Codec, isDefault: s.IsDefault })),
		videoBitrate: videoStream?.BitRate,
		videoLevel: videoStream?.Level,
		videoProfile: videoStream?.Profile,
		videoWidth: videoStream?.Width,
		videoHeight: videoStream?.Height,
		videoBitDepth: videoStream?.BitDepth,
		videoRangeType: videoStream?.VideoRangeType,
		serverSupportsDirectPlay: mediaSource.SupportsDirectPlay,
		serverSupportsDirectStream: mediaSource.SupportsDirectStream,
		transcodingUrl: mediaSource.TranscodingUrl ? 'present' : 'none'
	}));

	// Build supported video codecs list
	const videoCodec = (videoStream?.Codec || '').toLowerCase();
	const supportedVideoCodecs = ['h264', 'avc', 'mpeg4', 'mpeg2', 'mpeg1'];
	if (capabilities.hevc) supportedVideoCodecs.push('hevc', 'h265', 'hev1', 'hvc1');
	if (capabilities.av1) supportedVideoCodecs.push('av1', 'av01');
	if (capabilities.vp9) supportedVideoCodecs.push('vp9');
	supportedVideoCodecs.push('vp8');
	if (capabilities.dolbyVision) supportedVideoCodecs.push('dvhe', 'dvh1', 'dovi');

	// Build supported audio codecs list (with container-specific restrictions)
	const audioCodec = (audioStream?.Codec || '').toLowerCase();
	const supportedAudioCodecs = getSupportedAudioCodecs(capabilities, container);

	// Check if ANY audio stream is compatible (not just the default/first one).
	// A file with TrueHD primary + AC3 secondary should still DirectPlay using the AC3 track.
	const hasCompatibleAudio = audioStreams.length === 0 || audioStreams.some(s => {
		const codec = (s.Codec || '').toLowerCase();
		return !codec || supportedAudioCodecs.includes(codec);
	});

	console.log('[webosVideo] Audio check:', {
		defaultAudioCodec: audioCodec,
		defaultAudioOk: !audioCodec || supportedAudioCodecs.includes(audioCodec),
		hasCompatibleAudio,
		compatibleStreams: audioStreams.filter(s => supportedAudioCodecs.includes((s.Codec || '').toLowerCase())).map(s => `${s.Index}:${s.Codec}`),
		totalAudioStreams: audioStreams.length
	});

	// Build supported containers list
	const supportedContainers = ['mp4', 'm4v', 'mov', 'ts', 'mpegts', 'mts', 'm2ts', 'avi', '3gp', '3g2', 'mpg', 'mpeg', 'vob', 'dat'];
	if (capabilities.mkv) supportedContainers.push('mkv', 'matroska');
	if (capabilities.webm) supportedContainers.push('webm');
	if (capabilities.asf) supportedContainers.push('asf');
	if (capabilities.wmv) supportedContainers.push('wmv');
	if (capabilities.nativeHls) supportedContainers.push('m3u8', 'hls');

	const videoOk = !videoCodec || supportedVideoCodecs.includes(videoCodec);
	const audioOk = hasCompatibleAudio;
	// Container can be comma-separated (e.g., "mov,mp4,m4a,3gp,3g2,mj2") - check if ANY match
	const containerParts = container.split(',').map(c => c.trim());
	const containerOk = !container || containerParts.some(c => supportedContainers.includes(c));

	// HDR compatibility check
	let hdrOk = true;
	if (videoStream?.VideoRangeType) {
		const rangeType = videoStream.VideoRangeType.toUpperCase();
		if (rangeType === 'DOVI') {
			// Pure DV with no fallback layer needs native DV support
			hdrOk = capabilities.dolbyVision;
			if (!hdrOk) console.log('[webosVideo] Pure Dolby Vision not supported (no fallback layer)');
		} else if (rangeType.includes('DOVIWITH')) {
			// DV with fallback layer — check if we can play the fallback
			if (capabilities.dolbyVision) {
				hdrOk = true; // Native DV support
			} else if (rangeType.includes('HDR10') && capabilities.hdr10) {
				hdrOk = true; // HDR10 fallback layer
				console.log('[webosVideo] DV with HDR10 fallback — will use HDR10 layer');
			} else if (rangeType.includes('HLG') && capabilities.hlg) {
				hdrOk = true; // HLG fallback layer
				console.log('[webosVideo] DV with HLG fallback — will use HLG layer');
			} else if (rangeType.includes('SDR')) {
				hdrOk = true; // SDR fallback always works
				console.log('[webosVideo] DV with SDR fallback — will use SDR layer');
			} else {
				hdrOk = false;
				console.log('[webosVideo] DV fallback layer not supported:', rangeType);
			}
		} else if (rangeType.includes('DOLBY') || rangeType.includes('DV')) {
			// Generic DV/DOLBY reference, needs native DV
			hdrOk = capabilities.dolbyVision;
			if (!hdrOk) console.log('[webosVideo] Dolby Vision not supported');
		} else if (rangeType.includes('HDR10+') || rangeType === 'HDR10PLUS') {
			hdrOk = capabilities.hdr10Plus || capabilities.hdr10;
			if (!hdrOk) console.log('[webosVideo] HDR10+ not supported');
		} else if (rangeType.includes('HDR') || rangeType === 'HDR10') {
			hdrOk = capabilities.hdr10;
			if (!hdrOk) console.log('[webosVideo] HDR10 not supported');
		} else if (rangeType.includes('HLG')) {
			hdrOk = capabilities.hlg || capabilities.hdr10;
			if (!hdrOk) console.log('[webosVideo] HLG not supported');
		}
	}

	// Bitrate check per LG AV format docs, limits vary by codec and panel resolution
	let bitrateOk = true;
	if (videoStream?.BitRate) {
		let maxBitrate;
		const isHevc = ['hevc', 'h265', 'hev1', 'hvc1'].includes(videoCodec);
		const isH264 = ['h264', 'avc'].includes(videoCodec);
		if (capabilities.uhd8K) {
			maxBitrate = 100_000_000; // 8K: 100 Mbps (HEVC)
		} else if (capabilities.uhd) {
			maxBitrate = isHevc ? 60_000_000 : isH264 ? 50_000_000 : 60_000_000;
		} else {
			maxBitrate = 40_000_000; // FHD: 40 Mbps (H.264 and HEVC)
		}
		bitrateOk = videoStream.BitRate <= maxBitrate;
		if (!bitrateOk) {
			console.log('[webosVideo] Bitrate exceeds limit:', videoStream.BitRate, '>', maxBitrate, '(codec:', videoCodec, ')');
		}
	}

	console.log('[webosVideo] Compatibility check:', {
		videoOk,
		audioOk,
		containerOk,
		hdrOk,
		bitrateOk
	});

	if (mediaSource.SupportsDirectPlay && videoOk && audioOk && containerOk && hdrOk && bitrateOk) {
		console.log('[webosVideo] Result: DirectPlay');
		return 'DirectPlay';
	}

	// DirectStream can remux the container and transcode audio while keeping video direct.
	// This preserves HDR when only the audio track is incompatible.
	if (mediaSource.SupportsDirectStream && videoOk && containerOk && bitrateOk) {
		console.log('[webosVideo] Result: DirectStream');
		return 'DirectStream';
	}

	console.log('[webosVideo] Result: Transcode');
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
		mts: 'video/mp2t',
		avi: 'video/x-msvideo',
		mov: 'video/quicktime',
		m3u8: 'application/x-mpegURL',
		mpd: 'application/dash+xml',
		'3gp': 'video/3gpp',
		'3g2': 'video/3gpp2',
		mpg: 'video/mpeg',
		mpeg: 'video/mpeg',
		vob: 'video/mpeg',
		dat: 'video/mpeg',
		asf: 'video/x-ms-asf',
		wmv: 'video/x-ms-wmv'
	};
	return mimeTypes[container?.toLowerCase()] || 'video/mp4';
};

export const setDisplayWindow = async (rect) => {
	if (!isLunaAvailable) return false;

	try {
		await lunaCall('com.webos.service.avoutput', 'video/setDisplayWindow', {
			sourceInput: {
				x: rect.x || 0,
				y: rect.y || 0,
				width: rect.width || 1920,
				height: rect.height || 1080
			},
			outputDestination: {
				x: rect.destX || 0,
				y: rect.destY || 0,
				width: rect.destWidth || 1920,
				height: rect.destHeight || 1080
			}
		});
		return true;
	} catch (e) {
		console.warn('[webosVideo] setDisplayWindow failed:', e.message);
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
	document.addEventListener('webOSRelaunch', onForeground);

	return () => {
		document.removeEventListener('visibilitychange', handleVisibilityChange);
		document.removeEventListener('webOSRelaunch', onForeground);
	};
};

export const keepScreenOn = async (enable) => {
	if (!isLunaAvailable) return true;

	try {
		await lunaCall('com.webos.service.power', 'state', {
			state: enable ? 'Active' : 'ActiveStandby'
		});
		return true;
	} catch {
		return true;
	}
};

export const getAudioOutputInfo = async () => {
	if (!isLunaAvailable) return null;

	try {
		const result = await lunaCall('com.webos.service.avoutput', 'audio/getStatus', {});
		return result;
	} catch (e) {
		return null;
	}
};

/**
 * Release hardware video resources and reset HDR display mode.
 * Critical on webOS due to limited hardware decoder instances.
 *
 * LG webOS TVs automatically enter HDR mode when HDR content plays
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
		console.log('[webosVideo] No video element to cleanup');
		return false;
	}

	try {
		console.log('[webosVideo] Cleaning up video element resources');
		console.log('[webosVideo] Cleanup called from:', new Error().stack);

		if (!videoElement.paused) {
			videoElement.pause();
		}

		// Force HDR-to-SDR transition: briefly load a minimal SDR video
		// This switches the webOS decoder pipeline from HDR back to SDR
		// before we fully release the hardware decoder
		if (isWebOS()) {
			try {
				videoElement.src = SDR_RESET_VIDEO;
				videoElement.load();
				console.log('[webosVideo] Loaded SDR reset video to force HDR-to-SDR transition');
			} catch (e) {
				console.warn('[webosVideo] SDR reset video failed, continuing cleanup:', e);
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

		console.log('[webosVideo] Video element cleanup complete');
		return true;
	} catch (err) {
		console.error('[webosVideo] Error during video cleanup:', err);
		return false;
	}
};

/**
 * Handle visibility changes for app suspend/resume.
 * Uses webkit prefix for webOS 4.x compatibility.
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
		console.warn('[webosVideo] Visibility API not supported');
		return () => {};
	}

	const handleVisibilityChange = () => {
		if (document[hidden]) {
			console.log('[webosVideo] App hidden/suspended - triggering cleanup');
			onHidden?.();
		} else {
			console.log('[webosVideo] App visible - resuming');
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

	console.log('[webosVideo] Visibility handler registered');

	// Return cleanup function
	return () => {
		document.removeEventListener(visibilityChange, handleVisibilityChange, true);
		document.removeEventListener(altVisibilityChange, handleVisibilityChange, true);
		console.log('[webosVideo] Visibility handler removed');
	};
};

/**
 * Handle webOSRelaunch event (app re-launched while already running).
 */
export const setupWebOSLifecycle = (onRelaunch) => {
	if (!isWebOS()) {
		return () => {};
	}

	const handleRelaunch = (event) => {
		console.log('[webosVideo] webOSRelaunch event received', event?.detail);
		onRelaunch?.(event?.detail);
	};

	document.addEventListener('webOSRelaunch', handleRelaunch, true);
	console.log('[webosVideo] webOS lifecycle handler registered');

	return () => {
		document.removeEventListener('webOSRelaunch', handleRelaunch, true);
		console.log('[webosVideo] webOS lifecycle handler removed');
	};
}

export default {
	isWebOS,
	getWebOSVersion,
	initLunaAPI,
	getMediaCapabilities,
	getPlayMethod,
	getMimeType,
	getSupportedAudioCodecs,
	findCompatibleAudioStreamIndex,
	setDisplayWindow,
	registerAppStateObserver,
	keepScreenOn,
	getAudioOutputInfo,
	cleanupVideoElement,
	setupVisibilityHandler,
	setupWebOSLifecycle
};
