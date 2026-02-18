/* global webapis, tizen */
/**
 * Device Profile Service - Detects Samsung Tizen TV hardware capabilities
 *
 * Uses Tizen webapis to detect panel resolution, HDR support, codec support, etc.
 *
 * Samsung Tizen TV Specifications Reference (2018-2025):
 * https://developer.samsung.com/smarttv/develop/specifications/media-specifications.html
 * https://developer.samsung.com/smarttv/develop/specifications/general-specifications.html
 * https://developer.samsung.com/smarttv/develop/specifications/multimedia/adaptive-streaming.html
 * https://developer.samsung.com/smarttv/develop/specifications/multimedia/subtitles.html
 * https://developer.samsung.com/smarttv/develop/specifications/multimedia/4k-8k-uhd-video.html
 *
 */

let cachedCapabilities = null;

export const clearCapabilitiesCache = () => {
	cachedCapabilities = null;
};

/**
 * Map model year to Tizen platform version.
 */
export const yearToTizenVersion = (year) => {
	if (year >= 2025) return 9;
	if (year >= 2024) return 8;
	if (year >= 2023) return 7;
	if (year >= 2022) return 6.5;
	if (year >= 2021) return 6;
	if (year >= 2020) return 5.5;
	if (year >= 2019) return 5;
	if (year >= 2018) return 4;
	if (year >= 2017) return 3;
	if (year >= 2016) return 2.4;
	return 4;
};

const TIZEN_VERSION_TO_YEAR = {
	9: 2025, 8: 2024, 7: 2023, 6.5: 2022, 6: 2021,
	5.5: 2020, 5: 2019, 4: 2018, 3: 2017, 2.4: 2016
};

/**
 * Get model name from webapis (cached).
 * Prefers getRealModel() over getModel() for accurate model string.
 */
let cachedModelName = null;
const getModelName = () => {
	if (cachedModelName !== null) return cachedModelName;
	cachedModelName = '';
	if (typeof webapis !== 'undefined' && webapis.productinfo) {
		try {
			if (typeof webapis.productinfo.getRealModel === 'function') {
				cachedModelName = webapis.productinfo.getRealModel() || '';
			}
			if (!cachedModelName && typeof webapis.productinfo.getModel === 'function') {
				cachedModelName = webapis.productinfo.getModel() || '';
			}
		} catch (e) {
			// Fall through
		}
	}
	return cachedModelName;
};

/**
 * Get firmware string from webapis (cached).
 */
let cachedFirmware = null;
const getFirmwareString = () => {
	if (cachedFirmware !== null) return cachedFirmware;
	cachedFirmware = '';
	if (typeof webapis !== 'undefined' && webapis.productinfo) {
		try {
			if (typeof webapis.productinfo.getFirmware === 'function') {
				cachedFirmware = webapis.productinfo.getFirmware() || '';
			}
		} catch (e) {
			// Fall through
		}
	}
	return cachedFirmware;
};

/**
 * Extract model year from Samsung model name using the year-letter code.
 * Samsung model naming: year is encoded as a letter in the model string.
 * E.g., QN55Q60RAFXZA → 'R' = 2019, UN50TU7000 → 'T' = 2020
 *
 * Note: Letters recycle after 2021. Pre-Tizen years (≤2015) are excluded
 * since those TVs don't run Tizen. This avoids conflicts like 'C' (2012 vs 2023).
 */
const detectYearFromModelName = (modelName) => {
	if (!modelName) return null;
	// Samsung model year letter codes (Tizen-era only: 2016+)
	const yearLetters = {
		'K': 2016, 'M': 2017, 'N': 2018, 'R': 2019,
		'T': 2020, 'A': 2021, 'B': 2022, 'C': 2023,
		'D': 2024, 'E': 2025
	};

	// Samsung has multiple model naming formats depending on product line:
	//
	// Format A - Crystal UHD / standard: prefix + size + YEAR + series
	//   UA55DU7000 → D=2024, UN50TU7000 → T=2020
	//   Pattern: (UN|UE|UA|HG)\d{2,3}([A-Z])\w+
	//
	// Format B - QLED / premium: prefix + size + series_category + series_num + YEAR + suffix
	//   QN55Q60RAFXZA → R=2019, QE65Q80BATXXU → B=2022
	//   Pattern: (QN|QE|GQ)\d{2,3}[A-Z]\d{1,3}([A-Z])

	// Strategy: try each format and return the first valid year match
	const patterns = [
		// Format B (QLED/premium): year letter after series number
		// e.g., QN55Q60RAFXZA: QN + 55 + Q + 60 + R(year) + AFXZA
		/(?:QN|QE|GQ)\d{2,3}[A-Z]\d{1,3}([A-Z])/i,
		// Format A (Crystal UHD/standard): year letter right after size digits
		// e.g., UA55DU7000: UA + 55 + D(year) + U7000
		/(?:UN|UE|UA|HG)\d{2,3}([A-Z])/i
	];

	for (const pattern of patterns) {
		const match = modelName.match(pattern);
		if (match) {
			const letter = match[1].toUpperCase();
			if (yearLetters[letter]) {
				console.log(`[deviceProfile] Detected year letter '${letter}' (${yearLetters[letter]}) from model '${modelName}' using pattern ${pattern}`);
				return yearLetters[letter];
			}
		}
	}

	// Fallback: scan all single letters in model name for any year letter match
	// This handles unknown prefixes or unusual model strings
	const letters = modelName.match(/[A-Z]/g);
	if (letters) {
		for (const letter of letters) {
			if (yearLetters[letter]) {
				console.log(`[deviceProfile] Detected year letter '${letter}' (${yearLetters[letter]}) from model '${modelName}' via fallback scan`);
				return yearLetters[letter];
			}
		}
	}

	return null;
};

/**
 * Detect Tizen version using multiple strategies:
 * 1. tizen.systeminfo platform version API (most reliable)
 * 2. Model name year-letter code
 * 3. Firmware string year extraction (least reliable)
 *
 * Mapping based on Samsung TV Model Groups documentation:
 * https://developer.samsung.com/smarttv/develop/specifications/tv-model-groups.html
 */
export const detectTizenVersion = () => {
	// Strategy 1: Use tizen.systeminfo API for actual platform version
	if (typeof tizen !== 'undefined' && tizen.systeminfo) {
		try {
			const platformVersion = tizen.systeminfo.getCapability(
				'http://tizen.org/feature/platform.version'
			);
			if (platformVersion) {
				const ver = parseFloat(platformVersion);
				if (!isNaN(ver) && ver >= 2) {
					console.log(`[deviceProfile] Tizen version from systeminfo: ${ver}`);
					return ver;
				}
			}
		} catch (e) {
			console.log('[deviceProfile] systeminfo.getCapability not available');
		}
	}

	// Strategy 2: Parse model name year letter
	const yearFromModel = detectYearFromModelName(getModelName());
	if (yearFromModel) {
		console.log(`[deviceProfile] Tizen version from model name (${getModelName()}, year ${yearFromModel})`);
		return yearToTizenVersion(yearFromModel);
	}

	// Strategy 3: Extract year from firmware string (least reliable)
	const firmware = getFirmwareString();
	if (firmware) {
		const match = firmware.match(/(\d{4})/);
		if (match) {
			const year = parseInt(match[1], 10);
			if (year >= 2015 && year <= 2030) {
				console.log(`[deviceProfile] Tizen version from firmware year: ${year}`);
				return yearToTizenVersion(year);
			}
		}
	}

	return 4;
};

/**
 * Determine the model year. Uses model name year-letter, falls back to Tizen version.
 */
const detectModelYear = () => {
	const yearFromModel = detectYearFromModelName(getModelName());
	if (yearFromModel) return yearFromModel;

	return TIZEN_VERSION_TO_YEAR[detectTizenVersion()] || 2018;
};

/**
 * Container support per Samsung specifications.
 * All years (2018-2025) support: MP4, M4V, MKV, TS, MOV, AVI
 * Note: HEVC is restricted to MKV/MP4/TS containers per Samsung docs.
 * Note: WMV/ASF dropped from 24TV_BASIC4 and 2025+ models.
 */
const getDocumentedContainerSupport = () => {
	return {
		mp4: true,
		m4v: true,
		ts: true,
		mov: true,
		avi: true,
		mkv: true,
		webm: true,
		hls: true
	};
};

/**
 * HEVC support - Available on all Samsung TVs from 2018+
 * Per Samsung docs: "HEVC: Supported only for MKV/MP4/TS containers"
 */
export const testHevcSupport = () => {
	return true;
};

/**
 * AV1 support - Listed in Samsung per-year video spec tables from 2020 onwards.
 * 2020 (Tizen 5.5): AV1 on Premium/Standard/Basic1 UHD tiers (WebM container only)
 * 2021 (Tizen 6): AV1 on ALL tiers including FHD models
 * 2022+ (Tizen 6.5+): AV1 on all tiers; 8K Premium models also support AV1 in MP4/MKV/TS
 */
export const testAv1Support = (tizenVersion = 4) => {
	return tizenVersion >= 5.5;
};

/**
 * VP9 support - Listed in Samsung spec tables.
 * 2018-2020 (Tizen 4-5.5): UHD models only (WebM container)
 * 2021+ (Tizen 6+): ALL models including FHD (WebM container)
 * FHD-only models before 2021 (e.g. 20TV_BASIC2) have VP8 only, no VP9.
 */
export const testVp9Support = (tizenVersion = 4, uhd = true) => {
	return tizenVersion >= 6 || (tizenVersion >= 4 && uhd);
};

/**
 * DTS support - Samsung explicitly states DTS is NOT supported on ANY TV (2018-2025).
 *
 * From Samsung docs (every year):
 * "The DTS Audio codec is not supported on [year] TVs. For smooth playback,
 *  if a DTS Audio track is part of your manifest, make sure other audio tracks
 *  can be selected."
 */
export const testDtsSupport = () => false;

/**
 * AC3 (Dolby Digital) support - Supported on all Samsung TVs.
 */
export const testAc3Support = () => true;

/**
 * EAC3 (DD+) support - Supported on all Samsung TVs 2018+.
 * Samsung docs: "DD+: 5.1 channel supported"
 */
export const testEac3Support = () => true;

/**
 * TrueHD support - NOT documented in Samsung specifications.
 * Samsung spec tables list: AAC, MP3, Vorbis, AC3, EAC3, WMA, Opus, etc.
 * TrueHD (lossless Dolby) is never mentioned.
 */
export const testTruehdSupport = () => false;

export const getDeviceCapabilities = async () => {
	if (cachedCapabilities) return cachedCapabilities;

	const tizenVersion = detectTizenVersion();
	const modelYear = detectModelYear();
	const containerSupport = getDocumentedContainerSupport();

	let modelName = 'Samsung TV';
	let serialNumber = '';
	let deviceId = '';
	let uhd = true;
	let uhd8K = false;
	// HDR10: Available on premium/standard UHD models from 2018+
	// Runtime detection via avinfo API is more accurate
	let hdr10 = tizenVersion >= 4;
	// Dolby Vision: Hardware-dependent, detect via avinfo API
	// Fallback to false — let runtime detection enable it
	let dolbyVision = false;

	// Use cached helpers for model name and firmware (already fetched during version detection)
	modelName = getModelName() || modelName;
	const firmwareVersion = getFirmwareString();

	if (typeof webapis !== 'undefined') {
		try {
			if (webapis.productinfo) {
				if (typeof webapis.productinfo.getDuid === 'function') {
					deviceId = webapis.productinfo.getDuid();
				}

				// Check resolution support
				if (typeof webapis.productinfo.is8KPanelSupported === 'function' &&
					webapis.productinfo.is8KPanelSupported()) {
					uhd8K = true;
					uhd = true;
				} else if (typeof webapis.productinfo.isUdPanelSupported === 'function') {
					uhd = webapis.productinfo.isUdPanelSupported();
				}
			}

			// Check HDR support
			if (webapis.avinfo) {
				if (typeof webapis.avinfo.isHdrTvSupport === 'function') {
					hdr10 = webapis.avinfo.isHdrTvSupport();
				}
				if (typeof webapis.avinfo.isDolbyVisionSupport === 'function') {
					dolbyVision = webapis.avinfo.isDolbyVisionSupport();
				}
			}
		} catch (e) {
			console.log('[deviceProfile] Error getting Tizen capabilities:', e);
		}
	}

	cachedCapabilities = {
		modelName,
		modelNameAscii: modelName,
		serialNumber,
		deviceId,
		firmwareVersion,

		tizenVersion,
		modelYear,
		tizenVersionDisplay: `Tizen ${tizenVersion}`,

		screenWidth: uhd8K ? 7680 : uhd ? 3840 : 1920,
		screenHeight: uhd8K ? 4320 : uhd ? 2160 : 1080,
		uhd,
		uhd8K,
		oled: false, // Can't detect reliably on Tizen

		// HDR capabilities
		hdr10,
		hdr10Plus: hdr10 && tizenVersion >= 5, // HDR10+ on 2019+ premium models
		hlg: hdr10 && tizenVersion >= 4, // HLG on 2018+ HDR-capable models
		dolbyVision,

		// Audio capabilities - per Samsung documentation
		// Samsung docs: "DD+: 5.1 channel supported" for all years
		// No documentation supports 7.1/8-channel audio on Tizen TVs
		dolbyAtmos: false, // Not documented in Samsung specs
		dts: testDtsSupport(), // false - Samsung explicitly says not supported
		ac3: testAc3Support(),
		eac3: testEac3Support(),
		truehd: testTruehdSupport(), // false - not in Samsung specs

		// Video codec capabilities
		hevc: testHevcSupport(),
		av1: testAv1Support(tizenVersion),
		vp9: testVp9Support(tizenVersion, uhd),

		...containerSupport,

		nativeHls: true,
		nativeHlsFmp4: true,
		hlsAc3: true
	};

	console.log('[deviceProfile] Tizen Capabilities:', cachedCapabilities);
	return cachedCapabilities;
};

export const getJellyfinDeviceProfile = async () => {
	const caps = await getDeviceCapabilities();

	// --- Video codecs per Samsung spec tables ---
	// Samsung specs officially list VP9/AV1 as WebM-only, but in practice
	// Samsung TVs' hardware decoders handle VP9/AV1 in MKV containers fine.
	// This is confirmed by users and matches behavior of other Jellyfin clients.
	const generalVideoCodecs = ['h264'];
	if (caps.hevc) generalVideoCodecs.push('hevc');
	if (caps.vp9) generalVideoCodecs.push('vp9');
	if (caps.av1) generalVideoCodecs.push('av1');

	// WebM-specific profile (VP9/AV1 with WebM audio codecs)
	const webmVideoCodecs = [];
	if (caps.vp9) webmVideoCodecs.push('vp9');
	if (caps.av1) webmVideoCodecs.push('av1');

	// All supported video codecs (for HLS/transcode profiles)
	const allVideoCodecs = [...generalVideoCodecs];
	if (caps.vp9 && !allVideoCodecs.includes('vp9')) allVideoCodecs.push('vp9');
	if (caps.av1 && !allVideoCodecs.includes('av1')) allVideoCodecs.push('av1');

	// Audio codecs per Samsung spec tables
	// Per Samsung video spec tables: AAC, MP3, Vorbis, AC3, EAC3, Opus, LPCM, ADPCM, WMA, G.711
	// FLAC: Listed in Samsung Music format table (media-specifications.html) as a supported codec
	// ALAC: Also listed in Music table but omitted here (niche format, m4a container shared with AAC)
	// NOT supported: DTS (explicitly stated), TrueHD (not documented)
	const audioCodecs = ['aac', 'mp3', 'flac', 'opus', 'vorbis', 'pcm', 'wav'];
	if (caps.ac3) audioCodecs.push('ac3');
	if (caps.eac3) audioCodecs.push('eac3');
	// DTS intentionally excluded - Samsung docs: "DTS Audio codec is not supported"
	// TrueHD intentionally excluded - not in Samsung specifications

	// General video containers per Samsung spec tables (for H.264/HEVC)
	// Note: HEVC only works in MKV/MP4/TS per Samsung docs
	const generalContainers = [];
	if (caps.mp4) generalContainers.push('mp4');
	if (caps.m4v) generalContainers.push('m4v');
	if (caps.ts) generalContainers.push('ts', 'mpegts');
	if (caps.mkv) generalContainers.push('mkv', 'matroska');
	if (caps.mov) generalContainers.push('mov');
	if (caps.avi) generalContainers.push('avi');

	console.log('[deviceProfile] DirectPlayProfiles - General:', generalContainers.join(','), generalVideoCodecs.join(','));
	console.log('[deviceProfile] DirectPlayProfiles - WebM:', webmVideoCodecs.join(','));

	// Max bitrates per Samsung spec tables:
	// 8K HEVC: ~80 Mbps per spec tables
	// UHD: ~60-80 Mbps for HEVC UHD
	// FHD: ~40 Mbps
	const maxBitrate = caps.uhd8K ? 100000000 : caps.uhd ? 80000000 : 40000000;

	// Samsung docs: "DD+: 5.1 channel supported" for most models
	// 8K adaptive streaming spec lists DD/DD+ (5.1, 7.1) — 8K models support 7.1
	const maxAudioChannels = caps.uhd8K ? '8' : '6';

	const directPlayProfiles = [
		// General containers: H.264, HEVC (+ AV1 for 8K Premium 2022+)
		{
			Container: generalContainers.join(','),
			Type: 'Video',
			VideoCodec: generalVideoCodecs.join(','),
			AudioCodec: audioCodecs.join(',')
		}
	];

	// WebM container: VP9, AV1 (per Samsung spec tables, these codecs are WebM-only)
	if (webmVideoCodecs.length > 0) {
		directPlayProfiles.push({
			Container: 'webm',
			Type: 'Video',
			VideoCodec: webmVideoCodecs.join(','),
			AudioCodec: 'vorbis,opus' // Samsung spec: WebM audio is Vorbis (+ Opus on some)
		});
	}

	directPlayProfiles.push({
		Container: 'mp3,flac,aac,m4a,ogg,opus,wav',
		Type: 'Audio'
	});

	if (caps.nativeHls) {
		directPlayProfiles.push({
			Container: 'm3u8',
			Type: 'Video',
			VideoCodec: allVideoCodecs.join(','),
			AudioCodec: audioCodecs.join(',')
		});
	}

	const transcodingProfiles = [
		{
			Container: 'ts',
			Type: 'Video',
			AudioCodec: caps.ac3 ? 'aac,ac3,eac3' : 'aac',
			VideoCodec: caps.hevc ? 'hevc,h264' : 'h264',
			Context: 'Streaming',
			Protocol: 'hls',
			MaxAudioChannels: maxAudioChannels,
			MinSegments: '1',
			SegmentLength: '3',
			BreakOnNonKeyFrames: true
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
		}
	];

	// H.264 Level per Samsung spec tables:
	// 2018-2019: FHD Level 4.1, UHD Level 5.1
	// 2020+: FHD Level 4.2, UHD Level 5.1
	const h264Level = caps.uhd ? '51' : (caps.modelYear >= 2020 ? '42' : '41');

	// HEVC Level per Samsung spec tables:
	// FHD: Level 4.1 (all years)
	// UHD Standard/Basic: Level 5.1
	// UHD Premium (2020+): Level 5.2
	// 8K: Level 6.1
	let hevcLevel;
	if (caps.uhd8K) {
		hevcLevel = '183'; // Level 6.1 (6.1 * 30 = 183 in Jellyfin encoding)
	} else if (caps.uhd) {
		// Use 5.1 (153) as safe default — premium models support 5.2 (156)
		hevcLevel = '153'; // Level 5.1
	} else {
		hevcLevel = '123'; // Level 4.1
	}

	const codecProfiles = [
		{
			Type: 'Video',
			Codec: 'h264',
			Conditions: [
				{
					Condition: 'NotEquals',
					Property: 'IsAnamorphic',
					Value: 'true',
					IsRequired: false
				},
				{
					Condition: 'LessThanEqual',
					Property: 'VideoLevel',
					Value: h264Level,
					IsRequired: false
				},
				{
					Condition: 'LessThanEqual',
					Property: 'VideoBitDepth',
					Value: '8',
					IsRequired: false
				},
				{
					Condition: 'LessThanEqual',
					Property: 'RefFrames',
					Value: '16',
					IsRequired: false
				}
			]
		},
		{
			Type: 'Video',
			Codec: 'hevc',
			Conditions: [
				{
					Condition: 'LessThanEqual',
					Property: 'VideoLevel',
					Value: hevcLevel,
					IsRequired: false
				},
				{
					Condition: 'LessThanEqual',
					Property: 'VideoBitDepth',
					Value: caps.hdr10 || caps.dolbyVision ? '10' : '8',
					IsRequired: false
				}
			]
		},
		{
			Type: 'Audio',
			Conditions: [
				{
					Condition: 'LessThanEqual',
					Property: 'AudioChannels',
					Value: maxAudioChannels,
					IsRequired: false
				}
			]
		}
	];

	if (caps.av1) {
		codecProfiles.push({
			Type: 'Video',
			Codec: 'av1',
			Conditions: [
				{
					Condition: 'LessThanEqual',
					Property: 'VideoLevel',
					Value: '15',
					IsRequired: false
				},
				{
					Condition: 'LessThanEqual',
					Property: 'VideoBitDepth',
					Value: caps.hdr10 ? '10' : '8',
					IsRequired: false
				}
			]
		});
	}

	// Subtitle profiles
	// Samsung general specs: SAMI (UTF-8), SubRip, SMPTE-TT, WebVTT (out-of-band), Closed Caption
	// For HLS: Samsung recommends WebVTT (out-of-band)
	//
	// External: Jellyfin extracts text subtitles from the container and serves them
	// via its API. This is lightweight (no video transcoding) and works with HTML5 <video>.
	// Embed: Only for image-based subs — triggers burn-in (transcoding) when selected.
	const subtitleProfiles = [
		// External method — server extracts and delivers subtitle tracks via API
		{Format: 'srt', Method: 'External'},
		{Format: 'subrip', Method: 'External'},
		{Format: 'vtt', Method: 'External'},
		{Format: 'ass', Method: 'External'},
		{Format: 'ssa', Method: 'External'},
		{Format: 'smi', Method: 'External'},
		{Format: 'ttml', Method: 'External'},
		{Format: 'sub', Method: 'External'},
		// Embed method - allows direct play of embedded subtitles without extraction
		{Format: 'srt', Method: 'Embed'},
		{Format: 'subrip', Method: 'Embed'},
		// Image-based: burn-in only (client cannot render these)
		{Format: 'pgs', Method: 'Embed'},
		{Format: 'dvdsub', Method: 'Embed'},
		{Format: 'dvbsub', Method: 'Embed'}
	];

	const responseProfiles = [
		{
			Type: 'Video',
			Container: 'm4v',
			MimeType: 'video/mp4'
		},
		{
			Type: 'Video',
			Container: 'mkv',
			MimeType: 'video/x-matroska'
		}
	];

	return {
		Name: `Moonfin Tizen ${caps.tizenVersion}`,
		MaxStreamingBitrate: maxBitrate,
		MaxStaticBitrate: maxBitrate,
		MaxStaticMusicBitrate: 40000000,
		MusicStreamingTranscodingBitrate: 384000,
		DirectPlayProfiles: directPlayProfiles,
		TranscodingProfiles: transcodingProfiles,
		CodecProfiles: codecProfiles,
		SubtitleProfiles: subtitleProfiles,
		ResponseProfiles: responseProfiles
	};
};

export const getDeviceId = () => {
	// Try to get Tizen device ID first
	if (typeof webapis !== 'undefined' && webapis.productinfo) {
		try {
			const duid = webapis.productinfo.getDuid();
			if (duid) return duid;
		} catch (e) {
			// Fall through to localStorage
		}
	}

	let deviceId = localStorage.getItem('moonfin_device_id');
	if (!deviceId) {
		deviceId = 'moonfin_tizen_' + Date.now().toString(36) + Math.random().toString(36).substring(2);
		localStorage.setItem('moonfin_device_id', deviceId);
	}
	return deviceId;
};

export const getDeviceName = async () => {
	const caps = await getDeviceCapabilities();
	return caps.modelName || `Samsung TV Tizen ${caps.tizenVersion}`;
};

export default {
	detectTizenVersion,
	getDeviceCapabilities,
	getJellyfinDeviceProfile,
	getDeviceId,
	getDeviceName
};
