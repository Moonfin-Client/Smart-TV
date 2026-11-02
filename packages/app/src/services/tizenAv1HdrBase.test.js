import {clearCapabilitiesCache, getDeviceCapabilities} from '../../../platform-tizen/src/deviceProfile';
import {getPlayMethod} from '../../../platform-tizen/src/video';
const source = (video = {}) => ({Container: 'mkv', SupportsDirectPlay: true, SupportsDirectStream: true,
	MediaStreams: [{Type:'Video',Codec:'av1',Width:1920,Height:804,VideoRangeType:'DOVIInvalid',DvProfile:10,DvBlSignalCompatibilityId:6,BlPresentFlag:1,ElPresentFlag:0,ColorTransfer:'smpte2084',ColorPrimaries:'bt2020',...video},
	{Type:'Audio',Codec:'eac3',Channels:6}]});
describe('Known AV1 Dolby Vision HDR10 base on Tizen', () => {
	beforeEach(() => {
		global.tizen = {systeminfo:{getCapability:()=> '6.5'}};
		global.webapis = {productinfo:{getRealModel:()=> 'QN55S95BAFXZA',isUdPanelSupported:()=>true,is8KPanelSupported:()=>false},avinfo:{isHdrTvSupport:()=>true}};
		clearCapabilitiesCache();
	});
	afterEach(() => { delete global.tizen; delete global.webapis; clearCapabilitiesCache(); });
	test('accepts the verified P10.6 PQ/BT2020 base when the server approves it', async () => {
		expect(getPlayMethod(source(),await getDeviceCapabilities(),{})).toBe('DirectPlay');
	});
	test.each([{DvProfile:5},{DvBlSignalCompatibilityId:0},{BlPresentFlag:0},{ElPresentFlag:1},{ColorTransfer:'arib-std-b67'},{ColorPrimaries:'bt709'},{VideoRangeType:'DOVI'},{VideoRangeType:'DOVIWithEL'}])('retains rejection without the known HDR10 base: %j', async changes => {
		expect(getPlayMethod(source(changes),await getDeviceCapabilities(),{})).not.toBe('DirectPlay');
	});
	test('does not override panel support or the server',async()=> {
		const caps=await getDeviceCapabilities();
		expect(getPlayMethod(source(),{...caps,hdr10:false,dolbyVision:false},{})).not.toBe('DirectPlay');
		expect(getPlayMethod({...source(),SupportsDirectPlay:false},caps,{})).not.toBe('DirectPlay');
	});
});

const device = (model = 'QN55S95BAFXZA', version = '6.5', uhd = true, uhd8K = false, hdr = true) => {
	global.tizen = {systeminfo: {getCapability: () => version}};
	global.webapis = {productinfo: {getRealModel: () => model, isUdPanelSupported: () => uhd, is8KPanelSupported: () => uhd8K}, avinfo: {isHdrTvSupport: () => hdr}};
	let service;
	jest.isolateModules(() => { service = require('../../../platform-tizen/src/deviceProfile'); });
	return service;
};
afterEach(() => { delete global.tizen; delete global.webapis; jest.restoreAllMocks(); });

describe('AV1 HDR10-base model-independent scope', () => {
	test.each([
		['UN55KU6300', '2.4', true, false], ['UN32T5300', '5.5', false, false],
		['QN55Q80TAFXZA', '5.5', true, true], ['UN32Q50AAFXZA', '6', false, true],
		['GQ65S90C', '7', true, true], ['QN65QN80HAFXZA', '10', true, true], ['unknown', '6.5', true, true]
	])('%s follows AV1 capability rather than a model name', async (model, version, uhd, supported) => {
		const caps = await device(model, version, uhd).getDeviceCapabilities();
		expect(getPlayMethod(source(), caps, {}) === 'DirectPlay').toBe(supported);
	});
});
