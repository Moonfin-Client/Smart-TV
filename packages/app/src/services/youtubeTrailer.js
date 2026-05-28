const INNERTUBE_URL = 'https://www.youtube.com/youtubei/v1/player';
const RESOLVE_TIMEOUT_MS = 8000;
const REQUEST_TIMEOUT_MS = 5000;
const DEBUG_STORAGE_KEY = 'moonfin:debugYoutubeTrailer';

const YOUTUBE_REFERER = 'https://www.youtube.com/';
const FIREFOX_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0';

const PIPED_BASES = [
	'https://pipedapi.kavin.rocks',
	'https://pipedapi.moomoo.me'
];

const INVIDIOUS_BASES = [
	'https://invidious.fdn.fr',
	'https://invidious.privacyredirect.com',
	'https://invidious.projectsegfau.lt'
];

const INNERTUBE_CLIENTS = [
	{
		name: 'ANDROID',
		nameId: '3',
		version: '20.10.41',
		userAgent: 'com.google.android.youtube/20.10.41 (Linux; U; Android 11) gzip',
		apiKey: 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w',
		platform: 'MOBILE',
		extra: {
			deviceMake: 'Google',
			deviceModel: 'Pixel 5',
			osName: 'Android',
			osVersion: '11',
			androidSdkVersion: '30'
		}
	},
	{
		name: 'ANDROID_VR',
		nameId: '28',
		version: '1.60.19',
		userAgent: 'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; Quest 3 Build/SQ3A.220605.009.A1) gzip',
		apiKey: 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w',
		platform: 'MOBILE',
		extra: {
			deviceMake: 'Oculus',
			deviceModel: 'Quest 3',
			osName: 'Android',
			osVersion: '12L',
			androidSdkVersion: '32'
		}
	},
	{
		name: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
		nameId: '85',
		version: '2.0',
		userAgent: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/6.0 TV Safari/538.1',
		apiKey: 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
		platform: 'TV',
		embedContext: true,
		extra: {}
	},
	{
		name: 'IOS',
		nameId: '5',
		version: '20.10.4',
		userAgent: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
		apiKey: 'AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc',
		platform: 'MOBILE',
		extra: {
			deviceMake: 'Apple',
			deviceModel: 'iPhone16,2',
			osName: 'iOS',
			osVersion: '18.3.2.22D82'
		}
	},
	{
		name: 'WEB',
		nameId: '1',
		version: '2.20250312.04.00',
		userAgent: FIREFOX_UA,
		apiKey: 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
		platform: 'DESKTOP',
		extra: {}
	}
];

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

		fetch(url, options)
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
	const audioCodec = ((stream && stream.audioCodec) || '').toLowerCase();

	return (stream && stream.videoOnly === false) ||
		mime.indexOf('mp4a') !== -1 ||
		mime.indexOf('opus') !== -1 ||
		mime.indexOf('vorbis') !== -1 ||
		mime.indexOf('audio') !== -1 ||
		audioCodec.length > 0;
}

function streamScore (stream, preferHighQuality) {
	const mime = ((stream && stream.mimeType) || '').toLowerCase();
	const container = ((stream && stream.container) || '').toLowerCase();
	const quality = qualityFromStream(stream);

	const hasAudio = streamHasAudio(stream);
	const isMp4 = mime.indexOf('video/mp4') !== -1 || container === 'mp4';
	const isH264 = mime.indexOf('avc1') !== -1 || mime.indexOf('h264') !== -1;
	const isVp9 = mime.indexOf('vp9') !== -1 || mime.indexOf('vp09') !== -1;
	const isAv1 = mime.indexOf('av01') !== -1 || mime.indexOf('av1') !== -1;
	const isHls = (stream && stream.hls === true) || (stream && stream.isHLS === true);

	let score = 0;

	if (hasAudio) score += 5000;
	if (isMp4) score += 2500;
	if (isH264) score += 2500;
	if (isVp9) score -= 1500;
	if (isAv1) score -= 2500;
	if (isHls) score += 500;

	const clampedQuality = quality > 0 ? Math.min(1080, Math.max(144, quality)) : 480;
	if (preferHighQuality) {
		score += clampedQuality;
	} else {
		const qualityDelta = Math.abs(clampedQuality - 480);
		score += 1000 - qualityDelta;
	}

	return score;
}

function pickBestUrl (streams, preferHighQuality) {
	if (!Array.isArray(streams) || streams.length === 0) return null;

	let bestUrl = null;
	let bestScore = -1e9;

	for (let i = 0; i < streams.length; i++) {
		const stream = streams[i];
		const url = stream && stream.url;
		if (!url) continue;

		const score = streamScore(stream, preferHighQuality);
		if (score > bestScore) {
			bestScore = score;
			bestUrl = url;
		}
	}

	if (bestUrl) return bestUrl;

	for (let i = 0; i < streams.length; i++) {
		if (streams[i] && streams[i].url) return streams[i].url;
	}

	return null;
}

function extractInnertubeStreamUrl (playerResponse, preferHighQuality) {
	if (!playerResponse) return null;

	const playability = playerResponse.playabilityStatus;
	const status = playability && playability.status;
	if (status && status !== 'OK') return null;

	const streamingData = playerResponse.streamingData;
	if (!streamingData) return null;

	if (streamingData.hlsManifestUrl) return streamingData.hlsManifestUrl;
	if (streamingData.dashManifestUrl) return streamingData.dashManifestUrl;

	const formats = Array.isArray(streamingData.formats) ? streamingData.formats : [];
	const muxedFormats = formats.filter(function (stream) {
		return stream && stream.url && streamHasAudio(stream);
	});

	if (muxedFormats.length > 0) {
		return pickBestUrl(muxedFormats, preferHighQuality);
	}

	return null;
}

function buildInnertubePayload (videoId, client) {
	const payload = {
		videoId: videoId,
		context: {
			client: {
				clientName: client.name,
				clientVersion: client.version,
				hl: 'en',
				gl: 'US',
				platform: client.platform,
				...client.extra
			}
		},
		contentCheckOk: true,
		racyCheckOk: true
	};

	if (client.embedContext) {
		payload.context.thirdParty = {embedUrl: YOUTUBE_REFERER};
	}

	return payload;
}

async function tryInnertube (videoId, preferHighQuality) {
	// Browser environments cannot set User-Agent/Origin/Referer headers.
	// Use a CORS-simple request (text/plain) to avoid preflight rejection.
	for (let i = 0; i < INNERTUBE_CLIENTS.length; i++) {
		const client = INNERTUBE_CLIENTS[i];
		const data = await requestJson(
			`${INNERTUBE_URL}?key=${client.apiKey}&prettyPrint=false`,
			{
				method: 'POST',
				mode: 'cors',
				credentials: 'omit',
				cache: 'no-store',
				headers: {
					'Content-Type': 'text/plain;charset=UTF-8'
				},
				body: JSON.stringify(buildInnertubePayload(videoId, client))
			},
			REQUEST_TIMEOUT_MS,
			`innertube:${client.name}`
		);

		if (!data) continue;

		debugLog('innertube status', client.name, data.playabilityStatus?.status, data.playabilityStatus?.reason || '');

		const streamUrl = extractInnertubeStreamUrl(data, preferHighQuality);
		if (streamUrl) {
			debugLog('innertube resolved stream', client.name);
			return streamUrl;
		}
	}

	debugLog('innertube exhausted without stream');
	return null;
}

async function tryPiped (videoId, baseUrl, preferHighQuality) {
	const data = await requestJson(
		`${baseUrl}/streams/${videoId}`,
		{headers: {'User-Agent': FIREFOX_UA}},
		REQUEST_TIMEOUT_MS,
		`piped:${baseUrl}`
	);

	if (!data) return null;

	if (data.hls && typeof data.hls === 'string') {
		return data.hls;
	}

	const videoStreams = Array.isArray(data.videoStreams) ? data.videoStreams : [];
	const muxedStreams = videoStreams.filter(function (stream) {
		return stream && stream.url && stream.videoOnly === false;
	});

	const muxedUrl = pickBestUrl(muxedStreams, preferHighQuality);
	if (muxedUrl) return muxedUrl;

	return pickBestUrl(videoStreams, preferHighQuality);
}

async function tryInvidious (videoId, baseUrl, preferHighQuality) {
	const data = await requestJson(
		`${baseUrl}/api/v1/videos/${videoId}`,
		{},
		REQUEST_TIMEOUT_MS,
		`invidious:${baseUrl}`
	);

	if (!data) return null;

	const formatStreams = Array.isArray(data.formatStreams) ? data.formatStreams.filter(function (stream) {
		return stream && stream.url;
	}) : [];

	if (formatStreams.length === 0) return null;

	return pickBestUrl(formatStreams, preferHighQuality);
}

async function doResolve (videoId, preferHighQuality) {
	const innertubeUrl = await tryInnertube(videoId, preferHighQuality);
	if (innertubeUrl) return innertubeUrl;

	for (let i = 0; i < PIPED_BASES.length; i++) {
		const pipedUrl = await tryPiped(videoId, PIPED_BASES[i], preferHighQuality);
		if (pipedUrl) return pipedUrl;
	}

	for (let i = 0; i < INVIDIOUS_BASES.length; i++) {
		const invidiousUrl = await tryInvidious(videoId, INVIDIOUS_BASES[i], preferHighQuality);
		if (invidiousUrl) return invidiousUrl;
	}

	return null;
}

export function fetchVideoStreamUrl (videoId, preferHighQuality = false) {
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

		doResolve(videoId, !!preferHighQuality)
			.then(function (url) { finish(url); })
			.catch(function () { finish(null); });
	});
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
