import {clearCapabilitiesCache, getJellyfinDeviceProfile} from '../../../platform-tizen/src/deviceProfile';
const level = async () => (await getJellyfinDeviceProfile()).CodecProfiles.find(p => p.Codec === 'h264').Conditions.find(c=>c.Property==='VideoLevel').Value;
describe('Bounded h264 level 5.2 probe on Tizen',()=> {
	beforeEach(()=> {
		global.tizen={systeminfo:{getCapability:()=> '6.5'}};
		global.webapis={productinfo:{getRealModel:()=> 'QN55S95BAFXZA',isUdPanelSupported:()=>true,is8KPanelSupported:()=>false},avinfo:{isHdrTvSupport:()=>true}};
		clearCapabilitiesCache();
	});
	afterEach(()=> {delete global.tizen;delete global.webapis;jest.restoreAllMocks();clearCapabilitiesCache();});
	test('offers level 5.2 only with a positive native video probe',async()=> {
		jest.spyOn(window.HTMLMediaElement.prototype,'canPlayType').mockImplementation(type=>type==='video/mp4; codecs="avc1.640834"'?'probably':'');
		expect(await level()).toBe('52');
	});
	test('keeps level 5.1 when the probe is negative, uncertain or throws',async()=> {
		const probe=jest.spyOn(window.HTMLMediaElement.prototype,'canPlayType');
		for(const response of ['', 'maybe']) {probe.mockReturnValue(response);expect(await level()).toBe('51');}
		probe.mockImplementation(()=> {throw new Error('Unavailable');});
		expect(await level()).toBe('51');
	});
	test('does not raise the 42 limit',async()=> {
		global.webapis.productinfo.isUdPanelSupported=()=>false;
		jest.spyOn(window.HTMLMediaElement.prototype,'canPlayType').mockReturnValue('probably');
		expect(await level()).toBe('42');
	});

	test.each(['GQ65S90C', 'QN65QN900B', 'QN65QN80HAFXZA', 'unknown'])('keeps %s unchanged even with a positive browser probe', async model => {
		global.webapis.productinfo.getRealModel = () => model;
		jest.spyOn(window.HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
		let service;
		jest.isolateModules(() => { service = require('../../../platform-tizen/src/deviceProfile'); });
		const profile = await service.getJellyfinDeviceProfile();
		expect(profile.CodecProfiles.find(p => p.Codec === 'h264').Conditions.find(c => c.Property === 'VideoLevel').Value).toBe('51');
	});
});
