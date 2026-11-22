// A video element that plays through the console's own player.
//
// The player takes a real video element and talks to it as any page would: it sets
// src, calls play, reads currentTime and listens for timeupdate. This one is a real
// element in the page, so it can be placed, styled and listened to, but what it is
// asked to do goes to the host's player behind the WebView, and what the player
// reports comes back as the element's own events. It never loads anything itself.
//
// The page draws over the player, so while the element is on the page everything
// behind it is made clear, and put back the moment it is taken off.
import {nativePlayerAvailable} from './bridge';
import * as hostPlayer from './hostPlayer';

const SETTINGS_KEY = 'moonfin_settings';
const CLEAR_CLASS = 'xbox-native-video';
const CLEAR_STYLE_ID = 'xbox-native-video-style';
const CLOSE_WAIT_MS = 300;

const HAVE_NOTHING = 0;
const HAVE_METADATA = 1;
const HAVE_CURRENT_DATA = 2;
const HAVE_ENOUGH_DATA = 4;
const NETWORK_EMPTY = 0;
const NETWORK_IDLE = 1;
const NETWORK_LOADING = 2;
const NETWORK_NO_SOURCE = 3;

const PLAYS_NATIVELY = /^(application\/(x-mpegurl|vnd\.apple\.mpegurl)|video\/(mp4|x-matroska|quicktime|webm|mp2t)|audio\/)/i;

let element = null;
let display = null;

const savedSettings = () => {
	try {
		return JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || '{}') || {};
	} catch (e) {
		return {};
	}
};

// The console player plays unless the host doesnt have one or the viewer turned it off.
export const isNativePlayerEnabled = () => nativePlayerAvailable() && savedSettings().xboxNativePlayer !== false;

export const isPassthroughEnabled = () => isNativePlayerEnabled() && savedSettings().xboxPassthrough === true;

export const isDolbyVisionEnabled = () => isNativePlayerEnabled() && savedSettings().xboxDolbyVision !== false;

// What the host last put the display in for the open stream, {ok, mode, reason, hdr}, or null
export const getNativeDisplay = () => display;

export const isNativeVideoElement = (candidate) => !!candidate && candidate === element;

const stripFragment = (url) => {
	const match = /^(.*?)#t=([\d.]+)$/.exec(url || '');
	return match ? {url: match[1], startSeconds: Number(match[2]) || 0} : {url: url || '', startSeconds: 0};
};

const define = (target, name, descriptor) => Object.defineProperty(target, name, {configurable: true, enumerable: true, ...descriptor});

const createFacade = () => {
	const video = document.createElement('video');
	video.setAttribute('playsinline', '');
	video.style.position = 'absolute';
	video.style.width = '100%';
	video.style.height = '100%';
	video.style.left = '0';
	video.style.top = '0';
	video.style.display = 'block';

	let nextSession = 1;
	const state = {
		session: 0,
		pendingSrc: '',
		position: 0,
		positionAt: 0,
		duration: NaN,
		paused: true,
		seeking: false,
		ended: false,
		moving: false,
		readyState: HAVE_NOTHING,
		networkState: NETWORK_EMPTY,
		error: null,
		naturalWidth: 0,
		naturalHeight: 0,
		buffered: [],
		tracks: [],
		selectedTrack: -1,
		volume: 1,
		muted: false,
		subtitle: -1,
		systemReader: null,
		dolbyVision: null,
		passthrough: false,
		autoplay: false,
		playing: [],
		closing: null
	};

	const fire = (name) => video.dispatchEvent(new Event(name));
	const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

	const settlePlays = (ok) => {
		const waiting = state.playing;
		state.playing = [];
		waiting.forEach(({resolve, reject}) => (ok ? resolve() : reject(new DOMException('The play() request was interrupted', 'AbortError'))));
	};

	const setPosition = (seconds) => {
		state.position = Number(seconds) || 0;
		state.positionAt = now();
	};

	const trackList = (entries) => entries.map((entry, index) => {
		const track = {id: String(entry.id || index), language: entry.language || '', label: entry.label || '', kind: 'main'};
		define(track, 'enabled', {
			get: () => state.selectedTrack === index,
			set: (on) => {
				if (!on || state.selectedTrack === index) return;
				state.selectedTrack = index;
				hostPlayer.selectAudio(state.session, index);
			}
		});
		return track;
	});

	const takeTracks = (payload) => {
		state.selectedTrack = Number.isInteger(payload.selectedAudio) ? payload.selectedAudio : -1;
		state.tracks = trackList(Array.isArray(payload.audioTracks) ? payload.audioTracks : []);
	};

	const onEvent = (payload) => {
		if (!payload || payload.session !== state.session) return;
		switch (payload.event) {
			case 'opened':
				state.duration = payload.duration === null ? Infinity : (Number(payload.duration) || 0);
				state.naturalWidth = payload.width || 0;
				state.naturalHeight = payload.height || 0;
				state.readyState = HAVE_METADATA;
				state.networkState = NETWORK_IDLE;
				takeTracks(payload);
				fire('loadedmetadata');
				break;
			case 'playing':
				setPosition(payload.position);
				state.moving = true;
				state.ended = false;
				if (state.readyState < HAVE_ENOUGH_DATA) {
					state.readyState = HAVE_ENOUGH_DATA;
					fire('loadeddata');
					fire('canplay');
				}
				if (state.paused) {
					state.paused = false;
					fire('play');
				}
				fire('playing');
				settlePlays(true);
				break;
			case 'paused':
				setPosition(payload.position);
				state.moving = false;
				if (!state.paused) {
					state.paused = true;
					fire('pause');
				}
				break;
			case 'waiting':
				setPosition(payload.position);
				state.moving = false;
				state.readyState = Math.min(state.readyState, HAVE_CURRENT_DATA);
				fire('waiting');
				break;
			case 'timeupdate':
				setPosition(payload.position);
				if (Array.isArray(payload.buffered)) state.buffered = payload.buffered;
				if (payload.duration !== undefined && payload.duration !== null) state.duration = Number(payload.duration) || state.duration;
				fire('timeupdate');
				break;
			case 'seeked':
				setPosition(payload.position);
				state.seeking = false;
				fire('seeked');
				fire('timeupdate');
				break;
			case 'ended':
				setPosition(payload.position);
				state.moving = false;
				state.ended = true;
				state.paused = true;
				fire('pause');
				fire('ended');
				break;
			case 'audioTracks':
				takeTracks(payload);
				break;
			case 'natural':
				state.naturalWidth = payload.width || 0;
				state.naturalHeight = payload.height || 0;
				fire('resize');
				break;
			case 'display':
				display = payload;
				break;
			case 'error':
				state.error = {code: Number(payload.code) || 4, message: payload.message || ''};
				state.networkState = NETWORK_NO_SOURCE;
				state.moving = false;
				settlePlays(false);
				fire('error');
				break;
			default:
				break;
		}
	};
	hostPlayer.onPlayerEvent(onEvent);

	const open = () => {
		const {url, startSeconds} = stripFragment(state.pendingSrc);
		state.session = nextSession++;
		state.position = startSeconds;
		state.positionAt = now();
		state.duration = NaN;
		state.seeking = false;
		state.ended = false;
		state.moving = false;
		state.readyState = HAVE_NOTHING;
		state.networkState = NETWORK_LOADING;
		state.error = null;
		state.naturalWidth = 0;
		state.naturalHeight = 0;
		state.buffered = [];
		state.tracks = [];
		state.selectedTrack = -1;
		display = null;
		const hls = /^application\/(x-mpegurl|vnd\.apple\.mpegurl)$/i.test(video.type || '') || /\.m3u8(\?|$)/i.test(url);
		// The choice holds for this one open, so a stream nobody chose for leaves it to FFmpeg
		const reader = state.systemReader ? {reader: 'system', fallback: true, hdr10: state.systemReader.hdr10} : {};
		state.systemReader = null;
		const dolbyVision = state.dolbyVision ? {dolbyVision: state.dolbyVision} : {};
		state.dolbyVision = null;
		const passthrough = state.passthrough ? {passthrough: true} : {};
		state.passthrough = false;
		hostPlayer.openStream(state.session, {url, hls, ...reader, ...dolbyVision, ...passthrough, startSeconds, autoplay: !state.paused || state.autoplay, volume: state.volume, muted: state.muted, subtitle: state.subtitle}).catch((err) => {
			onEvent({session: state.session, event: 'error', code: 2, message: err.message});
		});
	};

	const close = () => {
		const session = state.session;
		state.session = 0;
		state.readyState = HAVE_NOTHING;
		state.networkState = NETWORK_EMPTY;
		state.moving = false;
		state.paused = true;
		display = null;
		settlePlays(false);
		state.closing = session ? hostPlayer.closeStream(session).catch(() => {}) : Promise.resolve();
	};

	define(video, 'src', {
		get: () => stripFragment(state.pendingSrc).url,
		set: (value) => {
			state.pendingSrc = String(value || '');
		}
	});
	define(video, 'currentSrc', {get: () => stripFragment(state.pendingSrc).url});
	const prototype = window.HTMLVideoElement.prototype;
	define(video, 'setAttribute', {value: (name, value) => (name === 'src' ? (video.src = value) : prototype.setAttribute.call(video, name, value))});
	define(video, 'removeAttribute', {value: (name) => (name === 'src' ? (video.src = '') : prototype.removeAttribute.call(video, name))});
	define(video, 'load', {
		value: () => {
			if (!state.pendingSrc) {
				close();
				return;
			}
			if (/^(blob|mediasource):/i.test(state.pendingSrc)) {
				// hls.js would feed the element itself, which the console player cant take.
				const session = nextSession++;
				state.session = session;
				setTimeout(() => onEvent({session, event: 'error', code: 4, message: 'The console player takes no MediaSource'}), 0);
				return;
			}
			open();
		}
	});
	define(video, 'play', {
		value: () => new Promise((resolve, reject) => {
			state.playing.push({resolve, reject});
			if (!state.session) {
				if (state.pendingSrc) open();
				else {
					settlePlays(false);
					return;
				}
			}
			if (state.paused) {
				state.paused = false;
				setTimeout(() => fire('play'), 0);
			}
			hostPlayer.play(state.session);
		})
	});
	define(video, 'pause', {
		value: () => {
			if (!state.paused) {
				state.paused = true;
				fire('pause');
			}
			if (state.session) hostPlayer.pause(state.session);
		}
	});
	define(video, 'currentTime', {
		get: () => {
			if (!state.moving || state.seeking) return state.position;
			const elapsed = (now() - state.positionAt) / 1000;
			return Number.isFinite(state.duration) ? Math.min(state.duration, state.position + elapsed) : state.position + elapsed;
		},
		set: (value) => {
			let seconds = Math.max(0, Number(value) || 0);
			if (Number.isFinite(state.duration)) seconds = Math.min(seconds, state.duration);
			setPosition(seconds);
			if (!state.session) return;
			state.seeking = true;
			fire('seeking');
			hostPlayer.seek(state.session, seconds);
		}
	});
	define(video, 'duration', {get: () => state.duration});
	define(video, 'paused', {get: () => state.paused});
	define(video, 'seeking', {get: () => state.seeking});
	define(video, 'ended', {get: () => state.ended});
	define(video, 'readyState', {get: () => state.readyState});
	define(video, 'networkState', {get: () => state.networkState});
	define(video, 'error', {get: () => state.error});
	define(video, 'videoWidth', {get: () => state.naturalWidth});
	define(video, 'videoHeight', {get: () => state.naturalHeight});
	define(video, 'buffered', {
		get: () => ({
			length: state.buffered.length,
			start: (index) => state.buffered[index][0],
			end: (index) => state.buffered[index][1]
		})
	});
	define(video, 'audioTracks', {get: () => state.tracks});
	define(video, 'volume', {
		get: () => state.volume,
		set: (value) => {
			state.volume = Math.max(0, Math.min(1, Number(value) || 0));
			if (state.session) hostPlayer.setVolume(state.session, state.volume, state.muted);
		}
	});
	define(video, 'muted', {
		get: () => state.muted,
		set: (value) => {
			state.muted = !!value;
			if (state.session) hostPlayer.setVolume(state.session, state.volume, state.muted);
		}
	});
	define(video, 'defaultMuted', {get: () => false, set: () => {}});
	define(video, 'autoplay', {get: () => state.autoplay, set: (value) => { state.autoplay = !!value; }});
	define(video, 'playbackRate', {get: () => 1, set: () => {}});
	define(video, 'canPlayType', {value: (type) => (PLAYS_NATIVELY.test(type || '') ? 'probably' : '')});
	define(video, 'getVideoPlaybackQuality', {value: () => ({droppedVideoFrames: 0, totalVideoFrames: 0, corruptedVideoFrames: 0, creationTime: now()})});

	video.closeNative = () => {
		video.pause();
		video.src = '';
		video.load();
		return Promise.race([state.closing, new Promise((resolve) => setTimeout(resolve, CLOSE_WAIT_MS))]);
	};
	video.sessionNative = () => state.session;
	// Whether the next stream opens with the system's reader, and whether it is HDR10,
	// which only FFmpeg would have read out of the file
	video.useSystemReaderNative = (on, hdr10) => {
		state.systemReader = on ? {hdr10: !!hdr10} : null;
	};
	// The Dolby Vision profile the next stream opens in, 5, 7 or 8, or null for none
	video.useDolbyVisionNative = (profile) => {
		state.dolbyVision = profile || null;
	};
	// Whether the next stream's sound goes to the console as it is in the file
	video.usePassthroughNative = (on) => {
		state.passthrough = !!on;
	};
	// Which of the file's subtitle tracks the host draws, kept across reopens of the stream
	video.selectSubtitleNative = (index) => {
		state.subtitle = Number.isInteger(index) ? index : -1;
		if (state.session) hostPlayer.selectSubtitle(state.session, state.subtitle);
		return true;
	};
	return video;
};

// Everything from the element up to the page goes clear while it is on the page.
const clearBehind = (video) => {
	if (!document.getElementById(CLEAR_STYLE_ID)) {
		const style = document.createElement('style');
		style.id = CLEAR_STYLE_ID;
		style.textContent = `html.${CLEAR_CLASS}, html.${CLEAR_CLASS} body { background: transparent !important; }`;
		document.head.appendChild(style);
	}
	const cleared = [];
	for (let node = video.parentElement; node && node !== document.documentElement; node = node.parentElement) {
		cleared.push({node, background: node.style.background, backgroundColor: node.style.backgroundColor});
		node.style.background = 'transparent';
		node.style.backgroundColor = 'transparent';
	}
	document.documentElement.classList.add(CLEAR_CLASS);

	let observer = null;
	const restore = () => {
		observer.disconnect();
		cleared.forEach(({node, background, backgroundColor}) => {
			node.style.background = background;
			node.style.backgroundColor = backgroundColor;
		});
		document.documentElement.classList.remove(CLEAR_CLASS);
	};
	observer = new window.MutationObserver(() => {
		if (!video.isConnected) restore();
	});
	observer.observe(video.parentElement, {childList: true});
};

export const getNativeVideoElement = () => {
	if (!element) element = createFacade();
	const video = element;
	window.requestAnimationFrame(() => {
		if (video.isConnected && !document.documentElement.classList.contains(CLEAR_CLASS)) clearBehind(video);
	});
	return video;
};

export const closeNativeVideo = (video) => video.closeNative();

// Puts the host's player where the page laid the element out. False when nothing is open.
export const placeNativeVideo = () => {
	const session = element?.sessionNative();
	if (!session) return false;
	const px = (value) => parseFloat(value) || 0;
	hostPlayer.setRect(session, {x: px(element.style.left), y: px(element.style.top), width: px(element.style.width), height: px(element.style.height)});
	return true;
};
