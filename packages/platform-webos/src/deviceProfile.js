// Device Profile Service - webOS hardware capability detection via Luna APIs

let cachedCapabilities = null;

export const clearCapabilitiesCache = () => {
	cachedCapabilities = null;
};

const CHROME_TO_WEBOS = [
	[120, 25], [108, 24], [94, 23], [87, 22], [79, 6], [68, 5], [53, 4], [38, 3], [34, 2], [26, 1]
];

const getWebOSVersionFromChrome = (chromeVersion) => {
	for (const [chrome, webos] of CHROME_TO_WEBOS) {
		if (chromeVersion >= chrome) return webos;
	}
	return 4; // Default
};

// Starting with webOS 7 (2022), LG uses year-based marketing names (22, 23, 24, 25...)
// but the enact SDK and internal APIs still return sequential versions (7, 8, 9, 10...).
// All capability checks in this codebase use the marketing version numbers, so we
// convert internal versions 7+ to marketing: marketing = internal + 15.
const internalToMarketingVersion = (internal) => {
	if (internal >= 7) return internal + 15;
	return internal;
};

export const detectWebOSVersion = (sdkVersion = null) => {
	if (sdkVersion) {
		const match = /^(\d+)\./.exec(sdkVersion);
		if (match) {
			const major = parseInt(match[1], 10);
			if (major >= 1) return internalToMarketingVersion(major);
		}
	}

	const ua = navigator.userAgent.toLowerCase();
	const chromeMatch = /chrome\/(\d+)/.exec(ua);
	if (chromeMatch) {
		return getWebOSVersionFromChrome(parseInt(chromeMatch[1], 10));
	}
	return 4;
};

const getDocumentedContainerSupport = (webosVersion) => {
	const supported = {
		mp4: true,
		m4v: true,
		ts: true,
		mov: true,
		avi: true,
		'3gp': true,
		mpg: true,
		vob: true,
		asf: true,
		wmv: true,
		webm: false,
		mkv: false,
		hls: true
	};

	if (webosVersion >= 4) {
		supported.mkv = true;
	}

	if (webosVersion >= 5) {
		supported.webm = true;
	}

	console.log(`[deviceProfile] webOS ${webosVersion} documented container support:`, supported);
	return supported;
};

export const testHevcSupport = (lunaResult = null, webosVersion = 4) => {
	if (lunaResult === true) return true;
	if (lunaResult === false) return false;
	return webosVersion >= 4;
};

export const testAv1Support = (lunaResult = null, webosVersion = 4) => {
	if (lunaResult === true) return true;
	if (lunaResult === false) return false;
	return webosVersion >= 5;
};

export const testVp9Support = (lunaResult = null, webosVersion = 4) => {
	if (lunaResult === true) return true;
	if (lunaResult === false) return false;
	return webosVersion >= 4;
};

// Runtime check: does the platform's media pipeline actually handle HLS?
// Real webOS TVs with Starfish return "maybe"/"probably".
// Emulators/VMs without Starfish return "" (Chromium alone can't play HLS).
export const canPlayNativeHls = () => {
	if (typeof document === 'undefined') return false;
	const video = document.createElement('video');
	return !!(video.canPlayType('application/x-mpegURL').replace(/no/, '')
		|| video.canPlayType('application/vnd.apple.mpegURL').replace(/no/, ''));
};

// DTS support varies by webOS version AND container:
//   webOS 4/4.5: DTS in AVI + MKV (unconditionally supported)
//   webOS 5/6/22: DTS in MKV only
//   webOS 23+: DTS in MKV + MP4 + TS (model-specific, detected via tv.model.edidType)
// The undocumented Luna config key 'tv.model.edidType' indicates DTS support when it
// contains 'dts'. e.g. "TrueHD+dts" = DTS supported, plain "TrueHD" = no DTS.
// This key is NOT in LG's public developer docs but is known from reverse engineering.
//
// Note on soundbars: When edidType reports DTS support, the TV can decode DTS internally.
// However, if a soundbar is connected that doesn't support DTS, the TV decodes DTS and
// sends only 2.0 PCM to the soundbar, losing surround channels. In that case, server-side
// transcode to AAC/AC3 would be preferable to preserve channel layout, but there's no
// reliable way to detect connected soundbar capabilities via Luna APIs.
export const getDtsContainerSupport = (webosVersion, edidHasDts = false) => {
	if (webosVersion >= 23) {
		// edidType is the authoritative source on webOS 23+.
		// If the key is absent or doesn't contain 'dts', the TV cannot decode DTS.
		return {
			mkv: !!edidHasDts,
			mp4: !!edidHasDts,
			ts: !!edidHasDts,
			avi: false
		};
	}
	if (webosVersion >= 5) {
		// webOS 5/6/22: DTS in MKV only
		return { mkv: true, mp4: false, ts: false, avi: false };
	}
	// webOS 4/4.5: DTS unconditionally supported in AVI + MKV
	return { mkv: true, mp4: false, ts: false, avi: true };
};

export const testAc3Support = () => true;

export const getDeviceCapabilities = async () => {
	if (cachedCapabilities) return cachedCapabilities;

	let deviceInfoData = {};
	let configData = {};

	// Get device info from webOS SDK
	try {
		const deviceInfo = await import('@enact/webos/deviceinfo');
		deviceInfoData = await new Promise(resolve => deviceInfo.default(resolve));
	} catch (e) { void e; }

	// Get config from Luna API
	try {
		const LS2Request = (await import('@enact/webos/LS2Request')).default;
		configData = await new Promise((resolve) => {
			new LS2Request().send({
				service: 'luna://com.webos.service.config',
				method: 'getConfigs',
				parameters: {
					configNames: [
						'tv.model.*',
						'tv.hw.*'
					]
				},
				onSuccess: resolve,
				onFailure: () => resolve({configs: {}})
			});
		});
	} catch (e) { void e; }

	const cfg = configData.configs || {};
	const webosVersion = detectWebOSVersion(deviceInfoData.sdkVersion);

	const containerSupport = getDocumentedContainerSupport(webosVersion);

	const isUhd = cfg['tv.hw.panelResolution'] === 'UD' || cfg['tv.hw.panelResolution'] === '8K' || deviceInfoData.uhd || false;
	const isOled = cfg['tv.hw.displayType'] === 'OLED' || (cfg['tv.model.moduleBackLightType'] || '').toLowerCase() === 'oled' || deviceInfoData.oled || false;

	// DTS detection: tv.model.edidType contains 'dts' when DTS is supported
	// e.g. "TrueHD+dts" = DTS supported, plain "TrueHD" = no DTS
	// If the key is absent or doesn't mention dts, the TV cannot decode DTS.
	const rawEdidType = cfg['tv.model.edidType'];
	const edidHasDts = rawEdidType != null && rawEdidType.toLowerCase().includes('dts');

	// Per-container DTS support based on LG documentation + edidType detection
	const dtsSupport = getDtsContainerSupport(webosVersion, edidHasDts);

	cachedCapabilities = {
		modelName: deviceInfoData.modelName || cfg['tv.model.modelname'] || 'Unknown',
		modelNameAscii: deviceInfoData.modelNameAscii || '',
		serialNumber: cfg['tv.model.serialnumber'] || '',
		sdkVersion: deviceInfoData.sdkVersion || 'Unknown',
		firmwareVersion: deviceInfoData.version || '',

		webosVersion,
		webosVersionDisplay: `webOS ${webosVersion}`,

		screenWidth: deviceInfoData.screenWidth || 1920,
		screenHeight: deviceInfoData.screenHeight || 1080,
		uhd: isUhd,
		uhd8K: cfg['tv.hw.panelResolution'] === '8K' || cfg['tv.hw.bSupport_8K_resolution'] === true || deviceInfoData.uhd8K || false,
		oled: isOled,

		hdr10: cfg['tv.model.supportHDR'] === true || webosVersion >= 4,
		// HDR10+ has no native webOS support, but content plays fine as HDR10
		// (dynamic metadata is ignored). Match hdr10 to avoid unnecessary transcoding.
		hdr10Plus: cfg['tv.model.supportHDR'] === true || webosVersion >= 4,
		hlg: cfg['tv.model.supportHDR'] === true || webosVersion >= 4,

		// DV detection: webOS 4+ UHD/OLED TVs have DV hardware. Luna config keys
		// (tv.model.supportDolbyVisionHDR) exist in webOS OSE configd but aren't in
		// LG's public docs — used as supplementary positive signal only.
		dolbyVision: (() => {
			if (webosVersion >= 4 && (isUhd || isOled)) return true;
			const lunaVal = cfg['tv.model.supportDolbyVisionHDR'];
			if (lunaVal === true || lunaVal === 'true' || lunaVal === 'Y' || lunaVal === 1) return true;
			const lunaVal2 = cfg['tv.model.supportDolbyVision'];
			if (lunaVal2 === true || lunaVal2 === 'true' || lunaVal2 === 'Y' || lunaVal2 === 1) return true;
			return false;
		})(),

		dolbyAtmos: (cfg['tv.model.soundModeType'] || '').includes('Dolby Atmos'),
		dts: dtsSupport,
		ac3: testAc3Support(),
		eac3: true,
		// webOS can only passthrough TrueHD/DTS-HD to an AV receiver, not decode internally
		truehd: false,
		dtshd: false,

		hevc: testHevcSupport(null, webosVersion),
		av1: testAv1Support(null, webosVersion),
		vp9: testVp9Support(null, webosVersion),

		...containerSupport,

		nativeHls: containerSupport.hls,
		hasNativeHls: canPlayNativeHls(),
		nativeHlsFmp4: webosVersion >= 5,
		hlsAc3: webosVersion >= 5,
		hlsByteRange: webosVersion >= 4,

		lunaConfig: cfg,
		ddrSize: cfg['tv.hw.ddrSize'] || 0
	};

	console.log('[deviceProfile] Capabilities:', cachedCapabilities);
	return cachedCapabilities;
};

const buildVideoRangeTypes = (caps) => {
	let rangeTypes = ['SDR'];

	const isWebOsWithoutDV = caps.webosVersion >= 4 && !caps.dolbyVision;
	if (isWebOsWithoutDV) {
		rangeTypes.push('DOVIWithSDR');
	}

	if (caps.hdr10) {
		rangeTypes.push('HDR10', 'HDR10Plus');

		if (isWebOsWithoutDV) {
			rangeTypes.push('DOVIWithHDR10', 'DOVIWithHDR10Plus', 'DOVIWithEL', 'DOVIWithELHDR10Plus', 'DOVIInvalid');
		}
	}

	if (caps.hlg) {
		rangeTypes.push('HLG');

		if (isWebOsWithoutDV) {
			rangeTypes.push('DOVIWithHLG');
		}
	}

	if (caps.dolbyVision) {
		rangeTypes.push('DOVI', 'DOVIWithHDR10', 'DOVIWithHLG', 'DOVIWithSDR', 'DOVIWithHDR10Plus');
		rangeTypes.push('DOVIWithEL', 'DOVIWithELHDR10Plus', 'DOVIInvalid');
	}

	return rangeTypes.join('|');
};

const buildDirectPlayProfiles = (caps) => {
	const profiles = [];

	const mp4VideoCodecs = ['h264'];
	if (caps.hevc) mp4VideoCodecs.push('hevc', 'dvh1');
	if (caps.dolbyVision) mp4VideoCodecs.push('dvhe');
	if (caps.av1) mp4VideoCodecs.push('av1');

	// Per-container audio codecs based on LG's official AV format docs.
	// Different containers support different audio codecs on webOS.
	const dts = caps.dts || {}; // Per-container DTS support object

	// MP4/M4V/MOV: ac3, eac3, aac, mp3; DTS only on webOS 23+ (model-specific)
	const mp4AudioCodecs = ['aac', 'mp3'];
	if (caps.ac3) mp4AudioCodecs.push('ac3');
	if (caps.eac3) mp4AudioCodecs.push('eac3');
	if (dts.mp4) mp4AudioCodecs.push('dca', 'dts');

	// MKV: ac3, eac3, aac, mp2, pcm, mp3, opus (24+), dts (all versions per LG docs)
	// FLAC and Vorbis are NOT listed in MKV by LG docs (standalone formats only)
	const mkvAudioCodecs = ['aac', 'mp2', 'mp3', 'pcm_s16le', 'pcm_s24le'];
	if (caps.ac3) mkvAudioCodecs.push('ac3');
	if (caps.eac3) mkvAudioCodecs.push('eac3');
	if (dts.mkv) mkvAudioCodecs.push('dca', 'dts');
	if (caps.webosVersion >= 24) mkvAudioCodecs.push('opus');

	// TS: ac3, eac3, aac, mp2, pcm, mp3; DTS only on webOS 23+ (model-specific)
	const tsAudioCodecs = ['aac', 'mp2', 'mp3', 'pcm_s16le', 'pcm_s24le'];
	if (caps.ac3) tsAudioCodecs.push('ac3');
	if (caps.eac3) tsAudioCodecs.push('eac3');
	if (dts.ts) tsAudioCodecs.push('dca', 'dts');

	// AVI: ac3, mp2, mp3, lpcm, adpcm; DTS only on webOS 4/4.5
	const aviAudioCodecs = ['mp2', 'mp3', 'pcm_s16le', 'pcm_s24le'];
	if (caps.ac3) aviAudioCodecs.push('ac3');
	if (dts.avi) aviAudioCodecs.push('dca', 'dts');

	const webmVideoCodecs = ['vp8'];
	if (caps.vp9) webmVideoCodecs.push('vp9');
	if (caps.av1) webmVideoCodecs.push('av1');
	const webmAudioCodecs = ['vorbis'];
	if (caps.webosVersion >= 24) webmAudioCodecs.push('opus');

	if (caps.webm) {
		profiles.push({
			Container: 'webm',
			Type: 'Video',
			VideoCodec: webmVideoCodecs.join(','),
			AudioCodec: webmAudioCodecs.join(',')
		});
	}

	profiles.push({
		Container: 'mp4,m4v',
		Type: 'Video',
		VideoCodec: mp4VideoCodecs.join(','),
		AudioCodec: mp4AudioCodecs.join(',')
	});

	if (caps.mkv) {
		// MKV supports broader video codecs per LG docs: MPEG-2, MPEG-4, H.264, VP8, VP9, HEVC, AV1
		const mkvVideoCodecs = ['h264', 'mpeg4', 'mpeg2video', 'vp8'];
		if (caps.hevc) mkvVideoCodecs.push('hevc', 'dvh1');
		if (caps.dolbyVision) mkvVideoCodecs.push('dvhe');
		if (caps.vp9) mkvVideoCodecs.push('vp9');
		if (caps.av1) mkvVideoCodecs.push('av1');

		profiles.push({
			Container: 'mkv',
			Type: 'Video',
			VideoCodec: mkvVideoCodecs.join(','),
			AudioCodec: mkvAudioCodecs.join(',')
		});
	}

	if (caps.ts) {
		// TS per LG docs: H.264, HEVC, MPEG-2; VC-1 is only documented in ASF/WMV
		const tsVideoCodecs = ['h264'];
		if (caps.hevc) tsVideoCodecs.push('hevc', 'dvh1');
		if (caps.dolbyVision) tsVideoCodecs.push('dvhe');
		tsVideoCodecs.push('mpeg2video');

		profiles.push({
			Container: 'ts,mpegts',
			Type: 'Video',
			VideoCodec: tsVideoCodecs.join(','),
			AudioCodec: tsAudioCodecs.join(',')
		});
	}

	// M2TS (Blu-ray transport stream): H.264, HEVC (UHD Blu-ray), VC-1, MPEG-2
	const m2tsVideoCodecs = ['h264', 'vc1', 'mpeg2video'];
	if (caps.hevc) m2tsVideoCodecs.push('hevc', 'dvh1');
	if (caps.dolbyVision) m2tsVideoCodecs.push('dvhe');

	profiles.push({
		Container: 'm2ts',
		Type: 'Video',
		VideoCodec: m2tsVideoCodecs.join(','),
		AudioCodec: tsAudioCodecs.join(',')
	});

	if (caps.asf || caps.wmv) {
		// ASF/WMV per LG docs: VC-1 (Advanced/Simple/Main), WMA
		profiles.push({
			Container: 'asf',
			Type: 'Video',
			VideoCodec: 'vc1',
			AudioCodec: 'wmav2,wmapro'
		});
		profiles.push({
			Container: 'wmv',
			Type: 'Video',
			VideoCodec: 'vc1',
			AudioCodec: 'wmav2,wmapro'
		});
	}

	if (caps.avi) {
		// AVI per LG docs: Xvid, H.264/AVC, Motion JPEG, MPEG-4
		const aviVideoCodecs = ['h264', 'mpeg4', 'mjpeg'];

		profiles.push({
			Container: 'avi',
			Type: 'Video',
			VideoCodec: aviVideoCodecs.join(','),
			AudioCodec: aviAudioCodecs.join(',')
		});
	}

	if (caps.mpg) {
		// MPG/MPEG per LG docs: MPEG-1, MPEG-2 video; MP2, MP3 audio
		profiles.push({
			Container: 'mpg,mpeg',
			Type: 'Video',
			VideoCodec: 'mpeg1video,mpeg2video',
			AudioCodec: 'mp2,mp3'
		});
	}

	// VOB per LG docs: supported on all webOS versions (MPEG-2 + MP2/AC3 audio)
	if (caps.vob) {
		const vobAudioCodecs = ['mp2'];
		if (caps.ac3) vobAudioCodecs.push('ac3');

		profiles.push({
			Container: 'vob',
			Type: 'Video',
			VideoCodec: 'mpeg2video',
			AudioCodec: vobAudioCodecs.join(',')
		});
	}

	// MOV per LG docs: H.264/AVC, MPEG-4, HEVC, AV1
	const movVideoCodecs = ['h264', 'mpeg4'];
	if (caps.hevc) movVideoCodecs.push('hevc', 'dvh1');
	if (caps.dolbyVision) movVideoCodecs.push('dvhe');
	if (caps.av1) movVideoCodecs.push('av1');

	profiles.push({
		Container: 'mov',
		Type: 'Video',
		VideoCodec: movVideoCodecs.join(','),
		AudioCodec: mp4AudioCodecs.join(',')
	});

	['mp3', 'flac', 'aac', 'ogg', 'wav', 'wma'].forEach(format => {
		profiles.push({
			Container: format,
			Type: 'Audio'
		});
	});

	if (caps.webosVersion >= 24) {
		profiles.push({
			Container: 'webm',
			AudioCodec: 'opus',
			Type: 'Audio'
		});
	}

	profiles.push({
		Container: 'm4a',
		AudioCodec: 'aac',
		Type: 'Audio'
	});

	profiles.push({
		Container: 'm4b',
		AudioCodec: 'aac',
		Type: 'Audio'
	});

	if (caps.nativeHls) {
		// HLS uses TS segments, so use TS-compatible audio codecs
		profiles.push({
			Container: 'hls',
			Type: 'Video',
			VideoCodec: mp4VideoCodecs.join(','),
			AudioCodec: tsAudioCodecs.join(',')
		});
	}

	return profiles;
};

export const getJellyfinDeviceProfile = async () => {
	const caps = await getDeviceCapabilities();

	const videoRangeTypes = buildVideoRangeTypes(caps);
	const directPlayProfiles = buildDirectPlayProfiles(caps);

	const maxStreamingBitrate = 120_000_000;
	const maxAudioChannels = caps.dolbyAtmos ? '8' : '6';

	// fMP4 preserves DV RPU metadata; MPEG-TS strips it. Use fMP4 on webOS 5+.
	const hlsContainer = caps.nativeHlsFmp4 ? 'mp4' : 'ts';
	let transcodingProfiles;

	if (caps.hasNativeHls) {
		const hlsAudioCodecs = caps.eac3 ? 'aac,mp2,ac3,eac3' : (caps.ac3 ? 'aac,mp2,ac3' : 'aac,mp2');
		const hlsVideoCodec = caps.dolbyVision ? 'hevc,dvh1,dvhe' : 'hevc';
		transcodingProfiles = [
			...(caps.hevc ? [{
				Container: hlsContainer,
				Type: 'Video',
				AudioCodec: hlsAudioCodecs,
				VideoCodec: hlsVideoCodec,
				Context: 'Streaming',
				Protocol: 'hls',
				MaxAudioChannels: maxAudioChannels,
				MinSegments: '1',
				BreakOnNonKeyFrames: false
			}] : []),
			{
				Container: hlsContainer,
				Type: 'Video',
				AudioCodec: hlsAudioCodecs,
				VideoCodec: 'h264',
				Context: 'Streaming',
				Protocol: 'hls',
				MaxAudioChannels: maxAudioChannels,
				MinSegments: '1',
				BreakOnNonKeyFrames: false
			},
		];
	} else {
		transcodingProfiles = [
			{
				Container: hlsContainer,
				Type: 'Video',
				AudioCodec: 'aac',
				VideoCodec: 'h264',
				Context: 'Streaming',
				Protocol: 'hls',
				MaxAudioChannels: '2',
				MinSegments: '1',
				BreakOnNonKeyFrames: false
			},
		];
	}

	transcodingProfiles.push(
		{
			Container: 'mp4',
			Type: 'Video',
			AudioCodec: 'aac,ac3',
			VideoCodec: 'h264',
			Context: 'Static'
		},
		{
			Container: 'mp3',
			Type: 'Audio',
			AudioCodec: 'mp3',
			Context: 'Streaming',
			Protocol: 'http'
		},
		{
			Container: 'aac',
			Type: 'Audio',
			AudioCodec: 'aac',
			Context: 'Streaming',
			Protocol: 'http'
		}
	);

	const h264MaxLevel = (caps.webosVersion >= 4 && (caps.uhd || caps.uhd8K)) ? '51' : '42';
	const hevcMaxLevel = caps.uhd8K ? '186' : caps.uhd ? '153' : '123';

	const codecProfiles = [
		{
			Type: 'Video',
			Codec: 'h264',
			Conditions: [
				{
					Condition: 'EqualsAny',
					Property: 'VideoProfile',
					Value: 'high|main|baseline|constrained baseline',
					IsRequired: false
				},
				{
					Condition: 'EqualsAny',
					Property: 'VideoRangeType',
					Value: 'SDR',
					IsRequired: false
				},
				{
					Condition: 'LessThanEqual',
					Property: 'VideoLevel',
					Value: h264MaxLevel,
					IsRequired: false
				}
			]
		},
		{
			Type: 'Video',
			Codec: 'hevc',
			Conditions: [
				{
					Condition: 'EqualsAny',
					Property: 'VideoProfile',
					Value: 'main|main 10',
					IsRequired: false
				},
				{
					Condition: 'EqualsAny',
					Property: 'VideoRangeType',
					Value: videoRangeTypes,
					IsRequired: false
				},
				{
					Condition: 'LessThanEqual',
					Property: 'VideoLevel',
					Value: hevcMaxLevel,
					IsRequired: false
				}
			]
		},
		...(caps.hevc ? [{
			Type: 'Video',
			Codec: 'dvh1',
			Conditions: [
				{
					Condition: 'EqualsAny',
					Property: 'VideoRangeType',
					Value: videoRangeTypes,
					IsRequired: false
				},
				{
					Condition: 'LessThanEqual',
					Property: 'VideoLevel',
					Value: hevcMaxLevel,
					IsRequired: false
				}
			]
		}] : []),
		...(caps.dolbyVision ? [{
			Type: 'Video',
			Codec: 'dvhe',
			Conditions: [
				{
					Condition: 'EqualsAny',
					Property: 'VideoRangeType',
					Value: videoRangeTypes,
					IsRequired: false
				},
				{
					Condition: 'LessThanEqual',
					Property: 'VideoLevel',
					Value: hevcMaxLevel,
					IsRequired: false
				}
			]
		}] : []),
		{
			Type: 'Video',
			Codec: 'vp9',
			Conditions: [
				{
					Condition: 'EqualsAny',
					Property: 'VideoRangeType',
					Value: videoRangeTypes,
					IsRequired: false
				}
			]
		},
		{
			Type: 'Video',
			Codec: 'av1',
			Conditions: [
				{
					Condition: 'EqualsAny',
					Property: 'VideoProfile',
					Value: 'main',
					IsRequired: false
				},
				{
					Condition: 'EqualsAny',
					Property: 'VideoRangeType',
					Value: videoRangeTypes,
					IsRequired: false
				},
				{
					Condition: 'LessThanEqual',
					Property: 'VideoLevel',
				Value: caps.uhd8K ? '19' : '15',
					IsRequired: false
				}
			]
		},
		{
			Type: 'VideoAudio',
			Codec: 'flac',
			Conditions: [
				{
					Condition: 'LessThanEqual',
					Property: 'AudioChannels',
					Value: '2',
					IsRequired: false
				}
			]
		}
	];

	const subtitleProfiles = [
		{Format: 'vtt', Method: 'External'},
		{Format: 'srt', Method: 'External'},
		{Format: 'ass', Method: 'External'},
		{Format: 'ssa', Method: 'External'},
		{Format: 'sub', Method: 'Encode'},
		{Format: 'smi', Method: 'Encode'},
		{Format: 'ttml', Method: 'External'},
		{Format: 'pgssub', Method: 'External'},
		{Format: 'dvdsub', Method: 'External'},
		{Format: 'dvbsub', Method: 'External'}
	];

	const responseProfiles = [
		{
			Type: 'Video',
			Container: 'm4v',
			MimeType: 'video/mp4'
		}
	];

	if (caps.mkv) {
		responseProfiles.push({
			Type: 'Video',
			Container: 'mkv',
			MimeType: 'video/x-matroska'
		});
	}

	console.log('[deviceProfile] Final profile:', {
		webosVersion: caps.webosVersion,
		profileCount: directPlayProfiles.length,
		hdr: { hdr10: caps.hdr10, dolbyVision: caps.dolbyVision, hlg: caps.hlg },
		maxStreamingBitrate
	});

	return {
		Name: `Moonfin webOS ${caps.webosVersion}`,
		MaxStreamingBitrate: maxStreamingBitrate,
		MaxStaticBitrate: maxStreamingBitrate,
		MaxStaticMusicBitrate: 40000000,
		MusicStreamingTranscodingBitrate: 384000,
		DirectPlayProfiles: directPlayProfiles,
		TranscodingProfiles: transcodingProfiles,
		CodecProfiles: codecProfiles,
		SubtitleProfiles: subtitleProfiles,
		ResponseProfiles: responseProfiles
	};
};

/** H.264+AAC-only profile for hls.js/MSE fallback when native HEVC decoding fails. */
export const getH264FallbackProfile = async () => {
	const profile = await getJellyfinDeviceProfile();

	profile.TranscodingProfiles = [
		{
			Container: 'ts',
			Type: 'Video',
			AudioCodec: 'aac',
			VideoCodec: 'h264',
			Context: 'Streaming',
			Protocol: 'hls',
			MaxAudioChannels: '2',
			MinSegments: '1',
			BreakOnNonKeyFrames: false
		},
		{
			Container: 'mp4',
			Type: 'Video',
			AudioCodec: 'aac,ac3',
			VideoCodec: 'h264',
			Context: 'Static'
		},
		{
			Container: 'mp3',
			Type: 'Audio',
			AudioCodec: 'mp3',
			Context: 'Streaming',
			Protocol: 'http'
		},
		{
			Container: 'aac',
			Type: 'Audio',
			AudioCodec: 'aac',
			Context: 'Streaming',
			Protocol: 'http'
		}
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

export const getDeviceName = async () => {
	const caps = await getDeviceCapabilities();
	return caps.modelName || `webOS TV ${caps.webosVersion}`;
};

export default {
	detectWebOSVersion,
	getDeviceCapabilities,
	getJellyfinDeviceProfile,
	getH264FallbackProfile,
	getDeviceId,
	getDeviceName
};
