const device = (model = 'QN55S95BAFXZA', version = '6.5', uhd = true, uhd8K = false, hdr = true) => {
	global.tizen = {systeminfo: {getCapability: () => version}};
	global.webapis = {productinfo: {getRealModel: () => model, isUdPanelSupported: () => uhd, is8KPanelSupported: () => uhd8K}, avinfo: {isHdrTvSupport: () => hdr}};
	let service;
	jest.isolateModules(() => { service = require('../../../platform-tizen/src/deviceProfile'); });
	return service;
};
afterEach(() => { delete global.tizen; delete global.webapis; jest.restoreAllMocks(); });
const level = async service => (await service.getJellyfinDeviceProfile()).CodecProfiles.find(p => p.Codec === 'hevc').Conditions.find(c => c.Property === 'VideoLevel').Value;
describe('Tizen HEVC level policy without model whitelists', () => {
	test.each(['UN55KU6300', 'QN55S95BAFXZA', 'GQ65S90C', 'QN65QN80HAFXZA', 'unknown'])('%s uses a successful level5.2 probe', async model => {
		jest.spyOn(window.HTMLMediaElement.prototype, 'canPlayType').mockImplementation(type => type === 'video/mp4; codecs="hvc1.2.4.L156"' ? 'probably' : '');
		expect(await level(device(model))).toBe('156');
	});
	test.each(['hvc1', 'hev1'])('accepts Main10 %s probes at level5.2 or higher', async codec => {
		const probe = jest.spyOn(window.HTMLMediaElement.prototype, 'canPlayType');
		for (const value of ['156', '183', '186']) {
			probe.mockImplementation(type => type === `video/mp4; codecs="${codec}.2.4.L${value}"` ? 'maybe' : '');
			expect(await level(device('unknown'))).toBe('156');
		}
	});
	test.each(['', 'no'])('a negative probe %j keeps UHD level5.1', async response => {
		jest.spyOn(window.HTMLMediaElement.prototype, 'canPlayType').mockReturnValue(response);
		expect(await level(device())).toBe('153');
	});
	test('a level5.1-only probe does not raise the cap', async () => {
		jest.spyOn(window.HTMLMediaElement.prototype, 'canPlayType').mockImplementation(type => type === 'video/mp4; codecs="hvc1.2.4.L153"' ? 'probably' : '');
		expect(await level(device())).toBe('153');
	});
	test('an unavailable probe keeps level5.1', async () => {
		jest.spyOn(document, 'createElement').mockReturnValue({});
		expect(await level(device())).toBe('153');
	});
	test('a throwing probe keeps level5.1', async () => {
		jest.spyOn(window.HTMLMediaElement.prototype, 'canPlayType').mockImplementation(() => { throw new Error('Unavailable'); });
		expect(await level(device())).toBe('153');
	});
	test('FHD and the existing 8K cap remain unchanged', async () => {
		const probe = jest.spyOn(window.HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
		expect(await level(device('UN32T5300', '5.5', false))).toBe('123');
		probe.mockReturnValue('');
		expect(await level(device('QN65QN900B', '6.5', true, true))).toBe('183');
	});
});
