// Titan's media pages list progressive MP4 with H.264 or HEVC and AAC, MP3, AC3 or
// E-AC-3, WebM with VP9 and Opus, and HLS version 3 with TS segments only. AV1 is
// only listed for MSE, which a direct played file doesn't go through. Every set does
// HDR10 and HLG, the SDK says which are 4K, and canPlayType has to agree as well.
import {buildDeviceProfile, buildH264FallbackProfile, hasAudioTracks, probeCodecs} from '@moonfin/platform-web/deviceProfile';
import {getTitanDeviceInfo, modelFromUserAgent, osVersionFromUserAgent} from './deviceInfo';

export {getDeviceId} from '@moonfin/platform-web/deviceProfile';

// The SDK answers true, false or "unknown", sometimes as strings.
const isTrue = (flag) => flag === true || flag === 'true';
const isFalse = (flag) => flag === false || flag === 'false';

let cachedCapabilities = null;

export const clearCapabilitiesCache = () => {
	cachedCapabilities = null;
};

export const getDeviceCapabilities = async () => {
	if (cachedCapabilities) return cachedCapabilities;

	const info = await getTitanDeviceInfo();
	const reported = info?.Capability || {};
	const codecs = probeCodecs();
	const uhd = isTrue(reported.supportUHD) || /_4K\b/.test(navigator.userAgent);
	const tenBit = codecs.hevcMain10 || codecs.vp9Profile2;

	cachedCapabilities = {
		...codecs,
		modelName: info?.Product?.model || info?.Product?.platform || modelFromUserAgent(navigator.userAgent),
		brand: info?.Channel?.brand || null,
		osVersionDisplay: osVersionFromUserAgent(navigator.userAgent),
		uhd,
		hdr10: tenBit && !isFalse(reported.supportHDR_HDR10),
		hlg: tenBit && !isFalse(reported.supportHDR_HLG),
		// Titan lists Dolby Vision on some sets, but none has been seen playing it through the page.
		dolbyVision: false,
		av1: false,
		dts: false,
		flac: false,
		mkv: false,
		webm: codecs.vp9,
		ts: false,
		audioTracks: hasAudioTracks(),
		hlsFmp4: false,
		// Titan publishes no bitrate ceiling for progressive files, so these are a guess.
		maxBitrate: uhd ? 60_000_000 : 20_000_000,
		autoMaxBitrate: uhd ? 60_000_000 : 20_000_000
	};

	console.log('[deviceProfile] Capabilities:', cachedCapabilities);
	return cachedCapabilities;
};

export const detectTitanVersion = () => osVersionFromUserAgent(navigator.userAgent);

export const getJellyfinDeviceProfile = async () => buildDeviceProfile(await getDeviceCapabilities(), 'Moonfin Titan OS');

export const getH264FallbackProfile = async () => buildH264FallbackProfile(await getDeviceCapabilities(), 'Moonfin Titan OS');

export const getDeviceName = async () => {
	const caps = await getDeviceCapabilities();
	return [caps.brand || 'Titan OS', caps.modelName].filter(Boolean).join(' ');
};
