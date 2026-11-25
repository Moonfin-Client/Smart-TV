import serverLogger from '@moonfin/app/src/services/serverLogger';
import {videoRangeTypeOf} from '@moonfin/app/src/utils/videoRange';
import {detectWebOSVersion} from './webosVersion';

let lunaClient = null;
let isLunaAvailable = false;

const DEFAULT_PASSTHROUGH_SETTINGS = {
	passthroughEnabled: true,
	ac3Passthrough: true,
	eac3Passthrough: true,
	dtsPassthrough: true,
	dtshdPassthrough: true
};

const resolvePassthroughSettings = (options = {}) => ({
	...DEFAULT_PASSTHROUGH_SETTINGS,
	...(options || {})
});

const isWebOS = () => {
	if (typeof window === 'undefined') return false;
	if (typeof window.webOS !== 'undefined') return true;
	const ua = navigator.userAgent.toLowerCase();
	return ua.includes('webos') || ua.includes('web0s');
};

export const initLunaAPI = async () => {
	if (!isWebOS()) return false;

	try {
		const LS2Request = (await import('./LS2Request.js')).default;
		lunaClient = LS2Request;
		isLunaAvailable = true;
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
			onFailure: (err) => reject(Object.assign(new Error(err.errorText || 'Luna call failed'), {errorCode: err.errorCode}))
		});
	});
};

// An empty container takes DTS when any container on the set plays it
const getSupportedAudioCodecs = (capabilities, container = '', passthroughOptions = {}) => {
	const passthrough = resolvePassthroughSettings(passthroughOptions);
	const passthroughAllowed = passthrough.passthroughEnabled;
	const codecs = ['aac', 'mp3', 'mp2', 'mp1', 'flac', 'pcm_s16le', 'pcm_s24le', 'lpcm', 'wav'];

	const ac3Ok = capabilities.ac3 && passthrough.ac3Passthrough;
	const eac3Ok = capabilities.eac3 && passthrough.eac3Passthrough;

	if (ac3Ok) codecs.push('ac3', 'dolby');
	if (eac3Ok) codecs.push('eac3', 'ec3');

	if (capabilities.dts && passthroughAllowed && passthrough.dtsPassthrough) {
		const dtsObj = capabilities.dts;
		let dtsOk = false;
		if (!container) {
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
		if (dtsOk) codecs.push('dts', 'dca');
		if (dtsOk && capabilities.dtshd) codecs.push('dts-hd', 'dtshd', 'dtsx');
	}

	if (capabilities.opus) codecs.push('opus');
	codecs.push('vorbis', 'wma', 'amr', 'amrnb', 'amrwb');

	return codecs;
};

export const isAudioStreamPlayable = (stream, capabilities, passthroughOptions = {}) => {
	if (!stream) return false;
	const codec = (stream.Codec || '').toLowerCase();
	if (!codec) return true;
	const supported = getSupportedAudioCodecs(capabilities, '', passthroughOptions);
	return supported.includes(codec);
};

export const getPlayMethod = (mediaSource, capabilities, options = {}, passthroughOptions = {}) => {
	if (!mediaSource) return 'Transcode';

	const container = (mediaSource.Container || '').toLowerCase();
	const videoStream = mediaSource.MediaStreams?.find(s => s.Type === 'Video');

	const audioStreams = mediaSource.MediaStreams?.filter(s => s.Type === 'Audio') || [];

	const videoCodec = (videoStream?.Codec || '').toLowerCase();
	const supportedVideoCodecs = ['h264', 'avc', 'mpeg4', 'mpeg2', 'mpeg1'];
	if (capabilities.hevc) supportedVideoCodecs.push('hevc', 'h265', 'hev1', 'hvc1');
	if (capabilities.av1) supportedVideoCodecs.push('av1', 'av01');
	if (capabilities.vp9) supportedVideoCodecs.push('vp9');
	supportedVideoCodecs.push('vp8');
	if (capabilities.dolbyVision) supportedVideoCodecs.push('dvhe', 'dvh1', 'dovi');
	// dvh1 (DV Profile 8) has an HEVC base layer playable without native DV
	if (!capabilities.dolbyVision && capabilities.hevc) supportedVideoCodecs.push('dvh1');

	const supportedAudioCodecs = getSupportedAudioCodecs(capabilities, container, passthroughOptions);
	const isAudioOnly = !videoStream && audioStreams.length > 0;

	// Any playable track will do, so TrueHD with an AC3 second track still direct plays on the AC3.
	const hasCompatibleAudio = audioStreams.length === 0 || audioStreams.some(s => {
		const codec = (s.Codec || '').toLowerCase();
		return !codec || supportedAudioCodecs.includes(codec);
	});

	const containerParts = container.split(',').map(c => c.trim());

	if (isAudioOnly) {
		const supportedAudioContainers = ['mp3', 'aac', 'm4a', 'm4b', 'flac', 'ogg', 'oga', 'opus', 'wav', 'wma', 'webma'];
		const audioContainerOk = !container || containerParts.some(c => supportedAudioContainers.includes(c));

		if (mediaSource.SupportsDirectPlay && hasCompatibleAudio && audioContainerOk) {
			return 'DirectPlay';
		}

		if (mediaSource.SupportsDirectStream && hasCompatibleAudio) {
			return 'DirectStream';
		}

		return 'Transcode';
	}

	const unsupportedContainers = ['rmvb', 'rm', 'flv', 'swf'];
	if (containerParts.some(c => unsupportedContainers.includes(c))) return 'Transcode';

	const supportedContainers = ['mp4', 'm4v', 'mov', 'ts', 'mpegts', 'mts', 'm2ts', '3gp', '3g2', 'mpg', 'mpeg', 'vob', 'dat'];
	if (capabilities.avi) supportedContainers.push('avi');
	if (capabilities.mkv) supportedContainers.push('mkv', 'matroska');
	if (capabilities.webm) supportedContainers.push('webm');
	if (capabilities.asf) supportedContainers.push('asf');
	if (capabilities.wmv) supportedContainers.push('wmv');
	if (capabilities.nativeHls) supportedContainers.push('m3u8', 'hls');

	const videoOk = !videoCodec || supportedVideoCodecs.includes(videoCodec);
	const audioOk = hasCompatibleAudio;
	// The container can be a list like mov,mp4,m4a, and any match counts
	let containerOk = !container || containerParts.some(c => supportedContainers.includes(c));

	let hdrOk = true;
	let isDolbyVision = false;
	const videoRangeType = videoRangeTypeOf(videoStream);
	if (videoRangeType) {
		const rangeType = videoRangeType.toUpperCase();
		if (rangeType === 'DOVI') {
			// Dolby Vision with no fallback layer needs native support
			hdrOk = capabilities.dolbyVision;
			isDolbyVision = true;
		} else if (rangeType.includes('DOVIWITH')) {
			if (capabilities.dolbyVision) {
				hdrOk = true;
			} else if (rangeType.includes('HDR10') && capabilities.hdr10) {
				hdrOk = true;
			} else if (rangeType.includes('HLG') && capabilities.hlg) {
				hdrOk = true;
			} else if (rangeType.includes('SDR')) {
				hdrOk = true;
			} else {
				hdrOk = false;
			}
			isDolbyVision = true;
		} else if (rangeType.includes('DOLBY') || rangeType.includes('DV')) {
			hdrOk = capabilities.dolbyVision;
			isDolbyVision = true;
		} else if (rangeType.includes('HDR10+') || rangeType === 'HDR10PLUS') {
			hdrOk = capabilities.hdr10Plus || capabilities.hdr10;
		} else if (rangeType.includes('HDR') || rangeType === 'HDR10') {
			hdrOk = capabilities.hdr10;
		} else if (rangeType.includes('HLG')) {
			hdrOk = capabilities.hlg || capabilities.hdr10;
		}
	}

	if(hdrOk && isDolbyVision){
		if(container.includes("mkv") || container.includes("matroska")){
			// Before webOS 25 Dolby Vision doesn't play from MKV
			if(capabilities.webosVersion<25){
				containerOk = false;
			}
		}
	}

	// LG's limits by codec and panel resolution
	let bitrateOk = true;
	if (videoStream?.BitRate) {
		let maxBitrate;
		const isHevc = ['hevc', 'h265', 'hev1', 'hvc1'].includes(videoCodec);
		const isH264 = ['h264', 'avc'].includes(videoCodec);
		if (options.maxBitrate > 0) {
			maxBitrate = options.maxBitrate;
		} else if (capabilities.uhd8K) {
			maxBitrate = 100_000_000;
		} else if (capabilities.uhd) {
			if (capabilities.webosVersion === 3) {
				maxBitrate = 50_000_000;
			} else {
				maxBitrate = isHevc ? 60_000_000 : isH264 ? 50_000_000 : 60_000_000;
			}
		} else {
			maxBitrate = 40_000_000;
		}
		bitrateOk = videoStream.BitRate <= maxBitrate;
	}

	if (mediaSource.SupportsDirectPlay && videoOk && audioOk && containerOk && hdrOk && bitrateOk) {
		return 'DirectPlay';
	}

	// DirectStream only remuxes, so audio the set can't play has to go to Transcode, where the
	// server copies the video and converts only the audio, keeping HDR and Dolby Vision.
	if (mediaSource.SupportsDirectStream && videoOk && audioOk && containerOk && hdrOk && bitrateOk) {
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
		wmv: 'video/x-ms-wmv',
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

// webOS hands the container to Starfish and exposes no track list for embedded bitmap
// subtitles, so an embedded PGS track is taken out of the file the player is already
// streaming instead of being asked for as a sidecar.
export const canRenderEmbeddedPgsInBand = () =>
	typeof ReadableStream === 'function' &&
	typeof Response === 'function' &&
	typeof fetch === 'function';

// Before webOS 6 the TV keeps the picture's shape inside the video element's box, so a box the size
// of the screen can't stretch it. The TV's video output service can, given the id of the playing
// pipeline, which the WebView puts on the element as mediaId.
const PIPELINE_NOT_READY = 53;
const outputWindow = {video: null, rect: null, active: false, inFlight: false, rerun: false, failures: 0, refreshes: 0, timer: null};

const callOutputWindow = async (video, rect) => {
	const width = video.videoWidth;
	const height = video.videoHeight;
	if (!video.mediaId || !width || !height) return 'pending';

	const output = {x: rect.destX, y: rect.destY, width: rect.destWidth, height: rect.destHeight};
	// The TV letterboxes a source to its own shape, so Stretch hands it one the shape of the output.
	const original = rect.mode === 'stretch'
		? {x: 0, y: 0, width, height: Math.round((width * output.height) / output.width)}
		: {x: 0, y: 0, width, height};
	const source = rect.mode === 'stretch' ? original : {x: rect.x, y: rect.y, width: rect.width, height: rect.height};
	try {
		await lunaCall('com.webos.service.videooutput', 'display/setDisplayWindow', {
			context: video.mediaId,
			sourcePort: 3,
			originalInput: original,
			sourceInput: source,
			displayOutput: output,
			fullScreen: false
		});
		return 'ok';
	} catch (e) {
		return e.errorCode === PIPELINE_NOT_READY ? 'pending' : 'failed';
	}
};

const stopOutputWindow = () => {
	clearTimeout(outputWindow.timer);
	Object.assign(outputWindow, {video: null, rect: null, active: false, failures: 0, refreshes: 0, timer: null});
};

const sendOutputWindow = async () => {
	if (outputWindow.inFlight) {
		outputWindow.rerun = true;
		return;
	}
	const {video, rect} = outputWindow;
	if (!video) return;

	clearTimeout(outputWindow.timer);
	outputWindow.inFlight = true;
	const result = await callOutputWindow(video, rect);
	outputWindow.inFlight = false;
	if (outputWindow.rerun || outputWindow.rect !== rect) {
		outputWindow.rerun = false;
		sendOutputWindow();
		return;
	}

	if (result === 'ok') {
		if (!outputWindow.active && rect.mode === 'stretch') serverLogger.playback('Playback: the TV took the Stretch window');
		outputWindow.failures = 0;
		outputWindow.active = rect.mode === 'stretch';
		if (!outputWindow.active) {
			stopOutputWindow();
			return;
		}
		// The TV can drop the window, so it's sent again now and then while Stretch is on.
		outputWindow.timer = setTimeout(sendOutputWindow, outputWindow.refreshes++ < 5 ? 3000 : 30000);
		return;
	}

	outputWindow.failures++;
	if (outputWindow.failures < (result === 'pending' ? 40 : 5)) {
		outputWindow.timer = setTimeout(sendOutputWindow, 500);
		return;
	}
	serverLogger.playback('Playback: the TV refused the zoom window', {mode: rect.mode, mediaId: Boolean(video.mediaId)});
	stopOutputWindow();
};

// Added once per element and left there, since it does nothing unless that element holds a Stretch window.
const resendOutputWindow = (event) => {
	if (outputWindow.active && outputWindow.video === event.currentTarget) sendOutputWindow();
};

export const setDisplayWindow = async (rect) => {
	const video = rect?.video;
	if (!isLunaAvailable || !video || detectWebOSVersion() >= 6) return false;

	// The element's box already shows Fit and Zoom to Fill, so the TV is only told while Stretch is on,
	// and once more after to take it back.
	const live = outputWindow.video === video && (outputWindow.active || outputWindow.inFlight);
	if (rect.mode !== 'stretch' && !live) {
		stopOutputWindow();
		return false;
	}
	if (outputWindow.video !== video) {
		stopOutputWindow();
		outputWindow.video = video;
	}
	video.addEventListener('playing', resendOutputWindow);
	outputWindow.rect = rect;
	outputWindow.failures = 0;
	sendOutputWindow();
	return true;
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

let _keepAwakeActivityId = null;

// The activity manager keepalive stops system suspend but not the firmware screensaver,
// so its requests are answered with ack false while video plays and the clock overlay
// never appears mid stream.
const SCREENSAVER_CLIENT = 'moonfin';
let _screenSaverBlocked = false;
let _screenSaverRegistered = false;

const respondScreenSaver = (timestamp) => {
	const ack = !_screenSaverBlocked;
	lunaCall('com.webos.service.tvpower', 'power/responseScreenSaverRequest', {
		clientName: SCREENSAVER_CLIENT,
		ack,
		timestamp
	}).catch((e) => console.warn('[webosVideo] Failed to respond to screensaver request:', e.message));
};

// window.webOS.service only exists with LG's webOSTV.js, which this app doesn't ship,
// so the guard goes through the service bridge directly.
const registerScreenSaverGuard = () => {
	if (_screenSaverRegistered) return;
	if (!isLunaAvailable) return;
	try {
		// eslint-disable-next-line @babel/new-cap
		new lunaClient().send({
			service: 'luna://com.webos.service.tvpower',
			method: 'power/registerScreenSaverRequest',
			parameters: {clientName: SCREENSAVER_CLIENT},
			subscribe: true,
			onSuccess: (res) => {
				if (res?.timestamp) {
					respondScreenSaver(res.timestamp);
				}
			},
			onFailure: (err) => {
				console.warn('[webosVideo] Screensaver guard registration failed:', err);
				_screenSaverRegistered = false;
			}
		});
		_screenSaverRegistered = true;
	} catch (e) {
		console.warn('[webosVideo] Exception registering screensaver guard:', e);
		_screenSaverRegistered = false;
	}
};

export const keepScreenOn = async (enable) => {
	_screenSaverBlocked = enable;

	if (enable) {
		registerScreenSaverGuard();
		// https://webostv.developer.lge.com/develop/references/activity-manager#type
		try {
			const res = await lunaCall('com.palm.activitymanager', 'create', {
				activity: {
					name: 'moonfin-playback-keepalive',
					description: 'Keep screen on during video playback',
					type: {
						foreground: true,
						continuous: true,
						power: true,
						powerDebounce: true
					}
				},
				start: true,
				replace: true,
				subscribe: false
			});
			_keepAwakeActivityId = res.activityId || null;
		} catch (e) {
			// keeping the screen awake is best effort
			console.warn('[webosVideo] Failed to create keep-screen activity:', e.message);
		}
	} else if (_keepAwakeActivityId != null) {
		lunaCall('com.palm.activitymanager', 'cancel', {activityId: _keepAwakeActivityId})
			.catch(() => {
				// the activity dies with the app anyway
			});
		_keepAwakeActivityId = null;
	}
	return true;
};

let _lastCleanupTimestamp = 0;
const DECODER_RELEASE_MS = 3000;

export const waitForDecoderRelease = async () => {
	if (_lastCleanupTimestamp === 0) return;
	const elapsed = Date.now() - _lastCleanupTimestamp;
	if (elapsed < DECODER_RELEASE_MS) {
		const wait = DECODER_RELEASE_MS - elapsed;
		await new Promise(resolve => setTimeout(resolve, wait));
	}
};

// One element is reused across player mounts so webOS 4's few hardware decoders
// aren't used up.
let _sharedVideoElement = null;

export const getSharedVideoElement = () => {
	if (!_sharedVideoElement) {
		_sharedVideoElement = document.createElement('video');
		_sharedVideoElement.autoplay = true;
		_sharedVideoElement.setAttribute('webkit-playsinline', '');
		_sharedVideoElement.setAttribute('playsinline', '');
		_sharedVideoElement.setAttribute('preload', 'auto');
		_sharedVideoElement.style.position = 'absolute';
		_sharedVideoElement.style.width = '100%';
		_sharedVideoElement.style.height = '100%';
		_sharedVideoElement.style.left = '0';
		_sharedVideoElement.style.top = '0';
		_sharedVideoElement.style.objectFit = 'fill';
		_sharedVideoElement.style.display = 'block';
	}
	return _sharedVideoElement;
};

// Pausing and dropping the source lets Starfish release the hardware decoder. The
// element stays in the DOM.
export const cleanupVideoElement = async (videoElement) => {
	if (!videoElement) return false;

	if (outputWindow.video === videoElement) stopOutputWindow();
	try { videoElement.pause(); } catch (e) { /* ignore */ }

	while (videoElement.firstChild) {
		videoElement.removeChild(videoElement.firstChild);
	}

	videoElement.src = '';
	videoElement.removeAttribute('src');
	if (videoElement.srcObject) {
		videoElement.srcObject = null;
	}
	videoElement.load();

	_lastCleanupTimestamp = Date.now();

	await new Promise(resolve => setTimeout(resolve, 300));

	return true;
};

// webOS 4 still has the webkit prefixed visibility API
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
			onHidden?.();
		} else {
			onVisible?.();
		}
	};

	// Both variants are listened to, since firmware differs on which one fires
	const altVisibilityChange = visibilityChange === 'visibilitychange'
		? 'webkitvisibilitychange'
		: 'visibilitychange';

	document.addEventListener(visibilityChange, handleVisibilityChange, true);
	document.addEventListener(altVisibilityChange, handleVisibilityChange, true);

	return () => {
		document.removeEventListener(visibilityChange, handleVisibilityChange, true);
		document.removeEventListener(altVisibilityChange, handleVisibilityChange, true);
	};
};

// webOSRelaunch fires when the app is launched again while it's already running
export const setupWebOSLifecycle = (onRelaunch) => {
	if (!isWebOS()) {
		return () => {};
	}

	const handleRelaunch = (event) => onRelaunch?.(event?.detail);

	document.addEventListener('webOSRelaunch', handleRelaunch, true);

	return () => {
		document.removeEventListener('webOSRelaunch', handleRelaunch, true);
	};
}
