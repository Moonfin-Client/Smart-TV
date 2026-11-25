import {resolvePanelType} from './panelType';
import {detectWebOSVersion, platformSdkVersion} from './webosVersion';

let cachedCapabilities = null;

const DEFAULT_PASSTHROUGH_SETTINGS = {
	passthroughEnabled: true,
	ac3Passthrough: true,
	eac3Passthrough: true,
	dtsPassthrough: true,
	dtshdPassthrough: true
};

const resolvePassthroughSettings = (options = {}) => ({
	...DEFAULT_PASSTHROUGH_SETTINGS,
	...(options?.passthroughSettings || {})
});

const emptyDtsSupport = {mkv: false, mp4: false, ts: false, avi: false};

const getActiveSoundOutput = (audioStatus = {}) =>
	(audioStatus?.soundOutput || '').toString().toLowerCase().trim();

// Lossless formats only survive over ARC or eARC to a receiver, and only while
// the TV is bitstreaming. PCM means it decoded the track itself.
const isLosslessPassthroughOutput = (audioStatus = {}) => {
	if (!/arc/.test(getActiveSoundOutput(audioStatus))) return false;
	const digital = (audioStatus?.soundOutputDigital || '').toString().toLowerCase();
	return digital !== 'pcm';
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const lunaRequest = async (service, method, parameters) => {
	try {
		const LS2Request = (await import('./LS2Request.js')).default;
		return await new Promise((resolve) => {
			new LS2Request().send({
				service: `luna://${service}`,
				method,
				...(parameters ? {parameters} : {}),
				onSuccess: resolve,
				onFailure: () => resolve({})
			});
		});
	} catch (e) {
		return {};
	}
};

const queryAudioOutputStatus = () =>
	lunaRequest('com.webos.service.avoutput', 'audio/getStatus');

// The documented route to the sound path. com.webos.service.avoutput isn't public API
// and answers an empty object on current firmware, which reads as no receiver and
// switches off every passthrough check.
const querySoundSettings = async () => {
	const result = await lunaRequest('com.webos.settingsservice', 'getSystemSettings', {
		category: 'sound',
		keys: ['soundOutput', 'digitalSoundOutput']
	});
	return result?.settings || {};
};

// A playback request reads the sound path for the capabilities and again for the profile, and a set
// without the avoutput service retries for over a second, so both reads share one answer keyed by the
// request's options object. Any other read asks again, since a stale receiver answer would send
// lossless audio to the TV speakers.
const audioOutputQueries = new WeakMap();

const queryAudioOutputPath = async () => {
	for (let attempt = 0; attempt < 4; attempt++) {
		const [status, sound] = await Promise.all([queryAudioOutputStatus(), querySoundSettings()]);
		const merged = {
			...status,
			soundOutput: status?.soundOutput || sound.soundOutput,
			soundOutputDigital: status?.soundOutputDigital || sound.digitalSoundOutput
		};
		if (getActiveSoundOutput(merged)) return merged;
		await delay(150);
	}
	return {};
};

const getAudioOutputStatus = (request) => {
	if (!request || typeof request !== 'object') return queryAudioOutputPath();
	if (!audioOutputQueries.has(request)) audioOutputQueries.set(request, queryAudioOutputPath());
	return audioOutputQueries.get(request);
};

const applyAudioOutputPath = async (baseCaps, request) => {
	const audioOutputStatus = await getAudioOutputStatus(request);
	const receiverPassthrough = isLosslessPassthroughOutput(audioOutputStatus);

	const setDts = baseCaps.dtsBase || baseCaps.dts || emptyDtsSupport;
	// A set without DTS can't pass it through either, which is how LG's 2025 sets are.
	const dts = receiverPassthrough && (setDts.mkv || setDts.mp4 || setDts.ts)
		? {mkv: true, mp4: true, ts: true, avi: false}
		: setDts;

	return {
		...baseCaps,
		dts,
		dtshd: receiverPassthrough && !!(dts.mkv || dts.mp4 || dts.ts),
		audioOutputStatus,
		externalAudioPathActive: receiverPassthrough
	};
};

const applyPassthroughSettings = (caps, options = {}) => {
	const prefs = resolvePassthroughSettings(options);
	const passthroughAllowed = prefs.passthroughEnabled;
	const dtsSupport = passthroughAllowed && prefs.dtsPassthrough ? (caps.dts || emptyDtsSupport) : emptyDtsSupport;

	return {
		...caps,
		ac3: !!caps.ac3 && !!prefs.ac3Passthrough,
		eac3: !!caps.eac3 && !!prefs.eac3Passthrough,
		dts: dtsSupport,
		dtshd: !!caps.dtshd && passthroughAllowed && !!prefs.dtshdPassthrough
	};
};

export const clearCapabilitiesCache = () => {
	cachedCapabilities = null;
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

	if (webosVersion >= 3) {
		supported.mkv = true;
	}

	if (webosVersion >= 5) {
		supported.webm = true;
	}

	return supported;
};

// A real set answers through its Starfish pipeline. An emulator without it answers
// nothing, since Chromium alone can't play HLS.
const canPlayNativeHls = () => {
	if (typeof document === 'undefined') return false;
	const video = document.createElement('video');
	return !!(video.canPlayType('application/x-mpegURL').replace(/no/, '')
		|| video.canPlayType('application/vnd.apple.mpegURL').replace(/no/, ''));
};

// LG only lists HEVC up to Level 5.1 for 4K, but plenty of 4K remuxes are tagged 6.0 or 6.1,
// so the set is asked whether it takes them before the server is told to transcode them.
const canPlayHevcLevel61 = () => {
	if (typeof document === 'undefined') return false;
	const video = document.createElement('video');
	return !!(video.canPlayType('video/mp4; codecs="hvc1.2.4.L183"').replace(/no/, '')
		|| video.canPlayType('video/mp4; codecs="hev1.2.4.L183"').replace(/no/, ''));
};

const canPlayDts = () => {
	if (typeof document === 'undefined') return false;
	const video = document.createElement('video');
	return !!(video.canPlayType('video/mp4; codecs="dts-"').replace(/no/, '')
		|| video.canPlayType('video/mp4; codecs="dts+"').replace(/no/, ''));
};

// LG documents DTS in AVI and MKV on webOS 4, in MKV only on 5 to 22, and in MKV, MP4 and TS
// on some models from 23. There the undocumented tv.model.edidType config holds dts on sets
// that have it, as in "TrueHD+dts". Without the key MKV is offered only when the set's engine
// says it plays DTS, since LG's 2025 sets have none and refuse the key to apps. A non-DTS
// soundbar makes the TV decode DTS to stereo PCM, and no Luna API reports that.
const getDtsContainerSupport = (webosVersion, rawEdidType = null) => {
	if (webosVersion >= 23) {
		if (rawEdidType == null) {
			return { mkv: canPlayDts(), mp4: false, ts: false, avi: false };
		}
		const edidHasDts = rawEdidType.toLowerCase().includes('dts');
		return {
			mkv: edidHasDts,
			mp4: edidHasDts,
			ts: edidHasDts,
			avi: false
		};
	}
	if (webosVersion >= 5) {
		return { mkv: true, mp4: false, ts: false, avi: false };
	}
	return { mkv: true, mp4: false, ts: false, avi: true };
};

// What the set is, read once. The sound path changes with what's plugged in, so it's added per read.
const loadCapabilities = async () => {
	if (cachedCapabilities) return cachedCapabilities;

	let deviceInfoData = {};

	try {
		const deviceInfo = await import('./lunaDeviceInfo.js');
		deviceInfoData = await new Promise(resolve => deviceInfo.default(resolve));
	} catch (e) { void e; }

	const configData = await lunaRequest('com.webos.service.config', 'getConfigs', {configNames: ['tv.model.*', 'tv.hw.*']});

	// The config service withholds the panel keys on some sets, so the system property
	// service is asked when nothing else has said what the panel is.
	let systemProperty = {};
	if (!configData.configs?.['tv.hw.panelResolution'] && deviceInfoData.uhd !== true) {
		systemProperty = await lunaRequest('com.webos.service.tv.systemproperty', 'getSystemInfo', {keys: ['UHD', 'OLED']});
	}

	const cfg = configData.configs || {};
	const webosVersion = detectWebOSVersion(platformSdkVersion(deviceInfoData));

	const containerSupport = getDocumentedContainerSupport(webosVersion);

	const {isUhd, isOled} = resolvePanelType(cfg, systemProperty, deviceInfoData);

	const rawEdidType = cfg['tv.model.edidType'];
	const dtsBase = getDtsContainerSupport(webosVersion, rawEdidType);

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
		// webOS has no HDR10+ of its own but plays it as HDR10, so it follows hdr10 to avoid a transcode.
		hdr10Plus: cfg['tv.model.supportHDR'] === true || webosVersion >= 4,
		hlg: cfg['tv.model.supportHDR'] === true || webosVersion >= 4,

		// UHD and OLED sets from webOS 4 have Dolby Vision. The config keys aren't in LG's
		// public docs, so they only ever add a yes.
		dolbyVision: (() => {
			if (webosVersion >= 4 && (isUhd || isOled)) return true;
			const lunaVal = cfg['tv.model.supportDolbyVisionHDR'];
			if (lunaVal === true || lunaVal === 'true' || lunaVal === 'Y' || lunaVal === 1) return true;
			const lunaVal2 = cfg['tv.model.supportDolbyVision'];
			if (lunaVal2 === true || lunaVal2 === 'true' || lunaVal2 === 'Y' || lunaVal2 === 1) return true;
			return false;
		})(),

		dolbyAtmos: (cfg['tv.model.soundModeType'] || '').includes('Dolby Atmos'),
		dts: dtsBase,
		dtsBase,
		ac3: true,
		eac3: true,
		// LG only sends TrueHD out over eARC from an HDMI input, never from an app, and its player
		// skips the track and plays another one from the file instead (#668).
		truehd: false,
		dtshd: false,
		// The TV decodes FLAC to LPCM, so it direct plays in a video container on modern
		// webOS even though LG only lists it as a standalone format.
		flac: webosVersion >= 5,
		opus: webosVersion >= 6,

		hevc: webosVersion >= 3,
		hevcLevel61: canPlayHevcLevel61(),
		av1: webosVersion >= 5,
		vp9: webosVersion >= 3,

		...containerSupport,

		nativeHls: containerSupport.hls,
		hasNativeHls: canPlayNativeHls(),
		nativeHlsFmp4: webosVersion >= 5,
		hlsAc3: webosVersion >= 5,
		hlsByteRange: webosVersion >= 4,

		lunaConfig: cfg,
		ddrSize: cfg['tv.hw.ddrSize'] || 0
	};

	return cachedCapabilities;
};

export const getDeviceCapabilities = async (request) => applyAudioOutputPath(await loadCapabilities(), request);

const buildVideoRangeTypes = (caps) => {
	let rangeTypes = ['SDR'];

	const isWebOsWithoutDV = caps.webosVersion >= 4 && !caps.dolbyVision;
	if (isWebOsWithoutDV) {
		rangeTypes.push('DOVIWithSDR');
	}

	if (caps.hdr10) {
		// A set that only reads the static metadata still renders the HDR10 base of HDR10+
		rangeTypes.push('HDR10', 'HDR10Plus');

		if (isWebOsWithoutDV) {
			// Dual layer Dolby Vision carries a base layer an HDR10 panel can play while
			// ignoring the Dolby Vision data on top
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

const buildMp4VideoCodecs = (caps) => {
	const mp4VideoCodecs = ['h264'];
	if (caps.hevc) mp4VideoCodecs.push('hevc', 'dvh1');
	if (caps.dolbyVision) mp4VideoCodecs.push('dvhe');
	if (caps.av1) mp4VideoCodecs.push('av1');
	return mp4VideoCodecs;
}

const buildMp4AudioCodecs = (caps) => {
	const dts = caps.dts || {};
	const mp4AudioCodecs = ['aac', 'mp3'];
	if (caps.ac3) mp4AudioCodecs.push('ac3');
	if (caps.eac3) mp4AudioCodecs.push('eac3');
	if (dts.mp4) mp4AudioCodecs.push('dca', 'dts');
	if (dts.mp4 && caps.dtshd) mp4AudioCodecs.push('dts-hd', 'dtshd');
	if (caps.opus) mp4AudioCodecs.push('opus');
	if (caps.flac) mp4AudioCodecs.push('flac');
	return mp4AudioCodecs;

}

const buildTsVideoCodecs = (caps) => {
	// LG documents VC-1 only in ASF and WMV
	const tsVideoCodecs = ['h264'];
	if (caps.hevc) tsVideoCodecs.push('hevc', 'dvh1');
	if (caps.dolbyVision) tsVideoCodecs.push('dvhe');
	tsVideoCodecs.push('mpeg2video');
	return tsVideoCodecs;
}

const buildTsAudioCodecs = (caps) => {
	const dts = caps.dts || {};
	const tsAudioCodecs = ['aac', 'mp2', 'mp3', 'pcm_s16le', 'pcm_s24le'];
	if (caps.ac3) tsAudioCodecs.push('ac3');
	if (caps.eac3) tsAudioCodecs.push('eac3');
	if (dts.ts) tsAudioCodecs.push('dca', 'dts');
	if (dts.ts && caps.dtshd) tsAudioCodecs.push('dts-hd', 'dtshd');
	if (caps.opus) tsAudioCodecs.push('opus');
	return tsAudioCodecs;
}

const buildMkvVideoCodecs = (caps) => {
	const mkvVideoCodecs = ['h264', 'mpeg4', 'mpeg2video', 'vp8'];
	if (caps.hevc) mkvVideoCodecs.push('hevc');
	if (caps.webosVersion >= 25 && caps.hevc) mkvVideoCodecs.push('dvh1');
	if (caps.webosVersion >= 25 && caps.dolbyVision) mkvVideoCodecs.push('dvhe');
	if (caps.vp9) mkvVideoCodecs.push('vp9');
	if (caps.av1) mkvVideoCodecs.push('av1');
	return mkvVideoCodecs
}

const buildMkvAudioCodecs = (caps) => {
	const dts = caps.dts || {};
	// FLAC decodes here on modern webOS though LG only documents it as a standalone format,
	// so a Dolby Vision file with FLAC audio direct plays instead of transcoding. Vorbis stays out.
	const mkvAudioCodecs = ['aac', 'mp2', 'mp3', 'pcm_s16le', 'pcm_s24le'];
	if (caps.ac3) mkvAudioCodecs.push('ac3');
	if (caps.eac3) mkvAudioCodecs.push('eac3');
	if (dts.mkv) mkvAudioCodecs.push('dca', 'dts');
	if (dts.mkv && caps.dtshd) mkvAudioCodecs.push('dts-hd', 'dtshd');
	if (caps.opus) mkvAudioCodecs.push('opus');
	if (caps.flac) mkvAudioCodecs.push('flac');
	return mkvAudioCodecs;

}

const buildDirectPlayProfiles = (caps) => {
	const profiles = [];

	const mp4VideoCodecs = buildMp4VideoCodecs(caps);

	const dts = caps.dts || {};

	const mp4AudioCodecs = buildMp4AudioCodecs(caps);

	const mkvAudioCodecs = buildMkvAudioCodecs(caps);

	const tsAudioCodecs =  buildTsAudioCodecs(caps);

	const aviAudioCodecs = ['mp2', 'mp3', 'pcm_s16le', 'pcm_s24le'];
	if (caps.ac3) aviAudioCodecs.push('ac3');
	if (dts.avi) aviAudioCodecs.push('dca', 'dts');

	const webmVideoCodecs = ['vp8'];
	if (caps.vp9) webmVideoCodecs.push('vp9');
	if (caps.av1) webmVideoCodecs.push('av1');
	const webmAudioCodecs = ['vorbis'];
	if (caps.opus) webmAudioCodecs.push('opus');

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
		const mkvVideoCodecs = buildMkvVideoCodecs(caps);

		profiles.push({
			Container: 'mkv',
			Type: 'Video',
			VideoCodec: mkvVideoCodecs.join(','),
			AudioCodec: mkvAudioCodecs.join(',')
		});
	}

	if (caps.ts) {
		const tsVideoCodecs = buildTsVideoCodecs(caps);

		profiles.push({
			Container: 'ts,mpegts',
			Type: 'Video',
			VideoCodec: tsVideoCodecs.join(','),
			AudioCodec: tsAudioCodecs.join(',')
		});
	}

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
		const aviVideoCodecs = ['h264', 'mpeg4', 'mjpeg'];

		profiles.push({
			Container: 'avi',
			Type: 'Video',
			VideoCodec: aviVideoCodecs.join(','),
			AudioCodec: aviAudioCodecs.join(',')
		});
	}

	if (caps.mpg) {
		profiles.push({
			Container: 'mpg,mpeg',
			Type: 'Video',
			VideoCodec: 'mpeg1video,mpeg2video',
			AudioCodec: 'mp2,mp3'
		});
	}

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

	if (caps.opus) {
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
		// HLS sources arrive in TS segments, so they take the TS audio list
		profiles.push({
			Container: 'hls',
			Type: 'Video',
			VideoCodec: mp4VideoCodecs.join(','),
			AudioCodec: tsAudioCodecs.join(',')
		});
	}

	return profiles;
};

export const getJellyfinDeviceProfile = async (options = {}) => {
	const baseCaps = await getDeviceCapabilities(options);
	const caps = applyPassthroughSettings(baseCaps, options);

	const videoRangeTypes = buildVideoRangeTypes(caps);
	const directPlayProfiles = buildDirectPlayProfiles(caps);

	const maxStreamingBitrate = 120_000_000;
	const maxAudioChannels = caps.dolbyAtmos || caps.dtshd ? '8' : '6';

	// fMP4 keeps the Dolby Vision RPU metadata that TS strips
	const hlsContainer = caps.nativeHlsFmp4 ? 'mp4' : 'ts';
	let transcodingProfiles;

	if (caps.hasNativeHls) {
		const hlsAudioCodecs = caps.eac3 ? 'aac,mp2,ac3,eac3' : (caps.ac3 ? 'aac,mp2,ac3' : 'aac,mp2');
		// One profile with h264 last, not a separate hevc one. The server takes the first
		// workable profile and picks the codec within it, so a lone hevc profile demands
		// an HEVC encode from servers that don't allow one.
		const hlsVideoCodec = caps.hevc
			? (caps.dolbyVision ? 'hevc,dvh1,dvhe,h264' : 'hevc,h264')
			: 'h264';
		transcodingProfiles = [
			{
				Container: hlsContainer,
				Type: 'Video',
				AudioCodec: hlsAudioCodecs,
				VideoCodec: hlsVideoCodec,
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
	const hevcMaxLevel = caps.uhd8K ? '186' : caps.uhd ? (caps.hevcLevel61 ? '183' : '153') : '123';

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
			// The FLAC decoder handles up to 7.1 and downmixes for the output, so multichannel
			// doesn't need a transcode
			Type: 'VideoAudio',
			Codec: 'flac',
			Conditions: [
				{
					Condition: 'LessThanEqual',
					Property: 'AudioChannels',
					Value: '8',
					IsRequired: false
				}
			]
		}
	];

	// Embed covers the SRT tracks inside the file, which the client reads itself, and External
	// still covers sidecar files.
	const embeddedTextProfiles = options.embedTextSubtitles ?
		['srt', 'subrip'].map((Format) => ({Format, Method: 'Embed'})) : [];
	const subtitleProfiles = [
		...embeddedTextProfiles,
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

// H.264 and AAC only, for the hls.js retry after native HEVC decoding fails.
export const getH264FallbackProfile = async (options = {}) => {
	const profile = await getJellyfinDeviceProfile(options);

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
