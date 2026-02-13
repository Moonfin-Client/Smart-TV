import * as jellyfinApi from './jellyfinApi';
import {getJellyfinDeviceProfile, getDeviceCapabilities} from './deviceProfile';
import {getPlayMethod, getMimeType, findCompatibleAudioStreamIndex, getSupportedAudioCodecs} from './tizenVideo';

export const PlayMethod = {
	DirectPlay: 'DirectPlay',
	DirectStream: 'DirectStream',
	Transcode: 'Transcode'
};

let currentSession = null;
let progressInterval = null;
let healthMonitor = null;

// Cross-server support: get API instance based on item or options
const getApiForItem = (item) => {
	if (item?._serverUrl && item?._serverAccessToken && item?._serverUserId) {
		return jellyfinApi.createApiForServer(item._serverUrl, item._serverAccessToken, item._serverUserId);
	}
	return jellyfinApi.api;
};

// Get server credentials from item or fallback to current
const getServerCredentials = (item) => {
	if (item?._serverUrl && item?._serverAccessToken) {
		return {
			serverUrl: item._serverUrl,
			accessToken: item._serverAccessToken,
			userId: item._serverUserId
		};
	}
	return {
		serverUrl: jellyfinApi.getServerUrl(),
		accessToken: jellyfinApi.getApiKey(),
		userId: jellyfinApi.getUserId?.() || null
	};
};

const selectMediaSource = (mediaSources, capabilities, options) => {
	if (options.mediaSourceId) {
		const source = mediaSources.find(s => s.Id === options.mediaSourceId);
		if (source) return source;
	}

	const supportedAudio = getSupportedAudioCodecs(capabilities);

	const scored = mediaSources.map(source => {
		let score = 0;
		const playMethodResult = getPlayMethod(source, capabilities);

		if (playMethodResult === PlayMethod.DirectPlay) score += 100;
		else if (playMethodResult === PlayMethod.DirectStream) score += 50;

		const videoStream = source.MediaStreams?.find(s => s.Type === 'Video');
		if (videoStream) {
			if (videoStream.Width >= 3840) score += 20;
			else if (videoStream.Width >= 1920) score += 15;
			else if (videoStream.Width >= 1280) score += 10;
		}

		if (videoStream?.VideoRangeType) {
			const rangeType = videoStream.VideoRangeType.toUpperCase();
			if (rangeType.includes('DOLBY') && capabilities.dolbyVision) score += 10;
			else if (rangeType.includes('HDR') && capabilities.hdr10) score += 5;
		}

		// Score based on the best COMPATIBLE audio stream, not just the first one
		const audioStreams = source.MediaStreams?.filter(s => s.Type === 'Audio') || [];
		const compatibleAudio = audioStreams.filter(s => supportedAudio.includes((s.Codec || '').toLowerCase()));
		if (compatibleAudio.length > 0) {
			// Score based on the best compatible track
			const bestAudio = compatibleAudio.reduce((best, s) => {
				let trackScore = 0;
				if (s.Codec === 'eac3') trackScore = 10;
				else if (s.Codec === 'ac3') trackScore = 8;
				else if (s.Channels >= 6) trackScore = 5;
				else trackScore = 3;
				return trackScore > best.score ? {stream: s, score: trackScore} : best;
			}, {stream: null, score: 0});
			score += bestAudio.score;
		}
		// Note: DTS and TrueHD excluded — not supported on Samsung TVs

		return {source, score, playMethod: playMethodResult};
	});

	scored.sort((a, b) => b.score - a.score);
	return scored[0].source;
};

const determinePlayMethod = (mediaSource, capabilities) => {
	if (mediaSource.SupportsDirectPlay) {
		const computed = getPlayMethod(mediaSource, capabilities);
		if (computed === PlayMethod.DirectPlay) {
			return PlayMethod.DirectPlay;
		}
	}

	if (mediaSource.SupportsDirectStream) {
		return PlayMethod.DirectStream;
	}

	return PlayMethod.Transcode;
};

const buildPlaybackUrl = (itemId, mediaSource, playSessionId, playMethod, credentials = null, isAudio = false) => {
	const serverUrl = credentials?.serverUrl || jellyfinApi.getServerUrl();
	const apiKey = credentials?.accessToken || jellyfinApi.getApiKey();
	const streamType = isAudio ? 'Audio' : 'Videos';

	console.log('[playback] buildPlaybackUrl:', {
		itemId,
		mediaSourceId: mediaSource?.Id,
		playSessionId,
		playMethod,
		serverUrl,
		apiKeyType: typeof apiKey,
		apiKeyLength: apiKey?.length,
		isCrossServer: !!credentials,
		isAudio
	});

	if (playMethod === PlayMethod.DirectPlay) {
		const params = new URLSearchParams();
		params.append('Static', 'true');
		params.append('MediaSourceId', mediaSource.Id);
		params.append('api_key', apiKey);
		const url = `${serverUrl}/${streamType}/${itemId}/stream?${params.toString()}`;
		console.log('[playback] DirectPlay URL:', url);
		return url;
	}

	if (playMethod === PlayMethod.DirectStream) {
		if (mediaSource.DirectStreamUrl) {
			const dsUrl = mediaSource.DirectStreamUrl.startsWith('http')
				? mediaSource.DirectStreamUrl
				: `${serverUrl}${mediaSource.DirectStreamUrl}`;
			return dsUrl.includes('api_key') ? dsUrl : `${dsUrl}&api_key=${apiKey}`;
		}
		// Fallback: construct DirectStream URL manually (e.g. for audio)
		const container = mediaSource.Container || '';
		const params = new URLSearchParams();
		params.append('Static', 'true');
		params.append('MediaSourceId', mediaSource.Id);
		params.append('api_key', apiKey);
		const url = `${serverUrl}/${streamType}/${itemId}/stream.${container}?${params.toString()}`;
		console.log('[playback] DirectStream fallback URL:', url);
		return url;
	}

	if (mediaSource.TranscodingUrl) {
		const url = mediaSource.TranscodingUrl.startsWith('http')
			? mediaSource.TranscodingUrl
			: `${serverUrl}${mediaSource.TranscodingUrl}`;
		return url.includes('api_key') ? url : `${url}&api_key=${apiKey}`;
	}

	throw new Error('No playback URL available');
};

const extractAudioStreams = (mediaSource) => {
	if (!mediaSource.MediaStreams) return [];
	return mediaSource.MediaStreams
		.filter(s => s.Type === 'Audio')
		.map(s => ({
			index: s.Index,
			codec: s.Codec,
			language: s.Language || 'Unknown',
			displayTitle: s.DisplayTitle || `${s.Language || 'Unknown'} (${s.Codec})`,
			channels: s.Channels,
			channelLayout: s.ChannelLayout,
			bitRate: s.BitRate,
			sampleRate: s.SampleRate,
			isDefault: s.IsDefault,
			isForced: s.IsForced
		}));
};

const extractSubtitleStreams = (mediaSource, credentials = null) => {
	if (!mediaSource.MediaStreams) return [];
	const serverUrl = credentials?.serverUrl || jellyfinApi.getServerUrl();

	return mediaSource.MediaStreams
		.filter(s => s.Type === 'Subtitle')
		.map(s => {
			const codec = s.Codec?.toLowerCase() || '';
			// Text-based subtitle codecs that can be rendered client-side
			// subrip = srt, webvtt = vtt, sami = smi
			const isTextBased = ['srt', 'subrip', 'vtt', 'webvtt', 'ass', 'ssa', 'sub', 'smi', 'sami', 'mov_text', 'tx3g'].includes(codec);
			const isExternal = s.IsExternal;
			const deliveryMethod = s.DeliveryMethod;

			return {
				index: s.Index,
				codec: s.Codec,
				language: s.Language || 'Unknown',
				displayTitle: s.DisplayTitle || s.Language || 'Unknown',
				isExternal,
				isForced: s.IsForced,
				isDefault: s.IsDefault,
				isTextBased,
				// Native embedded support for SRT to avoid extraction
				isEmbeddedNative: !isExternal && (codec === 'srt' || codec === 'subrip'),
				deliveryMethod,
				deliveryUrl: deliveryMethod === 'External' && s.DeliveryUrl
					? (s.DeliveryUrl.startsWith('http') ? s.DeliveryUrl : `${serverUrl}${s.DeliveryUrl}`)
					: null
			};
		});
};

const extractChapters = (mediaSource) => {
	if (!mediaSource.Chapters) return [];
	return mediaSource.Chapters.map((c, i) => ({
		index: i,
		name: c.Name || `Chapter ${i + 1}`,
		startPositionTicks: c.StartPositionTicks,
		imageTag: c.ImageTag
	}));
};

export const getPlaybackInfo = async (itemId, options = {}) => {
	const deviceProfile = await getJellyfinDeviceProfile();
	const capabilities = await getDeviceCapabilities();

	// Cross-server support: use item's server if available
	const api = options.item ? getApiForItem(options.item) : jellyfinApi.api;
	const creds = options.item ? getServerCredentials(options.item) : null;

	// Auto-select a compatible audio stream if the user hasn't explicitly chosen one.
	// This prevents the server from forcing remux/transcode when the default audio track
	// is unsupported (e.g. DTS primary + AC3 secondary in a 4K remux).
	let audioStreamIndex = options.audioStreamIndex;
	if (audioStreamIndex == null && options.enableDirectPlay !== false) {
		// We'll do a preliminary check after getting playback info and
		// re-request if needed. For now, pass undefined to get the default.
	}

	const playbackInfo = await api.getPlaybackInfo(itemId, {
		DeviceProfile: deviceProfile,
		StartTimeTicks: options.startPositionTicks || 0,
		AutoOpenLiveStream: true,
		EnableDirectPlay: options.enableDirectPlay !== false,
		EnableDirectStream: options.enableDirectStream !== false,
		EnableTranscoding: options.enableTranscoding !== false,
		AudioStreamIndex: audioStreamIndex,
		SubtitleStreamIndex: options.subtitleStreamIndex,
		...(options.maxBitrate ? {MaxStreamingBitrate: options.maxBitrate} : {}),
		MediaSourceId: options.mediaSourceId
	});

	if (!playbackInfo.MediaSources?.length) {
		throw new Error('No playable media source found');
	}

	let mediaSource = selectMediaSource(playbackInfo.MediaSources, capabilities, options);

	// If no explicit audio stream was chosen by the user, check if the default audio
	// track is compatible. If not, auto-select the first compatible one and re-request
	// playback info so the server evaluates DirectPlay against the compatible track.
	if (options.audioStreamIndex == null && mediaSource.DefaultAudioStreamIndex != null) {
		const defaultAudioStream = mediaSource.MediaStreams?.find(
			s => s.Type === 'Audio' && s.Index === mediaSource.DefaultAudioStreamIndex
		);
		const defaultCodec = (defaultAudioStream?.Codec || '').toLowerCase();
		const supportedAudio = getSupportedAudioCodecs(capabilities);

		if (defaultCodec && !supportedAudio.includes(defaultCodec)) {
			const compatibleIndex = findCompatibleAudioStreamIndex(mediaSource, capabilities);
			if (compatibleIndex >= 0) {
				console.log(`[playback] Default audio track ${mediaSource.DefaultAudioStreamIndex} (${defaultCodec}) unsupported, auto-selecting compatible track ${compatibleIndex}`);
				const retryInfo = await api.getPlaybackInfo(itemId, {
					DeviceProfile: deviceProfile,
					StartTimeTicks: options.startPositionTicks || 0,
					AutoOpenLiveStream: true,
					EnableDirectPlay: options.enableDirectPlay !== false,
					EnableDirectStream: options.enableDirectStream !== false,
					EnableTranscoding: options.enableTranscoding !== false,
					AudioStreamIndex: compatibleIndex,
					SubtitleStreamIndex: options.subtitleStreamIndex,
					...(options.maxBitrate ? {MaxStreamingBitrate: options.maxBitrate} : {}),
					MediaSourceId: options.mediaSourceId || mediaSource.Id
				});
				if (retryInfo.MediaSources?.length) {
					mediaSource = selectMediaSource(retryInfo.MediaSources, capabilities, options);
					audioStreamIndex = compatibleIndex;
					console.log(`[playback] Re-requested with audio track ${compatibleIndex}, play method: ${determinePlayMethod(mediaSource, capabilities)}`);
				}
			} else {
				console.warn(`[playback] No compatible audio track found — server will remux/transcode`);
			}
		}
	}

	const playMethod = determinePlayMethod(mediaSource, capabilities);
	const isAudio = options.item?.MediaType === 'Audio' || options.item?.Type === 'Audio';
	const url = buildPlaybackUrl(itemId, mediaSource, playbackInfo.PlaySessionId, playMethod, creds, isAudio);
	const audioStreams = extractAudioStreams(mediaSource);
	const subtitleStreams = extractSubtitleStreams(mediaSource, creds);
	const chapters = extractChapters(mediaSource);

	currentSession = {
		itemId,
		playSessionId: playbackInfo.PlaySessionId,
		mediaSourceId: mediaSource.Id,
		mediaSource,
		playMethod,
		startPositionTicks: options.startPositionTicks || 0,
		capabilities,
		audioStreamIndex: audioStreamIndex ?? options.audioStreamIndex ?? mediaSource.DefaultAudioStreamIndex,
		subtitleStreamIndex: options.subtitleStreamIndex ?? mediaSource.DefaultSubtitleStreamIndex,
		maxBitrate: options.maxBitrate,
		// Cross-server support: store server credentials for progress reporting
		serverCredentials: creds
	};

	console.log(`[playback] Playing ${itemId} via ${playMethod}`);

	let mimeType;
	if (playMethod === PlayMethod.Transcode) {
		if (url.includes('/master.m3u8') || url.includes('TranscodingProtocol=hls')) {
			mimeType = 'application/x-mpegURL';
		} else if (url.includes('.ts') || mediaSource.TranscodingContainer === 'ts') {
			mimeType = 'video/mp2t';
		} else if (isAudio) {
			mimeType = getMimeType(mediaSource.TranscodingContainer || 'mp3');
		} else {
			mimeType = 'video/mp4';
		}
	} else {
		mimeType = getMimeType(mediaSource.Container);
	}

	return {
		url,
		playSessionId: playbackInfo.PlaySessionId,
		mediaSourceId: mediaSource.Id,
		mediaSource,
		playMethod,
		mimeType,
		isAudio,
		runTimeTicks: mediaSource.RunTimeTicks,
		audioStreams,
		subtitleStreams,
		chapters,
		defaultAudioStreamIndex: mediaSource.DefaultAudioStreamIndex,
		defaultSubtitleStreamIndex: mediaSource.DefaultSubtitleStreamIndex
	};
};

export const getSubtitleUrl = (subtitleStream) => {
	if (!subtitleStream || !currentSession) return null;

	// Request WebVTT for any text-based subtitle. Server extracts and converts as needed
	if (subtitleStream.isTextBased) {
		const {itemId, mediaSourceId, serverCredentials} = currentSession;
		const serverUrl = serverCredentials?.serverUrl || jellyfinApi.getServerUrl();
		const apiKey = serverCredentials?.accessToken || jellyfinApi.getApiKey();
		return `${serverUrl}/Videos/${itemId}/${mediaSourceId}/Subtitles/${subtitleStream.index}/Stream.vtt?api_key=${apiKey}`;
	}

	return null;
};

/**
 * Fetch subtitle track events as JSON data for custom rendering.
 * Jellyfin extracts the subtitle track from the container and returns it
 * as JSON with TrackEvents array containing StartPositionTicks,
 * EndPositionTicks, and Text for each subtitle cue.
 */
export const fetchSubtitleData = async (subtitleStream) => {
	if (!subtitleStream || !currentSession) return null;

	const {itemId, mediaSourceId, serverCredentials} = currentSession;
	const serverUrl = serverCredentials?.serverUrl || jellyfinApi.getServerUrl();
	const apiKey = serverCredentials?.accessToken || jellyfinApi.getApiKey();

	if (!subtitleStream.isTextBased) {
		console.log('[Playback] Subtitle stream is not text-based, cannot fetch as JSON');
		return null;
	}

	// Jellyfin returns JSON when requesting .js format instead of .vtt
	const url = `${serverUrl}/Videos/${itemId}/${mediaSourceId}/Subtitles/${subtitleStream.index}/Stream.js?api_key=${apiKey}`;

	try {
		console.log('[Playback] Fetching subtitle data from:', url);
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to fetch subtitles: ${response.status}`);
		}
		const data = await response.json();
		console.log(`[Playback] Loaded ${data?.TrackEvents?.length || 0} subtitle events`);
		return data;
	} catch (err) {
		console.error('[Playback] Failed to fetch subtitle data:', err);
		return null;
	}
};

export const getChapterImageUrl = (itemId, chapterIndex, width = 320) => {
	const serverUrl = jellyfinApi.getServerUrl();
	const apiKey = jellyfinApi.getApiKey();
	return `${serverUrl}/Items/${itemId}/Images/Chapter/${chapterIndex}?maxWidth=${width}&api_key=${apiKey}`;
};

export const getTrickplayInfo = async (itemId) => {
	try {
		const serverUrl = jellyfinApi.getServerUrl();
		const apiKey = jellyfinApi.getApiKey();
		const response = await fetch(`${serverUrl}/Videos/${itemId}/Trickplay?api_key=${apiKey}`);
		if (response.ok) {
			return response.json();
		}
	} catch (e) { void e; }
	return null;
};

export const getMediaSegments = async (itemId) => {
	const segments = {
		introStart: null,
		introEnd: null,
		creditsStart: null
	};

	// Try the Media Segments API first
	try {
		const serverUrl = jellyfinApi.getServerUrl();
		const apiKey = jellyfinApi.getApiKey();
		const response = await fetch(`${serverUrl}/MediaSegments/${itemId}?api_key=${apiKey}`);
		if (response.ok) {
			const data = await response.json();
			if (data.Items && data.Items.length > 0) {
				for (const seg of data.Items) {
					const type = seg.Type?.toLowerCase();
					if (type === 'intro') {
						segments.introStart = seg.StartTicks;
						segments.introEnd = seg.EndTicks;
					} else if (type === 'outro' || type === 'credits') {
						segments.creditsStart = seg.StartTicks;
					}
				}
				if (segments.introStart !== null || segments.creditsStart !== null) {
					return segments;
				}
			}
		}
	} catch (e) {
		console.warn('[Playback] Media Segments API not available, falling back to chapters:', e.message);
	}

	// Fallback: check chapter markers
	try {
		const item = await jellyfinApi.api.getItem(itemId);

		if (item.Chapters) {
			const introIndex = item.Chapters.findIndex(c =>
				c.MarkerType === 'IntroStart' ||
				c.Name?.toLowerCase().includes('intro')
			);
			if (introIndex >= 0) {
				segments.introStart = item.Chapters[introIndex].StartPositionTicks;
				if (introIndex + 1 < item.Chapters.length) {
					segments.introEnd = item.Chapters[introIndex + 1].StartPositionTicks;
				} else {
					segments.introEnd = segments.introStart + 1200000000; // 2 minutes
				}
			}

			const creditsChapter = item.Chapters.find(c =>
				c.MarkerType === 'Credits' ||
				c.Name?.toLowerCase().includes('credit')
			);
			if (creditsChapter) {
				segments.creditsStart = creditsChapter.StartPositionTicks;
			}
		}
	} catch (e) {
		console.warn('[Playback] Failed to fetch chapters for segments:', e.message);
	}

	return segments;
};

export const getNextEpisode = async (item) => {
	if (item.Type !== 'Episode' || !item.SeriesId) return null;
	try {
		const result = await jellyfinApi.api.getNextEpisode(item.SeriesId, item.Id);
		return result.Items?.[0] || null;
	} catch (e) {
		return null;
	}
};

export const changeAudioStream = async (streamIndex, currentPositionTicks) => {
	if (!currentSession) return null;

	const newInfo = await getPlaybackInfo(currentSession.itemId, {
		...currentSession,
		audioStreamIndex: streamIndex,
		startPositionTicks: currentPositionTicks ?? currentSession.startPositionTicks
	});

	return newInfo;
};

export const changeSubtitleStream = async (streamIndex) => {
	if (!currentSession) return null;

	const newInfo = await getPlaybackInfo(currentSession.itemId, {
		...currentSession,
		subtitleStreamIndex: streamIndex
	});

	return newInfo;
};

export const reportStart = async (positionTicks = 0) => {
	if (!currentSession) return;

	try {
		await jellyfinApi.api.reportPlaybackStart({
			ItemId: currentSession.itemId,
			PlaySessionId: currentSession.playSessionId,
			MediaSourceId: currentSession.mediaSourceId,
			PositionTicks: positionTicks,
			CanSeek: true,
			IsPaused: false,
			IsMuted: false,
			PlayMethod: currentSession.playMethod,
			RepeatMode: 'RepeatNone'
		});
	} catch (e) {
		console.warn('[playback] Failed to report start:', e.message);
	}
};

export const reportProgress = async (positionTicks, options = {}) => {
	if (!currentSession) return;

	try {
		// Use session's server credentials for cross-server support
		const api = currentSession.serverCredentials
			? jellyfinApi.createApiForServer(
				currentSession.serverCredentials.serverUrl,
				currentSession.serverCredentials.accessToken,
				currentSession.serverCredentials.userId
			)
			: jellyfinApi.api;

		await api.reportPlaybackProgress({
			ItemId: currentSession.itemId,
			PlaySessionId: currentSession.playSessionId,
			MediaSourceId: currentSession.mediaSourceId,
			PositionTicks: positionTicks,
			CanSeek: true,
			IsPaused: options.isPaused || false,
			IsMuted: options.isMuted || false,
			PlayMethod: currentSession.playMethod,
			AudioStreamIndex: currentSession.audioStreamIndex,
			SubtitleStreamIndex: currentSession.subtitleStreamIndex
		});
	} catch (e) { void e; }
};

export const stopProgressReporting = () => {
	if (progressInterval) {
		clearInterval(progressInterval);
		progressInterval = null;
	}
};

export const stopHealthMonitoring = () => {
	if (healthMonitor) {
		clearInterval(healthMonitor);
		healthMonitor = null;
	}
};

export const reportStop = async (positionTicks) => {
	if (!currentSession) return;

	stopProgressReporting();
	stopHealthMonitoring();

	try {
		// Use session's server credentials for cross-server support
		const api = currentSession.serverCredentials
			? jellyfinApi.createApiForServer(
				currentSession.serverCredentials.serverUrl,
				currentSession.serverCredentials.accessToken,
				currentSession.serverCredentials.userId
			)
			: jellyfinApi.api;

		await api.reportPlaybackStopped({
			ItemId: currentSession.itemId,
			PlaySessionId: currentSession.playSessionId,
			MediaSourceId: currentSession.mediaSourceId,
			PositionTicks: positionTicks
		});
	} catch (e) {
		console.warn('[playback] Failed to report stop:', e.message);
	}

	currentSession = null;
};

export const startProgressReporting = (getPositionTicks, intervalMs = 10000) => {
	stopProgressReporting();

	progressInterval = setInterval(async () => {
		const ticks = getPositionTicks();
		if (ticks !== null && ticks !== undefined) {
			await reportProgress(ticks);
		}
	}, intervalMs);
};

class PlaybackHealthMonitor {
	constructor() {
		this.stallCount = 0;
		this.bufferEvents = [];
		this.lastProgressTime = Date.now();
		this.startTime = Date.now();
		this.isHealthy = true;
		this.hasFiredCallback = false;
	}

	// Grace period: ignore health checks for the first 20 seconds of playback
	_isInGracePeriod() {
		return Date.now() - this.startTime < 20000;
	}

	recordBuffer() {
		this.bufferEvents.push(Date.now());
		const cutoff = Date.now() - 30000;
		this.bufferEvents = this.bufferEvents.filter(t => t > cutoff);

		// Require >10 buffer events in 30s window and not in grace period
		if (this.bufferEvents.length > 10 && !this._isInGracePeriod()) {
			this.isHealthy = false;
		}
	}

	recordStall() {
		if (this._isInGracePeriod()) return;
		this.stallCount++;
		if (this.stallCount > 5) {
			this.isHealthy = false;
		}
	}

	recordProgress() {
		this.lastProgressTime = Date.now();
		// Allow recovery: if we're making progress, we're healthy again
		if (!this.isHealthy) {
			this.isHealthy = true;
			this.stallCount = 0;
			this.hasFiredCallback = false;
			console.log('[HealthMonitor] Playback recovered, marking healthy');
		}
	}

	checkHealth() {
		// Don't flag unhealthy during grace period
		if (this._isInGracePeriod()) return true;

		if (Date.now() - this.lastProgressTime > 30000) {
			this.isHealthy = false;
		}
		return this.isHealthy;
	}

	reset() {
		this.stallCount = 0;
		this.bufferEvents = [];
		this.lastProgressTime = Date.now();
		this.startTime = Date.now();
		this.isHealthy = true;
		this.hasFiredCallback = false;
	}

	shouldFallbackToTranscode() {
		// Only fire the callback once per unhealthy period
		if (this.hasFiredCallback) return false;
		const shouldFallback = !this.isHealthy && currentSession?.playMethod !== PlayMethod.Transcode;
		if (shouldFallback) {
			this.hasFiredCallback = true;
		}
		return shouldFallback;
	}
}

let healthMonitorInstance = null;

export const getHealthMonitor = () => {
	if (!healthMonitorInstance) {
		healthMonitorInstance = new PlaybackHealthMonitor();
	}
	return healthMonitorInstance;
};

export const startHealthMonitoring = (onUnhealthy) => {
	stopHealthMonitoring();

	const monitor = getHealthMonitor();
	monitor.reset();

	healthMonitor = setInterval(() => {
		if (!monitor.checkHealth()) {
			if (onUnhealthy && monitor.shouldFallbackToTranscode()) {
				onUnhealthy();
			}
		}
	}, 5000);
};

export const getCurrentSession = () => currentSession;

export const isDirectPlay = () => currentSession?.playMethod === PlayMethod.DirectPlay;

export const getPlaybackUrl = async (itemId, startPositionTicks = 0, options = {}) => {
	return getPlaybackInfo(itemId, {...options, startPositionTicks});
};

export const getIntroMarkers = getMediaSegments;

export default {
	PlayMethod,
	getPlaybackInfo,
	getPlaybackUrl,
	getSubtitleUrl,
	fetchSubtitleData,
	getChapterImageUrl,
	getTrickplayInfo,
	getMediaSegments,
	getIntroMarkers,
	getNextEpisode,
	changeAudioStream,
	changeSubtitleStream,
	reportStart,
	reportProgress,
	reportStop,
	startProgressReporting,
	stopProgressReporting,
	getHealthMonitor,
	startHealthMonitoring,
	stopHealthMonitoring,
	getCurrentSession,
	isDirectPlay
};
