/* global webapis, tizen */
import {isExperimentalTruehdEnabled, probeTruehdCodecSupport} from './truehd';
/**
 * The Samsung specs the capabilities and profile below follow:
 * https://developer.samsung.com/smarttv/develop/specifications/media-specifications.html
 * https://developer.samsung.com/smarttv/develop/specifications/general-specifications.html
 * https://developer.samsung.com/smarttv/develop/specifications/multimedia/adaptive-streaming.html
 * https://developer.samsung.com/smarttv/develop/specifications/multimedia/subtitles.html
 * https://developer.samsung.com/smarttv/develop/specifications/multimedia/4k-8k-uhd-video.html
 */

let cachedCapabilities = null;

const DEFAULT_PASSTHROUGH_SETTINGS = {
	passthroughEnabled: true,
	dtsPassthrough: true,
	dtshdPassthrough: true,
	truehdPassthrough: true
};

const resolvePassthroughSettings = (options = {}) => ({
	...DEFAULT_PASSTHROUGH_SETTINGS,
	...(options?.passthroughSettings || {})
});

// The set decodes AC3 and E-AC3 itself and its own sound output setting decides
// whether a receiver gets the bitstream, so the passthrough settings leave them alone.
const applyPassthroughSettings = (caps, options = {}) => {
	const prefs = resolvePassthroughSettings(options);
	const passthroughAllowed = prefs.passthroughEnabled;

	return {
		...caps,
		truehd: !!caps.truehd && passthroughAllowed && !!prefs.truehdPassthrough,
		dts: !!caps.dts && passthroughAllowed && !!prefs.dtsPassthrough,
		dtshd: !!caps.dtshd && passthroughAllowed && !!prefs.dtshdPassthrough
	};
};

export const clearCapabilitiesCache = () => {
	cachedCapabilities = null;
};

const yearToTizenVersion = (year) => {
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

// Runs one Samsung API call and hands back the fallback when it's missing or throws,
// so one call failing on older firmware doesn't take the others down with it.
const readWebapis = (read, fallback) => {
	try {
		const value = read();
		return value === undefined || value === null ? fallback : value;
	} catch (e) {
		return fallback;
	}
};

// getRealModel gives the more accurate model string, so getModel is only the fallback.
let cachedModelName = null;
const getModelName = () => {
	if (cachedModelName !== null) return cachedModelName;
	cachedModelName = readWebapis(() => webapis.productinfo.getRealModel(), '') ||
		readWebapis(() => webapis.productinfo.getModel(), '');
	return cachedModelName;
};

let cachedFirmware = null;
const getFirmwareString = () => {
	if (cachedFirmware !== null) return cachedFirmware;
	cachedFirmware = readWebapis(() => webapis.productinfo.getFirmware(), '');
	return cachedFirmware;
};

// Samsung writes the model year as a letter, as in QN55Q60RAFXZA (R is 2019) or UN50TU7000
// (T is 2020). The letters repeat after 2021, so only years from 2016 on are mapped, since
// older sets don't run Tizen. That keeps C from meaning both 2012 and 2023.
const detectYearFromModelName = (modelName) => {
	if (!modelName) return null;
	const yearLetters = {
		'K': 2016, 'M': 2017, 'N': 2018, 'R': 2019,
		'T': 2020, 'A': 2021, 'B': 2022, 'C': 2023,
		'D': 2024, 'E': 2025
	};

	// QLED and premium models put the letter after the series number, as in QN55Q60RAFXZA.
	// Crystal UHD and standard models put it right after the size, as in UA55DU7000.
	const patterns = [
		/(?:QN|QE|GQ)\d{2,3}[A-Z]\d{1,3}([A-Z])/i,
		/(?:UN|UE|UA|HG)\d{2,3}([A-Z])/i
	];

	for (const pattern of patterns) {
		const match = modelName.match(pattern);
		if (match) {
			const letter = match[1].toUpperCase();
			if (yearLetters[letter]) {
				return yearLetters[letter];
			}
		}
	}

	// An unknown prefix falls back to the first letter that's a year code.
	const letters = modelName.match(/[A-Z]/g);
	if (letters) {
		for (const letter of letters) {
			if (yearLetters[letter]) {
				return yearLetters[letter];
			}
		}
	}

	return null;
};

// Tries the platform version, then the model's year letter, then a year in the firmware
// string, from most to least reliable. The years follow Samsung's model groups:
// https://developer.samsung.com/smarttv/develop/specifications/tv-model-groups.html
export const detectTizenVersion = () => {
	if (typeof tizen !== 'undefined' && tizen.systeminfo) {
		try {
			const platformVersion = tizen.systeminfo.getCapability(
				'http://tizen.org/feature/platform.version'
			);
			if (platformVersion) {
				const ver = parseFloat(platformVersion);
				if (!isNaN(ver) && ver >= 2) {
					return ver;
				}
			}
		} catch (e) {
			// Falls back to the model name below
		}
	}

	const yearFromModel = detectYearFromModelName(getModelName());
	if (yearFromModel) {
		return yearToTizenVersion(yearFromModel);
	}

	const firmware = getFirmwareString();
	if (firmware) {
		const match = firmware.match(/(\d{4})/);
		if (match) {
			const year = parseInt(match[1], 10);
			if (year >= 2015 && year <= 2030) {
				return yearToTizenVersion(year);
			}
		}
	}

	return 4;
};

const detectModelYear = () => {
	const yearFromModel = detectYearFromModelName(getModelName());
	if (yearFromModel) return yearFromModel;

	return TIZEN_VERSION_TO_YEAR[detectTizenVersion()] || 2018;
};

// Every set from 2018 on reads these. WMV and ASF are left out since 24TV_BASIC4 and 2025
// models dropped them.
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

// Every set from 2018 on decodes HEVC.
const testHevcSupport = () => {
	return true;
};

// AV1 is in Samsung's spec tables from 2020, on every tier but the FHD-only 20TV_BASIC2, and on
// every model from 2021. 2018 and 2019 sets updated to Tizen 5.5 have no AV1 decoder, so a 2020
// set is told apart by its model year, and FHD panels are left out on Tizen 5.5.
const testAv1Support = (tizenVersion = 4, modelYear = 2018, uhd = false) => {
	return tizenVersion >= 6 || (tizenVersion >= 5.5 && modelYear >= 2020 && uhd);
};

// VP9 is on UHD models from 2018 and on every model from 2021. FHD sets before that, such as
// 20TV_BASIC2, only have VP8.
const testVp9Support = (tizenVersion = 4, uhd = true) => {
	return tizenVersion >= 6 || (tizenVersion >= 4 && uhd);
};

// Samsung says no TV from 2018 to 2025 supports DTS.
const testDtsSupport = () => false;

const testAc3Support = () => true;

const testEac3Support = () => true;

// TrueHD isn't in Samsung's specs, so it's only offered when the viewer opts in and the set
// says it decodes it.
const testTruehdSupport = (truehdCodecSupported = probeTruehdCodecSupport()) => {
	if (!isExperimentalTruehdEnabled()) return false;

	return truehdCodecSupported === true;
};

const probeTizenAudioCodecSupport = () => {
	const support = {
		ac3: testAc3Support(),
		eac3: testEac3Support(),
		truehd: testTruehdSupport(),
		dts: testDtsSupport(),
		dtshd: false
	};

	if (typeof webapis === 'undefined' || !webapis.systeminfo || typeof webapis.systeminfo.isSupportedAudioCodec !== 'function') {
		return support;
	}

	const codecAliases = {
		ac3: ['AC3'],
		eac3: ['E-AC3'],
		truehd: ['TrueHD'],
		dts: ['DTS'],
		dtshd: ['DTS-HD', 'DTSHD']
	};

	for (const [key, aliases] of Object.entries(codecAliases)) {
		for (const alias of aliases) {
			try {
				if (webapis.systeminfo.isSupportedAudioCodec(alias) === true) {
					support[key] = true;
					break;
				}
			} catch (e) {
				// An alias the firmware doesn't know throws, so the next one is tried
			}
		}
	}

	if (support.dtshd) support.dts = true;
	// A set saying it takes TrueHD isn't enough on its own. It only reaches a receiver over eARC
	// and can fall back to something else on the way, so it waits for the viewer to opt in.
	if (!isExperimentalTruehdEnabled()) support.truehd = false;

	return support;
};

export const getDeviceCapabilities = async () => {
	if (cachedCapabilities) return cachedCapabilities;

	const tizenVersion = detectTizenVersion();
	const modelYear = detectModelYear();
	const containerSupport = getDocumentedContainerSupport();

	const serialNumber = '';
	const modelName = getModelName() || 'Samsung TV';
	const firmwareVersion = getFirmwareString();
	const deviceId = readWebapis(() => webapis.productinfo.getDuid(), '');
	const uhd8K = readWebapis(() => webapis.productinfo.is8KPanelSupported(), false);
	const uhd = uhd8K || readWebapis(() => webapis.productinfo.isUdPanelSupported(), true);
	const hdr10 = readWebapis(() => webapis.avinfo.isHdrTvSupport(), tizenVersion >= 4);
	const dolbyVision = readWebapis(() => webapis.avinfo.isDolbyVisionSupport(), false);

	const audioProbe = probeTizenAudioCodecSupport();

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

		hdr10,
		// HDR10+ rides on HDR10. A set that only reads the static metadata still renders the
		// HDR10 base, so it goes wherever HDR10 goes.
		hdr10Plus: hdr10,
		hlg: hdr10 && tizenVersion >= 4, // HLG is on HDR models from 2018
		dolbyVision,
		// Samsung only documents DD+ at 5.1. This is on anyway because 7.1 tracks often carry
		// Atmos, and leaving it off stopped them from playing.
		dolbyAtmos: true,
		dts: audioProbe.dts,
		ac3: audioProbe.ac3,
		eac3: audioProbe.eac3,
		truehd: audioProbe.truehd,
		dtshd: audioProbe.dtshd,
		opus: true,

		hevc: testHevcSupport(),
		av1: testAv1Support(tizenVersion, modelYear, uhd),
		vp9: testVp9Support(tizenVersion, uhd),

		...containerSupport,

		nativeHls: true,
		nativeHlsFmp4: true,
		hlsAc3: true
	};

	return cachedCapabilities;
};

export const getJellyfinDeviceProfile = async (options = {}) => {
	const baseCaps = await getDeviceCapabilities();
	const caps = applyPassthroughSettings(baseCaps, options);

	// Samsung lists VP9 and AV1 as WebM only, but the decoders handle them in MKV as well, as
	// other Jellyfin clients find. MPEG2 has no container limit in the spec tables, unlike
	// HEVC, and every set has an MPEG2 broadcast decoder.
	const generalVideoCodecs = ['h264', 'mpeg2video'];
	if (caps.hevc) generalVideoCodecs.push('hevc');
	if (caps.vp9) generalVideoCodecs.push('vp9');
	if (caps.av1) generalVideoCodecs.push('av1');

	const webmVideoCodecs = [];
	if (caps.vp9) webmVideoCodecs.push('vp9');
	if (caps.av1) webmVideoCodecs.push('av1');

	const allVideoCodecs = [...generalVideoCodecs];

	// From Samsung's spec tables. ALAC is listed too but left out, since it shares the m4a
	// container with AAC.
	const audioCodecs = ['aac', 'mp3', 'flac','vorbis', 'pcm', 'wav', 'pcm_s16le'];
	if (caps.ac3) audioCodecs.push('ac3');
	if (caps.eac3) audioCodecs.push('eac3');
	if (caps.opus) audioCodecs.push('opus');
	if (caps.truehd) audioCodecs.push('truehd');

	// FLAC inside a video container plays with a noticeable audio delay here, so video
	// profiles leave it out and let the server transcode the track. Music files keep direct
	// playing FLAC.
	const videoAudioCodecs = audioCodecs.filter((codec) => codec !== 'flac');

	const generalContainers = [];
	if (caps.mp4) generalContainers.push('mp4');
	if (caps.m4v) generalContainers.push('m4v');
	if (caps.ts) generalContainers.push('ts', 'mpegts');
	if (caps.mkv) generalContainers.push('mkv', 'matroska');
	if (caps.mov) generalContainers.push('mov');
	if (caps.avi) generalContainers.push('avi');

	// Close to the HEVC rates Samsung's spec tables give for each panel size
	const maxBitrate = caps.uhd8K ? 100000000 : caps.uhd ? 80000000 : 40000000;

	// Samsung documents DD+ at 5.1, and 7.1 only for 8K models
	const maxAudioChannels = caps.uhd8K ? '8' : '6';

	const directPlayProfiles = [
		{
			Container: generalContainers.join(','),
			Type: 'Video',
			VideoCodec: generalVideoCodecs.join(','),
			AudioCodec: videoAudioCodecs.join(',')
		}
	];

	if (webmVideoCodecs.length > 0) {
		directPlayProfiles.push({
			Container: 'webm',
			Type: 'Video',
			VideoCodec: webmVideoCodecs.join(','),
			AudioCodec: 'vorbis,opus' // Samsung's WebM audio codecs
		});
	}

	directPlayProfiles.push({
		Container: 'mp3,flac,aac,ogg,opus,wav',
		Type: 'Audio'
	});

	// m4a and m4b hold either AAC or ALAC. With the codec left open the server
	// direct played ALAC into AVPlay, which freezes partway through a track.
	directPlayProfiles.push({
		Container: 'm4a,m4b',
		Type: 'Audio',
		AudioCodec: 'aac'
	});

	if (caps.nativeHls) {
		directPlayProfiles.push({
			Container: 'm3u8',
			Type: 'Video',
			VideoCodec: allVideoCodecs.join(','),
			AudioCodec: videoAudioCodecs.join(',')
		});
	}

	// fMP4 HLS is only for AV1 passthrough since TS can't carry AV1. HEVC and H.264 use TS
	// because copying HEVC, especially Dolby Vision, into fMP4 HLS fails on several Tizen
	// firmwares, so they must not match the fMP4 profile.
	const isOldTizen = caps.tizenVersion < 6;
	// Sets before Tizen 6 play E-AC3 copied into a stream from the server with no sound, so
	// the server converts it to AC3 for them.
	const tsAudio = isOldTizen
		? (caps.ac3 ? 'ac3' : 'mp3')
		: (caps.eac3 ? 'eac3,ac3,aac' : (caps.ac3 ? 'ac3,aac' : 'aac'));
	const transcodingProfiles = [];

	// Samsung recommends TS for HEVC over HLS on 2018 and 2019 sets, so HEVC is
	// remuxed there too rather than encoded to H.264. Short segments and non
	// keyframe breaks stall AVPlay on segment boundaries, so use longer keyframe
	// aligned ones. VBR AAC in TS comes out LATM framed, which older firmware
	// refuses, so keep the encoder on CBR.
	transcodingProfiles.push(
		{
			Container: 'ts',
			Type: 'Video',
			AudioCodec: tsAudio,
			VideoCodec: caps.hevc ? 'hevc,h264' : 'h264',
			Context: 'Streaming',
			Protocol: 'hls',
			MaxAudioChannels: maxAudioChannels,
			MinSegments: '2',
			SegmentLength: '6',
			BreakOnNonKeyFrames: false,
			EnableAudioVbrEncoding: false
		},
		{
			Container: 'mp3',
			Type: 'Audio',
			AudioCodec: 'mp3',
			Context: 'Streaming',
			Protocol: 'http'
		}
	);

	// The server walks these in order and takes the first workable profile, and
	// this one only offers AV1, which many servers have no encoder for. It has
	// to sit after the TS profile or every transcode on an AV1 capable set
	// demands an AV1 encode and dies on servers that can't provide one.
	if (caps.av1) {
		transcodingProfiles.push({
			Container: 'mp4',
			Type: 'Video',
			AudioCodec: tsAudio,
			VideoCodec: 'av1',
			Context: 'Streaming',
			Protocol: 'hls',
			MaxAudioChannels: maxAudioChannels,
			MinSegments: '2',
			SegmentLength: '6'
		});
	}

	// The H.264 levels in Samsung's spec tables
	const h264Level = caps.uhd ? '51' : (caps.modelYear >= 2020 ? '42' : '41');

	// The HEVC levels in Samsung's spec tables, which Jellyfin writes times 30. UHD Premium
	// models from 2020 take 5.2, but 5.1 is safe on every UHD set.
	let hevcLevel;
	if (caps.uhd8K) {
		hevcLevel = '183'; // Level 6.1
	} else if (caps.uhd) {
		hevcLevel = '153'; // Level 5.1
	} else {
		hevcLevel = '123'; // Level 4.1
	}

	// Dolby Vision over an HDR10, HDR10+, HLG or SDR base plays that base on a
	// panel without Dolby Vision, which skips the metadata on top. Profile 7
	// adds an enhancement layer that freezes the picture on those panels, so
	// only a Dolby Vision panel gets it as is and the rest get a remux with the
	// Dolby Vision taken out. A bare DOVI is profile 5, which has no base to
	// fall back on.
	const hevcRangeTypes = ['SDR', 'DOVIWithSDR'];
	if (caps.hdr10) hevcRangeTypes.push('HDR10', 'DOVIWithHDR10', 'DOVIInvalid');
	if (caps.hdr10Plus) hevcRangeTypes.push('HDR10Plus', 'DOVIWithHDR10Plus');
	if (caps.hlg) hevcRangeTypes.push('HLG', 'DOVIWithHLG');
	if (caps.dolbyVision) hevcRangeTypes.push('DOVI', 'DOVIWithEL', 'DOVIWithELHDR10Plus');

	const codecProfiles = [
		// Samsung only specifies H.264 Level 5.1 for UHD, so a UHD panel still can't decode
		// every 1080p Level 5.x stream, and AVPlay fails on one that's direct played or
		// remuxed with its video copied. This lowers the level for FHD sources to force a
		// real video transcode. 1088 covers encodes that report their uncropped height, and
		// the height is required since the server counts an unknown value as a match.
		...(caps.uhd ? [{
			Type: 'Video',
			Codec: 'h264',
			ApplyConditions: [
				{
					Condition: 'LessThanEqual',
					Property: 'Height',
					Value: '1088',
					IsRequired: true
				}
			],
			Conditions: [
				{
					Condition: 'LessThanEqual',
					Property: 'VideoLevel',
					Value: caps.modelYear >= 2020 ? '42' : '41',
					IsRequired: false
				}
			]
		}] : []),
		{
			Type: 'Video',
			Codec: 'h264',
			Conditions: [
				// Tizen 6 and later show non-square pixels at the right shape.
				...(isOldTizen ? [{
					Condition: 'NotEquals',
					Property: 'IsAnamorphic',
					Value: 'true',
					IsRequired: false
				}] : []),
				{
					Condition: 'NotEquals',
					Property: 'IsInterlaced',
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
					// UHD sets decode Main 10 even when the panel reports no HDR
					Value: caps.hdr10 || caps.dolbyVision || caps.uhd ? '10' : '8',
					IsRequired: false
				},
				{
					Condition: 'EqualsAny',
					Property: 'VideoRangeType',
					Value: hevcRangeTypes.join('|'),
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

	// 5.1 AAC in TS crashes these sets. The container is named so MP4 and MKV files aren't
	// forced to transcode as well.
	if (isOldTizen) {
		codecProfiles.push({
			Type: 'VideoAudio',
			Container: 'ts,mpegts',
			Codec: 'aac',
			Conditions: [{ Condition: 'LessThanEqual', Property: 'AudioChannels', Value: '2', IsRequired: true }]
		});
	}

	// The same PCM16 limits isAudioStreamPlayable checks.
	codecProfiles.push({
		Type: 'VideoAudio',
		Codec: 'pcm_s16le',
		Conditions: [
			{
				Condition: 'LessThanEqual',
				Property: 'AudioChannels',
				Value: '2',
				IsRequired: false
			},
			{
				Condition: 'LessThanEqual',
				Property: 'AudioSampleRate',
				Value: '48000',
				IsRequired: false
			}
		]
	});

	// Forces every kind of DTS to transcode
	codecProfiles.push({
		Type: 'VideoAudio',
		Codec: 'dts,dca,dts-hd,dtshd,dts-ma,dtsma,dts-x,dtsx',
		Conditions: [{ Condition: 'Equals', Property: 'AudioChannels', Value: '0', IsRequired: true }]
	});

	// The experimental setting already puts TrueHD in the audio codec list above, so
	// forcing a transcode here left it with nothing to direct play. Atmos still gets
	// refused by isAudioStreamPlayable, since its marker is free text no condition matches.
	if (!caps.truehd) {
		codecProfiles.push({
			Type: 'VideoAudio',
			Codec: 'truehd,mlp',
			Conditions: [{ Condition: 'Equals', Property: 'AudioChannels', Value: '0', IsRequired: true }]
		});
	}

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

	// The server pulls text subtitles out of the file, which costs no video transcode. PGS is
	// drawn by the app, and DVD and DVB bitmaps are burned in.
	const subtitleProfiles = [
		{Format: 'srt', Method: 'External'},
		{Format: 'subrip', Method: 'External'},
		{Format: 'vtt', Method: 'External'},
		{Format: 'ass', Method: 'External'},
		{Format: 'ssa', Method: 'External'},
		{Format: 'smi', Method: 'External'},
		{Format: 'ttml', Method: 'External'},
		{Format: 'sub', Method: 'External'},
		// Lets a file with SRT inside direct play without the extraction
		{Format: 'srt', Method: 'Embed'},
		{Format: 'subrip', Method: 'Embed'},
		{Format: 'pgs', Method: 'External'},
		{Format: 'pgssub', Method: 'External'},
		{Format: 'dvdsub', Method: 'Encode'},
		{Format: 'dvbsub', Method: 'Encode'}
	];

	const containerProfiles = [];
	if (caps.tizenVersion < 6.5) {
		// These sets refuse files with more than 32 streams
		containerProfiles.push({
			Type: 'Video',
			Conditions: [{ Condition: 'LessThanEqual', Property: 'NumStreams', Value: '32', IsRequired: false }]
		});
	}

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
		ContainerProfiles: containerProfiles,
		SubtitleProfiles: subtitleProfiles,
		ResponseProfiles: responseProfiles
	};
};
