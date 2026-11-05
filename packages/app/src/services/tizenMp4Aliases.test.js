import {getPlayMethod} from '../../../platform-tizen/src/video';
const device = (model = 'QN55S95BAFXZA', version = '6.5', uhd = true, uhd8K = false, hdr = true) => {
	global.tizen = {systeminfo: {getCapability: () => version}};
	global.webapis = {productinfo: {getRealModel: () => model, isUdPanelSupported: () => uhd, is8KPanelSupported: () => uhd8K}, avinfo: {isHdrTvSupport: () => hdr}};
	let service;
	jest.isolateModules(() => { service = require('../../../platform-tizen/src/deviceProfile'); });
	return service;
};
afterEach(() => { delete global.tizen; delete global.webapis; jest.restoreAllMocks(); });

describe('Tizen MP4 aliases across model families', () => {
	test.each([
		['UN32Q50AAFXZA', '6', false], ['QN55S95BAFXZA', '6.5', true],
		['GQ65S90C', '7', true], ['QN65QN80HAFXZA', '10', true], ['unknown', '6.5', true]
	])('%s retains each existing codec capability for mov', async (model, version, uhd) => {
		const caps = await device(model, version, uhd).getDeviceCapabilities();
		for (const codec of ['hevc', 'av1', 'vp9']) {
			const source = {Container: 'mov', SupportsDirectPlay: true, SupportsDirectStream: true,
				MediaStreams: [{Type: 'Video', Codec: codec, VideoRangeType: 'SDR'}, {Type: 'Audio', Codec: 'aac', Channels: 2}]};
			expect(getPlayMethod(source, caps, {})).toBe('DirectPlay');
			expect(getPlayMethod({...source, SupportsDirectPlay: false}, caps, {})).not.toBe('DirectPlay');
			expect(getPlayMethod(source, {...caps, [codec]: false}, {})).not.toBe('DirectPlay');
		}
	});
});
