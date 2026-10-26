import {buildQueryString} from '../utils/urlCompat';
import {selectPreferredAudioStream} from '../utils/audioTrackSelection';
import {getPerfTier} from '../utils/perfTier';
import {isUnownedSeerrTitle} from '../utils/tmdbThumb';
import {fetchTmdbDetails} from './externalRowsApi';
import {createApiForServer, getApiKey, getServerType, getServerUrl, getTokenParam} from './jellyfinApi';
import {moonfinPing} from './seerrApi';

// What a home row card plays when it has been focused for a moment: a short, low
// bitrate transcode of the title itself. Everything here is pure so the rules can
// be pinned by tests, the controller in views/Browse drives the element.

export const PREVIEW_DWELL_MS = 1200;
// A low tier set stutters while a preview opens, so focus has to rest there longer before one starts.
const LOW_TIER_DWELL_MS = 2500;
export const previewDwellMs = () => (getPerfTier() === 'low' ? LOW_TIER_DWELL_MS : PREVIEW_DWELL_MS);
export const PREVIEW_OPEN_TIMEOUT_MS = 10000;
export const PREVIEW_PLAY_CAP_MS = 30000;

const PREVIEW_TYPES = {
	media: ['Series', 'Movie', 'Episode', 'Video', 'MusicVideo'],
	trailer: ['Movie', 'Series', 'Episode', 'Season']
};
const DEFAULT_START_S = 180;
const SHORT_RUNTIME_S = 900;
const TICKS_PER_SECOND = 10000000;

// A Seerr, outside list or seasonal suggestion title. It has nothing on the server to play,
// so it only ever plays its trailer. Genre, studio and network tiles, shortcuts and calendar
// cards carry the same marks but aren't titles.
export const isOutsideTitle = (item) => isUnownedSeerrTitle(item) && !item._calendarDate;

// Library titles, plus outside titles for a trailer. The shortcut tiles aren't titles at all.
// Without a mode it answers for either kind, which is all a card needs to know before the
// controller picks.
export const supportsMediaPreview = (item, mode) => {
	if (isOutsideTitle(item)) return mode !== 'media';
	return !!item && !!item.Id && !item._seerr && !item._external && !item.isLibraryTile && !item.isRecordingsShortcut &&
		(mode ? PREVIEW_TYPES[mode] : [...PREVIEW_TYPES.media, ...PREVIEW_TYPES.trailer]).includes(item.Type);
};

// Previews are kept off the sets that can't carry a second decoder comfortably:
// Tizen 3.0 and older, webOS 4 and older, and any set the viewer put in the low
// performance mode. On webOS the version comes from the device profile, so until it's
// known the answer is no rather than a guess.
export const mediaPreviewAllowedOnDevice = ({platform, legacyTizen = false, webosVersion = null, performanceMode = 'auto'} = {}) => {
	if (performanceMode === 'low') return false;
	if (platform === 'tizen' && legacyTizen) return false;
	if (platform === 'webos' && !(typeof webosVersion === 'number' && webosVersion >= 5)) return false;
	return true;
};

// A row from another server carries its own credentials.
export const previewApiFor = (item, api) =>
	(item?._serverUrl && item?._serverAccessToken
		? createApiForServer(item._serverUrl, item._serverAccessToken, item._serverUserId, item._serverType)
		: api);

export const previewServerOf = (item) => ({
	serverUrl: item?._serverUrl || getServerUrl(),
	token: item?._serverAccessToken || getApiKey(),
	serverType: item?._serverType || getServerType()
});

// A series plays its next episode. Specials (season 0) are skipped, and a series
// with nothing up next has no preview. The target is then fetched again for its
// media sources and resume position, with the row item standing in when that fails.
export const resolvePreviewTarget = async (api, item) => {
	if (!item?.Id) return null;
	let targetId = item.Id;
	let fallback = item;
	if (item.Type === 'Series') {
		let nextUp = null;
		try {
			nextUp = await api.getNextUp(1, item.Id);
		} catch (e) {
			return null;
		}
		const episode = nextUp?.Items?.[0];
		if (!episode?.Id || episode.ParentIndexNumber === 0) return null;
		targetId = episode.Id;
		fallback = episode;
	}
	let target = null;
	try {
		target = await api.getItemMediaInfo(targetId);
	} catch (e) {
		target = null;
	}
	if (!target) target = fallback;
	if (!target?.MediaSources?.[0]) return null;
	return target;
};

// A film or show plays its own trailer, and an episode or season plays its show's.
export const trailerSubjectId = (item) => {
	if (item?.Type === 'Movie' || item?.Type === 'Series') return item.Id;
	if (item?.Type === 'Episode' || item?.Type === 'Season') return item.SeriesId || null;
	return null;
};

// An outside title's trailer is the one TMDB lists for it, through Moonbase, when the plugin
// can look titles up there.
const outsideTrailerSource = async (item, extractYouTubeId) => {
	const {serverUrl, token} = previewServerOf(item);
	const ping = await moonfinPing(serverUrl, token).catch(() => null);
	if (!ping || ping.tmdbDetailsSupported !== true) return null;
	const details = await fetchTmdbDetails({
		type: item._seerrMediaType,
		tmdbId: item._seerrRaw?.mediaId ?? item.ProviderIds?.Tmdb,
		imdbId: item._seerrRaw?.imdbId ?? item.ProviderIds?.Imdb
	});
	const youTubeId = details?.trailerUrl ? extractYouTubeId({RemoteTrailers: [{Url: details.trailerUrl}]}) : null;
	return youTubeId ? {youTubeId} : null;
};

// A trailer on the server comes first, as a target the clip's own stream plays. The
// first YouTube trailer comes next, as an id for the caller to resolve, since the
// resolver is loaded on demand. A server that keeps no trailer links has YouTube
// searched for one. Null when there is neither.
export const resolveTrailerSource = async (api, item, youtube) => {
	const {extractYouTubeId} = youtube;
	if (isOutsideTitle(item)) return outsideTrailerSource(item, extractYouTubeId);
	const subjectId = trailerSubjectId(item);
	if (!subjectId) return null;
	let local = null;
	try {
		const trailers = await api.getLocalTrailers(subjectId);
		const list = Array.isArray(trailers?.Items) ? trailers.Items : trailers;
		local = Array.isArray(list) ? list.find((trailer) => trailer?.Id) : null;
	} catch (e) {
		local = null;
	}
	const target = local ? await resolvePreviewTarget(api, local) : null;
	if (target) return {target};
	const searches = youtube.searchesForTrailer(item, getServerType());
	let subject = subjectId === item.Id && (Array.isArray(item.RemoteTrailers) || searches) ? item : null;
	if (!subject) {
		try {
			subject = await api.getItem(subjectId);
		} catch (e) {
			return null;
		}
	}
	let youTubeId = extractYouTubeId(subject);
	if (!youTubeId && searches) youTubeId = extractYouTubeId({RemoteTrailers: await youtube.searchedTrailers(subject)});
	return youTubeId ? {youTubeId} : null;
};

// Where the clip starts: the resume position when there is one, otherwise three
// minutes in, or the top for anything under fifteen minutes.
export const previewStartSeconds = (target) => {
	const resumeTicks = target?.UserData?.PlaybackPositionTicks;
	if (typeof resumeTicks === 'number' && resumeTicks > 0) return Math.floor(resumeTicks / TICKS_PER_SECOND);
	const runtimeTicks = target?.RunTimeTicks;
	if (typeof runtimeTicks === 'number' && runtimeTicks > 0 && runtimeTicks < SHORT_RUNTIME_S * TICKS_PER_SECOND) return 0;
	return DEFAULT_START_S;
};

const toAudioStreams = (mediaSource) => (mediaSource?.MediaStreams || [])
	.filter((stream) => stream.Type === 'Audio')
	.map((stream) => ({
		index: stream.Index,
		codec: stream.Codec,
		language: stream.Language || 'Unknown',
		displayTitle: stream.DisplayTitle || stream.Title || stream.Language,
		title: stream.Title,
		channels: stream.Channels,
		isDefault: stream.IsDefault,
		isForced: stream.IsForced,
		isAudioDescription: stream.IsAudioDescription
	}));

// The same track the player would start on, or null when the source has no audio.
export const pickPreviewAudioIndex = (mediaSource, settings = {}) => {
	const streams = toAudioStreams(mediaSource);
	if (streams.length === 0) return null;
	const picked = selectPreferredAudioStream(streams, settings);
	return picked && typeof picked.index === 'number' ? picked.index : null;
};

// Tizen and Xbox play the manifest through hls.js, which wants MPEG-TS segments. LG's
// player takes fMP4 from webOS 5 on, and the Fire TV WebView drops HEVC in TS so it
// takes fMP4 outright.
export const previewSegmentContainer = (platform, caps) => {
	if (platform === 'webos') return caps?.nativeHlsFmp4 ? 'mp4' : 'ts';
	if (platform === 'vega') return 'mp4';
	return 'ts';
};

export const newPlaySessionId = () => {
	let id = '';
	while (id.length < 32) id += Math.floor(Math.random() * 16).toString(16);
	return id;
};

// The manifest URL the card plays. A fixed h264 720p transcode with stereo aac, no
// subtitles and its own play session, so stopping it never touches real playback.
// No StartTimeTicks: the server turns the segments away when the manifest carries
// one, so the offset goes to the element instead. Emby's enum has no Drop, so it
// only gets the subtitle method on Jellyfin, and with no subtitle index asked for
// nothing burns in either way.
export const buildMediaPreviewUrl = ({serverUrl, serverType, token, deviceId, playSessionId, itemId, mediaSourceId, audioStreamIndex, segmentContainer}) => {
	const params = {
		Static: 'false',
		PlaySessionId: playSessionId,
		DeviceId: deviceId,
		videoCodec: 'h264',
		audioCodec: 'aac',
		maxVideoBitDepth: 8,
		videoBitRate: 4000000,
		maxWidth: 1280,
		maxHeight: 720,
		audioBitRate: 96000,
		audioChannels: 2
	};
	if (serverType !== 'emby') params.subtitleMethod = 'Drop';
	params.SegmentContainer = segmentContainer;
	params.MediaSourceId = mediaSourceId;
	params.AudioStreamIndex = typeof audioStreamIndex === 'number' ? audioStreamIndex : null;
	params[getTokenParam(serverType)] = token;
	return `${serverUrl}/Videos/${encodeURIComponent(itemId)}/master.m3u8?${buildQueryString(params)}`;
};
