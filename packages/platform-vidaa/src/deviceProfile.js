// What a Hisense VIDAA TV can play, and the Jellyfin profile that says so.
//
// The app runs in the TV's own Chromium ("odin"), which hands media to the
// TV's hardware pipeline. Measured on a 55U65QEVS (MT9618, VIDAA U09.60):
// 4K HEVC Main10 HDR10 plays through MSE, and EAC3/AC3 decode or pass through.
//
// The browser is asked first. Where it gives no answer, the measured facts
// stand in, since this build only ships to VIDAA sets of that generation.
//
// The page is drawn at 1920x1080 while video goes out on its own 4K plane,
// so the screen size says nothing about what the panel can show.
//
// MKV is played as it is: the browser hands the file to the TV's own media
// engine (Hisense's hisplayback, the one that plays USB files), not to
// Chromium's demuxers. Anything the profile can't take goes to fMP4 HLS.

export const MAX_BITRATE = 120_000_000;

let cachedCapabilities = null;
let probeElement = null;

const canPlayType = (type) => {
	try {
		if (!probeElement) probeElement = document.createElement('video');
		return !!probeElement.canPlayType(type).replace(/no/, '');
	} catch (e) {
		return false;
	}
};

const mseSupports = (type) => {
	try {
		return !!(window.MediaSource && window.MediaSource.isTypeSupported(type));
	} catch (e) {
		return false;
	}
};

const supports = (type) => mseSupports(type) || canPlayType(type);

export const clearCapabilitiesCache = () => {
	cachedCapabilities = null;
};

export const getDeviceCapabilities = async () => {
	if (cachedCapabilities) return cachedCapabilities;

	const probed = {
		dvhe08: supports('video/mp4; codecs="dvh1.08.06"'),
		dvhe05: supports('video/mp4; codecs="dvh1.05.06"'),
		av1: supports('video/mp4; codecs="av01.0.08M.10"'),
		vp9: supports('video/mp4; codecs="vp09.02.10.10"'),
		dts: supports('audio/mp4; codecs="dtsc"'),
	};

	cachedCapabilities = {
		modelName: 'Hisense VIDAA',
		// 4K panel and decoder on every set this build targets; see the header.
		uhd: true,
		uhd8K: false,

		hdr10: true,
		hdr10Plus: true,
		hlg: true,
		// Dolby Vision only if the browser says so; otherwise a Dolby Vision file
		// with an HDR10 base layer plays as HDR10.
		dolbyVision: probed.dvhe08 || probed.dvhe05,

		hevc: true,
		av1: probed.av1,
		vp9: probed.vp9,

		ac3: true,
		eac3: true,
		dts: probed.dts,
		// The browser hands audio to the TV's own engine, which plays TrueHD
		// (tested with a 4K Dolby Vision MKV with a TrueHD 7.1 track).
		truehd: true,
		flac: true,
		opus: true,

		mkv: true,
		webm: true,
		ts: false,

		// Always hls.js over MSE: that is the path 4K HEVC was measured on.
		nativeHls: false,

		autoMaxBitrate: MAX_BITRATE,
		probed
	};

	console.log('[vidaaProfile] Capabilities:', cachedCapabilities);
	return cachedCapabilities;
};

// A dual layer Dolby Vision file carries a base layer that plays on its own.
const buildVideoRangeTypes = (caps) => {
	const rangeTypes = ['SDR', 'DOVIWithSDR'];
	if (caps.hdr10) rangeTypes.push('HDR10', 'HDR10Plus', 'DOVIWithHDR10', 'DOVIWithHDR10Plus', 'DOVIWithEL', 'DOVIWithELHDR10Plus', 'DOVIInvalid');
	if (caps.hlg) rangeTypes.push('HLG', 'DOVIWithHLG');
	if (caps.dolbyVision) rangeTypes.push('DOVI');
	return rangeTypes.join('|');
};

const buildVideoCodecs = (caps) => {
	const codecs = ['h264'];
	if (caps.hevc) codecs.push('hevc');
	if (caps.dolbyVision) codecs.push('dvh1', 'dvhe');
	if (caps.av1) codecs.push('av1');
	return codecs;
};

const buildAudioCodecs = (caps) => {
	const codecs = ['aac', 'mp3', 'opus', 'flac'];
	if (caps.ac3) codecs.push('ac3');
	if (caps.eac3) codecs.push('eac3');
	if (caps.dts) codecs.push('dca', 'dts');
	if (caps.truehd) codecs.push('truehd');
	return codecs;
};

const buildDirectPlayProfiles = (caps) => {
	const videoCodecs = buildVideoCodecs(caps).join(',');
	const audioCodecs = buildAudioCodecs(caps).join(',');
	const webmVideoCodecs = ['vp8'].concat(caps.vp9 ? ['vp9'] : [], caps.av1 ? ['av1'] : []).join(',');

	return [
		{Container: 'mp4,m4v', Type: 'Video', VideoCodec: videoCodecs, AudioCodec: audioCodecs},
		...(caps.mkv ? [{Container: 'mkv', Type: 'Video', VideoCodec: videoCodecs, AudioCodec: audioCodecs}] : []),
		{Container: 'mov', Type: 'Video', VideoCodec: videoCodecs, AudioCodec: audioCodecs},
		{Container: 'webm', Type: 'Video', VideoCodec: webmVideoCodecs, AudioCodec: 'vorbis,opus'},
		{Container: 'mp3', Type: 'Audio'},
		{Container: 'flac', Type: 'Audio'},
		{Container: 'aac', Type: 'Audio'},
		{Container: 'ogg', Type: 'Audio'},
		{Container: 'wav', Type: 'Audio'},
		{Container: 'webm', AudioCodec: 'opus', Type: 'Audio'},
		{Container: 'm4a', AudioCodec: 'aac', Type: 'Audio'},
		{Container: 'm4b', AudioCodec: 'aac', Type: 'Audio'}
	];
};

const AUDIO_TRANSCODING_PROFILES = [
	{Container: 'mp3', Type: 'Audio', AudioCodec: 'mp3', Context: 'Streaming', Protocol: 'http'},
	{Container: 'aac', Type: 'Audio', AudioCodec: 'aac', Context: 'Streaming', Protocol: 'http'}
];

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

export const getJellyfinDeviceProfile = async () => {
	const caps = await getDeviceCapabilities();
	const videoRangeTypes = buildVideoRangeTypes(caps);

	// The remux and any real transcode go out as fMP4 HLS for hls.js, which
	// carries HEVC (TS does not get HEVC through MSE). The server takes the
	// first codec it may use, so an HEVC source is copied and only its audio
	// converted when that is all it needs. Surround audio stays surround:
	// EAC3 first, then AC3, then AAC.
	const hlsVideoCodecs = caps.hevc ? 'hevc,h264' : 'h264';
	const hlsAudioCodecs = [].concat(caps.eac3 ? ['eac3'] : [], caps.ac3 ? ['ac3'] : [], ['aac', 'mp3']).join(',');
	const transcodingProfiles = [
		{Container: 'mp4', Type: 'Video', AudioCodec: hlsAudioCodecs, VideoCodec: hlsVideoCodecs, Context: 'Streaming', Protocol: 'hls', MaxAudioChannels: '6', MinSegments: '1', SegmentLength: 3, BreakOnNonKeyFrames: false},
		// Live TV only takes a TS profile.
		{Container: 'ts', Type: 'Video', AudioCodec: 'aac', VideoCodec: 'h264', Context: 'Streaming', Protocol: 'hls', MaxAudioChannels: '2', MinSegments: '1', BreakOnNonKeyFrames: false},
		{Container: 'mp4', Type: 'Video', AudioCodec: 'aac', VideoCodec: 'h264', Context: 'Static'},
		...AUDIO_TRANSCODING_PROFILES
	];

	const codecProfiles = [
		{
			Type: 'Video',
			Codec: 'h264',
			Conditions: [
				{Condition: 'EqualsAny', Property: 'VideoProfile', Value: 'high|main|baseline|constrained baseline', IsRequired: false},
				{Condition: 'EqualsAny', Property: 'VideoRangeType', Value: 'SDR', IsRequired: false},
				{Condition: 'LessThanEqual', Property: 'VideoLevel', Value: '51', IsRequired: false}
			]
		},
		{
			Type: 'Video',
			Codec: 'hevc',
			Conditions: [
				// Both spellings: the server's copy check compares against the source's
				// profile with its spaces removed ("Main10").
				{Condition: 'EqualsAny', Property: 'VideoProfile', Value: 'main|main 10|main10', IsRequired: false},
				{Condition: 'EqualsAny', Property: 'VideoRangeType', Value: videoRangeTypes, IsRequired: false},
				{Condition: 'LessThanEqual', Property: 'VideoLevel', Value: '153', IsRequired: false}
			]
		},
		{
			Type: 'Video',
			Codec: 'dvh1',
			Conditions: [
				{Condition: 'EqualsAny', Property: 'VideoRangeType', Value: videoRangeTypes, IsRequired: false},
				{Condition: 'LessThanEqual', Property: 'VideoLevel', Value: '153', IsRequired: false}
			]
		},
		{
			Type: 'VideoAudio',
			Codec: 'flac',
			Conditions: [
				{Condition: 'LessThanEqual', Property: 'AudioChannels', Value: '8', IsRequired: false}
			]
		},
		// The browser plays a file's first audio track, so picking any other one
		// has the server remux the stream with it.
		{
			Type: 'VideoAudio',
			Conditions: [
				{Condition: 'Equals', Property: 'IsSecondaryAudio', Value: 'false', IsRequired: false}
			]
		}
	];

	return {
		Name: 'Moonfin VIDAA',
		MaxStreamingBitrate: MAX_BITRATE,
		MaxStaticBitrate: MAX_BITRATE,
		MaxStaticMusicBitrate: 40_000_000,
		MusicStreamingTranscodingBitrate: 384_000,
		DirectPlayProfiles: buildDirectPlayProfiles(caps),
		TranscodingProfiles: transcodingProfiles,
		CodecProfiles: codecProfiles,
		SubtitleProfiles: SUBTITLE_PROFILES,
		ResponseProfiles: [
			{Type: 'Video', Container: 'm4v', MimeType: 'video/mp4'},
			{Type: 'Video', Container: 'mkv', MimeType: 'video/x-matroska'}
		]
	};
};

// H.264 and stereo AAC only, for the retry after a transcode fails to play.
export const getH264FallbackProfile = async () => {
	const profile = await getJellyfinDeviceProfile();
	profile.TranscodingProfiles = [
		{Container: 'mp4', Type: 'Video', AudioCodec: 'aac', VideoCodec: 'h264', Context: 'Streaming', Protocol: 'hls', MaxAudioChannels: '2', MinSegments: '1', SegmentLength: 3, BreakOnNonKeyFrames: false},
		{Container: 'mp4', Type: 'Video', AudioCodec: 'aac', VideoCodec: 'h264', Context: 'Static'},
		...AUDIO_TRANSCODING_PROFILES
	];
	return profile;
};

export const getDeviceId = () => {
	let deviceId = localStorage.getItem('moonfin_device_id');
	if (!deviceId) {
		deviceId = 'moonfin_' + Date.now().toString(36) + Math.random().toString(36).substring(2);
		localStorage.setItem('moonfin_device_id', deviceId);
	}
	return deviceId;
};

export const getDeviceName = async () => 'Hisense VIDAA TV';
