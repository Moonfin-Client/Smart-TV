import {clearCapabilitiesCache, getDeviceCapabilities, getJellyfinDeviceProfile} from '../../../platform-tizen/src/deviceProfile';
import {getPlayMethod} from '../../../platform-tizen/src/video';

const source = (codec, container = 'mkv', video = {}, audio = {}) => ({
	Container: container, SupportsDirectPlay: true, SupportsDirectStream: true,
	MediaStreams: [{Type: 'Video', Index: 0, Codec: codec, Width: 1280, Height: 720, VideoRangeType: 'SDR', ...video},
		{Type: 'Audio', Index: 1, Codec: 'aac', Channels: 2, SampleRate: 48000, ...audio}]
});

describe('Tizen bounded PCM16 support', () => {
	beforeEach(() => {
		global.tizen = {systeminfo: {getCapability: () => '6.5'}};
		global.webapis = {productinfo: {getRealModel: () => 'QN55S95BAFXZA', isUdPanelSupported: () => true, is8KPanelSupported: () => false}, avinfo: {isHdrTvSupport: () => true}};
		jest.spyOn(window.HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
		clearCapabilitiesCache();
	});
	afterEach(() => { delete global.tizen; delete global.webapis; jest.restoreAllMocks(); clearCapabilitiesCache(); });

	test('recognizes the actual Jellyfin 16-bit stereo codec name', async () => {
		expect(getPlayMethod(source('h264', 'mkv', {}, {Codec: 'pcm_s16le'}), await getDeviceCapabilities(), {})).toBe('DirectPlay');
		const profile = await getJellyfinDeviceProfile();
		expect(profile.DirectPlayProfiles.find(p => p.Container.includes('mkv')).AudioCodec.split(',')).toContain('pcm_s16le');
	});
	test.each([{Codec:'pcm_s24le'}, {Codec:'pcm_s16le',Channels:6}, {Codec:'pcm_s16le',SampleRate:192000}])('keeps unverified or unsupported PCM converting: %j', async audio => {
		expect(getPlayMethod(source('h264', 'mkv', {}, audio), await getDeviceCapabilities(), {})).not.toBe('DirectPlay');
	});
	test('profile has matching PCM channel/sample-rate bounds', async () => {
		const profile = await getJellyfinDeviceProfile();
		const rule = profile.CodecProfiles.find(p => p.Codec === 'pcm_s16le');
		expect(rule.Conditions).toEqual(expect.arrayContaining([
			expect.objectContaining({Property:'AudioChannels',Value:'2'}),
			expect.objectContaining({Property:'AudioSampleRate',Value:'48000'})
		]));
	});

	test.each(['GQ65S90C', 'QN65QN900B', 'QN65QN80HAFXZA', 'unknown'])('keeps %s unchanged even with a positive browser probe', async model => {
		global.webapis.productinfo.getRealModel = () => model;
		window.HTMLMediaElement.prototype.canPlayType.mockReturnValue('probably');
		let service;
		jest.isolateModules(() => { service = require('../../../platform-tizen/src/deviceProfile'); });
		const caps = await service.getDeviceCapabilities();
		const profile = await service.getJellyfinDeviceProfile();
		expect(caps.pcm16).toBe(false);
		expect(profile.DirectPlayProfiles.find(p => p.Container.includes('mkv')).AudioCodec.split(',')).not.toContain('pcm_s16le');
	});

	test('keeps PCM16 converting when its media probe is missing or negative',async()=> {
		window.HTMLMediaElement.prototype.canPlayType.mockReturnValue('');
		clearCapabilitiesCache();
		expect((await getDeviceCapabilities()).pcm16).toBe(false);
		expect(getPlayMethod(source('h264','mkv',{}, {Codec:'pcm_s16le'}),await getDeviceCapabilities(),{})).not.toBe('DirectPlay');
	});
});
