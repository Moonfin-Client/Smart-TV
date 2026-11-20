jest.mock('@titan-os/sdk', () => ({getTitanSDK: jest.fn()}));

import {getTitanSDK} from '@titan-os/sdk';

const PHILIPS_UA = 'Mozilla/5.0 (Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.4147.62 Safari/537.36 OPR/46.0.2207.0 OMI/4.24, TV_NT72690_2025_4K /000.000.000.000 (Philips, 55PUS8909, wired) CE-HTML/1.0 NETTV/4.6.0.8 SignOn/2.0 SmartTvA/5.0.0 TitanOS/3.0 en Ginga';
const JVC_UA = 'Mozilla/5.0 (Linux ) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.36 OMI/4.24.3.93.MIKE.227 Model/Vestel-MB190 VSTVB MB100 FVC/9.0 (VESTEL; MB190; ) HbbTV/1.7.1 (+DRM; VESTEL; MB190; 0.9.0.0; ; _TV__2025;) TitanOS/3.0 (Vestel MB190 VESTEL) SmartTvA/3.0.0';

// A Titan set answers yes to AV1 for MSE, which a direct played file never uses.
const titanEngine = (type) => (/avc1|hvc1|vp09|av01|mp4a|ac-3|ec-3|opus|mpegurl/.test(type) ? 'probably' : '');

const deviceInfo = {
	Channel: {appStore: 'titan', vendor: 'TPV', brand: 'Philips'},
	Product: {platform: 'TPN256E', year: '2025', model: '55PUS8909', firmwareVersion: '1.0.0', deviceID: 'secret-device-id', mac: '00:11:22:33:44:55', country: 'gb'},
	Capability: {supportUHD: true, supportHDR_HDR10: true, supportHDR_HLG: true, supportHDR_DV: true, supportHDR_HDR10Plus: 'unknown'}
};

const load = () => {
	let modules;
	jest.isolateModules(() => {
		modules = {
			profile: require('../../../platform-titan/src/deviceProfile'),
			info: require('../../../platform-titan/src/deviceInfo'),
			country: require('../../../platform-titan/src/countryCode'),
			video: require('../../../platform-titan/src/video')
		};
	});
	return modules;
};

const setUserAgent = (value) => Object.defineProperty(window.navigator, 'userAgent', {value, configurable: true});

describe('the Titan OS device profile', () => {
	// The app's jest config resets every mock before each test.
	beforeEach(() => {
		jest.spyOn(window.HTMLMediaElement.prototype, 'canPlayType').mockImplementation(titanEngine);
		setUserAgent(PHILIPS_UA);
		getTitanSDK.mockReturnValue({isReady: Promise.resolve(true), deviceInfo: {getDeviceInfo: () => Promise.resolve(deviceInfo)}});
	});

	test('reads the model, the OS version and the country, and never the set ids', async () => {
		const {info, country} = load();
		const device = await info.getDeviceInfo();
		expect(device).toMatchObject({platform: 'Titan OS', tvVersion: 'Titan OS 3.0', modelName: '55PUS8909', brand: 'Philips', year: '2025'});
		expect(JSON.stringify(device)).not.toMatch(/secret-device-id|00:11:22/);
		expect(await country.getCountryCode()).toBe('GB');
	});

	test('keeps to what Titan documents for a progressive file', async () => {
		const {profile} = load();
		const caps = await profile.getDeviceCapabilities();
		expect(caps).toMatchObject({uhd: true, hevc: true, hdr10: true, hlg: true, av1: false, dts: false, mkv: false, ts: false, hlsFmp4: false, dolbyVision: false});

		const built = await profile.getJellyfinDeviceProfile();
		expect(built.Name).toBe('Moonfin Titan OS');
		expect(built.DirectPlayProfiles.find((entry) => entry.Container === 'mp4,m4v')).toMatchObject({VideoCodec: 'h264,hevc', AudioCodec: 'aac,mp3,ac3,eac3'});
		// Titan's HLS takes TS segments only, kept to H.264 and AAC.
		expect(built.TranscodingProfiles[0]).toMatchObject({Container: 'ts', Protocol: 'hls', VideoCodec: 'h264', AudioCodec: 'aac', MaxAudioChannels: '6'});
		expect(built.TranscodingProfiles.some((entry) => entry.Protocol === 'hls' && entry.Container === 'mp4')).toBe(false);
		expect(built.CodecProfiles.find((entry) => entry.Codec === 'hevc').Conditions[1].Value).toBe('SDR|HDR10|HDR10Plus|HLG');
		expect(await profile.getDeviceName()).toBe('Philips 55PUS8909');
	});

	test('decides HDR10 direct and Dolby Vision through the server', async () => {
		const {profile, video} = load();
		const caps = await profile.getDeviceCapabilities();
		const file = (rangeType) => ({Container: 'mp4', SupportsDirectPlay: true, MediaStreams: [{Type: 'Video', Codec: 'hevc', VideoRangeType: rangeType, BitRate: 30_000_000}, {Type: 'Audio', Codec: 'eac3'}]});
		expect(video.getPlayMethod(file('HDR10'), caps)).toBe('DirectPlay');
		expect(video.getPlayMethod(file('DOVIWithHDR10'), caps)).toBe('Transcode');
		expect(video.getPlayMethod({...file('SDR'), Container: 'mkv'}, caps)).toBe('Transcode');
	});

	test('falls back to the user agent when the SDK never answers', async () => {
		jest.useFakeTimers();
		setUserAgent(JVC_UA);
		getTitanSDK.mockReturnValue({isReady: new Promise(() => {}), deviceInfo: {getDeviceInfo: jest.fn()}});
		const {profile} = load();
		const pending = profile.getDeviceCapabilities();
		await jest.advanceTimersByTimeAsync(6000);
		const caps = await pending;
		jest.useRealTimers();
		expect(caps).toMatchObject({modelName: 'Vestel-MB190', osVersionDisplay: 'Titan OS 3.0', uhd: false, maxBitrate: 20_000_000});
	});

	test("waits out the SDK's own 5 s lookup on older Philips sets", async () => {
		jest.useFakeTimers();
		getTitanSDK.mockReturnValue({isReady: new Promise((resolve) => setTimeout(() => resolve(true), 5500)), deviceInfo: {getDeviceInfo: () => Promise.resolve(deviceInfo)}});
		const {info} = load();
		const pending = info.getDeviceInfo();
		await jest.advanceTimersByTimeAsync(5500);
		const device = await pending;
		jest.useRealTimers();
		expect(device.modelName).toBe('55PUS8909');
	});

	test('reads the Back key the SDK gives for the brand', async () => {
		getTitanSDK.mockReturnValue({isReady: Promise.resolve(true), deviceInfo: {getDeviceInfo: () => Promise.resolve(deviceInfo), getKeyCodes: () => ({BACK: {key: 'Backspace', keyCode: 8}})}});
		expect(await load().info.getBackKeyCode()).toBe(8);
	});

	test('gives no Back key from an SDK without key codes', async () => {
		expect(await load().info.getBackKeyCode()).toBe(null);
	});

	test('names the set Titan OS when neither the SDK nor the user agent has a model', async () => {
		setUserAgent('Mozilla/5.0 (Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.4147.62 Safari/537.36 TitanOS/3.0');
		getTitanSDK.mockImplementation(() => {
			throw new Error('no platform');
		});
		expect(await load().profile.getDeviceName()).toBe('Titan OS');
	});

	test('falls back to the user agent when the SDK fails to load', async () => {
		getTitanSDK.mockImplementation(() => {
			throw new Error('no platform');
		});
		const {info} = load();
		expect((await info.getDeviceInfo()).modelName).toBe('TV_NT72690_2025_4K');
	});
});
