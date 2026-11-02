import {clearCapabilitiesCache, getDeviceCapabilities, getJellyfinDeviceProfile} from '../../../platform-tizen/src/deviceProfile';
import {getPlayMethod} from '../../../platform-tizen/src/video';

const source = (codec, container = 'mkv', video = {}, audio = {}) => ({
	Container: container, SupportsDirectPlay: true, SupportsDirectStream: true,
	MediaStreams: [{Type: 'Video', Index: 0, Codec: codec, Width: 1280, Height: 720, VideoRangeType: 'SDR', ...video},
		{Type: 'Audio', Index: 1, Codec: 'aac', Channels: 2, SampleRate: 48000, ...audio}]
});

describe('Tizen VP8 WebM support', () => {
	beforeEach(() => {
		global.tizen = {systeminfo: {getCapability: () => '6.5'}};
		global.webapis = {productinfo: {getRealModel: () => 'QN55S95BAFXZA', isUdPanelSupported: () => true, is8KPanelSupported: () => false}, avinfo: {isHdrTvSupport: () => true}};
		jest.spyOn(window.HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
		clearCapabilitiesCache();
	});
	afterEach(() => { delete global.tizen; delete global.webapis; jest.restoreAllMocks(); clearCapabilitiesCache(); });

	test('local and server profile both allow VP8 in WebM', async () => {
		const caps = await getDeviceCapabilities();
		expect(getPlayMethod(source('vp8', 'webm', {}, {Codec: 'vorbis'}), caps, {})).toBe('DirectPlay');
		const profile = await getJellyfinDeviceProfile();
		expect(profile.DirectPlayProfiles.find(p => p.Container === 'webm').VideoCodec.split(',')).toContain('vp8');
		expect(profile.DirectPlayProfiles.find(p => p.Container.includes('mp4')).VideoCodec.split(',')).not.toContain('vp8');
	});
	test('does not expand VP8 to unverified MP4 or older capabilities', async () => {
		const caps = await getDeviceCapabilities();
		expect(getPlayMethod(source('vp8', 'mp4'), caps, {})).not.toBe('DirectPlay');
		expect(getPlayMethod(source('vp8', 'webm'), {...caps, vp8: false}, {})).not.toBe('DirectPlay');
	});

	test.each(['', 'maybe'])('keeps VP8 disabled on an uncertain media probe: %s', async result => {
		window.HTMLMediaElement.prototype.canPlayType.mockReturnValue(result);
		clearCapabilitiesCache();
		expect((await getDeviceCapabilities()).vp8).toBe(false);
		expect((await getJellyfinDeviceProfile()).DirectPlayProfiles.find(p=>p.Container==='webm').VideoCodec.split(',')).not.toContain('vp8');
	});
	test('does not expand older Tizen models even when the probe is positive',async()=> {
		global.tizen.systeminfo.getCapability = () => '3';
		clearCapabilitiesCache();
		expect((await getDeviceCapabilities()).vp8).toBe(false);
	});
});
