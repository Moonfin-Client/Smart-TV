import {getSharedVideoElement as webOSVideoElement} from '../../../platform-webos/src/video';
import {chooseHostReader, cleanupVideoElement, getHostAudioOutput, getHostDisplay, getSharedVideoElement, notePlaybackError, rendersSubtitleInHost, resumesAfterFirstFrame, setDisplayWindow, showHostSubtitle, waitForDecoderRelease} from '../../../platform-xbox/src/video';
import {isNativePlayerEnabled} from '../../../platform-xbox/src/nativeVideo';

const SETTINGS_KEY = 'moonfin_settings';

const hostSays = (type, payload) => window.dispatchEvent(new CustomEvent('moonfin:xbox', {detail: {v: 1, type, payload}}));
const nextFrame = () => new Promise((resolve) => window.requestAnimationFrame(resolve));
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the video element backed by the console player', () => {
	let postMessage;
	let sent;
	let container;

	const reply = (id, payload) => window.dispatchEvent(new CustomEvent('moonfin:xbox', {detail: {v: 1, type: 'REPLY', id, payload}}));
	const playerEvent = (session, event, extra = {}) => hostSays('PLAYER_EVENT', {session, event, ...extra});
	const messages = (type) => sent.filter((message) => message.type === type);
	const lastOf = (type) => messages(type)[messages(type).length - 1];
	const events = (video) => {
		const seen = [];
		for (const name of ['loadedmetadata', 'loadeddata', 'canplay', 'play', 'playing', 'pause', 'timeupdate', 'waiting', 'seeking', 'seeked', 'ended', 'error', 'resize']) {
			video.addEventListener(name, () => seen.push(name));
		}
		return seen;
	};

	beforeEach(() => {
		sent = [];
		postMessage = jest.fn((raw) => sent.push(JSON.parse(raw)));
		window.chrome = {webview: {postMessage}};
		window.__MOONFIN_XBOX__ = {v: 1, nativePlayer: {v: 1}, protection: {hevc: true}, display: {hdr: ['hdr10']}};
		window.localStorage.removeItem(SETTINGS_KEY);
		container = document.createElement('div');
		container.style.background = '#000';
		document.body.appendChild(container);
	});

	afterEach(() => {
		container.remove();
		delete window.chrome;
		delete window.__MOONFIN_XBOX__;
		window.localStorage.removeItem(SETTINGS_KEY);
	});

	// Takes the stream a test before left open off the element, with the host's answer.
	const dropStream = (video) => {
		video.removeAttribute('src');
		video.load();
		const close = lastOf('PLAYER_CLOSE');
		if (close) reply(close.id, {ok: true});
		sent.length = 0;
	};

	// Opens a stream the way the player does and answers the host's part of it.
	const openStream = (video, src = 'http://server/Videos/1/stream.mkv?api_key=k') => {
		dropStream(video);
		video.src = src;
		video.load();
		const open = lastOf('PLAYER_OPEN');
		reply(open.id, {ok: true});
		return open;
	};

	test('is a real video element of its own, not the WebView singleton, while the setting is on', () => {
		const video = getSharedVideoElement();
		expect(video).toBeInstanceOf(window.HTMLVideoElement);
		expect(video).not.toBe(webOSVideoElement());
		expect(getSharedVideoElement()).toBe(video);
		expect(isNativePlayerEnabled()).toBe(true);

		window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({xboxNativePlayer: false}));
		expect(isNativePlayerEnabled()).toBe(false);
		expect(getSharedVideoElement()).toBe(webOSVideoElement());
	});

	test('names the decoder the console player plays the sound with, and the format it gives the console', async () => {
		const file = getHostAudioOutput();
		reply(lastOf('PLAYER_GET_STATE').id, {opened: true, audioDecoder: 'truehd FFmpegSoftwareDecoder', audioFormat: 'PCM 8 ch 48000 Hz'});
		expect(await file).toEqual({decoder: 'truehd FFmpegSoftwareDecoder', format: 'PCM 8 ch 48000 Hz'});

		// The system's reader names no decoder, and Windows names TrueHD by a GUID
		const passedOn = getHostAudioOutput();
		reply(lastOf('PLAYER_GET_STATE').id, {opened: true, audioFormat: '{eb27cec4-163e-4ca3-8b74-8e25f91b517e} 8 ch 48000 Hz'});
		expect(await passedOn).toEqual({decoder: null, format: 'TrueHD 8 ch 48000 Hz'});

		const transcode = getHostAudioOutput();
		reply(lastOf('PLAYER_GET_STATE').id, {opened: true, audioFormat: '{6D703461-767A-494D-B478-F29D25DC9037} 48000 Hz'});
		expect(await transcode).toEqual({decoder: null, format: 'AAC 48000 Hz'});

		const nothing = getHostAudioOutput();
		reply(lastOf('PLAYER_GET_STATE').id, {opened: false});
		expect(await nothing).toBeNull();

		sent.length = 0;
		window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({xboxNativePlayer: false}));
		expect(await getHostAudioOutput()).toBeNull();
		expect(messages('PLAYER_GET_STATE')).toHaveLength(0);
	});

	test('with passthrough on, opens a film whose sound a receiver decodes with the system reader, once', () => {
		const film = (codec, extra = {}) => ({
			playMethod: 'DirectPlay',
			audioStreamIndex: 1,
			mediaSource: {MediaStreams: [{Type: 'Video', Codec: 'hevc', VideoRangeType: 'HDR10'}, {Type: 'Audio', Codec: codec, Index: 1}, {Type: 'Audio', Codec: 'aac', Index: 2}]},
			...extra
		});
		const video = getSharedVideoElement();
		const openWith = (session) => {
			chooseHostReader(video, session);
			return openStream(video).payload;
		};

		expect(openWith(film('truehd'))).not.toHaveProperty('reader');
		expect(openWith(film('truehd'))).not.toHaveProperty('passthrough');

		window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({xboxPassthrough: true}));
		// FFmpeg is told to pass the sound on too, for when the system reader turns the file away
		expect(openWith(film('truehd'))).toMatchObject({reader: 'system', fallback: true, hdr10: true, passthrough: true});
		// Dolby Vision being on changes nothing for a film without it
		expect(openWith(film('truehd', {capabilities: {dolbyVision: true}}))).toMatchObject({reader: 'system', hdr10: true, passthrough: true});
		expect(openWith(film('DTS'))).toMatchObject({reader: 'system', passthrough: true});
		const aac = openWith(film('eac3', {audioStreamIndex: 2}));
		expect(aac).not.toHaveProperty('reader');
		expect(aac).not.toHaveProperty('passthrough');
		const transcode = openWith(film('ac3', {playMethod: 'Transcode'}));
		expect(transcode).not.toHaveProperty('reader');
		expect(transcode).not.toHaveProperty('passthrough');

		// The next stream nobody chose for goes back to FFmpeg
		chooseHostReader(video, film('ac3'));
		openStream(video);
		const next = openStream(video).payload;
		expect(next).not.toHaveProperty('reader');
		expect(next).not.toHaveProperty('passthrough');
	});

	test('opens a Dolby Vision film played as it is with its profile, with FFmpeg passing the sound on when passthrough is on', () => {
		const film = (range, extra = {}) => ({
			playMethod: 'DirectPlay',
			audioStreamIndex: 1,
			capabilities: {dolbyVision: true},
			mediaSource: {MediaStreams: [{Type: 'Video', Codec: 'hevc', VideoRangeType: range}, {Type: 'Audio', Codec: 'truehd', Index: 1}]},
			...extra
		});
		const video = getSharedVideoElement();
		const openWith = (session) => {
			chooseHostReader(video, session);
			return openStream(video).payload;
		};

		const profile5 = openWith(film('DOVI'));
		expect(profile5).toMatchObject({dolbyVision: 5});
		expect(profile5).not.toHaveProperty('passthrough');
		expect(openWith(film('DOVIWithHDR10'))).toMatchObject({dolbyVision: 8});
		expect(openWith(film('DOVIWithHDR10Plus'))).toMatchObject({dolbyVision: 8});
		expect(openWith(film('DOVIWithEL'))).toMatchObject({dolbyVision: 7});
		expect(openWith(film('DOVIWithELHDR10Plus'))).toMatchObject({dolbyVision: 7});
		expect(openWith(film('DOVIWithHLG'))).toMatchObject({dolbyVision: 8});
		expect(openWith(film('DOVIWithSDR'))).toMatchObject({dolbyVision: 8});
		expect(openWith(film('DOVIInvalid'))).not.toHaveProperty('dolbyVision');
		expect(openWith(film('HDR10'))).not.toHaveProperty('dolbyVision');
		expect(openWith(film('DOVI', {playMethod: 'Transcode'}))).not.toHaveProperty('dolbyVision');
		expect(openWith(film('DOVIWithHDR10', {playMethod: 'Transcode'}))).not.toHaveProperty('dolbyVision');
		expect(openWith(film('DOVIWithHDR10', {playMethod: 'DirectStream'}))).not.toHaveProperty('dolbyVision');
		expect(openWith(film('DOVIWithHDR10', {capabilities: {dolbyVision: false}}))).not.toHaveProperty('dolbyVision');

		window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({xboxPassthrough: true}));
		const passedThrough = openWith(film('DOVIWithHDR10'));
		expect(passedThrough).toMatchObject({dolbyVision: 8, passthrough: true});
		expect(passedThrough).not.toHaveProperty('reader');
		expect(openWith(film('DOVIWithHDR10', {capabilities: {dolbyVision: false}}))).toMatchObject({reader: 'system', hdr10: true});

		// The next stream nobody chose for opens without it
		chooseHostReader(video, film('DOVI'));
		openStream(video);
		expect(openStream(video).payload).not.toHaveProperty('dolbyVision');
	});

	test('keeps the mode the host put the display in until the stream closes', async () => {
		const video = getSharedVideoElement();
		const {session} = openStream(video).payload;
		expect(getHostDisplay()).toBeNull();

		playerEvent(session, 'display', {ok: true, mode: '3840x2160 at 60 Hz, 30 bits per pixel', hdr: 'dolbyvision'});
		expect(getHostDisplay()).toMatchObject({ok: true, hdr: 'dolbyvision'});
		playerEvent(session + 100, 'display', {ok: true, hdr: 'hdr10'});
		expect(getHostDisplay()).toMatchObject({hdr: 'dolbyvision'});
		// A profile 8 film the display turned down plays on, in HDR10
		playerEvent(session, 'display', {ok: true, hdr: 'hdr10'});
		expect(getHostDisplay()).toMatchObject({ok: true, hdr: 'hdr10'});

		const next = openStream(video).payload.session;
		expect(getHostDisplay()).toBeNull();
		playerEvent(next, 'display', {ok: true, hdr: 'dolbyvision'});
		window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({xboxNativePlayer: false}));
		expect(getHostDisplay()).toBeNull();
		window.localStorage.removeItem(SETTINGS_KEY);
		expect(getHostDisplay()).toMatchObject({hdr: 'dolbyvision'});

		const done = cleanupVideoElement(video);
		expect(getHostDisplay()).toBeNull();
		reply(lastOf('PLAYER_CLOSE').id, {ok: true});
		await done;
	});

	test('opens the stream through the host with the resume point taken off the address', () => {
		const video = getSharedVideoElement();
		const open = openStream(video, 'http://server/Videos/1/stream.mkv?api_key=k#t=125.5');
		expect(open.payload).toMatchObject({session: expect.any(Number), url: 'http://server/Videos/1/stream.mkv?api_key=k', hls: false, startSeconds: 125.5});
		expect(video.src).toBe('http://server/Videos/1/stream.mkv?api_key=k');
		expect(video.currentTime).toBe(125.5);
		expect(video.readyState).toBe(0);
	});

	test('tells an HLS transcode apart by its type or its address', () => {
		const video = getSharedVideoElement();
		video.type = 'application/x-mpegURL';
		expect(openStream(video, 'http://server/videos/1/master.m3u8').payload.hls).toBe(true);
		video.type = 'video/mp4';
		expect(openStream(video, 'http://server/videos/1/live.m3u8?x=1').payload.hls).toBe(true);
		expect(openStream(video, 'http://server/videos/1/stream.mp4').payload.hls).toBe(false);
	});

	test('closes the stream when the address is taken away, and the cleanup waits on it', async () => {
		const video = getSharedVideoElement();
		const open = openStream(video);
		const session = open.payload.session;
		const done = cleanupVideoElement(video);
		const close = lastOf('PLAYER_CLOSE');
		expect(close.payload).toEqual({session});
		reply(close.id, {ok: true});
		await done;
		expect(video.paused).toBe(true);
	});

	test('play returns a promise that settles when the player is going, or fails when the stream goes away', async () => {
		const video = getSharedVideoElement();
		const seen = events(video);
		const {session} = openStream(video).payload;
		const promise = video.play();
		expect(video.paused).toBe(false);
		expect(lastOf('PLAYER_PLAY').payload).toEqual({session});
		await tick();
		expect(seen).toEqual(['play']);

		playerEvent(session, 'opened', {duration: 100, width: 1920, height: 800, audioTracks: [{index: 0, language: 'en', label: 'Main'}], selectedAudio: 0});
		playerEvent(session, 'playing', {position: 0.1});
		await expect(promise).resolves.toBeUndefined();
		expect(seen).toEqual(['play', 'loadedmetadata', 'loadeddata', 'canplay', 'playing']);
		expect(video.duration).toBe(100);
		expect(video.videoWidth).toBe(1920);
		expect(video.readyState).toBe(4);

		const interrupted = video.play();
		openStream(video);
		await expect(interrupted).rejects.toMatchObject({name: 'AbortError'});
	});

	test('keeps a clock between the host position reports and clamps it to the duration', () => {
		const video = getSharedVideoElement();
		const {session} = openStream(video).payload;
		playerEvent(session, 'opened', {duration: 50, width: 1, height: 1, audioTracks: [], selectedAudio: -1});
		playerEvent(session, 'playing', {position: 10});
		const spy = jest.spyOn(performance, 'now');
		const base = performance.now();
		spy.mockReturnValue(base + 2000);
		expect(video.currentTime).toBeCloseTo(12, 0);
		playerEvent(session, 'timeupdate', {position: 49.9, duration: 50, buffered: [[40, 50]]});
		spy.mockReturnValue(base + 5000);
		expect(video.currentTime).toBe(50);
		expect(video.buffered.length).toBe(1);
		expect(video.buffered.end(0)).toBe(50);
		playerEvent(session, 'paused', {position: 30});
		spy.mockReturnValue(base + 9000);
		expect(video.currentTime).toBe(30);
		expect(video.paused).toBe(true);
		spy.mockRestore();
	});

	test('a seek is sent to the host and holds the clock still until it lands', () => {
		const video = getSharedVideoElement();
		const seen = events(video);
		const {session} = openStream(video).payload;
		playerEvent(session, 'opened', {duration: 100, width: 1, height: 1, audioTracks: [], selectedAudio: -1});
		playerEvent(session, 'playing', {position: 1});
		video.currentTime = 42;
		expect(video.seeking).toBe(true);
		expect(video.currentTime).toBe(42);
		expect(lastOf('PLAYER_SEEK').payload).toEqual({session, seconds: 42});
		playerEvent(session, 'seeked', {position: 42});
		expect(video.seeking).toBe(false);
		expect(seen.slice(-3)).toEqual(['seeking', 'seeked', 'timeupdate']);
	});

	test('switching a sound track is one message, and the list reads like the browser one', () => {
		const video = getSharedVideoElement();
		const {session} = openStream(video).payload;
		playerEvent(session, 'opened', {duration: 100, width: 1, height: 1, audioTracks: [{index: 0, id: '1', language: 'eng', label: 'English'}, {index: 1, id: '2', language: 'jpn', label: 'Japanese'}], selectedAudio: 0});
		expect(video.audioTracks.length).toBe(2);
		expect(video.audioTracks[1]).toMatchObject({language: 'jpn', label: 'Japanese', enabled: false});
		expect(video.audioTracks[0].enabled).toBe(true);
		for (let i = 0; i < video.audioTracks.length; i++) video.audioTracks[i].enabled = (i === 1);
		expect(messages('PLAYER_SELECT_AUDIO')).toHaveLength(1);
		expect(lastOf('PLAYER_SELECT_AUDIO').payload).toEqual({session, index: 1});
		expect(video.audioTracks[1].enabled).toBe(true);
		expect(video.audioTracks[0].enabled).toBe(false);
	});

	test('an error from the host becomes the element error without touching paused, and old sessions are ignored', () => {
		const video = getSharedVideoElement();
		const seen = events(video);
		const {session} = openStream(video).payload;
		playerEvent(session - 1, 'playing', {position: 5});
		expect(video.paused).toBe(true);
		expect(seen).toEqual([]);
		playerEvent(session, 'error', {code: 3, message: 'DecodingError: bad'});
		expect(video.error).toEqual({code: 3, message: 'DecodingError: bad'});
		expect(video.networkState).toBe(3);
		expect(video.paused).toBe(true);
		expect(seen).toEqual(['error']);
	});

	test('ending pauses then ends, as a browser does', () => {
		const video = getSharedVideoElement();
		const seen = events(video);
		const {session} = openStream(video).payload;
		playerEvent(session, 'playing', {position: 1});
		playerEvent(session, 'ended', {position: 100});
		expect(video.ended).toBe(true);
		expect(video.paused).toBe(true);
		expect(seen.slice(-2)).toEqual(['pause', 'ended']);
	});

	test('says it plays what the console player takes, so hls.js is never chosen', () => {
		const video = getSharedVideoElement();
		expect(video.canPlayType('application/x-mpegURL')).toBe('probably');
		expect(video.canPlayType('application/vnd.apple.mpegurl')).toBe('probably');
		expect(video.canPlayType('video/mp4')).toBe('probably');
		expect(video.canPlayType('video/x-matroska')).toBe('probably');
		expect(video.canPlayType('audio/flac')).toBe('probably');
		expect(video.canPlayType('application/dash+xml')).toBe('');
		expect(video.getVideoPlaybackQuality()).toMatchObject({droppedVideoFrames: 0, totalVideoFrames: 0});
	});

	test('turns a MediaSource away with a source error', async () => {
		const video = getSharedVideoElement();
		const seen = events(video);
		video.src = 'blob:http://moonfin.internal/abc';
		video.load();
		await tick();
		expect(video.error.code).toBe(4);
		expect(seen).toEqual(['error']);
		expect(messages('PLAYER_OPEN')).toHaveLength(0);
	});

	test('clears everything behind the element while it is on the page and puts it back after', async () => {
		document.body.style.background = '';
		const video = getSharedVideoElement();
		container.appendChild(video);
		await nextFrame();
		expect(container.style.background).toBe('transparent');
		expect(document.documentElement.classList.contains('xbox-native-video')).toBe(true);
		expect(document.getElementById('xbox-native-video-style')).not.toBeNull();

		container.removeChild(video);
		await tick();
		expect(container.style.background).toBe('rgb(0, 0, 0)');
		expect(document.documentElement.classList.contains('xbox-native-video')).toBe(false);
	});

	test('places the player where the page laid the element out', async () => {
		const video = getSharedVideoElement();
		dropStream(video);
		expect(await setDisplayWindow({})).toBe(false);
		const {session} = openStream(video).payload;
		video.style.left = '-40px';
		video.style.top = '0px';
		video.style.width = '2000px';
		video.style.height = '1080px';
		expect(await setDisplayWindow({})).toBe(true);
		expect(lastOf('PLAYER_SET_RECT').payload).toEqual({session, x: -40, y: 0, width: 2000, height: 1080});
	});

	test('volume and mute reach the host once a stream is open', () => {
		const video = getSharedVideoElement();
		dropStream(video);
		video.volume = 0.5;
		video.muted = true;
		expect(messages('PLAYER_SET_VOLUME')).toHaveLength(0);
		const {session} = openStream(video).payload;
		expect(lastOf('PLAYER_OPEN').payload).toMatchObject({volume: 0.5, muted: true});
		video.muted = false;
		expect(lastOf('PLAYER_SET_VOLUME').payload).toEqual({session, volume: 0.5, muted: false});
	});

	test('the hooks step aside for the console player', async () => {
		const hevc = {Id: 'a', MediaStreams: [{Type: 'Video', Codec: 'hevc', VideoRangeType: 'HDR10'}]};
		expect(resumesAfterFirstFrame(hevc)).toBe(false);
		notePlaybackError({message: 'DECODER_ERROR_NOT_SUPPORTED'}, hevc, 'DirectPlay');
		expect(window.localStorage.getItem('moonfin:xboxHevcRefusals')).toBeNull();
		await expect(waitForDecoderRelease()).resolves.toBeUndefined();

		const other = document.createElement('video');
		await expect(cleanupVideoElement(other)).resolves.toBeDefined();
	});

	test('a DVD subtitle track is the host player to draw, picked by its stream index', () => {
		expect(rendersSubtitleInHost('dvdsub')).toBe(true);
		expect(rendersSubtitleInHost('DVBSUB')).toBe(true);
		expect(rendersSubtitleInHost('pgssub')).toBe(false);
		expect(rendersSubtitleInHost('subrip')).toBe(false);

		const video = getSharedVideoElement();
		dropStream(video);
		expect(showHostSubtitle(video, 5)).toBe(true);
		expect(messages('PLAYER_SELECT_SUBTITLE')).toHaveLength(0);
		const {session} = openStream(video).payload;
		expect(lastOf('PLAYER_OPEN').payload.subtitle).toBe(5);
		expect(showHostSubtitle(video, -1)).toBe(true);
		expect(lastOf('PLAYER_SELECT_SUBTITLE').payload).toEqual({session, index: -1});
		expect(showHostSubtitle(document.createElement('video'), 5)).toBe(false);

		window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({xboxNativePlayer: false}));
		expect(rendersSubtitleInHost('dvdsub')).toBe(false);
	});
});
