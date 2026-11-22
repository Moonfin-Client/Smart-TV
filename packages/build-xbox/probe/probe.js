// Reports what the WebView the Xbox host shows can do.
//
// The checks start on their own and every finding goes on screen. The first button
// then plays every test clip in turn and sends the whole report off, so a tester has
// one button to press. Two more tests need someone to watch and listen, and ask
// what they saw and heard. Server addresses and media files come from
// probe-config.js, which the build writes.
//
// Opened from the app's settings, the page is also told the way back and where on
// the signed in server the report may go, see packages/app/src/utils/deviceProbe.js.
(function () {
	'use strict';

	const config = window.PROBE_CONFIG || {jellyfin: '', emby: '', image: '', report: '', media: []};
	// Where the files the app shares with the probe sit, when the probe isnt at the root.
	const assets = config.assets || '';

	// What the app left behind when it opened the probe, if it did.
	const handoff = (() => {
		try {
			return JSON.parse(sessionStorage.getItem('moonfin_probe_handoff')) || null;
		} catch (e) {
			return null;
		}
	})();

	const sectionsEl = document.getElementById('sections');
	const actionsEl = document.getElementById('actions');
	const questionEl = document.getElementById('question');
	const resultsEl = document.getElementById('results');
	const statusEl = document.getElementById('status');
	const keysEl = document.getElementById('keys');
	const eventsEl = document.getElementById('events');
	const results = [];
	const keyLog = [];
	const eventLog = [];
	const pendingChecks = [];

	const PAGE_EVENT = 'moonfin:xbox';
	const shell = () => (window.chrome && window.chrome.webview) || null;
	const boot = window.__MOONFIN_XBOX__ || null;
	const platform = boot || shell() ? 'Xbox' : 'browser';

	document.getElementById('title').textContent = `Moonfin ${platform} probe`;
	document.title = `Moonfin ${platform} probe`;

	const section = (title) => {
		const heading = document.createElement('h2');
		heading.textContent = title;
		sectionsEl.appendChild(heading);
		const body = document.createElement('div');
		sectionsEl.appendChild(body);
		return body;
	};

	// Each check gets a row that can be updated as its promise settles.
	const report = (body, name, value, state) => {
		let row = body.querySelector(`[data-name="${CSS.escape(name)}"]`);
		if (!row) {
			row = document.createElement('div');
			row.className = 'row';
			row.dataset.name = name;
			row.innerHTML = '<span class="name"></span><span class="value"></span>';
			row.querySelector('.name').textContent = name;
			body.appendChild(row);
		}
		const valueEl = row.querySelector('.value');
		valueEl.textContent = String(value);
		valueEl.className = `value ${state || ''}`;
		const prefix = `${body.previousSibling.textContent} | ${name} |`;
		const index = results.findIndex((line) => line.startsWith(prefix));
		if (index === -1) results.push(`${prefix} ${value}`);
		else results[index] = `${prefix} ${value}`;
	};

	const check = (body, name, task) => {
		report(body, name, 'waiting', 'wait');
		pendingChecks.push(Promise.resolve()
			.then(task)
			.then((value) => report(body, name, value, 'ok'), (err) => report(body, name, `FAIL ${err && err.message ? err.message : err}`, 'fail')));
	};

	const withTimeout = (promise, ms, what) => Promise.race([
		promise,
		new Promise((resolve, reject) => setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms))
	]);

	const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

	const toShell = (type, payload, id) => {
		if (!shell()) return false;
		shell().postMessage(JSON.stringify({v: 1, type, id, payload}));
		return true;
	};

	// A message the host answers, told apart from the others by its id.
	let lastRequestId = 0;
	const askShell = (type, payload, ms) => withTimeout(new Promise((resolve, reject) => {
		const id = ++lastRequestId;
		const listener = (e) => {
			const message = e.detail;
			if (!message || message.type !== 'REPLY' || message.id !== id) return;
			window.removeEventListener(PAGE_EVENT, listener);
			if (message.error) reject(new Error(message.error));
			else resolve(message.payload);
		};
		window.addEventListener(PAGE_EVENT, listener);
		if (!toShell(type, payload, id)) reject(new Error('no shell'));
	}), ms, type);

	const logEvent = (text) => {
		const stamped = `${new Date().toISOString().slice(11, 23)} ${text}`;
		eventLog.push(stamped);
		const line = document.createElement('div');
		line.textContent = stamped;
		eventsEl.prepend(line);
	};

	const button = (label, onClick) => {
		const el = document.createElement('button');
		el.textContent = label;
		el.addEventListener('click', onClick);
		actionsEl.appendChild(el);
	};

	const setStatus = (text, done) => {
		statusEl.textContent = text;
		statusEl.className = done ? 'done' : '';
	};

	// Whether script may read the pixels of an image, which a cross origin one only
	// allows when its server says so.
	const canvasReads = (src, crossOrigin) => new Promise((resolve, reject) => {
		const img = new Image();
		if (crossOrigin) img.crossOrigin = 'anonymous';
		img.onload = () => {
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 2;
			const ctx = canvas.getContext('2d');
			ctx.drawImage(img, 0, 0);
			try { ctx.getImageData(0, 0, 1, 1); resolve('ok'); } catch (e) { reject(e); }
		};
		img.onerror = () => reject(new Error('image failed to load'));
		img.src = src;
	});

	// Dolby Vision clips are put in probe/media by hand, see make-clips.js, or named with
	// --media, and the number in the name is the profile.
	const DOLBY_VISION_CLIP = /^dv-p(\d)\./;
	const dolbyVisionClips = config.media
		.filter((clip) => DOLBY_VISION_CLIP.test(clip.label))
		.map((clip) => ({...clip, profile: Number(clip.label.match(DOLBY_VISION_CLIP)[1])}));

	const dolbyVision = section('Dolby Vision');
	const bootDisplay = (boot && boot.display) || null;
	const effect = boot && boot.dolbyVision ? boot.dolbyVision.effect || [] : null;
	report(dolbyVision, 'effect profiles', effect ? effect.join(', ') || 'none, the console has no Dolby Vision effect' : 'not reported by the host', effect && effect.length ? 'ok' : 'fail');
	if (bootDisplay) {
		const hasMode = (bootDisplay.hdr || []).includes('dolbyvision');
		const modes = (bootDisplay.modes || []).filter((mode) => mode.dolbyVision).map((mode) => `${mode.width}x${mode.height} at ${mode.refreshRate} Hz ${mode.bitsPerPixel} bits`);
		report(dolbyVision, 'display hdr has dolbyvision', `${hasMode} (hdr ${(bootDisplay.hdr || []).join(', ') || 'none'})`, hasMode ? 'ok' : 'fail');
		report(dolbyVision, 'modes flagged dolbyVision', modes.join(', ') || 'none', modes.length ? 'ok' : 'fail');
	} else {
		report(dolbyVision, 'display', 'no HDMI display reported', 'fail');
	}
	report(dolbyVision, 'clips in this build', dolbyVisionClips.map((clip) => clip.label).join(', ') || 'none, see probe/make-clips.js');

	const env = section('Environment');
	report(env, 'platform', platform);
	report(env, 'opened from', handoff ? `Moonfin ${handoff.app}` : 'its own package');
	report(env, 'origin', window.origin);
	report(env, 'secure context', window.isSecureContext);
	report(env, 'userAgent', navigator.userAgent);
	report(env, 'Chrome token', (navigator.userAgent.match(/Chrome\/\d+/) || ['none'])[0], /Chrome\/\d+/.test(navigator.userAgent) ? 'ok' : 'fail');
	report(env, 'screen', `${screen.width}x${screen.height} inner ${innerWidth}x${innerHeight} dpr ${devicePixelRatio}`);
	report(env, 'hardwareConcurrency / deviceMemory', `${navigator.hardwareConcurrency} / ${navigator.deviceMemory}`);
	report(env, 'dynamic-range: high', matchMedia('(dynamic-range: high)').matches);
	report(env, 'color-gamut p3 / rec2020', `${matchMedia('(color-gamut: p3)').matches} / ${matchMedia('(color-gamut: rec2020)').matches}`);
	report(env, 'boot data from shell', boot ? JSON.stringify(boot) : 'missing', boot ? 'ok' : 'fail');
	check(env, 'shell answers a request (memory)', () => askShell('MEMORY', undefined, 5000).then((memory) => `${Math.round(memory.usage / 1048576)} MB of ${Math.round(memory.limit / 1048576)} MB, level ${memory.level}`));
	report(env, 'getGamepads / mediaSession / wakeLock', `${typeof navigator.getGamepads} / ${typeof navigator.mediaSession} / ${typeof navigator.wakeLock}`);
	report(env, 'sendBeacon / RTCPeerConnection / WebSocket', `${typeof navigator.sendBeacon} / ${typeof RTCPeerConnection} / ${typeof WebSocket}`);
	report(env, 'SharedArrayBuffer / crossOriginIsolated', `${typeof SharedArrayBuffer} / ${window.crossOriginIsolated}`);
	report(env, 'crypto.subtle / serviceWorker / clipboard', `${typeof (window.crypto && window.crypto.subtle)} / ${typeof navigator.serviceWorker} / ${typeof navigator.clipboard}`);

	const storage = section('Storage');
	try {
		const launches = Number(localStorage.getItem('probe_launches') || 0) + 1;
		const firstSeen = localStorage.getItem('probe_first_seen') || new Date().toISOString();
		localStorage.setItem('probe_launches', String(launches));
		localStorage.setItem('probe_first_seen', firstSeen);
		report(storage, 'localStorage', `launch ${launches}, first seen ${firstSeen}`, 'ok');
	} catch (e) {
		report(storage, 'localStorage', `FAIL ${e.name}`, 'fail');
	}
	try {
		sessionStorage.setItem('probe', '1');
		report(storage, 'sessionStorage', 'ok', 'ok');
	} catch (e) {
		report(storage, 'sessionStorage', `FAIL ${e.name}`, 'fail');
	}
	check(storage, 'IndexedDB', () => new Promise((resolve, reject) => {
		const request = indexedDB.open('probe', 1);
		request.onupgradeneeded = () => request.result.createObjectStore('kv');
		request.onsuccess = () => { request.result.close(); resolve('opens'); };
		request.onerror = () => reject(request.error);
	}));

	const local = section(`Loads from the package (${location.protocol}//)`);
	report(local, 'classic <script> sibling', window.PROBE_SCRIPT_LOADED ? 'ok' : 'FAIL', window.PROBE_SCRIPT_LOADED ? 'ok' : 'fail');
	check(local, 'fetch sibling json', () => fetch('probe-data.json').then((r) => r.text()).then((t) => `ok ${t.trim()}`));
	check(local, 'sync XHR sibling json', () => {
		const xhr = new XMLHttpRequest();
		xhr.open('GET', 'probe-data.json', false);
		xhr.send();
		return `status ${xhr.status} ${xhr.responseText.trim()}`;
	});
	// The locale loader asks for files that were never packaged and expects a 404. Where
	// the request throws instead, the app has to answer the 404 itself.
	check(local, 'sync XHR for a missing file', () => {
		const xhr = new XMLHttpRequest();
		xhr.open('GET', 'no-such-file.json', false);
		try {
			xhr.send();
		} catch (e) {
			return `throws ${e.name}, so the app must answer it`;
		}
		return `status ${xhr.status}`;
	});
	check(local, 'Worker from sibling file', () => withTimeout(new Promise((resolve, reject) => {
		const worker = new Worker('probe-worker.js');
		worker.onmessage = (e) => resolve(e.data);
		worker.onerror = (e) => reject(new Error(e.message || 'error event'));
	}), 5000, 'worker'));
	check(local, 'Worker from blob URL', () => withTimeout(new Promise((resolve, reject) => {
		const worker = new Worker(URL.createObjectURL(new Blob(['postMessage("blob worker ok")'])));
		worker.onmessage = (e) => resolve(e.data);
		worker.onerror = (e) => reject(new Error(e.message || 'error event'));
	}), 5000, 'worker'));
	check(local, 'dynamic import() sibling module', () => import('./probe-module.js').then((m) => m.loaded));
	check(local, 'WebAssembly.instantiate from bytes', () => WebAssembly.instantiate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])).then(() => 'ok'));
	check(local, 'canvas read of a package image', () => canvasReads('probe.png', false));

	const workers = section('Subtitle workers');
	check(workers, 'libass worker reaches ready', () => withTimeout(new Promise((resolve, reject) => {
		const started = Date.now();
		const worker = new Worker(`${assets}subtitles-octopus-worker.js`);
		worker.addEventListener('message', (e) => {
			if (e.data && e.data.target === 'ready') resolve(`ready after ${Date.now() - started} ms`);
			if (e.data && e.data.target === 'stderr') logEvent(`libass stderr: ${e.data.content}`);
		});
		worker.addEventListener('error', (e) => reject(new Error(e.message || 'error event')));
		worker.postMessage({
			target: 'worker-init',
			width: 1920,
			height: 1080,
			URL: document.URL,
			currentScript: `${assets}subtitles-octopus-worker.js`,
			preMain: true,
			renderMode: 'wasm-blend',
			subContent: '[Script Info]\nScriptType: v4.00+\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,Probe\n',
			fonts: [],
			availableFonts: {},
			fallbackFont: new URL(`${assets}ass-fallback-font.ttf`, document.URL).href,
			lazyFileLoading: false,
			debug: false,
			targetFps: 24,
			libassMemoryLimit: 0,
			libassGlyphLimit: 0,
			dropAllAnimations: false
		});
	}), 30000, 'libass worker'));
	check(workers, 'libpgs worker starts', () => new Promise((resolve, reject) => {
		const worker = new Worker(`${assets}libpgs.worker.js`);
		worker.addEventListener('error', (e) => reject(new Error(e.message || 'error event')));
		setTimeout(() => resolve('no error after 3 s'), 3000);
	}));

	const network = section('Servers');
	const servers = [
		config.jellyfin && {name: 'Jellyfin', base: config.jellyfin.replace(/\/+$/, ''), prefix: ''},
		config.emby && {name: 'Emby', base: config.emby.replace(/\/+$/, ''), prefix: '/emby'}
	].filter(Boolean);
	if (!servers.length) report(network, 'servers', 'none configured, build the probe with --server and --emby');
	servers.forEach(({name, base, prefix}) => {
		const info = `${base}${prefix}/System/Info/Public`;
		check(network, `${name} public info`, () => fetch(info).then((r) => r.json()).then((j) => `${j.ServerName} ${j.Version}`));
		check(network, `${name} preflight with Authorization`, () => fetch(info, {
			headers: {Authorization: `MediaBrowser Client="Moonfin Probe", Device="${platform}", DeviceId="probe", Version="0"`, 'Content-Type': 'application/json'}
		}).then((r) => `status ${r.status}`));
		// Without a token the server turns the socket away, which still shows the
		// upgrade got through.
		check(network, `${name} WebSocket upgrade`, () => withTimeout(new Promise((resolve, reject) => {
			const socket = new WebSocket(`${base.replace(/^http/, 'ws')}${prefix}/socket?api_key=probe&deviceId=probe`);
			socket.onopen = () => { socket.close(); resolve('opened'); };
			socket.onerror = () => resolve('refused without a token');
			socket.onclose = (e) => reject(new Error(`closed ${e.code}`));
		}), 8000, 'websocket'));
		check(network, `${name} sendBeacon`, () => (navigator.sendBeacon(`${base}${prefix}/Sessions/Playing/Stopped`, new Blob(['{}'], {type: 'application/json'})) ? 'queued' : 'refused'));
	});
	if (config.image) check(network, 'canvas read of a server image', () => canvasReads(config.image, true));
	else report(network, 'canvas read of a server image', 'no image configured, build the probe with --image url');
	check(network, 'TMDB image readable', () => fetch('https://image.tmdb.org/t/p/w92/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg', {mode: 'cors'}).then((r) => `status ${r.status}`));
	// Any answer at all means the page could read the reply, which the trailer lookup needs.
	check(network, 'YouTube Innertube POST', () => fetch('https://www.youtube.com/youtubei/v1/player', {
		method: 'POST',
		mode: 'cors',
		credentials: 'omit',
		headers: {'Content-Type': 'text/plain'},
		body: JSON.stringify({context: {client: {clientName: 'ANDROID', clientVersion: '19.09.37'}}, videoId: 'dQw4w9WgXcQ'})
	}).then((r) => `status ${r.status}`));

	const media = section('Media support (what the WebView claims)');
	const video = document.createElement('video');
	const types = [
		['HLS', 'application/vnd.apple.mpegurl'],
		['MKV', 'video/x-matroska'],
		['MP4 H.264 L4.1', 'video/mp4; codecs="avc1.640029"'],
		['MP4 H.264 L5.1', 'video/mp4; codecs="avc1.640033"'],
		['MP4 HEVC Main', 'video/mp4; codecs="hvc1.1.6.L153.B0"'],
		['MP4 HEVC Main10', 'video/mp4; codecs="hvc1.2.4.L153.B0"'],
		['MP4 Dolby Vision P5', 'video/mp4; codecs="dvh1.05.06"'],
		['MP4 VP9 P0', 'video/mp4; codecs="vp09.00.40.08"'],
		['MP4 VP9 P2 10bit', 'video/mp4; codecs="vp09.02.10.10"'],
		['MP4 AV1', 'video/mp4; codecs="av01.0.08M.08"'],
		['MP4 AV1 10bit', 'video/mp4; codecs="av01.0.08M.10"'],
		['TS H.264', 'video/mp2t; codecs="avc1.640029"'],
		['WebM VP9', 'video/webm; codecs="vp9"'],
		['WebM AV1', 'video/webm; codecs="av01.0.08M.08"'],
		['AAC', 'audio/mp4; codecs="mp4a.40.2"'],
		['MP3', 'audio/mpeg'],
		['AC3', 'audio/mp4; codecs="ac-3"'],
		['EAC3', 'audio/mp4; codecs="ec-3"'],
		['DTS', 'audio/mp4; codecs="dtsc"'],
		['FLAC', 'audio/mp4; codecs="flac"'],
		['Opus', 'audio/mp4; codecs="opus"'],
		['Opus in WebM', 'audio/webm; codecs="opus"'],
		['Vorbis in WebM', 'audio/webm; codecs="vorbis"'],
		['MKV HEVC+AC3', 'video/x-matroska; codecs="hvc1.2.4.L153.B0,ac-3"']
	];
	types.forEach(([label, type]) => {
		const play = video.canPlayType(type) || 'no';
		const mse = window.MediaSource ? String(MediaSource.isTypeSupported(type)) : 'no MSE';
		report(media, label, `canPlayType ${play}, MSE ${mse}`, play !== 'no' || mse === 'true' ? 'ok' : 'fail');
	});
	[['Widevine', 'com.widevine.alpha'], ['PlayReady', 'com.microsoft.playready.recommendation']].forEach(([label, keySystem]) => {
		check(media, `EME ${label}`, () => navigator.requestMediaKeySystemAccess(keySystem, [{initDataTypes: ['cenc'], videoCapabilities: [{contentType: 'video/mp4; codecs="avc1.42E01E"'}]}]).then(() => 'ok'));
	});

	// Whether a size and frame rate decodes at all, without dropping frames, and in
	// hardware, which canPlayType has no way to say.
	const decoding = section('Decoding (MediaCapabilities, as a file)');
	const HDR10_HINT = {hdrMetadataType: 'smpteSt2086', colorGamut: 'rec2020', transferFunction: 'pq'};
	const decodeCodecs = [
		['H.264', 'video/mp4; codecs="avc1.640033"', {}],
		['HEVC Main', 'video/mp4; codecs="hvc1.1.6.L153.B0"', {}],
		['HEVC Main10', 'video/mp4; codecs="hvc1.2.4.L153.B0"', {}],
		['HEVC Main10 HDR10', 'video/mp4; codecs="hvc1.2.4.L153.B0"', HDR10_HINT],
		['VP9', 'video/webm; codecs="vp09.00.40.08"', {}],
		['VP9 P2 HDR10', 'video/webm; codecs="vp09.02.51.10"', HDR10_HINT],
		['AV1', 'video/mp4; codecs="av01.0.12M.08"', {}],
		['AV1 10bit HDR10', 'video/mp4; codecs="av01.0.12M.10"', HDR10_HINT]
	];
	const decodeSizes = [['1080p30', 1920, 1080, 30, 10000000], ['1080p60', 1920, 1080, 60, 20000000], ['2160p30', 3840, 2160, 30, 30000000], ['2160p60', 3840, 2160, 60, 50000000]];
	if (!navigator.mediaCapabilities || !navigator.mediaCapabilities.decodingInfo) {
		report(decoding, 'MediaCapabilities', 'no API', 'fail');
	} else {
		decodeCodecs.forEach(([label, contentType, extra]) => {
			check(decoding, label, () => Promise.all(decodeSizes.map(([size, width, height, framerate, bitrate]) => navigator.mediaCapabilities
				.decodingInfo({type: 'file', video: {contentType, width, height, framerate, bitrate, ...extra}})
				.then((info) => `${size} ${info.supported ? `yes${info.smooth ? ' smooth' : ' NOT smooth'}${info.powerEfficient ? ' hw' : ' sw'}` : 'no'}`, (e) => `${size} threw ${e.name}`)
			)).then((answers) => answers.join(', ')));
		});
		const audioCodecs = [['AAC', 'audio/mp4; codecs="mp4a.40.2"', 2], ['AAC 5.1', 'audio/mp4; codecs="mp4a.40.2"', 6], ['AC3 5.1', 'audio/mp4; codecs="ac-3"', 6], ['EAC3 5.1', 'audio/mp4; codecs="ec-3"', 6], ['DTS 5.1', 'audio/mp4; codecs="dtsc"', 6], ['FLAC', 'audio/flac', 2], ['Opus', 'audio/webm; codecs="opus"', 2]];
		check(decoding, 'audio', () => Promise.all(audioCodecs.map(([label, contentType, channels]) => navigator.mediaCapabilities
			.decodingInfo({type: 'file', audio: {contentType, channels: String(channels), bitrate: 192000, samplerate: 48000}})
			.then((info) => `${label} ${info.supported ? 'yes' : 'no'}`, (e) => `${label} threw ${e.name}`)
		)).then((answers) => answers.join(', ')));
	}

	const playback = section('Playback (what really plays)');
	playback.appendChild(video);
	const quality = () => (video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : {});
	const decoded = () => `${video.videoWidth}x${video.videoHeight} t=${video.currentTime.toFixed(1)} dropped ${quality().droppedVideoFrames}/${quality().totalVideoFrames} audioBytes ${video.webkitAudioDecodedByteCount || 0}`;
	['loadedmetadata', 'playing', 'waiting', 'stalled', 'ended'].forEach((name) => {
		video.addEventListener(name, () => logEvent(`video ${name} ${decoded()} ready=${video.readyState} net=${video.networkState}`));
	});
	const mediaError = () => `error code ${video.error && video.error.code} ${video.error && video.error.message}`;
	video.addEventListener('error', () => logEvent(`video ${mediaError()}`));

	const CLIP_PLAY_MS = 4000;
	const CLIP_START_MS = 15000;
	const CLIP_END_MS = 40000;

	const stopVideo = () => {
		video.pause();
		video.removeAttribute('src');
		video.load();
	};

	// Starts a clip and resolves with how it ended: 'error', 'timeout', 'ended', or
	// 'judged' once it has played for judgeAfter ms. onTime hears the position as it
	// moves. The element is left as it stood, for the caller to read and then stop.
	const play = (url, {judgeAfter = 0, giveUpAfter, onTime} = {}) => new Promise((resolve) => {
		let playTimer = null;
		let settled = false;
		const settle = (how, detail) => {
			if (settled) return;
			settled = true;
			clearTimeout(guard);
			clearTimeout(playTimer);
			video.removeEventListener('error', onError);
			video.removeEventListener('ended', onEnded);
			video.removeEventListener('playing', onPlaying);
			video.removeEventListener('timeupdate', onTimeUpdate);
			resolve({how, detail});
		};
		const onError = () => settle('error', mediaError());
		const onEnded = () => settle('ended');
		const onPlaying = () => {
			if (judgeAfter && !playTimer) playTimer = setTimeout(() => settle('judged'), judgeAfter);
		};
		const onTimeUpdate = () => { if (onTime) onTime(video.currentTime); };
		const guard = setTimeout(() => settle('timeout'), giveUpAfter);
		video.addEventListener('error', onError);
		video.addEventListener('ended', onEnded);
		video.addEventListener('playing', onPlaying);
		video.addEventListener('timeupdate', onTimeUpdate);
		video.muted = false;
		video.src = url;
		video.play().catch((e) => settle('error', `play() ${e.name} ${e.message}`));
	});

	// Plays one clip for a few seconds and says what came out of it. A clip passes when
	// time moved on and something was decoded. One whose picture or sound was left out
	// is called out, since the element plays on without it and says nothing.
	const playClip = async ({label, url, video: hasVideo}) => {
		report(playback, label, 'playing', 'wait');
		const {how, detail} = await play(url, {judgeAfter: CLIP_PLAY_MS, giveUpAfter: CLIP_START_MS + CLIP_PLAY_MS});
		const problems = [];
		if (how === 'error') problems.push(detail);
		else if (how === 'timeout' && video.currentTime === 0) problems.push('never started playing');
		else {
			const {totalVideoFrames = 0, droppedVideoFrames = 0} = quality();
			if (video.currentTime < 2) problems.push(`time only reached ${video.currentTime.toFixed(1)} s`);
			if (hasVideo !== false && !(video.videoWidth > 0 && totalVideoFrames > 0)) problems.push('no picture decoded');
			if (!video.webkitAudioDecodedByteCount) problems.push('no sound decoded');
			if (totalVideoFrames && droppedVideoFrames / totalVideoFrames > 0.1) problems.push('more than a tenth of the frames dropped');
		}
		report(playback, label, problems.length ? `FAIL ${problems.join(', ')} (${decoded()})` : `plays ${decoded()}`, problems.length ? 'fail' : 'ok');
		stopVideo();
		return !problems.length;
	};

	// Plays a clip to its end for someone to watch or listen to, and says how it went.
	const playThrough = async (clip, onTime) => {
		const {how, detail} = await play(clip.url, {giveUpAfter: CLIP_END_MS, onTime});
		const outcome = how === 'ended' ? 'played to the end' : how === 'error' ? `FAIL ${detail}` : 'FAIL did not finish';
		const said = `${outcome} (${decoded()})`;
		stopVideo();
		return said;
	};

	// The clips a person has to judge belong to the tests further down.
	const unattended = config.media.filter((clip) => !clip.interactive && !DOLBY_VISION_CLIP.test(clip.label));
	const clipNamed = (name) => config.media.find((clip) => clip.label === name) || null;

	const playAll = async () => {
		setStatus('Waiting for the checks that started on their own...');
		await Promise.all(pendingChecks);
		if (!unattended.length) {
			report(playback, 'media', 'none in this build, see probe/make-clips.js or build with --media label=url');
			return;
		}
		let passed = 0;
		for (let i = 0; i < unattended.length; i++) {
			setStatus(`Playing test clip ${i + 1} of ${unattended.length}: ${unattended[i].label}`);
			if (await playClip(unattended[i])) passed += 1;
			await wait(500);
		}
		report(playback, 'summary', `${passed} of ${unattended.length} played`, passed === unattended.length ? 'ok' : 'fail');
		if (boot && boot.nativePlayer) await playAllNative();
	};

	// The same clips through the console's own player, which the app plays video with
	// on a host that has one. The host decodes, so what is judged is what it reports:
	// a stream that opened, played on for a few seconds and showed a picture.
	const nativePlayer = boot && boot.nativePlayer ? section('Console player (what the host plays)') : null;
	let nativeSession = 0;

	// Plays a clip in the console player for playFor ms, or to its end without it, and
	// resolves with what it did and the player's state while it played. open is added to
	// what PLAYER_OPEN is sent, and rect is where the picture goes, the video box by default.
	const playNative = async (clip, {hls = false, reader, open, rect, playFor, onTime} = {}) => {
		const session = ++nativeSession;
		const seen = {playing: false, ended: false, error: null, display: null};
		const listener = (e) => {
			const message = e.detail;
			if (!message || message.type !== 'PLAYER_EVENT' || !message.payload || message.payload.session !== session) return;
			const {event, position} = message.payload;
			if (event === 'playing') seen.playing = true;
			if (event === 'ended') seen.ended = true;
			if (event === 'error') seen.error = message.payload.message;
			if (event === 'display') seen.display = message.payload;
			if (event === 'timeupdate' && onTime) onTime(position);
		};
		window.addEventListener(PAGE_EVENT, listener);
		let state = null;
		try {
			await askShell('PLAYER_OPEN', {session, url: new URL(clip.url, location.href).href, hls, reader, startSeconds: 0, autoplay: true, volume: 1, muted: false, ...open}, CLIP_START_MS);
			const {left, top, width, height} = rect || video.getBoundingClientRect();
			toShell('PLAYER_SET_RECT', {session, x: left, y: top, width, height});
			const started = Date.now();
			while (!seen.playing && !seen.error && Date.now() - started < CLIP_START_MS) await wait(250);
			if (seen.playing) await wait(playFor || 1500);
			state = await askShell('PLAYER_GET_STATE', {session}, 5000);
			if (seen.playing && !playFor) {
				while (!seen.ended && !seen.error && Date.now() - started < CLIP_END_MS) await wait(250);
			}
		} catch (e) {
			seen.error = seen.error || e.message;
		}
		window.removeEventListener(PAGE_EVENT, listener);
		await askShell('PLAYER_CLOSE', {session}, 5000).catch(() => {});
		return {seen, state};
	};

	const playClipNative = async ({label, url, video: hasVideo}) => {
		report(nativePlayer, label, 'playing', 'wait');
		const {seen, state} = await playNative({url}, {playFor: CLIP_PLAY_MS});
		const problems = [];
		if (seen.error) problems.push(seen.error);
		else if (!seen.playing) problems.push('never started playing');
		else {
			if (state.position < 2) problems.push(`time only reached ${state.position.toFixed(1)} s`);
			if (hasVideo !== false && !(state.width > 0)) problems.push('no picture decoded');
		}
		const decoders = state ? [state.videoDecoder, state.audioDecoder, state.audioFormat].filter(Boolean).join(', ') : '';
		const where = state ? `${state.width}x${state.height} t=${(state.position || 0).toFixed(1)}` : '';
		report(nativePlayer, label, problems.length ? `FAIL ${problems.join(', ')} (${where})` : `plays ${where} ${decoders}`, problems.length ? 'fail' : 'ok');
		return !problems.length;
	};

	const playAllNative = async () => {
		let passed = 0;
		for (let i = 0; i < unattended.length; i++) {
			setStatus(`Playing test clip ${i + 1} of ${unattended.length} in the console player: ${unattended[i].label}`);
			if (await playClipNative(unattended[i])) passed += 1;
			await wait(500);
		}
		report(nativePlayer, 'summary', `${passed} of ${unattended.length} played`, passed === unattended.length ? 'ok' : 'fail');
	};

	const device = section('Device');
	check(device, 'WebRTC host candidates', () => new Promise((resolve) => {
		const peer = new RTCPeerConnection({iceServers: []});
		const found = [];
		const done = () => { peer.close(); resolve(found.join(', ') || 'none'); };
		peer.createDataChannel('probe');
		peer.onicecandidate = (e) => {
			if (e.candidate) found.push(e.candidate.candidate.split(' ')[4]);
			else done();
		};
		peer.createOffer().then((offer) => peer.setLocalDescription(offer));
		setTimeout(done, 8000);
	}));
	check(device, 'wakeLock.request(screen)', () => (navigator.wakeLock ? navigator.wakeLock.request('screen').then((lock) => `granted, released=${lock.released}`) : 'no API'));
	setInterval(() => {
		if (!navigator.getGamepads) return;
		const pads = Array.from(navigator.getGamepads()).filter(Boolean);
		const pressed = pads.flatMap((pad) => pad.buttons.map((b, i) => (b.pressed ? `${pad.index}:b${i}` : null)).filter(Boolean));
		report(device, 'gamepads', `${pads.length} connected${pads.length ? ` (${pads.map((p) => p.id).join('. ')})` : ''} pressed ${pressed.join(' ') || 'none'}`, pads.length ? 'ok' : '');
	}, 500);
	window.addEventListener('gamepadconnected', (e) => logEvent(`gamepadconnected ${e.gamepad.id}`));

	// Left and right walk the buttons and up and down scroll the findings, whether the
	// controller arrives as arrows and Enter or as its own key codes. Every key is
	// written down as it came, before any of that.
	const NAV = {
		left: [37, 140, 205, 214],
		right: [39, 141, 206, 213],
		up: [38, 138, 203, 211],
		down: [40, 139, 204, 212],
		select: [13, 142, 195],
		back: [27, 143, 196]
	};
	let busy = false;
	let pendingAnswer = null;

	// While a question is up its answers are the only buttons there are.
	const moveFocus = (step) => {
		const buttons = Array.from((questionEl.childElementCount ? questionEl : actionsEl).querySelectorAll('button'));
		const index = buttons.indexOf(document.activeElement);
		const next = buttons[index === -1 ? 0 : Math.min(buttons.length - 1, Math.max(0, index + step))];
		if (next) next.focus();
	};
	const leave = () => {
		if (handoff && handoff.returnTo) window.location.assign(handoff.returnTo);
		else toShell('EXIT_APP');
	};
	const noteKey = (e) => {
		const text = `${e.type} ${e.keyCode} ${e.key} code=${e.code} repeat=${e.repeat}`;
		keyLog.push(text);
		const line = document.createElement('div');
		line.textContent = text;
		keysEl.prepend(line);
	};
	window.addEventListener('keydown', (e) => {
		noteKey(e);
		const is = (name) => NAV[name].includes(e.keyCode);
		if (is('left') || is('right')) { e.preventDefault(); moveFocus(is('right') ? 1 : -1); }
		if (is('up') || is('down')) { e.preventDefault(); resultsEl.scrollBy(0, is('down') ? 300 : -300); }
		if (is('back') && !e.repeat) {
			e.preventDefault();
			if (pendingAnswer) pendingAnswer('not answered');
			else if (!busy) leave();
		}
		if (is('select') && document.activeElement && document.activeElement.tagName === 'BUTTON') {
			e.preventDefault();
			// A press held down repeats, and one run is enough
			if (!e.repeat) document.activeElement.click();
		}
	}, true);
	window.addEventListener('keyup', noteKey, true);
	document.addEventListener('visibilitychange', () => logEvent(`visibilitychange hidden=${document.hidden}`));
	window.addEventListener('pagehide', () => logEvent('pagehide'));
	window.addEventListener('pageshow', () => logEvent('pageshow'));
	window.addEventListener('blur', () => logEvent('window blur'));
	window.addEventListener('focus', () => logEvent('window focus'));
	window.addEventListener(PAGE_EVENT, (e) => {
		if (e.detail && e.detail.type !== 'REPLY') logEvent(`bridge ${JSON.stringify(e.detail)}`);
	});
	if (navigator.mediaSession) {
		['play', 'pause', 'seekforward', 'seekbackward', 'stop'].forEach((action) => {
			try { navigator.mediaSession.setActionHandler(action, () => logEvent(`mediaSession ${action}`)); } catch (e) { /* not every action is known */ }
		});
	}

	const MAX_LOG_LINES = 150;
	const buildReport = () => [
		`Moonfin ${platform} probe report`,
		`taken ${new Date().toISOString()}${handoff ? `, from Moonfin ${handoff.app}` : ''}`,
		'',
		...results,
		'',
		`keys seen (${keyLog.length}, oldest first)`,
		...keyLog.slice(-MAX_LOG_LINES),
		'',
		`events (${eventLog.length}, oldest first)`,
		...eventLog.slice(-MAX_LOG_LINES)
	].join('\n');

	// The signed in server keeps the report in its log folder, where whoever runs the
	// server can pick it up. Jellyfin turns it away unless client log upload is on.
	const sendToServer = (text) => {
		const upload = handoff.upload;
		if (!upload) return Promise.resolve('this server has nowhere to take the report');
		return fetch(upload.url, {method: upload.method, headers: upload.headers, body: text}).then((response) => {
			if (response.ok) return `sent to the server at ${new URL(upload.url).origin}`;
			if (response.status === 403) return 'the server is not accepting client logs, turn them on in its dashboard';
			return `the server answered ${response.status}`;
		}, (e) => `could not reach the server: ${e.message}`);
	};

	// The report goes to the signed in server, to the address the build named if it
	// named one, and to the host, which writes it to a file and answers with where.
	// It is also kept on the page for a debugger to read.
	const sendReport = async () => {
		const text = buildReport();
		window.PROBE_REPORT = text;
		const sent = [];
		if (handoff) sent.push(await sendToServer(text));
		if (config.report) {
			sent.push(await fetch(config.report, {method: 'POST', body: text, keepalive: true}).then(() => `posted to ${config.report}`, () => `could not post to ${config.report}`));
		}
		sent.push(await askShell('SAVE_REPORT', {text}, 10000).then((saved) => `saved on the console as ${saved.path}`, (e) => `the host could not save it: ${e.message}`));
		return sent.join('\n');
	};

	// One run at a time. Each ends by sending the report as it then stands.
	const run = (name, test) => async () => {
		if (busy) return;
		busy = true;
		try {
			resultsEl.scrollTo(0, 0);
			await test();
			setStatus('Sending the report...');
			const where = await sendReport();
			setStatus(`${name} done. ${results.filter((line) => / \| FAIL/.test(line)).length} failures in ${results.length} findings.\n${where}`, true);
		} catch (e) {
			setStatus(`${name} stopped: ${e && e.message ? e.message : e}`);
		} finally {
			busy = false;
			moveFocus(0);
		}
	};

	// Puts a question up with its answers as the only buttons, and resolves with the one
	// picked. Back leaves it unanswered.
	const ask = (question, answers) => new Promise((resolve) => {
		setStatus(question);
		actionsEl.style.display = 'none';
		pendingAnswer = (answer) => {
			pendingAnswer = null;
			questionEl.textContent = '';
			actionsEl.style.display = '';
			resolve(answer);
		};
		answers.forEach((answer) => {
			const el = document.createElement('button');
			el.textContent = answer;
			el.addEventListener('click', () => { if (pendingAnswer) pendingAnswer(answer); });
			questionEl.appendChild(el);
		});
		moveFocus(0);
	});

	const SAME_PICTURE = ['About the same', 'Washed out or grey', 'Much too bright or too dark', 'The picture went black'];

	// Whether HDR video is shown as HDR, which only the person in front of the TV can
	// say. The reference clip and the HDR clips hold the same picture, so a correct
	// display of each looks alike. Where the display has an HDR10 mode the host is
	// asked to switch to it for the HDR10 clip, as it would be for a film.
	const hdrTest = async () => {
		const hdr = section('HDR test');
		const reference = clipNamed('t-sdr-reference.mp4');
		const hdr10 = clipNamed('t-hdr10.mp4');
		const hlg = clipNamed('t-hlg.mp4');
		if (!reference || !hdr10 || !hlg) {
			report(hdr, 'clips', 'not in this build, make them with probe/make-clips.js', 'fail');
			return;
		}

		const display = await askShell('DISPLAY_GET_MODES', undefined, 5000).catch((e) => ({error: e.message}));
		const hdrModes = (display && display.hdr) || [];
		report(hdr, 'display', display ? JSON.stringify({width: display.width, height: display.height, refreshRate: display.refreshRate, hdr: hdrModes, error: display.error}) : 'the host has no HDMI display to report');
		report(hdr, 'dynamic-range: high before', matchMedia('(dynamic-range: high)').matches);

		setStatus('Watch this first clip. It is the reference the next two are compared with.');
		report(hdr, 'reference clip', await playThrough(reference));

		let switchedToHdr = false;
		if (hdrModes.includes('hdr10')) {
			const switched = await askShell('DISPLAY_SET_FOR_MEDIA', {hdr: 'hdr10'}, 15000).catch((e) => ({ok: false, reason: e.message}));
			switchedToHdr = !!switched.ok;
			report(hdr, 'switch to HDR10', switched.ok ? `done, ${switched.mode}` : `FAIL ${switched.reason}`, switched.ok ? 'ok' : 'fail');
			await wait(3000);
		} else {
			report(hdr, 'switch to HDR10', 'not tried, the display reports no HDR10 mode');
		}
		report(hdr, 'dynamic-range: high during', matchMedia('(dynamic-range: high)').matches);

		setStatus('Now the same picture in HDR10. Watch whether the TV says it switched to HDR.');
		report(hdr, 'HDR10 clip', await playThrough(hdr10));
		report(hdr, 'HDR10 picture against the reference', await ask('Compared with the first clip, the HDR10 clip looked:', SAME_PICTURE));
		if (switchedToHdr) {
			report(hdr, 'TV showed it switched to HDR', await ask('Did the TV show that it switched to HDR, with a badge or in its info screen?', ['Yes', 'No', 'Not sure']));
			const restored = await askShell('DISPLAY_RESTORE', undefined, 15000).catch((e) => ({ok: false, reason: e.message}));
			report(hdr, 'switch back', restored.ok ? 'done' : `FAIL ${restored.reason || 'the console did not go back'}`, restored.ok ? 'ok' : 'fail');
			await wait(3000);
		}

		setStatus('Last, the same picture in HLG.');
		report(hdr, 'HLG clip', await playThrough(hlg));
		report(hdr, 'HLG picture against the reference', await ask('Compared with the first clip, the HLG clip looked:', SAME_PICTURE));
	};

	// Whether surround sound reaches the speakers. The player decodes sound itself and
	// hands the console plain channels, so nothing is passed through as a bitstream, and
	// what a receiver shows is the console's own doing, set in its audio settings. What
	// can be found out is whether six channels come out as six, and that takes ears.
	// The order and length of the tones are those of probe/make-clips.js.
	const SPEAKERS = ['Front left', 'Front right', 'Centre', 'Subwoofer (a low hum)', 'Surround left', 'Surround right'];
	const SPEAKER_SECONDS = 2;
	// 7.1 puts the back pair before the sides
	const SPEAKERS_71 = [...SPEAKERS.slice(0, 4), 'Surround back left', 'Surround back right', 'Surround left', 'Surround right'];
	const WHERE_FROM = ['Each speaker in turn', 'All from the front or the TV', 'Some were missing', 'No sound at all'];
	const showSpeaker = (label, speakers = SPEAKERS) => (time) => {
		const speaker = speakers[Math.min(speakers.length - 1, Math.floor(time / SPEAKER_SECONDS))];
		setStatus(`${label}: ${speakers.length} tones, one speaker at a time.\nNow playing: ${speaker}`);
	};

	const surroundTest = async () => {
		const surround = section('Surround sound test');
		report(surround, 'bitstream passthrough', 'not open to this player, which decodes sound itself. The console sends on what its own audio settings say.');
		try {
			const context = new (window.AudioContext || window.webkitAudioContext)();
			report(surround, 'audio output', `up to ${context.destination.maxChannelCount} channels, ${context.sampleRate} Hz`);
			context.close();
		} catch (e) {
			report(surround, 'audio output', `could not be read: ${e.message}`);
		}

		const clips = [['AAC 5.1', 't-channels-aac51.mp4'], ['Dolby Digital 5.1', 't-channels-ac3.mp4'], ['Dolby Digital Plus 5.1', 't-channels-eac3.mp4']];
		for (const [label, name] of clips) {
			const clip = clipNamed(name);
			if (!clip) {
				report(surround, label, 'clip not in this build, make it with probe/make-clips.js', 'fail');
				continue;
			}
			const played = await playThrough(clip, showSpeaker(label));
			report(surround, `${label} clip`, played);
			report(surround, `${label} heard from`, await ask(`${label}: where did the six tones come from?`, WHERE_FROM));
		}
		report(surround, 'receiver or soundbar showed', await ask('What did your receiver or soundbar show while the tones played?', ['Dolby Digital, DTS or Atmos', 'PCM or Multichannel', 'It does not say, or there is none']));
	};

	// Whether the console passes compressed sound on to a receiver. Each clip opens with
	// the system's own reader, which hands the console the sound as it is in the file,
	// where FFmpeg would decode it to PCM. Only the receiver can say whether it went on as
	// a bitstream, which needs Allow passthrough on. The transcodes have the shape of a
	// server's transcode and play through the system's HLS source like the app's do. The
	// 7.1 one comes in fMP4 segments, since MPEG-TS cant carry 7.1 AAC.
	const PASSTHROUGH_CLIPS = [
		{label: 'Dolby TrueHD clip', name: 'a-truehd-in-mkv.mkv'},
		{label: 'DTS clip', name: 'a-dts-in-mkv.mkv'},
		{label: 'Dolby Digital Plus clip', name: 'a-eac3-in-mkv.mkv'},
		{label: 'AAC 5.1 transcode', name: 't-hls-aac51', hls: true, speakers: SPEAKERS},
		{label: 'Dolby Digital 5.1 transcode', name: 't-hls-ac3', hls: true, speakers: SPEAKERS},
		{label: 'AAC 7.1 transcode in fMP4', name: 't-hls-aac71', hls: true, speakers: SPEAKERS_71}
	];
	const RECEIVER_SHOWED = ['Dolby TrueHD or Atmos', 'Dolby Digital or Dolby Digital Plus', 'DTS or DTS-HD', 'PCM, Multi Ch or Dolby Surround', 'No sound', 'It does not say, or there is none'];

	const passthroughTest = async () => {
		const passthrough = section('Passthrough test (console player)');
		report(passthrough, 'Allow passthrough', await ask("In the console's Settings, General, Volume & audio output, is Allow passthrough on?", ['Yes', 'No', 'Not there, or not sure']));
		report(passthrough, 'Audio setup', await ask("Which one is chosen in the console's Settings, General, Audio setup?", ['Stereo uncompressed', '5.1 uncompressed', '7.1 uncompressed', 'Dolby Digital', 'DTS Digital Surround', 'Dolby Atmos for home theater', 'DTS:X for home theater', 'Not sure']));

		for (const {label, name, hls, speakers} of PASSTHROUGH_CLIPS) {
			const clip = clipNamed(name);
			if (!clip) {
				report(passthrough, label, 'not in this build, make it with probe/make-clips.js', 'fail');
				continue;
			}
			if (!hls) setStatus(`${label} through the system's reader.\nWatch what your receiver shows.`);
			const {seen, state} = await playNative(clip, hls ? {hls, onTime: showSpeaker(label, speakers)} : {reader: 'system'});
			const said = seen.error ? `FAIL ${seen.error}` : !seen.playing ? 'FAIL never started playing' : seen.ended ? 'played to the end' : 'FAIL did not finish';
			report(passthrough, label, said, /^FAIL/.test(said) ? 'fail' : 'ok');
			report(passthrough, `${label} given to the console as`, (state && state.audioFormat) || 'not reported');
			if (hls) report(passthrough, `${label} heard from`, await ask(`${label}: where did the ${speakers.length} tones come from?`, WHERE_FROM));
			report(passthrough, `${label} receiver showed`, await ask(`What did your receiver show during the ${label}?`, RECEIVER_SHOWED));
		}
	};

	// Whether the console sends Dolby Vision to the TV, which only the TV can say. Each
	// clip plays full screen through every route in turn, under a label naming both, while
	// the tester reads the TV's info banner and the colors. A profile 5 clip has no HDR10
	// picture to fall back on, so it comes out green and purple when the console's Dolby
	// Vision effect did not run.
	const DOLBY_VISION_ROUTES = [
		{label: '(a) FFmpeg with the Dolby Vision tags', open: (profile) => ({dolbyVision: profile})},
		{label: "(b) Windows' reader in Dolby Vision mode", open: (profile) => ({reader: 'system', fallback: false, dolbyVision: profile})},
		{label: '(c) FFmpeg in Dolby Vision mode without the tags, the control', open: (profile) => ({dolbyVision: profile, dolbyVisionTags: false})},
		{label: '(d) the HDR10 path, switched after opening', open: () => ({})}
	];
	const DOLBY_VISION_PLAY_MS = 15000;
	const stageEl = document.getElementById('stage');

	const dolbyVisionTest = async () => {
		const dv = section('Dolby Vision test (console player)');
		if (!dolbyVisionClips.length) {
			report(dv, 'skipped', 'no Dolby Vision clips in this build, see probe/make-clips.js');
			return;
		}
		const display = await askShell('DISPLAY_GET_MODES', undefined, 5000).catch(() => null);
		if (!display || !(display.hdr || []).includes('dolbyvision')) {
			report(dv, 'skipped', 'the console reports no Dolby Vision mode on this display');
			return;
		}
		document.documentElement.classList.add('stage');
		try {
			for (const clip of dolbyVisionClips) {
				for (const route of DOLBY_VISION_ROUTES) {
					const name = `${clip.label} ${route.label}`;
					stageEl.textContent = `${clip.label}, profile ${clip.profile}\n${route.label}`;
					report(dv, name, 'playing', 'wait');
					const {seen, state} = await playNative(clip, {open: route.open(clip.profile), rect: {left: 0, top: 0, width: innerWidth, height: innerHeight}, playFor: DOLBY_VISION_PLAY_MS});
					const restored = await askShell('DISPLAY_RESTORE', undefined, 15000).catch((e) => ({ok: false, reason: e.message}));
					const shown = seen.display ? `${seen.display.hdr} ${seen.display.ok ? seen.display.mode : `refused, ${seen.display.reason}`}` : 'no switch reported';
					const said = [
						seen.error ? `FAIL ${seen.error}` : !seen.playing ? 'FAIL never started playing' : `played ${state.width}x${state.height} to t=${(state.position || 0).toFixed(1)}`,
						`display ${shown}`,
						`decoder ${(state && state.videoDecoder) || 'not reported'}`,
						`dolbyVisionProfile ${(state && state.dolbyVisionProfile) || 'none'}`,
						restored.ok ? '' : `restore FAIL ${restored.reason || 'the console did not go back'}`
					].filter(Boolean).join(', ');
					report(dv, name, said, seen.error || !seen.playing ? 'fail' : 'ok');
					// The TV takes a few seconds to settle after a mode change
					await wait(3000);
				}
			}
		} finally {
			document.documentElement.classList.remove('stage');
		}
	};

	const runAll = run('Run', playAll);
	button('Run all tests and send the report', runAll);
	button('HDR test', run('HDR test', hdrTest));
	button('Surround sound test', run('Surround sound test', surroundTest));
	if (nativePlayer) button('Passthrough test', run('Passthrough test', passthroughTest));
	if (nativePlayer) button('Dolby Vision test', run('Dolby Vision test', dolbyVisionTest));
	button(handoff ? 'Back to Moonfin' : 'Exit', leave);

	// For a debugger or a script to start the run without a controller.
	window.PROBE_RUN = runAll;
	window.PROBE_RUN_NATIVE = run('Console player', playAllNative);

	moveFocus(0);
})();
