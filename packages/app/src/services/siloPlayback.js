// Playback on Silo, ported from Moonfin-Core's playback_silo.
//
// Silo decides how a title plays: the app says what this TV can decode (read from the same device profile Jellyfin
// gets) and Silo answers with a plan: the delivery (the original file, a remux, or a transcode), the stream address,
// the tracks and the subtitles. The plan comes back here in the PlaybackInfo shape the player reads. While a plan
// plays, a new request for the same title (another audio or subtitle track, a quality, a seek a remux can't make) is a
// replan of the same session. Progress goes to the session as numbered samples, and the stop carries an id it keeps
// for every retry.

import {SILO_TRACKS_KEY, siloAddedSubtitleStream, siloNextStreamIndex, siloStreamIndexForTrack, siloTrackForStreamIndex} from './siloMediaSources';
import {TICKS_PER_SECOND} from './siloMapper';
import {resolveSiloUrl} from '../utils/siloUrls';

const START_RETRY_BUDGET_MS = 60000;
const REPLAN_RETRY_BUDGET_MS = 30000;
const STOP_RETRY_BUDGET_MS = 30000;
const START_TIMEOUT_MS = 45000;

// Smart TVs load streams and sidecars without the app's headers, so every address carries what it needs.
const TRAITS = {
	managesDynamicRange: false,
	selectsAnyAudioTrack: false,
	playsProgressive: true,
	playsHls: true,
	playsHlsNatively: false,
	rendersEmbeddedSubtitles: false,
	drawsAssStyling: true,
	loadsFontAttachments: false,
	sendsRequestHeaders: false
};

// webOS's player can't play Silo's progressive remux: a piped fragmented MP4 has no overall duration or index, so the
// TV takes the first fragment for the whole stream and stalls. HLS carries the duration in its playlist, and the TV's
// own player plays it, which is what lets Silo keep a copied Dolby Vision track marked as Dolby Vision.
const PLATFORM_TRAITS = {webos: {playsProgressive: false, playsHlsNatively: true}};

export const siloTraitsFor = (platform) => ({...TRAITS, ...PLATFORM_TRAITS[platform]});

export const siloNewUuid = () => {
	const bytes = [];
	for (let i = 0; i < 16; i++) bytes.push(Math.floor(Math.random() * 256));
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = bytes.map((b) => ('0' + b.toString(16)).slice(-2));
	return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
};

// ---- What this TV can play, from its Jellyfin device profile

const profiles = (list) => (Array.isArray(list) ? list.filter((p) => p && typeof p === 'object') : []);
const csv = (value) => (typeof value === 'string' ? value.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean) : []);
const union = (lists) => {
	const out = [];
	lists.forEach((list) => list.forEach((v) => {
		if (!out.includes(v)) out.push(v);
	}));
	return out;
};
const withAliases = (containers) => {
	const out = containers.slice();
	if (out.includes('mkv') && !out.includes('matroska')) out.push('matroska');
	if (out.includes('matroska') && !out.includes('mkv')) out.push('mkv');
	return out;
};

// A codec whose profile condition says VideoProfile equals none is one the TV never plays.
const excludedVideoCodecs = (codecProfiles) => {
	const out = [];
	codecProfiles.forEach((p) => {
		if (p.Type !== 'Video' || profiles(p.ApplyConditions).length) return;
		const never = profiles(p.Conditions).some((c) => c.Condition === 'Equals' && c.Property === 'VideoProfile' && String(c.Value).toLowerCase() === 'none');
		if (never) out.push(...csv(p.Codec));
	});
	return out;
};

const rangeKey = (value) => value.trim().toUpperCase().replace(/_/g, '');

// The ranges a codec's profile rules out, and the ones it lists as the only ones it plays (null when it lists none).
const rangeRules = (codecProfiles, codec) => {
	const ruledOut = [];
	let only = null;
	codecProfiles.forEach((p) => {
		if (p.Type !== 'Video' || !csv(p.Codec).includes(codec)) return;
		profiles(p.Conditions).forEach((c) => {
			if (c.Property !== 'VideoRangeType') return;
			const values = String(c.Value).split('|').map(rangeKey);
			if (c.Condition === 'NotEquals') ruledOut.push(...values);
			else if (c.Condition === 'EqualsAny') only = (only || []).concat(values);
		});
	});
	return {ruledOut, only};
};

const hdrDetails = (codecProfiles, videoCodecs) => {
	let hdr10 = false;
	let hlg = false;
	let hdr10Plus = false;
	const dolbyVision = [];
	['hevc', 'av1'].forEach((codec) => {
		if (!videoCodecs.includes(codec)) return;
		const {ruledOut, only} = rangeRules(codecProfiles, codec);
		const allows = (range) => !ruledOut.includes(rangeKey(range)) && (!only || only.includes(rangeKey(range)));
		hdr10 = hdr10 || allows('HDR10');
		hlg = hlg || allows('HLG');
		hdr10Plus = hdr10Plus || allows('HDR10_PLUS');
		// Silo reads these as profiles the TV shows as Dolby Vision. A TV without it still lists the profile 7 and 8
		// ranges, since their HDR10 base layer plays, so those count only where plain Dolby Vision does.
		if (codec === 'hevc') {
			if (allows('DOVI')) {
				dolbyVision.push(5);
				if (allows('DOVI_WITH_EL')) dolbyVision.push(7);
				if (allows('DOVI_WITH_HDR10')) dolbyVision.push(8);
			}
		} else if (allows('DOVI')) {
			dolbyVision.push(10);
		}
	});
	return {hdr10, hdr10_plus: hdr10Plus, hlg, dolby_vision_profiles: dolbyVision.filter((p, i) => dolbyVision.indexOf(p) === i).sort((a, b) => a - b)};
};

const limits = (codecProfiles, type, property) => {
	const out = [];
	codecProfiles.forEach((p) => {
		if (p.Type !== type || profiles(p.ApplyConditions).length) return;
		profiles(p.Conditions).forEach((c) => {
			if (c.Property !== property || c.Condition !== 'LessThanEqual') return;
			const limit = parseInt(c.Value, 10);
			if (limit > 0) out.push(limit);
		});
	});
	return out;
};

const maxResolution = (codecProfiles) => {
	const widths = limits(codecProfiles, 'Video', 'Width');
	if (!widths.length) return null;
	const widest = Math.max(...widths);
	if (widest <= 854) return '480p';
	if (widest <= 1280) return '720p';
	if (widest <= 2560) return '1080p';
	if (widest <= 4096) return '2160p';
	return '4320p';
};

const maxChannels = (codecProfiles) => {
	const channels = limits(codecProfiles, 'VideoAudio', 'AudioChannels');
	if (!channels.length) return null;
	const lowest = Math.min(...channels);
	return lowest < 6 ? lowest : null;
};

const HLS_VIDEO_CODECS = ['h264', 'hevc'];

export const siloCapabilitiesFromDeviceProfile = (deviceProfile = {}, traits = TRAITS) => {
	const directPlay = profiles(deviceProfile.DirectPlayProfiles);
	const codecProfiles = profiles(deviceProfile.CodecProfiles);
	const transcoding = profiles(deviceProfile.TranscodingProfiles);
	const videoDirect = directPlay.filter((p) => (p.Type || 'Video') === 'Video');
	const excluded = excludedVideoCodecs(codecProfiles);
	const videoCodecs = union(videoDirect.map((p) => csv(p.VideoCodec))).filter((c) => !excluded.includes(c));
	const audioCodecs = union(videoDirect.map((p) => csv(p.AudioCodec)));
	const containers = withAliases(union(videoDirect.map((p) => csv(p.Container))));
	const hlsProfiles = transcoding.filter((p) => p.Type === 'Video' && String(p.Protocol).toLowerCase() === 'hls');
	const hlsTargets = union(hlsProfiles.map((p) => csv(p.VideoCodec)));
	const hlsVideo = hlsProfiles.length ? videoCodecs.filter((c) => HLS_VIDEO_CODECS.includes(c) || hlsTargets.includes(c)) : [];
	const hlsAudio = union(hlsProfiles.map((p) => csv(p.AudioCodec)));
	const hdr = hdrDetails(codecProfiles, videoCodecs);
	const anyHdr = hdr.hdr10 || hdr.hlg || hdr.hdr10_plus || hdr.dolby_vision_profiles.length > 0;
	const resolution = maxResolution(codecProfiles);
	const channels = maxChannels(codecProfiles);

	const delivery = ({supported, containers: kinds, video, audio, subtitles, claims = [], features = [], failureReason}) => ({
		enabled: true,
		supported_on_device: supported,
		...(supported ? null : {failure_reason: failureReason}),
		containers: kinds,
		video_codecs: video,
		audio_decode_codecs: audio,
		audio_passthrough_codecs: [],
		...(channels != null ? {max_channels: channels} : null),
		subtitles,
		features,
		auth_header_refresh: false,
		validated_claims: claims,
		transformations: []
	});
	const sidecarSubtitles = {
		embedded_text: false, sidecar_text: true, ass_styling: traits.drawsAssStyling, embedded_bitmap: false, sidecar_bitmap: false, font_attachments: false
	};
	const originalSubtitles = {
		embedded_text: traits.rendersEmbeddedSubtitles,
		sidecar_text: true,
		ass_styling: traits.drawsAssStyling,
		embedded_bitmap: traits.rendersEmbeddedSubtitles,
		sidecar_bitmap: false,
		font_attachments: traits.rendersEmbeddedSubtitles && traits.loadsFontAttachments
	};
	return {
		clientCapabilities: {
			video_evidence: 'declared',
			audio_evidence: 'declared',
			codecs_video: videoCodecs,
			codecs_video_hardware: videoCodecs,
			codecs_audio: audioCodecs,
			containers,
			...(resolution ? {max_resolution: resolution} : null),
			hdr: anyHdr,
			hdr_details: hdr
		},
		deliveries: {
			original_http: delivery({
				supported: true,
				containers,
				video: videoCodecs,
				audio: audioCodecs,
				subtitles: originalSubtitles,
				claims: [
					...(traits.selectsAnyAudioTrack ? ['client_selected_audio_track_v1'] : []),
					...(traits.managesDynamicRange && anyHdr ? ['client_managed_dynamic_range_v1'] : [])
				]
			}),
			progressive: delivery({
				supported: traits.playsProgressive,
				failureReason: 'player_has_no_progressive_remux',
				containers: withAliases(['mp4', 'mkv']),
				video: videoCodecs,
				audio: audioCodecs,
				subtitles: sidecarSubtitles
			}),
			hls: delivery({
				supported: traits.playsHls && hlsVideo.length > 0,
				failureReason: 'player_has_no_hls',
				containers: ['hls'],
				video: hlsVideo,
				audio: hlsAudio.length ? hlsAudio : ['aac'],
				subtitles: sidecarSubtitles,
				features: traits.playsHlsNatively ? ['native_hls_playback_v1'] : []
			})
		},
		clientFeatures: ['playback_plan_v3', ...(traits.rendersEmbeddedSubtitles ? ['embedded_subtitles_v1'] : [])]
	};
};

const NO_HDR = {hdr10: false, hdr10_plus: false, hlg: false, dolby_vision_profiles: []};

// A TV app runs on the panel itself, so what the TV decodes is what it shows. A stick or a console drives a display it
// can't see, so its HDR stays unknown and Silo maps HDR down for it.
const SHOWS_ON_ITS_OWN_PANEL = ['webos', 'tizen'];

const outputOf = (platform, capabilities) => {
	const hdr = capabilities.clientCapabilities?.hdr_details;
	if (!SHOWS_ON_ITS_OWN_PANEL.includes(platform) || !hdr) return {hdr_details: NO_HDR, display: {hdr_evidence: 'unknown'}};
	return {hdr_details: hdr, display: {hdr_evidence: 'exact', hdr_types: hdr}};
};

// The device and what it shows.
export const siloPlaybackContext = ({platform, appVersion, capabilities}) => ({
	protocol_version: 3,
	form_factor: 'tv',
	app_version: String(appVersion || 'unknown').slice(0, 64),
	device: platform ? {platform: String(platform).slice(0, 32)} : {},
	output: outputOf(platform, capabilities),
	deliveries: capabilities.deliveries
});

// ---- Tracks: Silo numbers subtitles across the file's own and the added ones

// The subtitle stream indexes in Silo's combined order: the external ones first, then the file's, each by position.
export const siloSubtitleOrder = (source) => {
	if (!source) return [];
	const ordinal = (s) => {
		const track = siloTrackForStreamIndex(source, s.Index);
		return track ? track.ordinal : Infinity;
	};
	const streams = (source.MediaStreams || []).filter((s) => s.Type === 'Subtitle' && typeof s.Index === 'number')
		.map((s, i) => ({s, i}))
		.sort((a, b) => (ordinal(a.s) - ordinal(b.s)) || (a.i - b.i))
		.map(({s}) => s);
	return streams.filter((s) => s.IsExternal === true).map((s) => s.Index)
		.concat(streams.filter((s) => s.IsExternal !== true).map((s) => s.Index));
};

export const siloSubtitleCombinedIndex = (source, index) => {
	if (index == null || index < 0) return null;
	const at = siloSubtitleOrder(source).indexOf(index);
	return at < 0 ? null : at;
};

// Silo's combined subtitle index to the app's stream index, including downloaded subtitles the plan adds.
export const siloSubtitleIndexByCombined = (plan, source) => {
	const byCombined = {};
	siloSubtitleOrder(source).forEach((index, i) => {
		byCombined[i] = index;
	});
	let next = siloNextStreamIndex(source);
	(plan?.subtitle?.inventory || []).forEach((entry) => {
		if (!entry || entry.source !== 'downloaded' || typeof entry.combined_index !== 'number' || byCombined[entry.combined_index] != null) return;
		byCombined[entry.combined_index] = next++;
	});
	return byCombined;
};

// The plan's stream address on this server, with the access token added to Silo's media routes for a player that
// can't send headers. Older plans named the v1 stream routes.
export const siloPlanUrl = (baseUrl, url) => {
	const path = String(url || '').replace(/^(?:\/api\/v1)?\/(?=stream\/|playback\/transcode\/)/, '/api/v2/');
	return resolveSiloUrl(path, baseUrl);
};

const sameOrigin = (a, b) => {
	const origin = (url) => (/^(https?:\/\/[^/?#]+)/i.exec(url || '') || [])[1]?.toLowerCase();
	return Boolean(origin(a)) && origin(a) === origin(b);
};

export const siloAuthorizeUrl = (url, baseUrl, accessToken, allMedia = true) => {
	if (!accessToken || !url || !sameOrigin(url, baseUrl)) return url;
	const path = url.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
	const media = path.includes('/api/v2/stream/') || (allMedia && path.includes('/api/v2/playback/'));
	if (!media || /[?&]token=/.test(url)) return url;
	const hash = url.indexOf('#');
	const head = hash < 0 ? url : url.slice(0, hash);
	const tail = hash < 0 ? '' : url.slice(hash);
	return `${head}${head.includes('?') ? '&' : '?'}token=${encodeURIComponent(accessToken)}${tail}`;
};

const SIDECAR_FORMATS = [['.vtt', 'vtt'], ['.ass', 'ass'], ['.ssa', 'ssa'], ['.srt', 'srt']];
const sidecarFormat = (url) => {
	const path = String(url).split(/[?#]/)[0].toLowerCase();
	const found = SIDECAR_FORMATS.find(([ext]) => path.endsWith(ext));
	return found ? found[1] : null;
};

// The file's streams with the plan's subtitles: downloaded ones added, the ones Silo serves as sidecars given their
// address (and a format the app can parse), and a burned-in one marked so.
export const siloPlanStreams = ({plan, source, baseUrl, accessToken, requestedStreamIndex}) => {
	const subtitle = plan?.subtitle || {};
	const inventory = (subtitle.inventory || []).filter((e) => e && typeof e === 'object');
	const streams = (source?.MediaStreams || []).map((s) => ({...s}));
	const byCombined = siloSubtitleIndexByCombined(plan, source);
	const own = siloSubtitleOrder(source);
	inventory.forEach((entry) => {
		const index = typeof entry.combined_index === 'number' ? byCombined[entry.combined_index] : null;
		if (index == null || own.includes(index)) return;
		streams.push(siloAddedSubtitleStream({
			index, codec: entry.codec, language: entry.language, label: entry.label, forced: entry.forced === true, hearingImpaired: entry.hearing_impaired === true
		}));
	});
	let selected = null;
	if (subtitle.mode === 'off') {
		selected = -1;
	} else {
		const match = /:subtitle:(\d+)$/.exec(typeof subtitle.track_id === 'string' ? subtitle.track_id : '');
		selected = match ? byCombined[parseInt(match[1], 10)] : null;
		if (subtitle.mode === 'burn_in' && selected != null) {
			streams.forEach((s) => {
				if (s.Type === 'Subtitle' && s.Index === selected) s.DeliveryMethod = 'Encode';
			});
		}
	}
	const original = plan?.delivery === 'original_http';
	inventory.forEach((entry) => {
		const index = typeof entry.combined_index === 'number' ? byCombined[entry.combined_index] : null;
		if (typeof entry.url !== 'string' || !entry.url || index == null || entry.delivery !== 'sidecar') return;
		// A remux carries only the subtitle it was made with, so the file's other tracks wait for a replan.
		if (!original && entry.source === 'embedded' && index !== selected && index !== requestedStreamIndex) return;
		const format = sidecarFormat(entry.url);
		if (!format) return;
		const stream = streams.find((s) => s.Type === 'Subtitle' && s.Index === index);
		if (!stream) return;
		stream.DeliveryMethod = 'External';
		stream.DeliveryUrl = siloAuthorizeUrl(siloPlanUrl(baseUrl, entry.url), baseUrl, accessToken);
		stream.IsExternalUrl = true;
		// The sidecar's own format is what the app parses, whatever the file holds.
		stream.SiloSidecarCodec = format;
		if (format === 'vtt' || format === 'srt') stream.Codec = format === 'vtt' ? 'webvtt' : 'subrip';
	});
	return {streams, selected};
};

// ---- The plan as PlaybackInfo

const PLAY_METHODS = {original_http: 'DirectPlay', server_remux_progressive: 'DirectStream', server_remux_hls: 'DirectStream'};
export const siloPlayMethod = (delivery) => PLAY_METHODS[delivery] || 'Transcode';

const DECISION_REASONS = {
	container_normalization: 'ContainerNotSupported',
	hls_packaging_required: 'ContainerNotSupported',
	audio_adaptation: 'AudioCodecNotSupported',
	hls_audio_adaptation: 'AudioCodecNotSupported',
	subtitle_burn_in_required: 'SubtitleCodecNotSupported',
	client_dv7_to_dv81: 'VideoRangeTypeNotSupported',
	client_dv7_to_hdr10: 'VideoRangeTypeNotSupported',
	evidence_insufficient_for_direct: 'VideoCodecNotSupported',
	quality_device_limit: 'VideoResolutionNotSupported',
	quality_bandwidth_limit: 'ContainerBitrateExceedsLimit',
	quality_bandwidth_cap: 'ContainerBitrateExceedsLimit',
	quality_metered_limit: 'ContainerBitrateExceedsLimit',
	quality_fixed_rung: 'ContainerBitrateExceedsLimit'
};
const WARNING_REASONS = {
	audio_converted: 'AudioCodecNotSupported',
	hdr_tone_mapped: 'VideoRangeTypeNotSupported',
	dolby_vision_removed: 'VideoRangeTypeNotSupported',
	subtitle_burn_in: 'SubtitleCodecNotSupported',
	bandwidth_cap_applied: 'ContainerBitrateExceedsLimit'
};

export const siloTranscodeReasons = (plan) => {
	if (plan?.delivery === 'original_http') return [];
	const reasons = [];
	const add = (reason) => {
		if (reason && !reasons.includes(reason)) reasons.push(reason);
	};
	add(DECISION_REASONS[plan?.decision_reason]);
	(plan?.degradation_warnings || []).forEach((w) => add(w && WARNING_REASONS[w.code]));
	return reasons;
};

// The plan's file as a MediaSource the player reads: what Silo decided, the stream address, and the plan's tracks.
export const siloPlanToMediaSource = ({plan, source, baseUrl, accessToken, requestedSubtitleStreamIndex}) => {
	const stream = plan.stream || {};
	const timeline = plan.timeline || {};
	const delivery = plan.delivery;
	const playMethod = siloPlayMethod(delivery);
	const url = siloAuthorizeUrl(siloPlanUrl(baseUrl, stream.url), baseUrl, accessToken);
	const {streams, selected} = siloPlanStreams({plan, source, baseUrl, accessToken, requestedStreamIndex: requestedSubtitleStreamIndex});
	const audio = plan.selected_tracks?.audio;
	const selectedAudio = audio && typeof audio.index === 'number' && source ? siloStreamIndexForTrack(source, 'audio', audio.index) : null;
	const container = stream.container || plan.source?.container || source?.Container;
	const hls = stream.protocol === 'hls' || /\.m3u8(\?|$)/i.test(String(stream.url || ''));
	const offset = typeof timeline.timeline_offset_seconds === 'number' && timeline.timeline_offset_seconds > 0 ? timeline.timeline_offset_seconds : 0;
	const bitrate = plan.source?.bitrate_kbps;
	return {
		...(source || {}),
		Id: String(plan.effective_media_file_id != null ? plan.effective_media_file_id : (source?.Id || '')),
		...(container ? {Container: container} : null),
		MediaStreams: streams,
		SupportsDirectPlay: playMethod === 'DirectPlay',
		SupportsDirectStream: playMethod === 'DirectStream',
		SupportsTranscoding: playMethod !== 'DirectPlay',
		// The player asks the plan's address whatever the method.
		Path: url,
		...(playMethod === 'DirectStream' ? {DirectStreamUrl: url} : null),
		...(playMethod !== 'DirectPlay' ? {
			TranscodingUrl: url,
			TranscodingSubProtocol: hls ? 'hls' : 'http',
			TranscodingContainer: hls ? 'ts' : container,
			TranscodeReasons: siloTranscodeReasons(plan)
		} : null),
		...(selectedAudio != null ? {DefaultAudioStreamIndex: selectedAudio} : null),
		DefaultSubtitleStreamIndex: selected != null ? selected : (source?.DefaultSubtitleStreamIndex != null ? source.DefaultSubtitleStreamIndex : -1),
		...(typeof bitrate === 'number' && bitrate > 0 ? {Bitrate: Math.round(bitrate * 1000)} : null),
		SiloStreamUrl: url,
		SiloStreamMimeType: stream.mime_type || null,
		SiloDelivery: delivery,
		// Where the stream starts in the title, and whether it can be seeked anywhere or a seek goes back to Silo.
		SiloTimelineOffsetTicks: Math.round(offset * TICKS_PER_SECOND),
		SiloSeeksThroughServer: timeline.can_seek_anywhere === false
	};
};

const refusal = (decision) => {
	const terminal = decision?.terminal || {};
	const reason = terminal.reason || String(decision?.outcome);
	const message = typeof terminal.message === 'string' && terminal.message.trim() ? terminal.message.trim() : `Silo can't play this item (${reason}).`;
	return Object.assign(new Error(message), {siloRefused: true, reason, retryable: terminal.retryable === true});
};

// Network trouble, a timeout, a busy or failing server are worth asking again, waiting longer each time.
const retryableStart = (err) => !err.status ? !err.cancelled : (err.status === 408 || err.status === 429 || err.status >= 500);
const sessionGone = (err) => err.status === 404 || err.status === 410;
const installationChanged = (err) => err.status === 409 && err.code === 'installation_changed';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const sendWithRetries = async (send, budgetMs, retryable, wait = sleep) => {
	const deadline = Date.now() + budgetMs;
	let delay = 1000;
	for (;;) {
		try {
			// eslint-disable-next-line no-await-in-loop
			return await send();
		} catch (err) {
			if (!retryable(err) || deadline - Date.now() <= delay) throw err;
			// eslint-disable-next-line no-await-in-loop
			await wait(delay);
			if (delay < 8000) delay *= 2;
		}
	}
};

export const SILO_PLAYBACK_UNAVAILABLE = "Playback isn't available on this Silo server.";
export const SILO_PLAYBACK_UPGRADE_REQUIRED = 'This Silo server needs a newer version of Moonfin to play.';
export const SILO_PLAYBACK_ENDED_ON_SERVER = 'Playback was ended on the Silo server.';

/**
 * `call(path, options)` sends as the signed-in profile; `getItem(itemId, fileId)` reads a title with its files.
 * `getAccessToken()` is the account's current token, for the stream addresses, and `freshenStreamAuth()` refreshes one
 * past a tenth of its life before a plan's stream is handed out. `onPlaying(itemId, fileId,
 * runTimeSeconds, source)` hears which file each plan plays, whose markers and tracks the player then uses.
 */
export const createSiloPlayback = ({call, getBaseUrl, getUserId, getAccessToken, freshenStreamAuth = async () => {}, getDeviceInfo, platform, getItem, onPlaying, wait = sleep}) => {
	const sessions = {};
	let capabilities = null;

	const readCapabilities = (refresh = false) => {
		if (refresh || !capabilities || Date.now() - capabilities.at > 60000) {
			const value = call('/api/v2/playback/capabilities');
			capabilities = {at: Date.now(), value};
			value.catch(() => {
				if (capabilities?.value === value) capabilities = null;
			});
		}
		return capabilities.value;
	};

	const playable = async (refresh = false) => {
		const caps = await readCapabilities(refresh);
		const ok = caps?.state === 'available' && caps.allowed === true && (caps.protocol_versions || []).includes(3) &&
			typeof caps.installation_id === 'string' && caps.installation_id.trim();
		if (!ok) throw Object.assign(new Error(SILO_PLAYBACK_UNAVAILABLE), {siloRefused: true, reason: caps?.state || 'unavailable'});
		return {installationId: caps.installation_id.trim(), features: caps.features || []};
	};

	// The file to play: the one asked for, else the title's default, read with its tracks when the item came without.
	const fileOf = async (itemId, mediaSourceId, item) => {
		const pick = (list, id) => (id ? list.find((s) => String(s.Id) === String(id)) : list[0]) || null;
		let sources = item?.MediaSources || [];
		let source = pick(sources, mediaSourceId);
		if (!source || !(source[SILO_TRACKS_KEY] || []).length) {
			try {
				const full = await getItem(itemId, mediaSourceId);
				sources = full?.MediaSources || [];
				source = pick(sources, mediaSourceId) || source;
			} catch {
				// An extra has no catalog page of its own; its file id is enough.
			}
		}
		const fileId = source ? String(source.Id) : (mediaSourceId || item?._silo?.file_id);
		if (fileId == null) throw new Error(`Silo item ${itemId} has no file to play`);
		return {fileId: String(fileId), source, sources, explicit: sources.length > 1 && String(sources[0].Id) !== String(fileId)};
	};

	const kbps = (bitsPerSecond) => (bitsPerSecond > 0 ? Math.min(Math.max(Math.round(bitsPerSecond / 1000), 100), 1000000) : null);
	const startSeconds = (ticks) => (ticks > 0 ? Math.min(ticks / TICKS_PER_SECOND, 31536000) : 0);

	const asPlaybackInfo = (session, requestedSubtitle) => {
		const source = siloPlanToMediaSource({
			plan: session.plan,
			source: session.source,
			baseUrl: getBaseUrl(),
			accessToken: getAccessToken(),
			requestedSubtitleStreamIndex: requestedSubtitle
		});
		return {PlaySessionId: session.sessionId, MediaSources: [source]};
	};

	// The tracks the plan plays, which a later ask is compared with: one that names no track, or the one already
	// playing, changes none.
	const playingTracks = (session, info) => {
		const ticks = session.source?.RunTimeTicks;
		if (onPlaying) onPlaying(session.itemId, info.MediaSources[0].Id, ticks > 0 ? ticks / TICKS_PER_SECOND : null, session.source);
		session.audioStreamIndex = info.MediaSources[0].DefaultAudioStreamIndex;
		session.subtitleStreamIndex = info.MediaSources[0].DefaultSubtitleStreamIndex;
		return info;
	};

	// The file a plan plays when Silo picked another version than the one asked for.
	const sourceOfPlan = async (plan, itemId, knownId, known, sources = []) => {
		const effective = plan.effective_media_file_id != null ? String(plan.effective_media_file_id) : null;
		if (!effective || effective === String(knownId)) return known;
		const listed = sources.find((s) => String(s.Id) === effective);
		if (listed && (listed[SILO_TRACKS_KEY] || []).length) return listed;
		try {
			const full = await getItem(itemId, effective);
			return (full?.MediaSources || []).find((s) => String(s.Id) === effective) || listed || known;
		} catch {
			return listed || known;
		}
	};

	const start = async (itemId, body, item, preview = false) => {
		const profileId = getUserId();
		if (!profileId) throw new Error('Silo playback needs the profile it plays as');
		const file = await fileOf(itemId, body.MediaSourceId, item);
		const caps = siloCapabilitiesFromDeviceProfile(body.DeviceProfile || {}, siloTraitsFor(platform));
		const context = siloPlaybackContext({platform, appVersion: getDeviceInfo().appVersion, capabilities: caps});
		let server = await playable();
		const audioTrack = file.source && body.AudioStreamIndex != null && body.AudioStreamIndex >= 0
			? siloTrackForStreamIndex(file.source, body.AudioStreamIndex) : null;
		const subtitle = siloSubtitleCombinedIndex(file.source, body.SubtitleStreamIndex);
		const startBody = (installationId) => ({
			protocol_version: 3,
			client_features: caps.clientFeatures,
			file_id: file.fileId,
			profile_id: profileId,
			playback_attempt_id: siloNewUuid(),
			installation_id: installationId,
			quality_preference: 'auto',
			// Styled ASS is drawn here, but a sidecar's fonts can't be fetched, so a simpler rendering is fine.
			subtitle_fidelity_preference: 'compatible',
			metered: false,
			client_capabilities: caps.clientCapabilities,
			client_playback_context: context,
			start_position: startSeconds(body.StartTimeTicks),
			...(audioTrack && audioTrack.kind === 'audio' ? {audio_track_index: audioTrack.ordinal} : null),
			...(subtitle != null ? {subtitle_track_index: subtitle} : null),
			...(kbps(body.MaxStreamingBitrate) ? {bandwidth_cap_kbps: kbps(body.MaxStreamingBitrate)} : null),
			// A version the viewer picked plays as that version.
			...(file.explicit && server.features.includes('fixed_media_file_v1') ? {allow_alternate_versions: false} : null)
		});
		const send = (startRequest) => sendWithRetries(
			() => call('/api/v2/playback/start', {method: 'POST', body: startRequest, timeoutMs: START_TIMEOUT_MS}),
			START_RETRY_BUDGET_MS, retryableStart, wait
		);
		let sent = startBody(server.installationId);
		let decision;
		try {
			decision = await send(sent);
		} catch (err) {
			if (err.status === 426 || (err.status === 410 && err.code === 'client_upgrade_required')) {
				throw Object.assign(new Error(SILO_PLAYBACK_UPGRADE_REQUIRED), {siloRefused: true, reason: 'client_upgrade_required'});
			}
			if (!installationChanged(err)) throw err;
			// The server was reset or replaced since its capabilities were read: start again under the new one.
			server = await playable(true);
			sent = startBody(server.installationId);
			decision = await send(sent);
		}
		const plan = decision?.playback_plan;
		const sessionId = decision?.session_id || plan?.session_id;
		if (decision?.outcome !== 'playable' || !plan || typeof sessionId !== 'string') throw refusal(decision);
		const session = {
			sessionId,
			attemptId: sent.playback_attempt_id,
			installationId: server.installationId,
			itemId,
			plan,
			startBody: sent,
			source: await sourceOfPlan(plan, itemId, file.fileId, file.source, file.sources),
			sequence: 0,
			stopId: siloNewUuid(),
			ended: false,
			planAttemptId: siloNewUuid(),
			attemptedPlanKeys: [],
			recoveries: 0,
			bandwidthCapKbps: sent.bandwidth_cap_kbps || null
		};
		if (preview) {
			stop(session, 0).catch(() => {}); // eslint-disable-line no-use-before-define
			return asPlaybackInfo(session, body.SubtitleStreamIndex);
		}
		sessions[sessionId] = session;
		await freshenStreamAuth();
		return playingTracks(session, asPlaybackInfo(session, body.SubtitleStreamIndex));
	};

	const selectedTracks = (plan) => {
		const out = {};
		['audio', 'subtitle'].forEach((kind) => {
			if (plan.selected_tracks && plan.selected_tracks[kind]) out[kind] = {...plan.selected_tracks[kind]};
		});
		return out;
	};

	// A new request for the title already playing changes the session's plan: another track, a quality, or the place
	// to start from.
	const replan = async (session, body) => {
		const plan = session.plan;
		// The original file was asked for again with direct play off: it failed here, so Silo tries something else.
		const failure = body.EnableDirectPlay === false && plan.delivery === 'original_http';
		const changes = (asked, playing) => asked != null && asked !== playing;
		const trackChange = !failure && (changes(body.AudioStreamIndex, session.audioStreamIndex) || changes(body.SubtitleStreamIndex, session.subtitleStreamIndex));
		const qualityChange = !failure && !trackChange && kbps(body.MaxStreamingBitrate) !== session.bandwidthCapKbps;
		let operation = 'seek_reanchor';
		if (failure) operation = 'failure_recovery';
		else if (trackChange) operation = 'track_change';
		else if (qualityChange) operation = 'quality_change';
		if (qualityChange) session.bandwidthCapKbps = kbps(body.MaxStreamingBitrate);
		if (failure) {
			if (typeof plan.plan_attempt_key === 'string' && !session.attemptedPlanKeys.includes(plan.plan_attempt_key)) {
				session.attemptedPlanKeys.push(plan.plan_attempt_key);
				if (session.attemptedPlanKeys.length > 16) session.attemptedPlanKeys.shift();
			}
			session.recoveries++;
		}
		const fileId = String(plan.effective_media_file_id);
		const tracks = selectedTracks(plan);
		if (trackChange) {
			const audio = session.source && body.AudioStreamIndex != null ? siloTrackForStreamIndex(session.source, body.AudioStreamIndex) : null;
			if (audio && audio.kind === 'audio') tracks.audio = {id: `file:${fileId}:audio:${audio.ordinal}`, index: audio.ordinal};
			if (body.SubtitleStreamIndex === -1) {
				delete tracks.subtitle;
			} else if (body.SubtitleStreamIndex != null) {
				const byCombined = siloSubtitleIndexByCombined(plan, session.source);
				const combined = Object.keys(byCombined).find((k) => byCombined[k] === body.SubtitleStreamIndex);
				if (combined != null) tracks.subtitle = {id: `file:${fileId}:subtitle:${combined}`, index: parseInt(combined, 10)};
			}
		}
		const first = session.startBody;
		const sent = {
			protocol_version: 3,
			client_features: first.client_features,
			operation,
			playback_attempt_id: session.attemptId,
			replan_request_id: siloNewUuid(),
			failed_plan_id: plan.plan_id,
			plan_attempt_id: session.planAttemptId,
			plan_attempt_key: plan.plan_attempt_key,
			attempted_plan_keys: session.attemptedPlanKeys.slice(),
			attempt_count: failure ? Math.min(Math.max(session.recoveries, 1), 8) : 1,
			quality_preference: first.quality_preference || 'auto',
			position_seconds: startSeconds(body.StartTimeTicks),
			metered: first.metered || false,
			selected_tracks: tracks,
			client_capabilities: first.client_capabilities,
			client_playback_context: first.client_playback_context,
			installation_id: session.installationId,
			...(failure ? {failure: {classification: 'playback_error'}} : null),
			...(session.bandwidthCapKbps ? {bandwidth_cap_kbps: session.bandwidthCapKbps} : null)
		};
		let decision;
		try {
			decision = await sendWithRetries(
				() => call(`/api/v2/playback/${encodeURIComponent(session.sessionId)}/replan`, {method: 'POST', body: sent, timeoutMs: START_TIMEOUT_MS}),
				REPLAN_RETRY_BUDGET_MS,
				(err) => retryableStart(err) || (err.status === 409 && err.code === 'replan_in_progress'),
				wait
			);
		} catch (err) {
			if (err.status === 410) {
				session.ended = true;
				throw Object.assign(new Error(SILO_PLAYBACK_ENDED_ON_SERVER), {siloRefused: true, reason: 'playback_session_ended'});
			}
			if (sessionGone(err) || installationChanged(err)) session.ended = true;
			throw err;
		}
		const next = decision?.playback_plan;
		if (decision?.outcome !== 'playable' || !next) throw refusal(decision);
		session.source = await sourceOfPlan(next, session.itemId, session.source?.Id, session.source);
		session.plan = next;
		session.planAttemptId = siloNewUuid();
		await freshenStreamAuth();
		return playingTracks(session, asPlaybackInfo(session, body.SubtitleStreamIndex));
	};

	const liveSessionOf = (itemId) => Object.keys(sessions).map((id) => sessions[id]).find((s) => s.itemId === itemId && !s.ended && !s.stopping);

	const ends = (err, session) => {
		if (sessionGone(err) || installationChanged(err)) {
			session.ended = true;
			return true;
		}
		return false;
	};

	const stop = async (session, positionTicks) => {
		const sample = positionTicks > 0 || session.sequence > 0;
		const sent = {
			installation_id: session.installationId,
			stop_id: session.stopId,
			...(sample ? {sequence: ++session.sequence, position: Math.max(positionTicks || 0, 0) / TICKS_PER_SECOND, is_paused: false} : null)
		};
		try {
			await sendWithRetries(
				() => call(`/api/v2/playback/${encodeURIComponent(session.sessionId)}`, {method: 'DELETE', body: sent}),
				STOP_RETRY_BUDGET_MS, retryableStart, wait
			);
		} catch (err) {
			if (!sessionGone(err)) throw err;
		} finally {
			session.ended = true;
			delete sessions[session.sessionId];
		}
	};

	return {
		// Silo's plan for the title, or a new plan for the one already playing.
		getPlaybackInfo: (itemId, body = {}, item = null) => {
			const live = liveSessionOf(itemId);
			return live ? replan(live, body) : start(itemId, body, item);
		},

		// What Play would get, for the details screen. Silo only answers inside a session, so it's ended right away.
		previewPlaybackInfo: (itemId, body = {}, item = null) => start(itemId, body, item, true),

		// Silo opens the session when the start answers, so there's nothing to say at the start.
		reportPlaybackStart: async () => null,

		// One sample: where the title is (the stream's position plus where it starts), paused or not, numbered. A
		// sample Silo already has under its number goes once more under the next one; a session Silo ended takes no more.
		reportPlaybackProgress: async (info) => {
			const session = sessions[info?.PlaySessionId];
			if (!session || session.ended || session.stopping) return null;
			const sample = () => ({
				installation_id: session.installationId,
				sequence: ++session.sequence,
				position: Math.max(info.PositionTicks || 0, 0) / TICKS_PER_SECOND,
				is_paused: info.IsPaused === true
			});
			const path = `/api/v2/playback/${encodeURIComponent(session.sessionId)}/progress`;
			try {
				return await call(path, {method: 'POST', body: sample()});
			} catch (err) {
				if (err.status === 409 && err.code === 'progress_conflict') {
					try {
						return await call(path, {method: 'POST', body: sample()});
					} catch (retryErr) {
						if (!ends(retryErr, session)) throw retryErr;
						return null;
					}
				}
				if (!ends(err, session)) throw err;
				return null;
			}
		},

		reportPlaybackStopped: (info) => {
			const session = sessions[info?.PlaySessionId];
			if (!session) return Promise.resolve(null);
			if (session.stopping) return session.stopping;
			if (session.ended) {
				delete sessions[session.sessionId];
				return Promise.resolve(null);
			}
			session.stopping = stop(session, info.PositionTicks);
			return session.stopping;
		},

		// Silo ends a session's transcode with its stop, and has no live streams to close.
		stopActiveEncodings: async () => null,
		closeLiveStream: async () => null,

		// For tests.
		sessionOf: (sessionId) => sessions[sessionId] || null
	};
};
