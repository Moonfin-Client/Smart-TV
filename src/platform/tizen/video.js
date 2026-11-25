// Playback on Tizen through Samsung's AVPlay
/* global webapis, XMLHttpRequest */
import {detectTizenVersion as _detectTizenVersion} from './deviceProfile';
import {videoRangeTypeOf} from '@moonfin/app/src/utils/videoRange';

let isAVPlayAvailable = false;

const DEFAULT_PASSTHROUGH_SETTINGS = {
	passthroughEnabled: true,
	dtsPassthrough: true,
	dtshdPassthrough: true,
	truehdPassthrough: true
};

const resolvePassthroughSettings = (options = {}) => ({
	...DEFAULT_PASSTHROUGH_SETTINGS,
	...(options || {})
});

const isTizen = () => {
	if (typeof window === 'undefined') return false;
	if (typeof window.tizen !== 'undefined') return true;
	const ua = navigator.userAgent.toLowerCase();
	return ua.includes('tizen');
};

export const getTizenVersion = () => _detectTizenVersion();

export const initTizenAPI = async () => {
	if (!isTizen()) {
		return false;
	}

	try {
		if (typeof webapis !== 'undefined' && webapis.avplay) {
			isAVPlayAvailable = true;
			return true;
		}
	} catch (e) {
		console.warn('[tizenVideo] AVPlay API not available:', e.message);
	}
	return false;
};

const getSupportedAudioCodecs = (capabilities, _container, passthroughOptions = {}) => {
	const passthrough = resolvePassthroughSettings(passthroughOptions);
	const passthroughAllowed = passthrough.passthroughEnabled;
	const codecs = ['aac', 'mp3', 'flac', 'vorbis', 'pcm', 'wav', 'pcm_s16le'];
	// AC3 and E-AC3 ignore the passthrough settings, as in the device profile
	if (capabilities.ac3) codecs.push('ac3');
	if (capabilities.eac3) codecs.push('eac3');
	if (capabilities.opus) codecs.push('opus');
	if (capabilities.truehd && passthroughAllowed && passthrough.truehdPassthrough) codecs.push('truehd', 'mlp');
	// No Samsung set decodes DTS
	return codecs;
};

export const DTS_FAMILY_CODECS = ['dts', 'dca', 'dts-hd', 'dtshd', 'dts-ma', 'dtsma', 'dts-x', 'dtsx'];

const streamHasAtmos = (stream) => {
	if (!stream) return false;
	const fields = [stream.Profile, stream.Title, stream.DisplayTitle, stream.ChannelLayout];
	if (fields.some(v => typeof v === 'string' && /atmos/i.test(v))) return true;
	// TrueHD with more than 8 channels is taken as Atmos
	const codec = (stream.Codec || '').toLowerCase();
	if ((codec === 'truehd' || codec === 'mlp') && (stream.Channels || 0) > 8) return true;
	return false;
};

export const isAudioStreamPlayable = (stream, capabilities, passthroughOptions = {}) => {
	if (!stream) return false;
	const codec = (stream.Codec || '').toLowerCase();
	if (!codec) return true;
	// Samsung doesn't document LPCM limits, so only 16-bit stereo at up to 48 kHz, which is
	// known to play, skips conversion.
	if (codec === 'pcm') {
		// Plex reports the PCM format separately from the codec alias.
		const profile = (stream.Profile || '').toLowerCase();
		if (profile && profile !== 'pcm_s16le') return false;
		if (stream.BitDepth != null && Number(stream.BitDepth) !== 16) return false;
	}
	if ((codec === 'pcm_s16le' || codec === 'pcm') && ((stream.Channels || 0) > 2 || (stream.SampleRate || 0) > 48000)) return false;
	if (DTS_FAMILY_CODECS.includes(codec)) return false;
	if ((codec === 'truehd' || codec === 'mlp') && streamHasAtmos(stream)) return false;
	const supported = getSupportedAudioCodecs(capabilities, '', passthroughOptions);
	return supported.includes(codec);
};

export const getPlayMethod = (mediaSource, capabilities, _options, passthroughOptions = {}) => {
	if (!mediaSource) return 'Transcode';

	const container = (mediaSource.Container || '').toLowerCase();
	const videoStream = mediaSource.MediaStreams?.find(s => s.Type === 'Video');

	const videoCodec = (videoStream?.Codec || '').toLowerCase();
	const supportedVideoCodecs = ['h264', 'avc', 'mpeg2video'];
	if (capabilities.hevc) supportedVideoCodecs.push('hevc', 'h265', 'hev1', 'hvc1');
	if (capabilities.av1) supportedVideoCodecs.push('av1');
	if (capabilities.vp9) supportedVideoCodecs.push('vp9');
	if (capabilities.dolbyVision) supportedVideoCodecs.push('dvhe', 'dvh1');

	const audioStreams = mediaSource.MediaStreams?.filter(s => s.Type === 'Audio') || [];

	// FLAC inside a video container plays with an audio delay and the device
	// profile makes the server transcode it, so the local decision has to agree.
	const audioPlayableHere = (s) => {
		if (videoStream && (s?.Codec || '').toLowerCase() === 'flac') return false;
		return isAudioStreamPlayable(s, capabilities, passthroughOptions);
	};

	// AVPlay always decodes the file's default audio track and ignores the AudioStreamIndex
	// in the stream URL. So a file with TrueHD or DTS as the default and AC3 as a second track
	// can't direct play, since AVPlay still tries the default and fails with "codec not
	// supported". Direct play goes by the default track, and an unplayable default forces an
	// audio remux.
	const defaultStream = audioStreams.find(s => s.Index === mediaSource.DefaultAudioStreamIndex) || audioStreams[0];
	const defaultPlayable = !defaultStream || audioPlayableHere(defaultStream);
	const needsAudioRemux = !defaultPlayable && audioStreams.length > 0;

	const supportedContainers = ['mp4', 'm4v', 'mov', 'ts', 'mpegts', 'mkv', 'matroska', 'webm', 'avi',
		'mp3', 'flac', 'aac', 'm4a', 'm4b', 'ogg', 'oga', 'opus', 'wav', 'wma', 'weba'];
	if (capabilities.nativeHls) supportedContainers.push('m3u8');

	const videoOk = !videoCodec || supportedVideoCodecs.includes(videoCodec);
	const audioOk = defaultPlayable;
	const containerOk = !container || supportedContainers.includes(container);
	// Jellyfin can report an MP4 as mov, the first name in ffprobe's format list, so it gets
	// the MP4 codec rules the device profile gives the server.
	const codecContainer = container === 'mov' ? 'mp4' : container;

	// Samsung only supports HEVC in MKV, MP4 and TS
	const hevcContainerOk = videoCodec === 'hevc' || videoCodec === 'h265' || videoCodec === 'hev1' || videoCodec === 'hvc1'
		? ['mp4', 'mkv', 'matroska', 'ts', 'mpegts', 'm4v'].includes(codecContainer)
		: true;

	// Samsung lists VP9 as WebM only, but the decoder doesn't care about the container, and
	// MKV and MP4 demux just as well.
	const vp9ContainerOk = videoCodec === 'vp9'
		? ['webm', 'mkv', 'matroska', 'mp4', 'm4v'].includes(codecContainer)
		: true;

	// AV1 plays from the same containers as VP9, and 8K Premium models from 2022 also take
	// TS and AVI.
	const av1GeneralContainers = capabilities.uhd8K && capabilities.tizenVersion >= 6.5;
	const av1ContainerOk = videoCodec === 'av1'
		? (['webm', 'mkv', 'matroska', 'mp4', 'm4v'].includes(codecContainer) ||
			(av1GeneralContainers && ['ts', 'mpegts', 'avi'].includes(container)))
		: true;

	let hdrOk = true;
	const videoRangeType = videoRangeTypeOf(videoStream);
	if (videoRangeType) {
		const rangeType = videoRangeType.toUpperCase();
		if (rangeType === 'DOVIINVALID') {
			// The profile only offers DOVIInvalid with HDR10, so this has to agree with it
			hdrOk = capabilities.hdr10;
		} else if (rangeType.includes('DOVIWITHEL')) {
			// Profile 7 carries an enhancement layer that freezes the picture on a
			// panel without Dolby Vision, so it goes through the server's remux
			hdrOk = capabilities.dolbyVision;
		} else if (rangeType.includes('DOVIWITH')) {
			// Dolby Vision over a compatible base layer plays that layer on an
			// HDR10 panel, and an SDR base plays anywhere
			hdrOk = rangeType.includes('SDR') ? true : (capabilities.hdr10 || capabilities.dolbyVision);
		} else if (rangeType.includes('DOLBY') || rangeType.includes('DOVI')) {
			// A bare DOVI is profile 5, which carries no HDR10 base layer to
			// fall back on, so it needs a panel that decodes Dolby Vision itself
			hdrOk = capabilities.dolbyVision;
		} else if (rangeType.includes('HDR')) {
			hdrOk = capabilities.hdr10;
		}
	}

	const codecContainerOk = hevcContainerOk && vp9ContainerOk && av1ContainerOk;

	if (needsAudioRemux) {
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

// Tizen keeps the sidecar the server extracts, since the in-band reader isn't wired into
// the Tizen renderer and dropping the delivery URL would leave PGS with nothing to draw.
export const canRenderEmbeddedPgsInBand = () => false;

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
			}
			if (!_keepScreenInterval) {
				const suppressScreenSaver = () => {
					try {
						if (typeof webapis !== 'undefined' && webapis.appcommon) {
							webapis.appcommon.setScreenSaver(webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_OFF);
						}
					} catch {
						// Swallowed because suppressing the screen saver is best effort
					}
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
			} catch {
				// Swallowed so the power release below still runs
			}
			if (typeof window.tizen !== 'undefined' && window.tizen.power) {
				window.tizen.power.release('SCREEN');
			}
		}
	} catch (e) {
		console.warn('[tizenVideo] keepScreenOn error:', e.message);
	}
	return true;
};

export const avplayOpen = (url) => {
	if (!isAVPlayAvailable) throw new Error('AVPlay not available');
	webapis.avplay.open(url);
};

// Must be called in IDLE, between open and prepare. Falls back through the older byte based
// APIs on firmware that lacks setBufferingParam, and never throws so it can't abort an open.
// Returns what was set, or null.
export const avplaySetBufferingParams = (opts = {}) => {
	if (!isAVPlayAvailable) return null;
	// Samsung docs set 4 seconds as the minimum accepted value
	const initialSeconds = Math.max(4, opts.initialSeconds ?? 6);
	const resumeSeconds = Math.max(4, opts.resumeSeconds ?? 4);
	let applied = null;

	try {
		webapis.avplay.setBufferingParam('PLAYER_BUFFER_FOR_PLAY', 'PLAYER_BUFFER_SIZE_IN_SECOND', initialSeconds);
		webapis.avplay.setBufferingParam('PLAYER_BUFFER_FOR_RESUME', 'PLAYER_BUFFER_SIZE_IN_SECOND', resumeSeconds);
		applied = `${initialSeconds} s to play, ${resumeSeconds} s to resume`;
	} catch (e) {
		console.warn('[tizenVideo] setBufferingParam unavailable:', e.message);
	}

	if (!applied) {
		const bytes = Math.max(15 * 1024 * 1024, Math.floor(((opts.bitrate || 0) / 8) * initialSeconds));
		try {
			webapis.avplay.setBufferSize(bytes);
			applied = `${bytes} bytes`;
		} catch (e) {
			try {
				webapis.avplay.setStreamingProperty('SET_BUFFER_SIZE', String(initialSeconds));
				applied = `${initialSeconds} s`;
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
// Bumped on stop, close, suspend and restore so callbacks and retry timers from a torn down
// session can't fire into the next one
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

export const avplaySuspend = () => {
	if (!isAVPlayAvailable) return false;
	// A seek still in flight would leave the deferral queue wedged after restore
	resetSeekState();
	try {
		const state = webapis.avplay.getState();
		if (state === 'NONE' || state === 'IDLE') return false;
		webapis.avplay.suspend();
		return true;
	} catch (e) {
		console.warn('[tizenVideo] suspend failed:', e.message);
		return false;
	}
};

const RESTORE_TIMEOUT_MS = 10000;

export const avplayRestore = (url, resumeMs = 0) => {
	return new Promise((resolve) => {
		if (!isAVPlayAvailable) {
			resolve(false);
			return;
		}
		resetSeekState();
		const timeMs = Math.max(0, Math.floor(resumeMs));
		if (typeof webapis.avplay.restoreAsync === 'function') {
			// A restore that can't reach its stream calls neither callback and leaves the player idle
			const timer = setTimeout(() => resolve(false), RESTORE_TIMEOUT_MS);
			const settle = (ok) => {
				clearTimeout(timer);
				resolve(ok);
			};
			try {
				webapis.avplay.restoreAsync(url, timeMs, true, () => settle(true), () => settle(false));
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

// Opening AVPlay on a transcode playlist the server hasn't written yet fails the whole
// pipeline, so this polls until it's there. Resolves false on a timeout and never rejects.
export const waitForHlsManifest = (url, options = {}) => {
	const intervalMs = options.intervalMs || 500;
	const timeoutMs = options.timeoutMs || 15000;

	const fetchText = (target) => new Promise((resolve) => {
		// A hung request must not stall the poll loop past its deadline
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

const avplayStop = () => {
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

const avplayClose = () => {
	if (!isAVPlayAvailable) return;
	resetSeekState();
	try {
		webapis.avplay.close();
	} catch (e) {
		// Ignore
	}
};

// Sets the start position in IDLE, before prepare, so playback begins at the resume point
// instead of starting at zero and jumping. False when it can't, so the caller seeks after play.
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

	// Seeking into the very last second races the stream completed event
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
			// Some firmware never fires buffering events after the seek flush and
			// leaves the pipeline parked, so play is nudged back on shortly after
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
			// Rapid scrubbing is coalesced. The newest target wins and every
			// waiting caller settles when it lands.
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

export const avplaySetDisplayMethod = (mode) => {
	if (!isAVPlayAvailable) return;
	try {
		webapis.avplay.setDisplayMethod(mode);
	} catch (e) {
		console.warn('[tizenVideo] setDisplayMethod failed:', e.message);
	}
};

// Stops and closes AVPlay to free the hardware, and is safe to call in any state
export const cleanupAVPlay = () => {
	try {
		const state = avplayGetState();
		if (state !== 'NONE' && state !== 'IDLE') {
			avplayStop();
		}
		if (state !== 'NONE') {
			avplayClose();
		}
	} catch (e) {
		console.warn('[tizenVideo] AVPlay cleanup error:', e);
	}
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

export const avplayGetCurrentTracks = () => {
	if (!isAVPlayAvailable) return [];
	try {
		return webapis.avplay.getCurrentStreamInfo();
	} catch (e) {
		console.warn('[tizenVideo] Failed to get current stream info:', e);
		return [];
	}
};

export const avplaySelectTrack = (type, index) => {
	if (!isAVPlayAvailable) return;
	try {
		// type is AUDIO or TEXT, and AVPlay only takes this in PLAYING or PAUSED, not READY
		webapis.avplay.setSelectTrack(type, index);
	} catch (e) {
		console.warn(`[tizenVideo] Failed to select ${type} track:`, e);
		throw e;
	}
};

// The rewindable range of a live stream in milliseconds, which AVPlay reports as "start|end" for
// live HLS. Null for anything else, including a live TS stream, which keeps no range.
export const avplayGetLiveRange = () => {
	if (!isAVPlayAvailable) return null;
	try {
		const [start, end] = String(webapis.avplay.getStreamingProperty('GET_LIVE_DURATION')).split('|').map(Number);
		return end > start ? {start, end} : null;
	} catch (e) {
		return null;
	}
};

export const avplaySetStreamingProperty = (property, value) => {
	if (!isAVPlayAvailable) return;
	try {
		webapis.avplay.setStreamingProperty(property, value);
	} catch (e) {
		console.warn(`[tizenVideo] Failed to set streaming property ${property}:`, e.message);
	}
};

export const avplaySetSilentSubtitle = (silent) => {
	if (!isAVPlayAvailable) return;
	try {
		webapis.avplay.setSilentSubtitle(silent);
	} catch (e) {
		console.warn('[tizenVideo] Failed to set silent subtitle:', e);
	}
};

// Tizen has few hardware decoders, so cleanup clears the element's source to free one. Sets
// also switch to HDR for HDR video in the element and can stay there on the home screen, so
// this 1x1 SDR H.264 clip is loaded first to put the decoder back in SDR.
const SDR_RESET_VIDEO = 'data:video/mp4;base64,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';

export const cleanupVideoElement = (videoElement, options = {}) => {
	if (!videoElement) {
		return false;
	}

	try {
		if (!videoElement.paused) {
			videoElement.pause();
		}

		if (isTizen()) {
			try {
				videoElement.src = SDR_RESET_VIDEO;
				videoElement.load();
			} catch (e) {
				console.warn('[tizenVideo] SDR reset video failed, continuing cleanup:', e);
			}
		}

		videoElement.removeAttribute('src');
		if (videoElement.srcObject) {
			videoElement.srcObject = null;
		}
		videoElement.load();

		if (options.removeFromDOM && videoElement.parentNode) {
			videoElement.parentNode.removeChild(videoElement);
		}

		return true;
	} catch (err) {
		console.error('[tizenVideo] Error during video cleanup:', err);
		return false;
	}
};

// Tizen 4 only has the webkit-prefixed visibility API
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
			onHidden?.();
		} else {
			onVisible?.();
		}
	};

	document.addEventListener(visibilityChange, handleVisibilityChange, true);

	// Both event names are listened to, since firmware differs on which one fires
	const altVisibilityChange = visibilityChange === 'visibilitychange'
		? 'webkitvisibilitychange'
		: 'visibilitychange';

	document.addEventListener(altVisibilityChange, handleVisibilityChange, true);

	return () => {
		document.removeEventListener(visibilityChange, handleVisibilityChange, true);
		document.removeEventListener(altVisibilityChange, handleVisibilityChange, true);
	};
};

// tizenRelaunch fires when the app is launched again while it's already running
export const setupTizenLifecycle = (onRelaunch) => {
	if (!isTizen()) {
		return () => {};
	}

	const handleRelaunch = (event) => {
		onRelaunch?.(event?.detail);
	};

	document.addEventListener('tizenRelaunch', handleRelaunch, true);

	return () => {
		document.removeEventListener('tizenRelaunch', handleRelaunch, true);
	};
}
