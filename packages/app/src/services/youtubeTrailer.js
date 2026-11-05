import {isTizen, isVega, isWebOS, isXbox} from '../platform';
import {originFreeFetch} from './secureFetch';
import serverLogger from './serverLogger';
import {readTrailerManifest} from './video';

const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1/player';
const RESOLVE_TIMEOUT_MS = 8000;
const REQUEST_TIMEOUT_MS = 5000;
const DEBUG_STORAGE_KEY = 'moonfin:debugYoutubeTrailer';

// What counts as a good enough resolution to stop hunting for a better stream.
const HIGH_QUALITY_FLOOR = 720;
const MANIFEST_URL = /\/manifest\/(hls|dash)_|\.(m3u8|mpd)(\?|$)/;
// hls.js guesses 500 kbps until it has measured, which opens a trailer at 480p on a TV that
// has bandwidth to spare for YouTube's 2.6 Mbps 1080p.
const HLS_START_BANDWIDTH = 8000000;
// LG's own player is held to 1080p. The rungs above it are VP9 only, and it cant change codec
// partway through a stream.
const LG_MAX_WIDTH = 1920;
const LG_MAX_HEIGHT = 1080;
// How long a manifest gets to start, and to sit still once it has, before the muxed file takes
// over, and how much of it has to play before the TV counts as coping with it.
const MANIFEST_START_MS = 8000;
const MANIFEST_STALL_MS = 5000;
const MANIFEST_CONFIRM_S = 10;
const MANIFEST_WATCH_MS = 500;
// A TV whose own player keeps failing the manifest goes straight to the muxed file for a week,
// rather than making every trailer wait out the watch first. One failure can be the network, so
// it takes two in a row.
const NATIVE_MANIFEST_SKIP_KEY = 'moonfin:trailerNativeManifestSkipUntil';
// Fire TV used to hand its player the whole manifest, which it never opens, so a skip from then
// says nothing about the picture only manifest it gets now.
const VEGA_MANIFEST_SKIP_KEY = 'moonfin:trailerVideoOnlyManifestSkipUntil';
const NATIVE_MANIFEST_FAILURES = 2;
const NATIVE_MANIFEST_SKIP_MS = 7 * 24 * 60 * 60 * 1000;
let nativeManifestFailures = 0;
// Fire TV plays YouTube's picture from a cut down manifest and the soundtrack from its own file
// beside it. A seek takes long enough to open a gap of its own, so a small gap is closed by playing
// the sound up to a tenth faster or slower, and only a big one is seeked across, landing ahead by
// about what the seek takes.
const SOUND_DRIFT_S = 0.03;
const SOUND_SEEK_GAP_S = 0.5;
const SOUND_SEEK_LEAD_S = 0.15;
const SOUND_MAX_RATE_STEP = 0.1;

// The Vision Pro app gets a manifest with every resolution in it, and the Android app backs it
// up with a muxed file that stops at 360p. A client marked needsVisitor turns away a request
// that carries no visitor id.
const INNERTUBE_CLIENTS = [
	{
		name: 'VISIONOS',
		version: '1.02',
		needsVisitor: true,
		extra: {
			deviceMake: 'Apple',
			deviceModel: 'RealityDevice17,1',
			osName: 'visionOS',
			osVersion: '26.5.23O471'
		}
	},
	{
		name: 'ANDROID',
		version: '20.10.41',
		apiKey: 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w',
		platform: 'MOBILE',
		extra: {
			deviceMake: 'Google',
			deviceModel: 'Pixel 5',
			osName: 'Android',
			osVersion: '11',
			androidSdkVersion: '30'
		}
	}
];

// YouTube's visitor id outlives a single lookup, so the one it last handed over is kept.
let visitorData = '';

const YT_ID_REGEX = /(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

function debugLog (...args) {
	try {
		if (typeof window !== 'undefined' && window.localStorage && window.localStorage.getItem(DEBUG_STORAGE_KEY) === '1') {
			console.log('[youtubeTrailer]', ...args);
		}
	} catch (e) {
		// Ignore debug logging errors.
	}
}

function requestJson (url, options, timeoutMs = REQUEST_TIMEOUT_MS, requestName = 'request') {
	return new Promise(function (resolve) {
		let timer = setTimeout(function () { resolve(null); }, timeoutMs);

		originFreeFetch(url, options, timeoutMs)
			.then(function (resp) {
				if (!resp.ok) {
					clearTimeout(timer);
					debugLog(requestName, 'HTTP', resp.status);
					resolve(null);
					return null;
				}
				return resp.json();
			})
			.then(function (data) {
				clearTimeout(timer);
				if (data === undefined) return;
				resolve(data);
			})
			.catch(function () {
				clearTimeout(timer);
				debugLog(requestName, 'network error');
				resolve(null);
			});
	});
}

function qualityFromStream (stream) {
	const qualityRaw = (stream && (stream.qualityLabel || stream.quality || '')) + '';
	const match = qualityRaw.match(/(\d{3,4})/);
	return match ? parseInt(match[1], 10) : 0;
}

function streamHasAudio (stream) {
	const mime = ((stream && stream.mimeType) || '').toLowerCase();

	return mime.indexOf('mp4a') !== -1 ||
		mime.indexOf('opus') !== -1 ||
		mime.indexOf('vorbis') !== -1 ||
		mime.indexOf('audio') !== -1;
}

function streamScore (stream, preferHighQuality) {
	const mime = ((stream && stream.mimeType) || '').toLowerCase();
	const quality = qualityFromStream(stream);

	let score = 0;

	if (mime.indexOf('video/mp4') !== -1) score += 2500;
	if (mime.indexOf('avc1') !== -1) score += 2500;
	if (mime.indexOf('vp9') !== -1 || mime.indexOf('vp09') !== -1) score -= 1500;
	if (mime.indexOf('av01') !== -1) score -= 2500;

	const clampedQuality = quality > 0 ? Math.min(1080, Math.max(144, quality)) : 480;
	if (preferHighQuality) {
		score += clampedQuality;
	} else {
		const qualityDelta = Math.abs(clampedQuality - 480);
		score += 1000 - qualityDelta;
	}

	return score;
}

function pickBestStream (streams, preferHighQuality) {
	let best = null;
	let bestScore = -1e9;

	for (let i = 0; i < streams.length; i++) {
		const stream = streams[i];
		const url = stream && stream.url;
		if (!url) continue;

		const score = streamScore(stream, preferHighQuality);
		if (score > bestScore) {
			bestScore = score;
			best = {url: url, quality: qualityFromStream(stream)};
		}
	}

	return best;
}

export function extractInnertubeStream (playerResponse, preferHighQuality, muxedOnly = false) {
	if (!playerResponse) return null;

	const playability = playerResponse.playabilityStatus;
	const status = playability && playability.status;
	if (status && status !== 'OK') return null;

	const streamingData = playerResponse.streamingData;
	if (!streamingData) return null;

	// A manifest carries every variant, so nothing else beats it on quality.
	if (streamingData.hlsManifestUrl && !muxedOnly) return {url: streamingData.hlsManifestUrl, quality: HIGH_QUALITY_FLOOR};
	if (streamingData.dashManifestUrl && !muxedOnly) return {url: streamingData.dashManifestUrl, quality: HIGH_QUALITY_FLOOR};

	const formats = Array.isArray(streamingData.formats) ? streamingData.formats : [];
	const muxedFormats = formats.filter(function (stream) {
		return stream && stream.url && streamHasAudio(stream);
	});

	if (muxedFormats.length > 0) {
		return pickBestStream(muxedFormats, preferHighQuality);
	}

	return null;
}

// The caption track for the viewer's language, as a WebVTT url. Machine
// generated tracks are marked asr and only stand in when nothing was written
// by hand. English backs an unmatched language, the way YouTube itself does.
function pickCaptionTrackUrl (playerResponse, language) {
	const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
	if (!Array.isArray(tracks) || tracks.length === 0) return null;
	const lang = (language || 'en').toLowerCase().split('-')[0];
	const written = tracks.filter(function (t) { return t && t.baseUrl && t.kind !== 'asr'; });
	const pool = written.length > 0 ? written : tracks.filter(function (t) { return t && t.baseUrl; });
	if (pool.length === 0) return null;
	const codeOf = function (t) { return (t.languageCode || '').toLowerCase(); };
	const track = pool.find(function (t) { return codeOf(t).indexOf(lang) === 0; }) ||
		pool.find(function (t) { return codeOf(t).indexOf('en') === 0; }) ||
		pool[0];
	// The track url pins its own format, which outranks an appended one, so it
	// has to go before vtt is asked for.
	const base = track.baseUrl.replace(/([?&])fmt=[^&]*&?/g, '$1').replace(/[?&]$/, '');
	return base + (base.indexOf('?') === -1 ? '?' : '&') + 'fmt=vtt';
}

export function buildInnertubePayload (videoId, client, visitor = '') {
	const context = {
		clientName: client.name,
		clientVersion: client.version,
		hl: 'en',
		gl: 'US',
		...client.extra
	};
	if (client.platform) context.platform = client.platform;
	if (visitor) context.visitorData = visitor;

	return {
		videoId: videoId,
		context: {client: context},
		contentCheckOk: true,
		racyCheckOk: true
	};
}

// Every answer carries a visitor id, even one that turned the request away for lacking it, so
// asking again is only worth it when the id handed back isnt the one that was sent.
export function freshVisitorData (playerResponse, sentVisitor) {
	if (!playerResponse || playerResponse.playabilityStatus?.status === 'OK') return null;
	const fresh = playerResponse.responseContext?.visitorData;
	return fresh && fresh !== sentVisitor ? fresh : null;
}

// YouTube turned the sent id away and handed the same one back, so asking again with it gets
// nowhere.
export function isStaleVisitor (playerResponse, sentVisitor) {
	return !!sentVisitor &&
		playerResponse?.playabilityStatus?.status === 'LOGIN_REQUIRED' &&
		playerResponse.responseContext?.visitorData === sentVisitor;
}

// The language of the trailer's own soundtrack, when YouTube lists machine dubbed ones beside
// it. The manifest names every one of them and flags none as the default, so a player left to
// choose takes the first, which is usually a dub.
export function originalAudioLanguage (playerResponse) {
	const formats = playerResponse?.streamingData?.adaptiveFormats;
	if (!Array.isArray(formats)) return '';
	for (let i = 0; i < formats.length; i++) {
		const track = formats[i] && formats[i].audioTrack;
		if (track && track.audioIsDefault === true) return (track.id || '').split('.')[0];
	}
	return '';
}

// The original soundtrack as a file of its own, for a player that opens a manifest's picture but
// not its separate sound.
export function soundtrackUrl (playerResponse) {
	const formats = (playerResponse?.streamingData?.adaptiveFormats || []).filter(function (format) {
		return format && format.url && /^audio\/mp4/.test(format.mimeType || '');
	});
	const original = formats.filter(function (format) {
		return !format.audioTrack || format.audioTrack.audioIsDefault === true;
	});
	let best = null;
	(original.length > 0 ? original : formats).forEach(function (format) {
		if (!best || (format.bitrate || 0) > (best.bitrate || 0)) best = format;
	});
	return best ? best.url : '';
}

// Which of a video element's audioTracks is the original soundtrack, found by the "original" in
// its name or failing that its language. YouTube lists every soundtrack once per audio group and
// only 240p and below play from the first, so the last match wins.
export function pickOriginalAudioTrackIndex (tracks, language) {
	if (!language || !tracks || tracks.length < 2) return -1;
	const wanted = language.slice(0, 2).toLowerCase();
	let named = -1;
	let spoken = -1;
	for (let i = 0; i < tracks.length; i++) {
		if ((tracks[i].label || '').toLowerCase().indexOf('original') !== -1) named = i;
		if ((tracks[i].language || '').slice(0, 2).toLowerCase() === wanted) spoken = i;
	}
	return named >= 0 ? named : spoken;
}

export function isManifestUrl (url) {
	return MANIFEST_URL.test(url || '');
}

// Keeps a video element on the original soundtrack. Call it once the src is set, since tracks
// turn up as the manifest loads, and call what it returns before the element plays anything
// else. Engines without the audioTracks API keep whatever they picked.
export function keepOriginalAudioTrack (video, language) {
	const tracks = video && video.audioTracks;
	if (!language || !tracks) return function () {};

	const apply = function () {
		const index = pickOriginalAudioTrackIndex(tracks, language);
		if (index < 0) return;
		for (let i = 0; i < tracks.length; i++) {
			const enabled = i === index;
			if (tracks[i].enabled !== enabled) tracks[i].enabled = enabled;
		}
	};
	apply();
	tracks.onaddtrack = apply;
	return function () {
		if (tracks.onaddtrack === apply) tracks.onaddtrack = null;
	};
}

// A browser cant set the User-Agent, Origin or Referer headers, and a text/plain body keeps the
// request simple enough to skip the CORS preflight YouTube would turn away.
function requestPlayer (videoId, client, visitor) {
	const key = client.apiKey ? `key=${client.apiKey}&` : '';
	return requestJson(
		`${INNERTUBE_URL}?${key}prettyPrint=false`,
		{
			method: 'POST',
			mode: 'cors',
			credentials: 'omit',
			cache: 'no-store',
			headers: {
				'Content-Type': 'text/plain;charset=UTF-8'
			},
			body: JSON.stringify(buildInnertubePayload(videoId, client, visitor))
		},
		REQUEST_TIMEOUT_MS,
		`innertube:${client.name}`
	);
}

// A client that wants a visitor id and has none kept gets turned away with a fresh one, so it
// asks once more with that. A kept id YouTube stops taking is dropped, so the next lookup
// starts over.
async function requestPlayerWithVisitor (videoId, client) {
	const sent = client.needsVisitor ? visitorData : '';
	const data = await requestPlayer(videoId, client, sent);
	if (!client.needsVisitor) return data;

	const fresh = freshVisitorData(data, sent);
	if (!fresh) {
		if (isStaleVisitor(data, sent)) visitorData = '';
		return data;
	}
	visitorData = fresh;
	return requestPlayer(videoId, client, fresh);
}

// A client that only offers a 360p muxed format doesnt end the search in high
// quality mode, which keeps going until one offers 720p or better and keeps the
// best answer so far as the fallback.
async function tryInnertube (videoId, preferHighQuality, captionLanguage, muxedOnly) {
	let best = null;

	for (let i = 0; i < INNERTUBE_CLIENTS.length; i++) {
		const client = INNERTUBE_CLIENTS[i];
		const data = await requestPlayerWithVisitor(videoId, client);

		if (!data) continue;

		debugLog('innertube status', client.name, data.playabilityStatus?.status, data.playabilityStatus?.reason || '');

		const stream = extractInnertubeStream(data, preferHighQuality, muxedOnly);
		if (!stream) continue;

		const captionsUrl = pickCaptionTrackUrl(data, captionLanguage);
		const audioLanguage = originalAudioLanguage(data);
		const soundtrack = isVega() && isManifestUrl(stream.url) ? soundtrackUrl(data) : '';
		debugLog('innertube resolved stream', client.name, stream.quality + 'p');
		if (!preferHighQuality || stream.quality >= HIGH_QUALITY_FLOOR) {
			return {url: stream.url, captionsUrl, audioLanguage, soundtrack, client: client.name};
		}
		if (!best || stream.quality > best.quality) {
			best = {url: stream.url, quality: stream.quality, captionsUrl, audioLanguage, soundtrack, client: client.name};
		}
	}

	if (best) {
		debugLog('innertube settled for', best.quality + 'p');
		return {url: best.url, captionsUrl: best.captionsUrl, audioLanguage: best.audioLanguage, soundtrack: best.soundtrack, client: best.client};
	}

	debugLog('innertube exhausted without stream');
	return null;
}

// A video's length in seconds and its channel name, from the same player call that resolves the
// stream. Null when no client answers with them.
export async function fetchVideoDetails (videoId) {
	for (let i = 0; i < INNERTUBE_CLIENTS.length; i++) {
		const data = await requestPlayerWithVisitor(videoId, INNERTUBE_CLIENTS[i]);
		const details = data && data.videoDetails;
		if (details) return {lengthSeconds: Number(details.lengthSeconds) || 0, author: details.author || ''};
	}
	return null;
}

// A manifest of its own for the best H.264 rung, with the soundtrack and caption groups left out.
// YouTube also lists VP9 rungs, which only go past the H.264 ones above 1080p.
export function videoOnlyManifest (master) {
	const lines = (master || '').split('\n');
	let best = null;
	for (let i = 0; i < lines.length - 1; i++) {
		if (lines[i].indexOf('#EXT-X-STREAM-INF') !== 0 || lines[i].indexOf('avc1') === -1) continue;
		const bandwidth = Number((lines[i].match(/BANDWIDTH=(\d+)/) || [])[1]) || 0;
		if (!best || bandwidth > best.bandwidth) best = {bandwidth, info: lines[i], uri: lines[i + 1].trim()};
	}
	if (!best) return null;
	const info = best.info
		.replace(/,(AUDIO|SUBTITLES|CLOSED-CAPTIONS)="[^"]*"/g, '')
		.replace(/CODECS="([^",]+)[^"]*"/, 'CODECS="$1"');
	return ['#EXTM3U', '#EXT-X-INDEPENDENT-SEGMENTS', info, best.uri].join('\n');
}

// Fire TV's player turns YouTube's manifest away for its separate soundtrack, so the picture is cut
// out of it here, while there is still time to wait on the shell for it. A manifest that cant be
// read or cut goes ahead whole, and the player's refusal falls back to the muxed file.
function withVideoOnly (stream) {
	if (!stream || !stream.soundtrack) return stream;
	return readTrailerManifest(stream.url).then(function (master) {
		const manifest = videoOnlyManifest(master);
		return manifest ? {...stream, videoOnly: {manifest, soundtrack: stream.soundtrack}} : stream;
	});
}

// muxedOnly stands in for a manifest the TV couldnt play, with the 360p file that carries its
// own sound.
export function fetchVideoStream (videoId, preferHighQuality = false, captionLanguage = '', muxedOnly = false) {
	if (!videoId) return Promise.resolve(null);

	return new Promise(function (resolve) {
		let settled = false;
		let timer = null;

		const finish = function (value) {
			if (settled) return;
			settled = true;
			if (timer) clearTimeout(timer);
			resolve(value || null);
		};

		timer = setTimeout(function () { finish(null); }, RESOLVE_TIMEOUT_MS);

		tryInnertube(videoId, !!preferHighQuality, captionLanguage, !!muxedOnly)
			.then(function (stream) { return isVega() ? withVideoOnly(stream) : stream; })
			.then(function (stream) { finish(stream); })
			.catch(function () { finish(null); });
	});
}

// Tizen's video element turns an HLS manifest away whatever canPlayType says, but its runtime
// lets script read googlevideo across origins, so hls.js plays it there. The WebView on Xbox
// never starts one either, and its host fetches googlevideo for script. webOS holds script to
// CORS, which googlevideo only answers for YouTube's own pages, so its native player takes it.
export function needsHlsJs (url) {
	return (isTizen() || isXbox()) && isManifestUrl(url);
}

export function playsManifestNatively (url) {
	return isManifestUrl(url) && !needsHlsJs(url);
}

const nativeManifestSkipKey = () => (isVega() ? VEGA_MANIFEST_SKIP_KEY : NATIVE_MANIFEST_SKIP_KEY);

export function nativeManifestSkipped (now = Date.now()) {
	try {
		return Number(window.localStorage.getItem(nativeManifestSkipKey())) > now;
	} catch (e) {
		return false;
	}
}

export function noteNativeManifest (played, now = Date.now()) {
	try {
		if (played) {
			nativeManifestFailures = 0;
			window.localStorage.removeItem(nativeManifestSkipKey());
			return;
		}
		nativeManifestFailures += 1;
		if (nativeManifestFailures < NATIVE_MANIFEST_FAILURES) return;
		nativeManifestFailures = 0;
		window.localStorage.setItem(nativeManifestSkipKey(), String(now + NATIVE_MANIFEST_SKIP_MS));
		serverLogger.warn(serverLogger.LOG_CATEGORIES.PLAYBACK, "YouTube manifests keep failing on this TV's player, so trailers use the 360p file for a week");
	} catch (e) {
		// Without storage the TV just doesnt remember.
	}
}

// LG's player and hls.js can both stall on a manifest without raising an error, so progress is
// watched instead. onStall hears a stream that never started or stopped moving, and onConfirmed
// hears one that has played long enough to trust. Returns what stops the watch.
export function watchManifestPlayback (video, {onStall, onConfirmed}) {
	const startedAt = Date.now();
	const firstTime = video.currentTime;
	let lastTime = firstTime;
	let stillSince = startedAt;
	let started = false;
	let played = 0;
	let confirmed = false;

	const timer = setInterval(function () {
		const now = Date.now();
		const time = video.currentTime;
		if (!started) {
			if (!video.paused && time !== firstTime) {
				started = true;
				lastTime = time;
				stillSince = now;
			} else if (now - startedAt >= MANIFEST_START_MS) {
				clearInterval(timer);
				onStall('did not start');
			}
			return;
		}
		if (video.paused || time !== lastTime) {
			// A jump past a sponsor segment is a seek rather than play, so only small steps count.
			const step = time - lastTime;
			if (step > 0 && step < 2) played += step;
			lastTime = time;
			stillSince = now;
			if (!confirmed && played >= MANIFEST_CONFIRM_S) {
				confirmed = true;
				if (onConfirmed) onConfirmed();
			}
		} else if (now - stillSince >= MANIFEST_STALL_MS) {
			clearInterval(timer);
			onStall('stalled');
		}
	}, MANIFEST_WATCH_MS);

	return function () {
		clearInterval(timer);
	};
}

// LG's media options ride on a source element's type. They hold its player to 1080p and start it
// at the offset, which spares the seek straight after loading that a manifest can stall on. A
// source the player turns away reports on the source rather than the element.
function attachLgManifest (video, url, startTime, onError) {
	const option = {adaptiveStreaming: {maxWidth: LG_MAX_WIDTH, maxHeight: LG_MAX_HEIGHT}};
	if (startTime > 0) option.transmission = {playTime: {start: Math.round(startTime * 1000)}};
	const source = document.createElement('source');
	source.setAttribute('src', url);
	source.setAttribute('type', 'application/vnd.apple.mpegurl;mediaOption=' + encodeURI(JSON.stringify({mediaTransportType: 'HLS', option: option})));
	if (onError) source.addEventListener('error', onError);
	video.removeAttribute('src');
	video.appendChild(source);
	video.load();
	return function () {
		if (onError) source.removeEventListener('error', onError);
		if (source.parentNode) source.parentNode.removeChild(source);
	};
}

// Plays a soundtrack file in step with the picture on the video element, which carries the volume
// and the play state. The sound waits for the picture to move, since the element reports playing
// a moment before it does.
function followSoundtrack (video, url, onError) {
	const sound = document.createElement('audio');
	sound.preload = 'auto';
	sound.src = url;
	let lastTime = -1;

	const matchVolume = function () {
		sound.muted = video.muted;
		sound.volume = video.volume;
	};
	const seek = function () {
		sound.currentTime = video.currentTime + SOUND_SEEK_LEAD_S;
		sound.playbackRate = 1;
	};
	const stop = function () {
		sound.pause();
	};
	const keepPace = function () {
		const moving = video.currentTime !== lastTime;
		lastTime = video.currentTime;
		if (video.paused || !moving || sound.error) return;
		if (sound.paused) {
			seek();
			const started = sound.play();
			if (started && started.catch) started.catch(function () {});
			return;
		}
		const gap = video.currentTime - sound.currentTime;
		if (Math.abs(gap) > SOUND_SEEK_GAP_S) seek();
		else sound.playbackRate = Math.abs(gap) > SOUND_DRIFT_S ? 1 + Math.max(-SOUND_MAX_RATE_STEP, Math.min(SOUND_MAX_RATE_STEP, gap / 2)) : 1;
	};
	const failed = function () {
		if (onError) onError();
	};

	const events = {timeupdate: keepPace, waiting: stop, pause: stop, seeking: stop, ended: stop, volumechange: matchVolume};
	Object.keys(events).forEach(function (name) {
		video.addEventListener(name, events[name]);
	});
	sound.addEventListener('error', failed);
	matchVolume();

	return function () {
		Object.keys(events).forEach(function (name) {
			video.removeEventListener(name, events[name]);
		});
		sound.removeEventListener('error', failed);
		sound.pause();
		sound.removeAttribute('src');
		sound.load();
	};
}

function attachVideoOnly (video, {manifest, soundtrack}, startTime, onError) {
	const source = window.URL.createObjectURL(new window.Blob([manifest], {type: 'application/vnd.apple.mpegurl'}));
	video.src = source;
	if (startTime > 0) video.currentTime = startTime;
	const releaseSound = followSoundtrack(video, soundtrack, onError);
	return function () {
		releaseSound();
		window.URL.revokeObjectURL(source);
	};
}

// Starts a trailer stream on a video element and returns what lets go of it, which has to run
// before the element plays anything else. Hls is the hls.js class, which the caller loads when
// needsHlsJs says so. onError hears a manifest hls.js gives up on, or a soundtrack that wont load
// beside a picture only manifest, since neither reaches the element's own error event.
export function attachTrailerStream (video, url, {Hls = null, audioLanguage = '', startTime = 0, videoOnly = null, onError} = {}) {
	if (videoOnly) return attachVideoOnly(video, videoOnly, startTime, onError);
	if (!Hls || !Hls.isSupported()) {
		if (isWebOS() && isManifestUrl(url)) {
			const releaseSource = attachLgManifest(video, url, startTime, onError);
			const releaseAudio = keepOriginalAudioTrack(video, audioLanguage);
			return function () {
				releaseAudio();
				releaseSource();
			};
		}
		video.src = url;
		if (startTime > 0) video.currentTime = startTime;
		return keepOriginalAudioTrack(video, audioLanguage);
	}

	const hls = new Hls({
		enableWorker: false,
		startPosition: startTime > 0 ? startTime : -1,
		abrEwmaDefaultEstimate: HLS_START_BANDWIDTH,
		// VP9 stalls in Tizen's MSE, and YouTube always offers H.264 beside it
		videoPreference: {videoCodec: 'avc1'},
		...(audioLanguage ? {audioPreference: {lang: audioLanguage}} : {})
	});
	let released = false;
	hls.on(Hls.Events.ERROR, function (event, data) {
		if (data.fatal && !released && onError) onError();
	});
	hls.loadSource(url);
	hls.attachMedia(video);
	return function () {
		released = true;
		hls.destroy();
	};
}

// The first video in a search answer, in the order YouTube ranked them.
export function firstSearchVideoId (node) {
	if (!node || typeof node !== 'object') return null;
	if (node.videoRenderer && typeof node.videoRenderer.videoId === 'string') return node.videoRenderer.videoId;
	const children = Array.isArray(node) ? node : Object.keys(node).map(function (key) { return node[key]; });
	for (let i = 0; i < children.length; i++) {
		const id = firstSearchVideoId(children[i]);
		if (id) return id;
	}
	return null;
}

const SEARCH_URL = 'https://www.youtube.com/youtubei/v1/search?prettyPrint=false';
const searches = {};

// A server that keeps no trailer links of its own gets the top YouTube search hit for the title's trailer, asked as the
// web client, whose top hit is usually the studio's own upload. A search is kept per title, but a failed one isn't.
export function searchedTrailers (item) {
	if (!item || !item.Name) return Promise.resolve([]);
	const query = [item.Name, item.ProductionYear, 'trailer'].filter(Boolean).join(' ');
	if (!searches[query]) {
		searches[query] = requestJson(SEARCH_URL, {
			method: 'POST',
			mode: 'cors',
			credentials: 'omit',
			cache: 'no-store',
			headers: {'Content-Type': 'text/plain;charset=UTF-8'},
			body: JSON.stringify({
				context: {client: {clientName: 'WEB', clientVersion: '2.20260101.00.00', hl: 'en', gl: 'US'}},
				query: query,
				// Videos only, leaving out channels and playlists.
				params: 'EgIQAQ%3D%3D'
			})
		}, REQUEST_TIMEOUT_MS, 'innertube:search').then(function (data) {
			const id = firstSearchVideoId(data);
			if (!id) delete searches[query];
			return id ? [{Url: 'https://www.youtube.com/watch?v=' + id}] : [];
		});
	}
	return searches[query];
}

// Plex items never carry trailer links. An item from the signed in server names no server type of its own.
export function searchesForTrailer (item, activeServerType) {
	return ((item && item._serverType) || activeServerType) === 'plex';
}

export function extractYouTubeId (item) {
	let trailers = item && item.RemoteTrailers;
	if (!trailers || trailers.length === 0) return null;
	for (let i = 0; i < trailers.length; i++) {
		let url = trailers[i].Url || trailers[i].url || '';
		let videoId = extractYouTubeIdFromUrl(url);
		if (videoId) return videoId;
	}
	return null;
}

export function extractYouTubeIdFromUrl (url) {
	if (!url) return null;

	try {
		const parsed = new URL(url);
		const host = parsed.hostname.toLowerCase();

		if (host.indexOf('youtu.be') !== -1) {
			const first = parsed.pathname.split('/').filter(Boolean)[0];
			if (first && first.length === 11) return first;
		}

		if (host.indexOf('youtube.com') !== -1 || host.indexOf('youtube-nocookie.com') !== -1) {
			const v = parsed.searchParams.get('v');
			if (v && v.length === 11) return v;

			const parts = parsed.pathname.split('/').filter(Boolean);
			for (let i = 0; i < parts.length - 1; i++) {
				if (parts[i] === 'embed' || parts[i] === 'shorts' || parts[i] === 'v') {
					const candidate = parts[i + 1];
					if (candidate && candidate.length === 11) return candidate;
				}
			}
		}
	} catch (e) {
		// Fall through to regex fallback.
	}

	let match = url.match(YT_ID_REGEX);
	return match ? match[1] : null;
}

export function fetchSponsorSegments (videoId) {
	return new Promise(function (resolve) {
		let url = 'https://sponsor.ajay.app/api/skipSegments?videoID=' + videoId +
			'&categories=["sponsor","selfpromo","intro","outro","interaction","music_offtopic"]';
		fetch(url)
			.then(function (resp) {
				if (!resp.ok) { resolve([]); return; }
				return resp.json();
			})
			.then(function (data) {
				if (!Array.isArray(data)) { resolve([]); return; }
				let segments = [];
				for (let i = 0; i < data.length; i++) {
					if (data[i].segment && data[i].segment.length === 2) {
						segments.push({start: data[i].segment[0], end: data[i].segment[1]});
					}
				}
				resolve(segments);
			})
			.catch(function () { resolve([]); });
	});
}

export function getTrailerStartTime (segments) {
	let startTime = 0;
	if (!segments || segments.length === 0) return startTime;
	let sorted = segments.slice().sort(function (a, b) { return a.start - b.start; });
	for (let i = 0; i < sorted.length; i++) {
		if (sorted[i].start <= startTime + 1) {
			startTime = Math.max(startTime, sorted[i].end);
		}
	}
	return Math.max(startTime, 5);
}
