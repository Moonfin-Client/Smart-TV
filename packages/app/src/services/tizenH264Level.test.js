const device = (model = 'QN55S95BAFXZA', version = '6.5', uhd = true, uhd8K = false, hdr = true) => {
	global.tizen = {systeminfo: {getCapability: () => version}};
	global.webapis = {productinfo: {getRealModel: () => model, isUdPanelSupported: () => uhd, is8KPanelSupported: () => uhd8K}, avinfo: {isHdrTvSupport: () => hdr}};
	let service;
	jest.isolateModules(() => { service = require('../../../platform-tizen/src/deviceProfile'); });
	return service;
};
afterEach(() => { delete global.tizen; delete global.webapis; jest.restoreAllMocks(); });
const level = async service => (await service.getJellyfinDeviceProfile()).CodecProfiles.find(p => p.Codec === 'h264').Conditions.find(c => c.Property === 'VideoLevel').Value;
describe('Tizen H264 level policy without model whitelists', () => {
	test.each([
		['UE55RU7100', '5'], ['QN55S95BAFXZA', '6.5'], ['GQ65S90C', '7'],
		['QN65QN900B', '6.5'], ['QN65QN80HAFXZA', '10'], ['unknown', '6.5']
	])('%s uses Jellyfin’s Tizen5+ UHD rule even when the probe is empty', async (model, version) => {
		jest.spyOn(window.HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('');
		expect(await level(device(model, version))).toBe('52');
	});
	test.each(['', 'no', 'maybe', 'probably'])('older UHD models use the level5.2 probe: %j', async response => {
		jest.spyOn(window.HTMLMediaElement.prototype, 'canPlayType').mockImplementation(type => type === 'video/mp4; codecs="avc1.640834"' ? response : '');
		expect(await level(device('UN55KU6300', '2.4'))).toBe(['maybe', 'probably'].includes(response) ? '52' : '51');
	});
	test('an unavailable older-model probe keeps level5.1', async () => {
		jest.spyOn(document, 'createElement').mockReturnValue({});
		expect(await level(device('UN55KU6300', '2.4'))).toBe('51');
	});
	test('a throwing older-model probe keeps level5.1', async () => {
		jest.spyOn(window.HTMLMediaElement.prototype, 'canPlayType').mockImplementation(() => { throw new Error('Unavailable'); });
		expect(await level(device('UN55KU6300', '2.4'))).toBe('51');
	});
	test.each([['UN40N5200AFXZA', '4', '41'], ['UN32T5300', '5.5', '42']])('%s retains its FHD limit', async (model, version, expected) => {
		jest.spyOn(window.HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
		expect(await level(device(model, version, false))).toBe(expected);
	});
});
