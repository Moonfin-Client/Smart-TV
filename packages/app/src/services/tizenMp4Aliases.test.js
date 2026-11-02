import {clearCapabilitiesCache, getDeviceCapabilities} from '../../../platform-tizen/src/deviceProfile';
import {getPlayMethod} from '../../../platform-tizen/src/video';

describe('Tizen MP4 container names from Jellyfin', () => {
	afterEach(() => {
		delete global.tizen;
		delete global.webapis;
		clearCapabilitiesCache();
	});

	test.each(['hevc', 'av1', 'vp9'])('%s remains direct playable when MP4 is reported as mov', async (codec) => {
		global.tizen = {systeminfo: {getCapability: () => '6.5'}};
		global.webapis = {
			productinfo: {getRealModel: () => 'QN55S95BAFXZA', isUdPanelSupported: () => true, is8KPanelSupported: () => false},
			avinfo: {isHdrTvSupport: () => true}
		};
		const caps = await getDeviceCapabilities();
		const source = {
			Container: 'mov', SupportsDirectPlay: true, SupportsDirectStream: true,
			MediaStreams: [
				{Type: 'Video', Index: 0, Codec: codec, Width: 1920, Height: 1080, BitDepth: 8, VideoRangeType: 'SDR'},
				{Type: 'Audio', Index: 1, Codec: 'aac', Channels: 2}
			]
		};
		expect(getPlayMethod(source, caps, {})).toBe('DirectPlay');
	});
});
