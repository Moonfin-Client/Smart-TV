/* global navigator, localStorage */
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

export const detectWebOSVersion = (sdkVersion = null) => {
	if (sdkVersion) {
		const match = /^(\d+)\./.exec(sdkVersion);
		if (match) {
			const major = parseInt(match[1], 10);
			if (major >= 1 && major <= 25) return major;
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

export const testDtsSupport = (webosVersion) => {
	// DTS audio is not supported by LG TV 2020-2022 (webOS 5.0, 6.0 and 22) models
	if (webosVersion >= 5 && webosVersion < 23) {
		return false;
	}
	return true;
};

// Check if DTS is supported in a specific container based on webOS version
export const testDtsInContainer = (webosVersion, container) => {
	if (!testDtsSupport(webosVersion)) {
		return false;
	}

	const containerLower = (container || '').toLowerCase();

	if (webosVersion >= 23) {
		return ['mkv', 'matroska', 'mp4', 'm4v', 'mov', 'ts', 'mpegts', 'mts', 'm2ts'].includes(containerLower);
	}

	return ['mkv', 'matroska', 'avi'].includes(containerLower);
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
						'tv.model.modelName',
						'tv.model.serialnumber',
						'tv.config.supportDolbyHDRContents',
						'tv.model.supportHDR',
						'tv.hw.supportCodecH265',
						'tv.hw.supportCodecAV1',
						'tv.hw.supportCodecVP9',
						'tv.hw.panelResolution',
						'tv.hw.ddrSize',
						'tv.conti.supportDolbyAtmos',
						'tv.config.supportDolbyAtmos',
						'tv.model.oled',
						'tv.nvm.support.edid.hdr10plus',
						'tv.config.supportHLG'
					]
				},
				onSuccess: resolve,
				onFailure: () => resolve({configs: {}})
			});
		});
	} catch (e) { void e; }

	const cfg = configData.configs || {};
	const webosVersion = detectWebOSVersion(deviceInfoData.sdkVersion);

	// Get container support from documented webOS specifications
	const containerSupport = getDocumentedContainerSupport(webosVersion);

	// Get Luna API codec results (null if not available)
	const lunaHevc = cfg['tv.hw.supportCodecH265'];
	const lunaAv1 = cfg['tv.hw.supportCodecAV1'];
	const lunaVp9 = cfg['tv.hw.supportCodecVP9'];

	cachedCapabilities = {
		modelName: deviceInfoData.modelName || cfg['tv.model.modelName'] || 'Unknown',
		modelNameAscii: deviceInfoData.modelNameAscii || '',
		serialNumber: cfg['tv.model.serialnumber'] || '',
		sdkVersion: deviceInfoData.sdkVersion || 'Unknown',
		firmwareVersion: deviceInfoData.version || '',

		webosVersion,
		webosVersionDisplay: `webOS ${webosVersion}`,

		screenWidth: deviceInfoData.screenWidth || 1920,
		screenHeight: deviceInfoData.screenHeight || 1080,
		uhd: cfg['tv.hw.panelResolution'] === 'UD' || deviceInfoData.uhd || false,
		uhd8K: cfg['tv.hw.panelResolution'] === '8K' || deviceInfoData.uhd8K || false,
		oled: cfg['tv.model.oled'] === true || deviceInfoData.oled || false,

		// HDR10/HLG: All webOS 4+ TVs support HDR10 and HLG via HEVC Main10 profile
		// webOS TVs are known to support HDR10
		// Luna API tv.model.supportHDR may not be available on older models
		hdr10: cfg['tv.model.supportHDR'] === true || webosVersion >= 4,
		hdr10Plus: cfg['tv.nvm.support.edid.hdr10plus'] === true || webosVersion >= 6,
		hlg: cfg['tv.config.supportHLG'] === true || cfg['tv.model.supportHDR'] === true || webosVersion >= 4,

		// Dolby Vision: Only enabled if Luna API confirms support
		// webOS 4+ can play DV Profile 8 fallback layers (HDR10/SDR) even without native DV
		dolbyVision: cfg['tv.config.supportDolbyHDRContents'] === true,

		dolbyAtmos: cfg['tv.conti.supportDolbyAtmos'] === true || cfg['tv.config.supportDolbyAtmos'] === true,
		dts: testDtsSupport(webosVersion),
		ac3: testAc3Support(),
		// E-AC3: webOS 4 handles it, but webOS 5 has issues with some streams, go figure
		// Disabled for webOS 5 to force transcoding to AAC which is more reliable
		eac3: webosVersion !== 5,
		// TrueHD/DTS-HD: webOS can only PASSTHROUGH these to an AV receiver, not decode internally
		// Setting to false by default - users with AV receivers would need a setting to enable. TODO: Add setting later probably
		truehd: false,
		dtshd: false,

		hevc: lunaHevc === true || (lunaHevc !== false && testHevcSupport(null, webosVersion)),
		av1: lunaAv1 === true || testAv1Support(null, webosVersion),
		vp9: lunaVp9 === true || testVp9Support(null, webosVersion),

		...containerSupport,

		// HLS support details:
		// - All versions: Native HLS with AES128 encryption
		// - webOS 5+: fMP4 segments, AC3 audio
		nativeHls: containerSupport.hls,
		nativeHlsFmp4: webosVersion >= 5,
		hlsAc3: webosVersion >= 5,
		hlsByteRange: webosVersion >= 4,

		lunaConfig: cfg,
		ddrSize: cfg['tv.hw.ddrSize'] || 0
	};

	// Log HDR detection details for debugging
	console.log('[deviceProfile] HDR detection:', {
		webosVersion,
		'tv.model.supportHDR': cfg['tv.model.supportHDR'],
		'tv.config.supportDolbyHDRContents': cfg['tv.config.supportDolbyHDRContents'],
		'tv.config.supportHLG': cfg['tv.config.supportHLG'],
		'tv.nvm.support.edid.hdr10plus': cfg['tv.nvm.support.edid.hdr10plus'],
		resultHdr10: cachedCapabilities.hdr10,
		resultHlg: cachedCapabilities.hlg,
		resultHdr10Plus: cachedCapabilities.hdr10Plus,
		resultDolbyVision: cachedCapabilities.dolbyVision,
		note: 'HDR10/HLG enabled for all webOS 4+ per'
	});
	console.log('[deviceProfile] Capabilities:', cachedCapabilities);
	return cachedCapabilities;
};

const buildVideoRangeTypes = (caps) => {
	// Base: SDR always supported
	let rangeTypes = ['SDR'];

	// webOS 4+ without native Dolby Vision can still play DV content
	// using the SDR fallback layer (DOVIWithSDR)
	const isWebOsWithoutDV = caps.webosVersion >= 4 && !caps.dolbyVision;
	if (isWebOsWithoutDV) {
		rangeTypes.push('DOVIWithSDR');
	}

	// HDR10 support (all webOS 4+ TVs)
	if (caps.hdr10) {
		rangeTypes.push('HDR10', 'HDR10Plus');

		// webOS without native DV can play HDR10 fallback from DV content
		if (isWebOsWithoutDV) {
			rangeTypes.push('DOVIWithHDR10', 'DOVIWithHDR10Plus', 'DOVIWithEL', 'DOVIWithELHDR10Plus', 'DOVIInvalid');
		}
	}

	// HLG support (all webOS 4+ TVs)
	if (caps.hlg) {
		rangeTypes.push('HLG');

		if (isWebOsWithoutDV) {
			rangeTypes.push('DOVIWithHLG');
		}
	}

	// Native Dolby Vision support (only if Luna API confirms)
	if (caps.dolbyVision) {
		// DV Profile 5 (single layer) and Profile 8 (with fallback layers)
		rangeTypes.push('DOVI', 'DOVIWithHDR10', 'DOVIWithHLG', 'DOVIWithSDR', 'DOVIWithHDR10Plus');
		// webOS can play fallback of Profile 7 and most invalid profiles
		rangeTypes.push('DOVIWithEL', 'DOVIWithELHDR10Plus', 'DOVIInvalid');
	}

	console.log('[deviceProfile] buildVideoRangeTypes:', rangeTypes.join('|'),
		'(webOS:', caps.webosVersion, 'hdr10:', caps.hdr10, 'hlg:', caps.hlg, 'dv:', caps.dolbyVision, ')');
	return rangeTypes.join('|');
};

const buildDirectPlayProfiles = (caps) => {
	const profiles = [];

	const mp4VideoCodecs = ['h264'];
	if (caps.hevc) mp4VideoCodecs.push('hevc');
	if (caps.vp9) mp4VideoCodecs.push('vp9');
	if (caps.av1) mp4VideoCodecs.push('av1');

	// Build audio codecs based on actual device capabilities
	const videoAudioCodecs = ['aac', 'mp3', 'flac', 'pcm_s16le', 'pcm_s24le'];
	if (caps.ac3) videoAudioCodecs.push('ac3');
	if (caps.eac3) videoAudioCodecs.push('eac3');
	if (caps.dts) {
		videoAudioCodecs.push('dca', 'dts');
	}

	console.log('[deviceProfile] Building DirectPlay profiles - caps.eac3:', caps.eac3, 'caps.webosVersion:', caps.webosVersion);
	console.log('[deviceProfile] videoAudioCodecs:', videoAudioCodecs);
	if (caps.truehd) videoAudioCodecs.push('truehd');
	if (caps.webosVersion >= 24) videoAudioCodecs.push('opus');
	videoAudioCodecs.push('vorbis');

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
		AudioCodec: videoAudioCodecs.join(',')
	});

	if (caps.mkv) {
		profiles.push({
			Container: 'mkv',
			Type: 'Video',
			VideoCodec: mp4VideoCodecs.join(','),
			AudioCodec: videoAudioCodecs.join(',')
		});
	}

	if (caps.ts) {
		const tsVideoCodecs = ['h264'];
		if (caps.hevc) tsVideoCodecs.push('hevc');
		tsVideoCodecs.push('vc1', 'mpeg2video');

		profiles.push({
			Container: 'ts,mpegts',
			Type: 'Video',
			VideoCodec: tsVideoCodecs.join(','),
			AudioCodec: videoAudioCodecs.join(',')
		});
	}

	profiles.push({
		Container: 'm2ts',
		Type: 'Video',
		VideoCodec: 'h264,vc1,mpeg2video',
		AudioCodec: videoAudioCodecs.join(',')
	});

	if (caps.asf || caps.wmv) {
		profiles.push({
			Container: 'asf',
			Type: 'Video',
			VideoCodec: '',
			AudioCodec: ''
		});
		profiles.push({
			Container: 'wmv',
			Type: 'Video',
			VideoCodec: '',
			AudioCodec: ''
		});
	}

	if (caps.avi) {
		const aviVideoCodecs = ['h264'];
		if (caps.hevc) aviVideoCodecs.push('hevc');

		profiles.push({
			Container: 'avi',
			Type: 'Video',
			VideoCodec: aviVideoCodecs.join(','),
			AudioCodec: videoAudioCodecs.join(',')
		});
	}

	if (caps.mpg) {
		profiles.push({
			Container: 'mpg,mpeg',
			Type: 'Video',
			VideoCodec: '',
			AudioCodec: ''
		});
	}

	profiles.push({
		Container: 'mov',
		Type: 'Video',
		VideoCodec: 'h264',
		AudioCodec: videoAudioCodecs.join(',')
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
		profiles.push({
			Container: 'hls',
			Type: 'Video',
			VideoCodec: mp4VideoCodecs.join(','),
			AudioCodec: videoAudioCodecs.join(',')
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

	console.log('[deviceProfile] Video Range Types:', videoRangeTypes, '(hdr10:', caps.hdr10, 'hlg:', caps.hlg, 'dolbyVision:', caps.dolbyVision, ')');
	console.log('[deviceProfile] DirectPlayProfiles:', directPlayProfiles);

	// Transcoding profiles - use HLS for all webOS versions
	// webOS 5 (Chrome 68) needs hls.js to handle HLS via MSE
	// webOS 6+ (Chrome 79+) has better native HLS support
	// Progressive MP4/TS don't work reliably due to timestamp/demuxing issues
	let transcodingProfiles;

	console.log('[deviceProfile] Using HLS transcoding for webOS', caps.webosVersion);
	const hlsContainer = 'ts';
	const hlsAudioCodecs = caps.ac3 ? 'aac,mp2,ac3' : 'aac,mp2';

	transcodingProfiles = [
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
		{
			Container: 'ts',
			Type: 'Video',
			AudioCodec: 'aac,mp2,ac3',
			VideoCodec: 'h264',
			Context: 'Streaming',
			Protocol: 'hls',
			MaxAudioChannels: '6',
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

	// H.264 level based on webOS version and panel resolution
	// Per LG docs: webOS 4+ UHD models support H.264 Level 5.1 at 3840x2160@30P
	// Non-UHD models: Level 4.2 for 1080p@60P
	const h264MaxLevel = (caps.webosVersion >= 4 && (caps.uhd || caps.uhd8K)) ? '51' : '42';
	console.log('[deviceProfile] H.264 max level:', h264MaxLevel, '(webOS', caps.webosVersion, ', UHD:', caps.uhd, ')');

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
					Value: '153',
					IsRequired: false
				}
			]
		},
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
					Value: '15',
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
		{Format: 'ass', Method: 'Encode'},
		{Format: 'ssa', Method: 'Encode'},
		{Format: 'sub', Method: 'Encode'},
		{Format: 'smi', Method: 'Encode'},
		{Format: 'ttml', Method: 'External'},
		{Format: 'pgssub', Method: 'Encode'},
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
	getDeviceId,
	getDeviceName
};
