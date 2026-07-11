/**
 * Tizen Video Service - Hardware-accelerated video playback using AVPlay APIs
 */
/* global webapis */
import {detectTizenVersion as _detectTizenVersion} from './deviceProfile';
import {isExperimentalTruehdEnabled, probeTruehdCodecSupport} from './truehd';

let isAVPlayAvailable = false;

const DEFAULT_PASSTHROUGH_SETTINGS = {
	passthroughEnabled: true,
	ac3Passthrough: true,
	eac3Passthrough: true,
	dtsPassthrough: true,
	dtshdPassthrough: true,
	truehdPassthrough: true
};

const resolvePassthroughSettings = (options = {}) => ({
	...DEFAULT_PASSTHROUGH_SETTINGS,
	...(options || {})
});

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
		truehdExperimental: false,
		mkv: true,
		nativeHls: true,
		nativeHlsFmp4: true,
		dts: false,
		dtshd: false,
		hlsAc3: true,
		opus: true
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

		const truehdCodecSupported = probeTruehdCodecSupport();
		capabilities.truehdExperimental = truehdCodecSupported === true;
		capabilities.truehd = capabilities.truehdExperimental && isExperimentalTruehdEnabled();
	} catch (e) {
		console.warn('[tizenVideo] Failed to get capabilities:', e.message);
	}

	return capabilities;
};

/**
 * Get the list of audio codecs supported by the TV hardware.
 */
export const getSupportedAudioCodecs = (capabilities, _container = '', passthroughOptions = {}) => {
	const passthrough = resolvePassthroughSettings(passthroughOptions);
	const passthroughAllowed = passthrough.passthroughEnabled;
	const codecs = ['aac', 'mp3', 'flac', 'vorbis', 'pcm', 'wav'];
	if (capabilities.ac3 && passthrough.ac3Passthrough) codecs.push('ac3');
	if (capabilities.eac3 && passthrough.eac3Passthrough) codecs.push('eac3');
	if (capabilities.opus) codecs.push('opus');
	if (capabilities.truehd && passthroughAllowed && passthrough.truehdPassthrough) codecs.push('truehd', 'mlp');
	// DTS: Samsung explicitly states not supported on any TV (2018-2025)
	return codecs;
};

export const DTS_FAMILY_CODECS = ['dts', 'dca', 'dts-hd', 'dtshd', 'dts-ma', 'dtsma', 'dts-x', 'dtsx'];

const streamHasAtmos = (stream) => {
	if (!stream) return false;
	const fields = [stream.Profile, stream.Title, stream.DisplayTitle, stream.ChannelLayout];
	if (fields.some(v => typeof v === 'string' && /atmos/i.test(v))) return true;
	// legacy atmos detection, i might come back later for direct stream of atmos (In love MOK)
	const codec = (stream.Codec || '').toLowerCase();
	if ((codec === 'truehd' || codec === 'mlp') && (stream.Channels || 0) > 8) return true;
	return false;
};

export const isAudioStreamPlayable = (stream, capabilities, passthroughOptions = {}) => {
	if (!stream) return false;
	const codec = (stream.Codec || '').toLowerCase();
	if (!codec) return true;
	if (DTS_FAMILY_CODECS.includes(codec)) return false;
	if ((codec === 'truehd' || codec === 'mlp') && streamHasAtmos(stream)) return false;
	const supported = getSupportedAudioCodecs(capabilities, '', passthroughOptions);
	return supported.includes(codec);
};

/**
 * Find the first compatible audio stream index for a media source.
 * Returns the index of the first audio stream whose codec is supported,
 * or -1 if no compatible audio stream exists.
 */
export const findCompatibleAudioStreamIndex = (mediaSource, capabilities, passthroughOptions = {}) => {
	if (!mediaSource?.MediaStreams) return -1;
	const audioStreams = mediaSource.MediaStreams.filter(s => s.Type === 'Audio');
	for (const stream of audioStreams) {
		if (isAudioStreamPlayable(stream, capabilities, passthroughOptions)) {
			return stream.Index;
		}
	}
	return -1;
};

export const getPlayMethod = (mediaSource, capabilities, _options = {}, passthroughOptions = {}) => {
	if (!mediaSource) return 'Transcode';

	const container = (mediaSource.Container || '').toLowerCase();
	const videoStream = mediaSource.MediaStreams?.find(s => s.Type === 'Video');

	const videoCodec = (videoStream?.Codec || '').toLowerCase();
	const supportedVideoCodecs = ['h264', 'avc'];
	if (capabilities.hevc) supportedVideoCodecs.push('hevc', 'h265', 'hev1', 'hvc1');
	if (capabilities.av1) supportedVideoCodecs.push('av1');
	if (capabilities.vp9) supportedVideoCodecs.push('vp9');
	if (capabilities.dolbyVision) supportedVideoCodecs.push('dvhe', 'dvh1');

	const supportedAudioCodecs = getSupportedAudioCodecs(capabilities, container, passthroughOptions);

	const audioStreams = mediaSource.MediaStreams?.filter(s => s.Type === 'Audio') || [];

	// FLAC inside a video container plays with an audio delay and the device
	// profile makes the server transcode it, so the local decision has to agree
	const audioPlayableHere = (s) => {
		if (videoStream && (s?.Codec || '').toLowerCase() === 'flac') return false;
		return isAudioStreamPlayable(s, capabilities, passthroughOptions);
	};

	// AVPlay always decodes the file's default audio track and ignores the
	// AudioStreamIndex hint passed in the stream URL. That means a multi-track
	// file with TrueHD/DTS as the default and AC3 as a secondary cant
	// DirectPlay even though an alternate compatible track exists, AVPlay
	// will still try to decode the default and fail with "codec not supported".
	// So DirectPlay/DirectStream on the DEFAULT track being playable, and
	// force audio remux whenever the default is unplayable.
	const defaultStream = audioStreams.find(s => s.Index === mediaSource.DefaultAudioStreamIndex) || audioStreams[0];
	const defaultPlayable = !defaultStream || audioPlayableHere(defaultStream);
	const needsAudioRemux = !defaultPlayable && audioStreams.length > 0;

	const supportedContainers = ['mp4', 'm4v', 'mov', 'ts', 'mpegts', 'mkv', 'matroska', 'webm', 'avi',
		// Audio containers
		'mp3', 'flac', 'aac', 'm4a', 'm4b', 'ogg', 'oga', 'opus', 'wav', 'wma', 'weba'];
	if (capabilities.nativeHls) supportedContainers.push('m3u8');

	const videoOk = !videoCodec || supportedVideoCodecs.includes(videoCodec);
	const audioOk = defaultPlayable;
	const containerOk = !container || supportedContainers.includes(container);

	// Samsung docs: "HEVC: Supported only for MKV/MP4/TS containers"
	const hevcContainerOk = videoCodec === 'hevc' || videoCodec === 'h265' || videoCodec === 'hev1' || videoCodec === 'hvc1'
		? ['mp4', 'mkv', 'matroska', 'ts', 'mpegts', 'm4v'].includes(container)
		: true;

	// VP9 container support:
	// Samsung spec tables officially list WebM only, but the hardware VP9
	// decoder is container agnostic and Tizen's media framework demuxes
	// MKV/MP4/WebM equally well for VP9 content.
	const vp9ContainerOk = videoCodec === 'vp9'
		? ['webm', 'mkv', 'matroska', 'mp4', 'm4v'].includes(container)
		: true;

	// AV1 container support:
	// Same as VP9, plays fine from MP4, MKV, and WebM.
	// 8K Premium 2022+ models additionally support TS/AVI containers.
	const av1GeneralContainers = capabilities.uhd8K && capabilities.tizenVersion >= 6.5;
	const av1ContainerOk = videoCodec === 'av1'
		? (['webm', 'mkv', 'matroska', 'mp4', 'm4v'].includes(container) ||
			(av1GeneralContainers && ['ts', 'mpegts', 'avi'].includes(container)))
		: true;

	let hdrOk = true;
	if (videoStream?.VideoRangeType) {
		const rangeType = videoStream.VideoRangeType.toUpperCase();
		if (rangeType.includes('DOVIWITH')) {
			// dual layer Dolby Vision has a compatible base layer, an HDR10
			// panel plays that layer directly and an SDR fallback plays anywhere
			hdrOk = rangeType.includes('SDR') ? true : (capabilities.hdr10 || capabilities.dolbyVision);
		} else if (rangeType.includes('DOLBY') || rangeType.includes('DV')) {
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

	if (needsAudioRemux) {
		// Default audio is unplayableso request a force remux
		console.log('[tizenVideo] Default audio unplayable (TrueHD+Atmos/DTS) with no alternate \u2014 forcing Transcode for audio remux');
		return 'Transcode';
	}

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

let _keepScreenInterval = null;

export const keepScreenOn = async (enable) => {
	try {
		if (enable) {
			if (typeof window.tizen !== 'undefined' && window.tizen.power) {
				window.tizen.power.request('SCREEN', 'SCREEN_NORMAL');
				console.log('[tizenVideo] Screen keep-on enabled');
			}
			if (!_keepScreenInterval) {
				const suppressScreenSaver = () => {
					try {
						if (typeof webapis !== 'undefined' && webapis.appcommon) {
							webapis.appcommon.setScreenSaver(webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_OFF);
						}
					} catch {}
				};
				suppressScreenSaver();
				_keepScreenInterval = setInterval(suppressScreenSaver, 30000);
			}
		} else {
			if (_keepScreenInterval) {
				clearInterval(_keepScreenInterval);
				_keepScreenInterval = null;
			}
			try {
				if (typeof webapis !== 'undefined' && webapis.appcommon) {
					webapis.appcommon.setScreenSaver(webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_ON);
				}
			} catch {}
			if (typeof window.tizen !== 'undefined' && window.tizen.power) {
				window.tizen.power.release('SCREEN');
				console.log('[tizenVideo] Screen keep-on released');
			}
		}
	} catch (e) {
		console.warn('[tizenVideo] keepScreenOn error:', e.message);
	}
	return true;
};

export const getAudioOutputInfo = async () => {
	const info = {
		outputMode: null,
		modelName: null,
		firmware: null,
		truehdCodecSupported: probeTruehdCodecSupport(),
		passthroughGuaranteed: false,
		notes: [
			'Samsung Tizen APIs do not expose a guaranteed TrueHD/eARC passthrough control.',
			'TrueHD support here is an experimental codec probe, not a passthrough guarantee.'
		]
	};

	try {
		if (typeof webapis !== 'undefined') {
			if (typeof webapis.productinfo?.getModel === 'function') {
				info.modelName = webapis.productinfo.getModel();
			}
			if (typeof webapis.productinfo?.getFirmware === 'function') {
				info.firmware = webapis.productinfo.getFirmware();
			}
		}

		if (typeof window !== 'undefined' && typeof window.tizen?.tvaudiocontrol?.getOutputMode === 'function') {
			info.outputMode = window.tizen.tvaudiocontrol.getOutputMode();
		}
	} catch (e) {
		info.error = e.message;
	}

	return info;
};

// AVPlay wrapper functions
export const avplayOpen = (url) => {
	if (!isAVPlayAvailable) throw new Error('AVPlay not available');
	webapis.avplay.open(url);
};

/**
 * Set hardware buffering thresholds. Must be called in IDLE, between open and prepare.
 * Falls back through the older byte based APIs on firmware that lacks setBufferingParam.
 * Never throws so it cant abort an open sequence.
 */
export const avplaySetBufferingParams = (opts = {}) => {
	if (!isAVPlayAvailable) return false;
	// Samsung docs set 4 seconds as the minimum accepted value
	const initialSeconds = Math.max(4, opts.initialSeconds ?? 6);
	const resumeSeconds = Math.max(4, opts.resumeSeconds ?? 4);
	let applied = false;

	try {
		webapis.avplay.setBufferingParam('PLAYER_BUFFER_FOR_PLAY', 'PLAYER_BUFFER_SIZE_IN_SECOND', initialSeconds);
		webapis.avplay.setBufferingParam('PLAYER_BUFFER_FOR_RESUME', 'PLAYER_BUFFER_SIZE_IN_SECOND', resumeSeconds);
		applied = true;
		console.log(`[tizenVideo] Buffering params set: play=${initialSeconds}s resume=${resumeSeconds}s`);
	} catch (e) {
		console.warn('[tizenVideo] setBufferingParam unavailable:', e.message);
	}

	if (!applied) {
		const bytes = Math.max(15 * 1024 * 1024, Math.floor(((opts.bitrate || 0) / 8) * initialSeconds));
		try {
			webapis.avplay.setBufferSize(bytes);
			applied = true;
			console.log(`[tizenVideo] Buffer size set: ${bytes} bytes`);
		} catch (e) {
			try {
				webapis.avplay.setStreamingProperty('SET_BUFFER_SIZE', String(initialSeconds));
				applied = true;
			} catch (e2) {
				console.warn('[tizenVideo] No buffering configuration supported on this firmware');
			}
		}
	}

	try {
		webapis.avplay.setTimeoutForBuffering(opts.timeoutSeconds ?? 8);
	} catch (e) { /* ignore */ }

	return applied;
};

export const avplaySuspend = () => {
	if (!isAVPlayAvailable) return false;
	// a seek still in flight would leave the deferral queue wedged after restore
	resetSeekState();
	try {
		const state = webapis.avplay.getState();
		if (state === 'NONE' || state === 'IDLE') return false;
		webapis.avplay.suspend();
		console.log('[tizenVideo] AVPlay suspended');
		return true;
	} catch (e) {
		console.warn('[tizenVideo] suspend failed:', e.message);
		return false;
	}
};

export const avplayRestore = (url, resumeMs = 0) => {
	return new Promise((resolve) => {
		if (!isAVPlayAvailable) {
			resolve(false);
			return;
		}
		resetSeekState();
		const timeMs = Math.max(0, Math.floor(resumeMs));
		if (typeof webapis.avplay.restoreAsync === 'function') {
			try {
				webapis.avplay.restoreAsync(url, timeMs, true, () => resolve(true), () => resolve(false));
				return;
			} catch (e) {
				console.warn('[tizenVideo] restoreAsync failed, trying restore:', e.message);
			}
		}
		try {
			webapis.avplay.restore(url, timeMs, true);
			resolve(true);
		} catch (e) {
			console.warn('[tizenVideo] restore failed:', e.message);
			resolve(false);
		}
	});
};

/**
 * Poll a transcode playlist until the server has actually written it.
 * Opening AVPlay against a not yet existing manifest errors out the whole pipeline.
 * Resolves false on timeout, never rejects.
 */
export const waitForHlsManifest = (url, options = {}) => {
	const intervalMs = options.intervalMs || 500;
	const timeoutMs = options.timeoutMs || 15000;

	const fetchText = (target) => new Promise((resolve) => {
		// a hung request must not stall the poll loop past its deadline
		const requestTimer = setTimeout(() => resolve(''), 5000);
		const done = (text) => {
			clearTimeout(requestTimer);
			resolve(text);
		};
		if (typeof fetch === 'function') {
			fetch(target, {cache: 'no-store'})
				.then((res) => (res.ok ? res.text() : ''))
				.then(done)
				.catch(() => done(''));
			return;
		}
		try {
			const xhr = new XMLHttpRequest();
			xhr.open('GET', target, true);
			xhr.onload = () => done(xhr.status >= 200 && xhr.status < 300 ? xhr.responseText : '');
			xhr.onerror = () => done('');
			xhr.send();
		} catch (e) {
			done('');
		}
	});

	return new Promise((resolve) => {
		const deadline = Date.now() + timeoutMs;
		const poll = () => {
			fetchText(url).then((body) => {
				if (body && body.indexOf('#EXTM3U') !== -1) {
					resolve(true);
					return;
				}
				if (Date.now() >= deadline) {
					console.warn('[tizenVideo] HLS manifest not ready after timeout, opening anyway');
					resolve(false);
					return;
				}
				setTimeout(poll, intervalMs);
			});
		};
		poll();
	});
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

// Samsung forbids issuing any other AVPlay call while a seekTo is still in flight.
// Overlapping calls are what leave the playhead stuck or throw INVALID_OPERATION,
// so play, pause, and further seeks are queued here until the active seek lands.
let seekInFlight = false;
let queuedSeek = null;
let activeSeekSettlers = null;
let pendingOpAfterSeek = null;
let postSeekHook = null;
let expectPlayingAfterSeek = false;
let seekSafetyTimer = null;
let seekRetryTimer = null;
// bumped on stop, close, suspend, and restore so callbacks and retry timers
// from a torn down session cant fire into the next one
let seekEpoch = 0;

const resetSeekState = () => {
	seekEpoch += 1;
	if (seekSafetyTimer) {
		clearTimeout(seekSafetyTimer);
		seekSafetyTimer = null;
	}
	if (seekRetryTimer) {
		clearTimeout(seekRetryTimer);
		seekRetryTimer = null;
	}
	if (activeSeekSettlers) {
		activeSeekSettlers.forEach((s) => s.resolve());
		activeSeekSettlers = null;
	}
	if (queuedSeek) {
		queuedSeek.settlers.forEach((s) => s.resolve());
		queuedSeek = null;
	}
	pendingOpAfterSeek = null;
	seekInFlight = false;
	expectPlayingAfterSeek = false;
};

export const avplaySetPostSeekHook = (fn) => {
	postSeekHook = typeof fn === 'function' ? fn : null;
};

const rawPlay = () => {
	if (!isAVPlayAvailable) return;
	webapis.avplay.play();
};

const rawPause = () => {
	if (!isAVPlayAvailable) return;
	webapis.avplay.pause();
};

export const avplayPlay = () => {
	if (seekInFlight) {
		pendingOpAfterSeek = 'play';
		expectPlayingAfterSeek = true;
		return;
	}
	rawPlay();
};

export const avplayPause = () => {
	if (seekInFlight) {
		pendingOpAfterSeek = 'pause';
		expectPlayingAfterSeek = false;
		return;
	}
	rawPause();
};

export const avplayStop = () => {
	if (!isAVPlayAvailable) return;
	resetSeekState();
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
	resetSeekState();
	try {
		webapis.avplay.close();
	} catch (e) {
		// Ignore
	}
};

/**
 * Set the start position while still in IDLE, before prepare, so playback
 * begins right at the resume point instead of starting at zero and jumping.
 * Returns false when it cant be applied so the caller can seek after play instead.
 */
export const avplaySeekIdle = (timeMs) => {
	if (!isAVPlayAvailable) return false;
	try {
		if (webapis.avplay.getState() !== 'IDLE') return false;
		webapis.avplay.seekTo(Math.max(1000, Math.floor(timeMs)), () => {}, () => {});
		return true;
	} catch (e) {
		console.warn('[tizenVideo] IDLE seek failed:', e.message);
		return false;
	}
};

const finishSeek = () => {
	seekInFlight = false;
	activeSeekSettlers = null;
	const op = pendingOpAfterSeek;
	pendingOpAfterSeek = null;
	if (op) {
		try {
			if (op === 'play') rawPlay();
			else rawPause();
		} catch (e) { /* ignore */ }
	}
	if (queuedSeek) {
		const next = queuedSeek;
		queuedSeek = null;
		runSeek(next.timeMs, next.settlers); // eslint-disable-line no-use-before-define
	}
};

const runSeek = (timeMs, settlers) => {
	const maxAttempts = 8;
	const retryDelayMs = 120;
	const epoch = seekEpoch;
	let attempts = 0;

	seekInFlight = true;
	activeSeekSettlers = settlers;
	expectPlayingAfterSeek = avplayGetState() === 'PLAYING'; // eslint-disable-line no-use-before-define

	const settle = (ok, err) => {
		if (activeSeekSettlers !== settlers) return;
		activeSeekSettlers = null;
		settlers.forEach((s) => (ok ? s.resolve() : s.reject(err)));
	};

	const isSeekableState = (state) => state === 'PLAYING' || state === 'PAUSED' || state === 'READY';

	// seeking into the very last second races the stream completed event
	let target = Math.max(0, Math.floor(timeMs));
	let duration = 0;
	try {
		duration = webapis.avplay.getDuration();
	} catch (e) { /* ignore */ }
	if (duration > 2000) {
		target = Math.min(target, duration - 1000);
	}

	const trySeek = () => {
		if (epoch !== seekEpoch) return;

		let state = 'NONE';
		try {
			state = webapis.avplay.getState();
		} catch (e) {
			state = 'NONE';
		}

		if (!isSeekableState(state)) {
			if (attempts < maxAttempts) {
				attempts += 1;
				seekRetryTimer = setTimeout(trySeek, retryDelayMs);
				return;
			}
			settle(false, new Error(`AVPlay not seekable (state=${state})`));
			finishSeek();
			return;
		}

		webapis.avplay.seekTo(target, () => {
			if (epoch !== seekEpoch) return;
			if (postSeekHook) {
				try { postSeekHook(); } catch (e) { /* ignore */ }
			}
			// some firmware never fires buffering events after the seek flush and
			// leaves the pipeline parked, so nudge play back on shortly after
			if (seekSafetyTimer) clearTimeout(seekSafetyTimer);
			seekSafetyTimer = setTimeout(() => {
				seekSafetyTimer = null;
				try {
					const s = webapis.avplay.getState();
					if (expectPlayingAfterSeek && (s === 'READY' || s === 'PAUSED')) {
						rawPlay();
					}
				} catch (e) { /* ignore */ }
			}, 250);
			settle(true);
			finishSeek();
		}, (err) => {
			if (epoch !== seekEpoch) return;
			const msg = String((err && (err.message || err.name)) || err || '');
			const isInvalidState = /INVALID_STATE|InvalidState/i.test(msg);
			if (isInvalidState && attempts < maxAttempts) {
				attempts += 1;
				seekRetryTimer = setTimeout(trySeek, retryDelayMs);
				return;
			}
			settle(false, err);
			finishSeek();
		});
	};

	trySeek();
};

export const avplaySeek = (timeMs) => {
	return new Promise((resolve, reject) => {
		if (!isAVPlayAvailable) {
			reject(new Error('AVPlay not available'));
			return;
		}

		if (seekInFlight) {
			// coalesce rapid scrubbing, the newest target wins and everyone
			// waiting settles when it lands
			if (queuedSeek) {
				queuedSeek.timeMs = timeMs;
				queuedSeek.settlers.push({resolve, reject});
			} else {
				queuedSeek = {timeMs, settlers: [{resolve, reject}]};
			}
			return;
		}

		runSeek(timeMs, [{resolve, reject}]);
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
	if (!isAVPlayAvailable) return false;
	try {
		webapis.avplay.setSpeed(speed);
		return true;
	} catch (e) {
		console.log('[tizenVideo] setSpeed not supported:', e);
		return false;
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
		return webapis.avplay.getTotalTrackInfo();
	} catch (e) {
		console.warn('[tizenVideo] Failed to get track info:', e);
		return [];
	}
};

export const avplaySelectTrack = (type, index) => {
	if (!isAVPlayAvailable) return;
	try {
		// type: 'AUDIO' or 'TEXT' (subtitle), per Samsung AVPlayStreamType enum
		// Requires PLAYING or PAUSED state (not READY)
		webapis.avplay.setSelectTrack(type, index);
		console.log(`[tizenVideo] Selected ${type} track index: ${index}`);
	} catch (e) {
		console.warn(`[tizenVideo] Failed to select ${type} track:`, e);
		throw e;
	}
};

export const avplaySetStreamingProperty = (property, value) => {
	if (!isAVPlayAvailable) return;
	try {
		webapis.avplay.setStreamingProperty(property, value);
		console.log(`[tizenVideo] Set streaming property ${property}: ${value}`);
	} catch (e) {
		console.warn(`[tizenVideo] Failed to set streaming property ${property}:`, e.message);
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
	isAudioStreamPlayable,
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
	avplaySeekIdle,
	avplaySetPostSeekHook,
	avplaySetBufferingParams,
	avplaySuspend,
	avplayRestore,
	waitForHlsManifest,
	avplayGetCurrentTime,
	avplayGetDuration,
	avplayGetState,
	avplaySetListener,
	avplaySetSpeed,
	avplaySetDrm,
	avplaySelectTrack,
	avplaySetSilentSubtitle,
	avplaySetStreamingProperty,
	avplayGetTracks,
	avplaySetDisplayMethod,
	cleanupAVPlay
};
