// Each codec is put to canPlayType, and HDR also needs the display to report a high
// dynamic range. Matroska, MPEG-TS and Dolby Vision always go through the server, since
// only some browsers open them. The profile is built from the capabilities alone, so
// Titan OS reuses it with what its SDK reports.
import {browserFromUserAgent} from './deviceInfo';

const MAX_BITRATE = 120_000_000;

let cachedCapabilities = null;
let probeElement = null;

const canPlay = (type) => {
	if (!probeElement) probeElement = document.createElement('video');
	return !!probeElement.canPlayType(type).replace(/no/, '');
};

export const probeCodecs = () => ({
	hevc: canPlay('video/mp4; codecs="hvc1.1.6.L120.90"'),
	hevcMain10: canPlay('video/mp4; codecs="hvc1.2.4.L153.B0"'),
	vp9: canPlay('video/webm; codecs="vp09.00.10.08"'),
	vp9Profile2: canPlay('video/webm; codecs="vp09.02.10.10"'),
	av1: canPlay('video/mp4; codecs="av01.0.08M.08"'),
	ac3: canPlay('audio/mp4; codecs="ac-3"'),
	eac3: canPlay('audio/mp4; codecs="ec-3"'),
	flac: canPlay('audio/mp4; codecs="flac"'),
	opus: canPlay('audio/webm; codecs="opus"'),
	nativeHls: canPlay('application/vnd.apple.mpegurl')
});

// Only Safari and a few TV engines let the page pick an audio track itself.
export const hasAudioTracks = () => typeof window.HTMLMediaElement !== 'undefined' && 'audioTracks' in window.HTMLMediaElement.prototype;

export const clearCapabilitiesCache = () => {
	cachedCapabilities = null;
};

export const getDeviceCapabilities = async () => {
	if (cachedCapabilities) return cachedCapabilities;

	const codecs = probeCodecs();
	const browser = browserFromUserAgent(navigator.userAgent);
	const hdr = typeof window.matchMedia === 'function' && window.matchMedia('(dynamic-range: high)').matches &&
		(codecs.hevcMain10 || codecs.vp9Profile2);

	cachedCapabilities = {
		...codecs,
		modelName: browser,
		osVersionDisplay: browser,
		uhd: window.screen.width * (window.devicePixelRatio || 1) >= 3840,
		hdr10: hdr,
		hlg: hdr,
		dolbyVision: false,
		dts: false,
		mkv: false,
		webm: codecs.vp9,
		ts: false,
		audioTracks: hasAudioTracks(),
		// Every browser this runs in plays HLS through MSE or natively, and fMP4
		// segments carry HEVC where TS segments only carry H.264.
		hlsFmp4: true,
		maxBitrate: MAX_BITRATE,
		autoMaxBitrate: MAX_BITRATE
	};

	console.log('[deviceProfile] Capabilities:', cachedCapabilities);
	return cachedCapabilities;
};

const buildVideoRangeTypes = (caps) => {
	const rangeTypes = ['SDR'];
	if (caps.hdr10) rangeTypes.push('HDR10', 'HDR10Plus');
	if (caps.hlg) rangeTypes.push('HLG');
	return rangeTypes.join('|');
};

const mp4VideoCodecs = (caps) => ['h264'].concat(caps.hevc ? ['hevc'] : [], caps.av1 ? ['av1'] : []).join(',');

const mp4AudioCodecs = (caps) => ['aac', 'mp3'].concat(caps.ac3 ? ['ac3'] : [], caps.eac3 ? ['eac3'] : [], caps.flac ? ['flac'] : []).join(',');

const buildDirectPlayProfiles = (caps) => {
	const profiles = [
		{Container: 'mp4,m4v', Type: 'Video', VideoCodec: mp4VideoCodecs(caps), AudioCodec: mp4AudioCodecs(caps)},
		{Container: 'mp3', Type: 'Audio'},
		{Container: 'aac', Type: 'Audio'},
		{Container: 'm4a', AudioCodec: 'aac', Type: 'Audio'},
		{Container: 'm4b', AudioCodec: 'aac', Type: 'Audio'},
		{Container: 'wav', Type: 'Audio'}
	];
	if (caps.webm) profiles.push({Container: 'webm', Type: 'Video', VideoCodec: ['vp8', 'vp9'].concat(caps.av1 ? ['av1'] : []).join(','), AudioCodec: 'vorbis,opus'});
	if (caps.flac) profiles.push({Container: 'flac', Type: 'Audio'});
	if (caps.opus) profiles.push({Container: 'webm,ogg', AudioCodec: 'opus,vorbis', Type: 'Audio'});
	// A live channel the server hands over as HLS, where only H.264 and AAC are sure to
	// come out of a TS segment.
	if (caps.nativeHls) profiles.push({Container: 'hls', Type: 'Video', VideoCodec: 'h264', AudioCodec: 'aac,mp3'});
	return profiles;
};

const AUDIO_TRANSCODING_PROFILES = [
	{Container: 'mp3', Type: 'Audio', AudioCodec: 'mp3', Context: 'Streaming', Protocol: 'http'},
	{Container: 'aac', Type: 'Audio', AudioCodec: 'aac', Context: 'Streaming', Protocol: 'http'}
];

// hls.js is only sure of stereo once it has to take over from a failed native player.
const tsHlsProfile = (caps, channels = caps.nativeHls ? '6' : '2') => (
	{Container: 'ts', Type: 'Video', AudioCodec: 'aac', VideoCodec: 'h264', Context: 'Streaming', Protocol: 'hls', MaxAudioChannels: channels, MinSegments: '1', BreakOnNonKeyFrames: false}
);

// The server takes the first profile it may use, so where fMP4 segments play they come
// first and an HEVC source that only needs its container or audio changed is copied.
// Jellyfin only takes a TS profile for a live channel, so that one always follows.
const buildTranscodingProfiles = (caps) => [
	...(caps.hlsFmp4
		? [{Container: 'mp4', Type: 'Video', AudioCodec: ['aac'].concat(caps.ac3 ? ['ac3'] : [], caps.eac3 ? ['eac3'] : []).join(','), VideoCodec: caps.hevc ? 'hevc,h264' : 'h264', Context: 'Streaming', Protocol: 'hls', MaxAudioChannels: '6', MinSegments: '1', BreakOnNonKeyFrames: false}]
		: []),
	tsHlsProfile(caps),
	{Container: 'mp4', Type: 'Video', AudioCodec: 'aac', VideoCodec: 'h264', Context: 'Static'},
	...AUDIO_TRANSCODING_PROFILES
];

const buildCodecProfiles = (caps) => {
	const videoRangeTypes = buildVideoRangeTypes(caps);
	const codecProfiles = [
		{
			Type: 'Video',
			Codec: 'h264',
			Conditions: [
				{Condition: 'EqualsAny', Property: 'VideoProfile', Value: 'high|main|baseline|constrained baseline', IsRequired: false},
				{Condition: 'EqualsAny', Property: 'VideoRangeType', Value: 'SDR', IsRequired: false},
				{Condition: 'LessThanEqual', Property: 'VideoLevel', Value: caps.uhd ? '51' : '42', IsRequired: false}
			]
		},
		{
			Type: 'Video',
			Codec: 'hevc',
			Conditions: [
				{Condition: 'EqualsAny', Property: 'VideoProfile', Value: caps.hevcMain10 ? 'main|main 10' : 'main', IsRequired: false},
				{Condition: 'EqualsAny', Property: 'VideoRangeType', Value: videoRangeTypes, IsRequired: false},
				{Condition: 'LessThanEqual', Property: 'VideoLevel', Value: caps.uhd ? '153' : '123', IsRequired: false}
			]
		},
		{Type: 'Video', Codec: 'vp9', Conditions: [{Condition: 'EqualsAny', Property: 'VideoRangeType', Value: videoRangeTypes, IsRequired: false}]},
		{Type: 'Video', Codec: 'av1', Conditions: [{Condition: 'EqualsAny', Property: 'VideoRangeType', Value: videoRangeTypes, IsRequired: false}]}
	];
	// Without audioTracks the element plays a file's first audio track, so picking any
	// other one has the server remux the stream with it.
	if (!caps.audioTracks) {
		codecProfiles.push({Type: 'VideoAudio', Conditions: [{Condition: 'Equals', Property: 'IsSecondaryAudio', Value: 'false', IsRequired: false}]});
	}
	return codecProfiles;
};

const SUBTITLE_PROFILES = [
	{Format: 'vtt', Method: 'External'},
	{Format: 'srt', Method: 'External'},
	{Format: 'ass', Method: 'External'},
	{Format: 'ssa', Method: 'External'},
	{Format: 'sub', Method: 'Encode'},
	{Format: 'smi', Method: 'Encode'},
	{Format: 'ttml', Method: 'External'},
	{Format: 'pgssub', Method: 'External'},
	{Format: 'dvdsub', Method: 'Encode'},
	{Format: 'dvbsub', Method: 'Encode'}
];

export const buildDeviceProfile = (caps, name) => ({
	Name: name,
	MaxStreamingBitrate: caps.maxBitrate,
	MaxStaticBitrate: caps.maxBitrate,
	MaxStaticMusicBitrate: 40_000_000,
	MusicStreamingTranscodingBitrate: 384_000,
	DirectPlayProfiles: buildDirectPlayProfiles(caps),
	TranscodingProfiles: buildTranscodingProfiles(caps),
	CodecProfiles: buildCodecProfiles(caps),
	SubtitleProfiles: SUBTITLE_PROFILES,
	ResponseProfiles: [{Type: 'Video', Container: 'm4v', MimeType: 'video/mp4'}]
});

// H.264 and stereo AAC in TS only, for the hls.js retry after a native transcode fails.
export const buildH264FallbackProfile = (caps, name) => ({
	...buildDeviceProfile(caps, name),
	TranscodingProfiles: [
		tsHlsProfile(caps, '2'),
		{Container: 'mp4', Type: 'Video', AudioCodec: 'aac', VideoCodec: 'h264', Context: 'Static'},
		...AUDIO_TRANSCODING_PROFILES
	]
});

export const getJellyfinDeviceProfile = async () => buildDeviceProfile(await getDeviceCapabilities(), 'Moonfin Web');

export const getH264FallbackProfile = async () => buildH264FallbackProfile(await getDeviceCapabilities(), 'Moonfin Web');

export const getDeviceId = () => {
	let deviceId = localStorage.getItem('moonfin_device_id');
	if (!deviceId) {
		deviceId = 'moonfin_' + Date.now().toString(36) + Math.random().toString(36).substring(2);
		localStorage.setItem('moonfin_device_id', deviceId);
	}
	return deviceId;
};

export const getDeviceName = async () => (await getDeviceCapabilities()).modelName;
