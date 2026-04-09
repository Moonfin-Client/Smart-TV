import * as jellyfinApi from './jellyfinApi';
import {getJellyfinDeviceProfile, getDeviceCapabilities} from './deviceProfile';
import {getPlayMethod, getMimeType, findCompatibleAudioStreamIndex, getSupportedAudioCodecs} from './video';

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

// Get server credentials from item (only for cross-server items)
const getServerCredentials = (item) => {
	if (item?._serverUrl && item?._serverAccessToken) {
		return {
			serverUrl: item._serverUrl,
			accessToken: item._serverAccessToken,
			userId: item._serverUserId
		};
	}
	return null;
};

const selectMediaSource = (mediaSources, capabilities, options) => {
	if (options.mediaSourceId) {
		const source = mediaSources.find(s => s.Id === options.mediaSourceId);
		if (source) return source;
	}

	const scored = mediaSources.map(source => {
		let score = 0;
		const playMethodResult = getPlayMethod(source, capabilities);

		if (playMethodResult === PlayMethod.DirectPlay) score += 1000;
		else if (playMethodResult === PlayMethod.DirectStream) score += 500;

		if (source.SupportsDirectPlay) score += 200;
		if (source.SupportsDirectStream) score += 100;

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
		const sourceAudioStreams = source.MediaStreams?.filter(s => s.Type === 'Audio') || [];
		const sourceContainer = (source.Container || '').toLowerCase();
		const supportedAudio = getSupportedAudioCodecs(capabilities, sourceContainer);
		const compatibleAudio = sourceAudioStreams.filter(s => supportedAudio.includes((s.Codec || '').toLowerCase()));
		if (compatibleAudio.length > 0) {
			const bestAudio = compatibleAudio.reduce((best, s) => {
				let trackScore = 0;
				if (s.Codec === 'truehd' && capabilities.truehd) trackScore = 15;
				else if (s.Codec === 'eac3') trackScore = 10;
				else if (s.Codec === 'ac3') trackScore = 8;
				else if (s.Channels >= 6) trackScore = 5;
				else trackScore = 3;
				return trackScore > best.score ? {stream: s, score: trackScore} : best;
			}, {stream: null, score: 0});
			score += bestAudio.score;
		} else if (sourceAudioStreams.length > 0) {
			// No compatible audio streams at all — penalize
			score -= 10;
		}

		console.log('[playback] Media source scored:', {
			id: source.Id,
			container: source.Container,
			score,
			playMethod: playMethodResult,
			serverDirectPlay: source.SupportsDirectPlay,
			serverDirectStream: source.SupportsDirectStream
		});

		return {source, score, playMethod: playMethodResult};
	});

	scored.sort((a, b) => b.score - a.score);
	console.log('[playback] Selected media source:', scored[0].source.Id, 'with score:', scored[0].score);
	return scored[0].source;
};

const determinePlayMethod = (mediaSource, capabilities, options = {}) => {
	if (options.forceDirectPlay) {
		console.log('[playback] Force DirectPlay — bypassing all checks, server SupportsDirectPlay:', mediaSource.SupportsDirectPlay);
		return PlayMethod.DirectPlay;
	}

	const mediaStreams = mediaSource?.MediaStreams || [];
	const hasVideoStream = mediaStreams.some((s) => s.Type === 'Video');
	const hasAudioStream = mediaStreams.some((s) => s.Type === 'Audio');
	const isAudioOnly = hasAudioStream && !hasVideoStream;
	if (isAudioOnly) {
		if (mediaSource.SupportsDirectPlay) return PlayMethod.DirectPlay;
		if (mediaSource.SupportsDirectStream) return PlayMethod.DirectStream;
		return PlayMethod.Transcode;
	}

	// First check what our client-side capability check says
	const computedMethod = getPlayMethod(mediaSource, capabilities);
	console.log('[playback] determinePlayMethod - computed:', computedMethod,
		'serverDirectPlay:', mediaSource.SupportsDirectPlay,
		'serverDirectStream:', mediaSource.SupportsDirectStream,
		'hasTranscodingUrl:', !!mediaSource.TranscodingUrl);

	// If client says we need transcode, we MUST transcode
	// Don't fall back to DirectStream if audio/video isn't compatible
	if (computedMethod === PlayMethod.Transcode) {
		return PlayMethod.Transcode;
	}

	// Client says DirectPlay is OK
	if (computedMethod === PlayMethod.DirectPlay && mediaSource.SupportsDirectPlay) {
		return PlayMethod.DirectPlay;
	}

	// Client says DirectStream is OK
	if (computedMethod === PlayMethod.DirectStream && mediaSource.SupportsDirectStream) {
		return PlayMethod.DirectStream;
	}

	// Fallback
	if (mediaSource.SupportsDirectStream) {
		return PlayMethod.DirectStream;
	}

	return PlayMethod.Transcode;
};

const buildPlaybackUrl = (itemId, mediaSource, playSessionId, playMethod, credentials = null, isAudio = false) => {
	const serverUrl = credentials?.serverUrl || jellyfinApi.getServerUrl();
	const apiKey = credentials?.accessToken || jellyfinApi.getApiKey();
	const deviceId = jellyfinApi.getDeviceId();
	const container = (mediaSource.Container || '').toLowerCase();
	const streamType = isAudio ? 'Audio' : 'Videos';

	console.log('[playback] buildPlaybackUrl:', {
		itemId,
		mediaSourceId: mediaSource?.Id,
		playSessionId,
		playMethod,
		container,
		serverUrl,
		apiKeyType: typeof apiKey,
		apiKeyLength: apiKey?.length,
		isCrossServer: !!credentials,
		isAudio
	});

	if (playMethod === PlayMethod.DirectPlay) {
		// Build query string manually for Chromium 47 compat (no URLSearchParams)
		const queryParts = [
			'Static=true',
			'mediaSourceId=' + encodeURIComponent(mediaSource.Id),
			'deviceId=' + encodeURIComponent(deviceId),
			'api_key=' + encodeURIComponent(apiKey)
		];
		// Include ETag if available
		if (mediaSource.ETag) {
			queryParts.push('Tag=' + encodeURIComponent(mediaSource.ETag));
		}
		// Include LiveStreamId if available
		if (mediaSource.LiveStreamId) {
			queryParts.push('LiveStreamId=' + encodeURIComponent(mediaSource.LiveStreamId));
		}
		// Include container extension for proper MIME type detection
		const url = `${serverUrl}/${streamType}/${itemId}/stream.${container}?${queryParts.join('&')}`;
		console.log('[playback] DirectPlay URL:', url);
		return url;
	}

	if (playMethod === PlayMethod.DirectStream) {
		if (mediaSource.DirectStreamUrl) {
			const url = mediaSource.DirectStreamUrl.startsWith('http')
				? mediaSource.DirectStreamUrl
				: `${serverUrl}${mediaSource.DirectStreamUrl}`;
			return url.includes('api_key') ? url : `${url}&api_key=${apiKey}`;
		}
	}

	if (mediaSource.TranscodingUrl) {
		let transcodeUrl = mediaSource.TranscodingUrl;

		// Clean up any malformed query string (e.g., ?& or &&)
		transcodeUrl = transcodeUrl.replace(/\?&/g, '?').replace(/&&/g, '&');

		const url = transcodeUrl.startsWith('http')
			? transcodeUrl
			: `${serverUrl}${transcodeUrl}`;
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

const extractSubtitleStreams = (mediaSource) => {
	if (!mediaSource.MediaStreams) return [];
	const serverUrl = jellyfinApi.getServerUrl();

	return mediaSource.MediaStreams
		.filter(s => s.Type === 'Subtitle')
		.map(s => {
			let deliveryUrl = null;
			if (s.DeliveryUrl) {
				// External URLs are used as-is, internal URLs need server prefix
				deliveryUrl = s.IsExternalUrl ? s.DeliveryUrl : `${serverUrl}${s.DeliveryUrl}`;
			}
			return {
				index: s.Index,
				codec: s.Codec,
				language: s.Language || 'Unknown',
				displayTitle: s.DisplayTitle || s.Language || 'Unknown',
				isExternal: s.IsExternal,
				isForced: s.IsForced,
				isDefault: s.IsDefault,
				isTextBased: ['srt', 'subrip', 'vtt', 'webvtt', 'ass', 'ssa', 'sub', 'smi', 'sami'].includes(s.Codec?.toLowerCase()),
				isAss: ['ass', 'ssa'].includes(s.Codec?.toLowerCase()),
				isImageBased: ['pgssub', 'hdmv_pgs', 'pgs', 'dvdsub', 'dvbsub', 'dvb_subtitle'].includes(s.Codec?.toLowerCase()),
				deliveryUrl: deliveryUrl,
				deliveryMethod: s.DeliveryMethod
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

// Derive max streaming bitrate from device capabilities
// Per LG AV format docs: 8K=100Mbps, UHD=60Mbps, FHD=40Mbps
const getAutoMaxBitrate = (capabilities) => {
	if (capabilities.uhd8K) return 100_000_000;
	if (capabilities.uhd) return 60_000_000;
	return 40_000_000;
};

export const getPlaybackInfo = async (itemId, options = {}) => {
	const deviceProfile = options.deviceProfile || await getJellyfinDeviceProfile();
	const capabilities = await getDeviceCapabilities();

	// Cross-server: use item's server if available
	const api = options.item ? getApiForItem(options.item) : jellyfinApi.api;
	const creds = options.item ? getServerCredentials(options.item) : null;

	const isLiveTV = options.isLiveTV || options.item?.Type === 'TvChannel';

	// maxBitrate: user-set value (>0), or auto-detect from device capabilities
	const maxBitrate = options.maxBitrate > 0 ? options.maxBitrate : getAutoMaxBitrate(capabilities);

	const requestedStartTime = isLiveTV ? 0 : (options.startPositionTicks || 0);
	const subtitleStreamIndex = options.subtitleStreamIndex != null ? options.subtitleStreamIndex : -1;
	console.log('[playback] getPlaybackInfo called:', {
		itemId,
		isLiveTV,
		startPositionTicks: requestedStartTime,
		maxBitrate,
		subtitleStreamIndex,
		enableDirectPlay: options.enableDirectPlay !== false,
		enableTranscoding: options.enableTranscoding !== false
	});

	const subProfiles = deviceProfile.SubtitleProfiles;
	if (subProfiles) {
		console.log('[playback] SubtitleProfiles sent to server:', subProfiles.map(p => p.Format + ':' + p.Method).join(', '));
	}

	let playbackInfo = await api.getPlaybackInfo(itemId, {
		DeviceProfile: deviceProfile,
		StartTimeTicks: requestedStartTime,
		AutoOpenLiveStream: true,
		EnableDirectPlay: options.enableDirectPlay !== false,
		EnableDirectStream: options.enableDirectStream !== false,
		EnableTranscoding: options.enableTranscoding !== false,
		AudioStreamIndex: options.audioStreamIndex,
		SubtitleStreamIndex: subtitleStreamIndex,
		MaxStreamingBitrate: maxBitrate,
		MediaSourceId: options.mediaSourceId
	});

	if (!playbackInfo.MediaSources?.length) {
		throw new Error('No playable media source found');
	}

	const firstSource = playbackInfo.MediaSources[0];
	console.log('[playback] Server response - MediaSource[0]:', {
		supportsDirectPlay: firstSource.SupportsDirectPlay,
		supportsDirectStream: firstSource.SupportsDirectStream,
		container: firstSource.Container,
		transcodingUrl: firstSource.TranscodingUrl ? firstSource.TranscodingUrl.substring(0, 200) : 'none',
		defaultSubtitleStreamIndex: firstSource.DefaultSubtitleStreamIndex,
		subtitleStreams: (firstSource.MediaStreams || [])
			.filter(s => s.Type === 'Subtitle')
			.map(s => ({idx: s.Index, codec: s.Codec, isDefault: s.IsDefault, isExternal: s.IsExternal, deliveryMethod: s.DeliveryMethod}))
	});

	// Live TV: skip VOD media source selection and codec negotiation
	if (isLiveTV) {
		const mediaSource = firstSource;
		const playMethod = mediaSource.TranscodingUrl
			? PlayMethod.Transcode
			: (mediaSource.SupportsDirectPlay ? PlayMethod.DirectPlay : PlayMethod.DirectStream);
		const url = buildPlaybackUrl(itemId, mediaSource, playbackInfo.PlaySessionId, playMethod, creds, false);
		const audioStreams = extractAudioStreams(mediaSource);
		const subtitleStreams = extractSubtitleStreams(mediaSource);

		currentSession = {
			itemId,
			playSessionId: playbackInfo.PlaySessionId,
			mediaSourceId: mediaSource.Id,
			mediaSource,
			playMethod,
			startPositionTicks: 0,
			capabilities,
			audioStreamIndex: mediaSource.DefaultAudioStreamIndex,
			subtitleStreamIndex,
			maxBitrate: options.maxBitrate,
			serverCredentials: creds
		};

		console.log(`[playback] Live TV: ${itemId} via ${playMethod}`);

		let mimeType;
		if (playMethod === PlayMethod.Transcode) {
			if (url.includes('/master.m3u8') || url.includes('TranscodingProtocol=hls')) {
				mimeType = 'application/x-mpegURL';
			} else if (url.includes('.ts') || mediaSource.TranscodingContainer === 'ts') {
				mimeType = 'video/mp2t';
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
			isAudio: false,
			isLiveTV: true,
			runTimeTicks: 0,
			audioStreams,
			subtitleStreams,
			chapters: [],
			defaultAudioStreamIndex: mediaSource.DefaultAudioStreamIndex,
			selectedAudioStreamIndex: mediaSource.DefaultAudioStreamIndex,
			defaultSubtitleStreamIndex: mediaSource.DefaultSubtitleStreamIndex,
			startPositionTicks: 0
		};
	}

	let mediaSource = selectMediaSource(playbackInfo.MediaSources, capabilities, options);

	// Auto-select a compatible audio stream to avoid unnecessary transcoding
	let audioStreamIndex = options.audioStreamIndex;
	if (audioStreamIndex == null && mediaSource.DefaultAudioStreamIndex != null) {
		const defaultAudioStream = mediaSource.MediaStreams?.find(
			s => s.Type === 'Audio' && s.Index === mediaSource.DefaultAudioStreamIndex
		);
		const defaultCodec = (defaultAudioStream?.Codec || '').toLowerCase();
		const sourceContainer = (mediaSource.Container || '').toLowerCase();
		const supportedAudio = getSupportedAudioCodecs(capabilities, sourceContainer);

		if (defaultCodec && !supportedAudio.includes(defaultCodec)) {
			const compatibleIndex = findCompatibleAudioStreamIndex(mediaSource, capabilities);
			if (compatibleIndex >= 0) {
				console.log(`[playback] Default audio track ${mediaSource.DefaultAudioStreamIndex} (${defaultCodec}) unsupported, auto-selecting compatible track ${compatibleIndex}`);
				// Re-request playback info with the compatible audio stream so the server
				// evaluates DirectPlay/DirectStream against the compatible track
				const retryInfo = await api.getPlaybackInfo(itemId, {
					DeviceProfile: deviceProfile,
					StartTimeTicks: requestedStartTime,
					AutoOpenLiveStream: true,
					EnableDirectPlay: options.enableDirectPlay !== false,
					EnableDirectStream: options.enableDirectStream !== false,
					EnableTranscoding: options.enableTranscoding !== false,
					AudioStreamIndex: compatibleIndex,
					SubtitleStreamIndex: subtitleStreamIndex,
					MaxStreamingBitrate: maxBitrate,
					MediaSourceId: options.mediaSourceId || mediaSource.Id
				});
				if (retryInfo.MediaSources?.length) {
					mediaSource = selectMediaSource(retryInfo.MediaSources, capabilities, options);
					audioStreamIndex = compatibleIndex;
					playbackInfo = retryInfo;
					console.log(`[playback] Re-requested with audio track ${compatibleIndex}, play method: ${determinePlayMethod(mediaSource, capabilities)}`);
				}
			} else {
				console.warn('[playback] No compatible audio track found \u2014 server will remux/transcode');
			}
		}
	}

	let playMethod = determinePlayMethod(mediaSource, capabilities, options);

	// Log video stream info including HDR type
	const videoStream = mediaSource.MediaStreams?.find(s => s.Type === 'Video');
	console.log('[playback] Video stream info:', {
		codec: videoStream?.Codec,
		profile: videoStream?.Profile,
		level: videoStream?.Level,
		width: videoStream?.Width,
		height: videoStream?.Height,
		videoRangeType: videoStream?.VideoRangeType,
		colorPrimaries: videoStream?.ColorPrimaries,
		colorTransfer: videoStream?.ColorTransfer,
		colorSpace: videoStream?.ColorSpace,
		bitDepth: videoStream?.BitDepth
	});
	console.log('[playback] HDR capabilities:', {
		hdr10: capabilities.hdr10,
		hlg: capabilities.hlg,
		dolbyVision: capabilities.dolbyVision
	});

	// If we determined we need transcoding but server didn't provide a TranscodingUrl,
	// re-request with DirectPlay/DirectStream disabled to force transcoding
	if (playMethod === PlayMethod.Transcode && !mediaSource.TranscodingUrl) {
		console.log('[playback] Need transcode but no TranscodingUrl - re-requesting with transcoding forced');
		playbackInfo = await api.getPlaybackInfo(itemId, {
			DeviceProfile: deviceProfile,
			StartTimeTicks: requestedStartTime,
			AutoOpenLiveStream: true,
			EnableDirectPlay: false,
			EnableDirectStream: false,
			EnableTranscoding: true,
			AudioStreamIndex: audioStreamIndex,
			SubtitleStreamIndex: subtitleStreamIndex,
			MaxStreamingBitrate: maxBitrate,
			MediaSourceId: options.mediaSourceId
		});

		if (!playbackInfo.MediaSources?.length) {
			throw new Error('No playable media source found after forcing transcode');
		}

		mediaSource = playbackInfo.MediaSources[0];
		playMethod = PlayMethod.Transcode;
		console.log('[playback] After forcing transcode - TranscodingUrl:', mediaSource.TranscodingUrl ? 'present' : 'none');
	}

	const itemAudio = options.item?.MediaType === 'Audio' || options.item?.Type === 'Audio';
	const hasVideoStream = (mediaSource.MediaStreams || []).some((s) => s.Type === 'Video');
	const hasAudioStream = (mediaSource.MediaStreams || []).some((s) => s.Type === 'Audio');
	const streamInferredAudio = hasAudioStream && !hasVideoStream;
	const isAudio = itemAudio || streamInferredAudio;
	const url = buildPlaybackUrl(itemId, mediaSource, playbackInfo.PlaySessionId, playMethod, creds, isAudio);

	const audioStreams = extractAudioStreams(mediaSource);
	const subtitleStreams = extractSubtitleStreams(mediaSource);
	const chapters = extractChapters(mediaSource);

	currentSession = {
		itemId,
		playSessionId: playbackInfo.PlaySessionId,
		mediaSourceId: mediaSource.Id,
		mediaSource,
		playMethod,
		startPositionTicks: options.startPositionTicks || 0,
		capabilities,
		audioStreamIndex: audioStreamIndex ?? mediaSource.DefaultAudioStreamIndex,
		subtitleStreamIndex: subtitleStreamIndex,
		maxBitrate: options.maxBitrate,
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

	// Starfish needs a DV codec hint in the MIME type to activate the DV decoder
	if (playMethod !== PlayMethod.Transcode && !isAudio && videoStream?.VideoRangeType) {
		const rangeType = videoStream.VideoRangeType.toUpperCase();
		if (rangeType.includes('DOVI')) {
			const streamCodec = (videoStream.Codec || '').toLowerCase();
			let dvCodec;
			if (streamCodec === 'dvhe') {
				dvCodec = 'dvhe.05';
			} else if (streamCodec === 'dvh1') {
				dvCodec = 'dvh1.08';
			} else {
				dvCodec = rangeType === 'DOVI' ? 'dvhe.05' : 'dvh1.08';
			}
			mimeType = mimeType + '; codecs="' + dvCodec + '"';
		}
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
		selectedAudioStreamIndex: audioStreamIndex ?? mediaSource.DefaultAudioStreamIndex,
		defaultSubtitleStreamIndex: mediaSource.DefaultSubtitleStreamIndex,
		startPositionTicks: requestedStartTime
	};
};

export const getPlaybackInfoWithFallback = async (itemId, options = {}) => {
	try {
		return await getPlaybackInfo(itemId, options);
	} catch (error) {
		console.warn('[playback] Primary playback failed, trying fallback:', error.message);

		return await getPlaybackInfo(itemId, {
			...options,
			enableDirectPlay: false,
			enableDirectStream: false
		});
	}
};

export const getSubtitleUrl = (subtitleStream) => {
	if (!subtitleStream || !currentSession) return null;

	const {itemId, mediaSourceId, serverCredentials} = currentSession;
	const serverUrl = serverCredentials?.serverUrl || jellyfinApi.getServerUrl();
	const apiKey = serverCredentials?.accessToken || jellyfinApi.getApiKey();

	// Request WebVTT for any text-based subtitle - server converts ASS/SSA/SRT as needed
	if (subtitleStream.isTextBased) {
		return `${serverUrl}/Videos/${itemId}/${mediaSourceId}/Subtitles/${subtitleStream.index}/Stream.vtt?api_key=${apiKey}`;
	}

	return null;
};

// Raw ASS/SSA subtitle URL that preserves styling (vs getSubtitleUrl which converts to VTT)
export const getAssSubtitleUrl = (subtitleStream) => {
	if (!subtitleStream?.isAss || !currentSession) return null;

	const {itemId, mediaSourceId, serverCredentials} = currentSession;
	const serverUrl = serverCredentials?.serverUrl || jellyfinApi.getServerUrl();
	const apiKey = serverCredentials?.accessToken || jellyfinApi.getApiKey();

	return `${serverUrl}/Videos/${itemId}/${mediaSourceId}/Subtitles/${subtitleStream.index}/Stream.ass?api_key=${apiKey}`;
};

/**
 * Fetch subtitle track events as JSON data for custom rendering
 * This is required on webOS because native <track> elements don't work reliably
 * The .js format returns JSON with TrackEvents array containing StartPositionTicks, EndPositionTicks, Text
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
		console.log(`[Playback] Loaded ${data.TrackEvents?.length || 0} subtitle events`);
		return data;
	} catch (err) {
		console.error('[Playback] Failed to fetch subtitle data:', err);
		return null;
	}
};

const mapChapters = (chapters) => chapters.map((c, i) => ({
	index: i,
	name: c.Name || `Chapter ${i + 1}`,
	startPositionTicks: c.StartPositionTicks,
	imageTag: c.ImageTag
}));

/**
 * Fetch chapters for an item. Chapters live on the Item object, not MediaSource.
 */
export const fetchItemChapters = async (itemId, item) => {
	if (item?.Chapters?.length > 0) {
		return mapChapters(item.Chapters);
	}
	try {
		const api = item ? getApiForItem(item) : jellyfinApi.api;
		const fullItem = await api.getItem(itemId);
		if (fullItem?.Chapters?.length > 0) {
			return mapChapters(fullItem.Chapters);
		}
	} catch (e) {
		console.warn('[playback] Failed to fetch item chapters:', e.message);
	}
	return [];
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

	// Try the Media Segments API first (uses authenticated request)
	try {
		const data = await jellyfinApi.api.getMediaSegments(itemId);
		if (data?.Items && data.Items.length > 0) {
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
				console.log('[Playback] Media segments found:', segments);
				return segments;
			}
		}
	} catch (e) {
		console.warn('[Playback] Media Segments API not available, falling back to chapters:', e.message);
	}

	// Fallback: check chapter markers
	try {
		const item = await jellyfinApi.api.getItemWithChapters(itemId);

		if (item?.Chapters) {
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

			if (segments.introStart !== null || segments.creditsStart !== null) {
				console.log('[Playback] Segments found via chapters:', segments);
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
		// Try NextUp API first - returns the next unwatched episode
		const result = await jellyfinApi.api.getNextEpisode(item.SeriesId, item.Id);
		const nextUp = result.Items?.[0];

		// If NextUp returned a different episode, use it
		if (nextUp && nextUp.Id !== item.Id) {
			return nextUp;
		}

		// NextUp returned the same episode (current episode not marked as watched yet)
		// or returned nothing. Fall back to fetching episodes sequentially.
		const seasonId = item.SeasonId || item.ParentId;
		if (!seasonId) return null;

		const episodesResult = await jellyfinApi.api.getEpisodes(item.SeriesId, seasonId);
		const episodes = episodesResult.Items || [];
		const currentIndex = episodes.findIndex(ep => ep.Id === item.Id);

		if (currentIndex >= 0 && currentIndex < episodes.length - 1) {
			// Return the next episode in the same season
			return episodes[currentIndex + 1];
		}

		// At end of season - try the next season
		const seasonsResult = await jellyfinApi.api.getSeasons(item.SeriesId);
		const seasons = seasonsResult.Items || [];
		const currentSeasonIndex = seasons.findIndex(s => s.Id === seasonId);

		if (currentSeasonIndex >= 0 && currentSeasonIndex < seasons.length - 1) {
			const nextSeason = seasons[currentSeasonIndex + 1];
			const nextSeasonEpisodes = await jellyfinApi.api.getEpisodes(item.SeriesId, nextSeason.Id);
			return nextSeasonEpisodes.Items?.[0] || null;
		}

		return null;
	} catch (e) {
		console.warn('[playback] Failed to get next episode:', e.message);
		return null;
	}
};

export const changeAudioStream = async (streamIndex, currentPositionTicks) => {
	if (!currentSession) return null;

	// Always disable DirectPlay for audio switching. DirectPlay URLs serve the static
	// container file and always play the default audio track regardless of AudioStreamIndex.
	// DirectStream (server-side remux) is quality-identical but honors track selection.
	const newInfo = await getPlaybackInfo(currentSession.itemId, {
		...currentSession,
		audioStreamIndex: streamIndex,
		startPositionTicks: currentPositionTicks ?? currentSession.startPositionTicks,
		enableDirectPlay: false
	});

	return newInfo;
};

export const changeSubtitleStream = async (streamIndex) => {
	if (!currentSession) return null;

	// Preserve current play method aand don't re-attempt DirectPlay if already transcoding
	const forceTranscode = currentSession.playMethod === PlayMethod.Transcode;

	const newInfo = await getPlaybackInfo(currentSession.itemId, {
		...currentSession,
		subtitleStreamIndex: streamIndex,
		...(forceTranscode && {
			enableDirectPlay: false,
			enableDirectStream: false,
			enableTranscoding: true
		})
	});

	return newInfo;
};

export const reportStart = async (positionTicks = 0) => {
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

		await api.reportPlaybackStart({
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

		const info = {
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
		};

		if (options.eventName) {
			info.EventName = options.eventName;
		}

		await api.reportPlaybackProgress(info);
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

export const startProgressReporting = (getPositionTicks, intervalMs = 10000, getPlayState) => {
	stopProgressReporting();

	progressInterval = setInterval(async () => {
		const ticks = getPositionTicks();
		if (ticks != null) {
			const options = getPlayState ? getPlayState() : {};
			await reportProgress(ticks, options);
		}
	}, intervalMs);
};

class PlaybackHealthMonitor {
	constructor() {
		this.stallCount = 0;
		this.bufferEvents = [];
		this.lastProgressTime = Date.now();
		this.isHealthy = true;
	}

	recordBuffer() {
		this.bufferEvents.push(Date.now());
		const cutoff = Date.now() - 30000;
		this.bufferEvents = this.bufferEvents.filter(t => t > cutoff);

		if (this.bufferEvents.length > 5) {
			this.isHealthy = false;
		}
	}

	recordStall() {
		this.stallCount++;
		if (this.stallCount > 3) {
			this.isHealthy = false;
		}
	}

	recordProgress() {
		this.lastProgressTime = Date.now();
	}

	checkHealth() {
		if (Date.now() - this.lastProgressTime > 30000) {
			this.isHealthy = false;
		}
		return this.isHealthy;
	}

	reset() {
		this.stallCount = 0;
		this.bufferEvents = [];
		this.lastProgressTime = Date.now();
		this.isHealthy = true;
	}

	shouldFallbackToTranscode() {
		return !this.isHealthy && currentSession?.playMethod !== PlayMethod.Transcode;
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

/** Update currentSession track indices without a full reload (native track switch). */
export const updateCurrentSession = (updates) => {
	if (!currentSession) return;
	if (updates.audioStreamIndex !== undefined) {
		currentSession.audioStreamIndex = updates.audioStreamIndex;
	}
	if (updates.subtitleStreamIndex !== undefined) {
		currentSession.subtitleStreamIndex = updates.subtitleStreamIndex;
	}
};

export const isDirectPlay = () => currentSession?.playMethod === PlayMethod.DirectPlay;

/**
 * Rewrite the StartTimeTicks parameter in an existing HLS transcode URL.
 * This allows seeking within the same transcode session without tearing down
 * the player pipeline or creating a new PlaySessionId.
 */
export const rewriteTranscodeSeekUrl = (url, newStartTicks) => {
	if (!url) return url;
	// Replace existing StartTimeTicks value
	if (url.includes('StartTimeTicks=')) {
		return url.replace(/StartTimeTicks=\d+/, 'StartTimeTicks=' + Math.floor(newStartTicks));
	}
	// Append if not present
	const separator = url.includes('?') ? '&' : '?';
	return url + separator + 'StartTimeTicks=' + Math.floor(newStartTicks);
};

export const getPlaybackUrl = async (itemId, startPositionTicks = 0, options = {}) => {
	return getPlaybackInfo(itemId, {...options, startPositionTicks});
};

export const getIntroMarkers = getMediaSegments;

export default {
	PlayMethod,
	getPlaybackInfo,
	getPlaybackInfoWithFallback,
	getPlaybackUrl,
	rewriteTranscodeSeekUrl,
	getSubtitleUrl,
	fetchItemChapters,
	getChapterImageUrl,
	getTrickplayInfo,
	getMediaSegments,
	getIntroMarkers,
	getNextEpisode,
	changeAudioStream,
	changeSubtitleStream,
	updateCurrentSession,
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
