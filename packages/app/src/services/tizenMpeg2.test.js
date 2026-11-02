import {clearCapabilitiesCache, getDeviceCapabilities, getJellyfinDeviceProfile} from '../../../platform-tizen/src/deviceProfile';
import {getPlayMethod} from '../../../platform-tizen/src/video';

const source = (codec, container = 'mkv', video = {}, audio = {}) => ({
	Container: container, SupportsDirectPlay: true, SupportsDirectStream: true,
	MediaStreams: [{Type: 'Video', Index: 0, Codec: codec, Width: 1280, Height: 720, VideoRangeType: 'SDR', ...video},
		{Type: 'Audio', Index: 1, Codec: 'aac', Channels: 2, SampleRate: 48000, ...audio}]
});

describe('Tizen MPEG2 direct play agrees with the server profile', () => {
	beforeEach(() => {
		global.tizen = {systeminfo: {getCapability: () => '6.5'}};
		global.webapis = {productinfo: {getRealModel: () => 'QN55S95BAFXZA', isUdPanelSupported: () => true, is8KPanelSupported: () => false}, avinfo: {isHdrTvSupport: () => true}};
		clearCapabilitiesCache();
	});
	afterEach(() => { delete global.tizen; delete global.webapis; clearCapabilitiesCache(); });

	test('a server-approved MPEG2 MKV stays direct playable', async () => {
		const profile = await getJellyfinDeviceProfile();
		expect(profile.DirectPlayProfiles.some(p => p.Type === 'Video' && p.VideoCodec?.split(',').includes('mpeg2video'))).toBe(true);
		expect(getPlayMethod(source('mpeg2video'), await getDeviceCapabilities(), {})).toBe('DirectPlay');
	});
	test('server denial and unsupported default audio remain enforced', async () => {
		const caps = await getDeviceCapabilities();
		expect(getPlayMethod({...source('mpeg2video'), SupportsDirectPlay: false}, caps, {})).not.toBe('DirectPlay');
		expect(getPlayMethod(source('mpeg2video', 'mkv', {}, {Codec: 'dts'}), caps, {})).toBe('Transcode');
	});
});
