const device = (model = 'QN55S95BAFXZA', version = '6.5', uhd = true, uhd8K = false, hdr = true, productinfo = {}) => {
	global.tizen = {systeminfo: {getCapability: () => version}};
	global.webapis = {productinfo: {getRealModel: () => model, isUdPanelSupported: () => uhd, is8KPanelSupported: () => uhd8K, ...productinfo}, avinfo: {isHdrTvSupport: () => hdr}};
	let service;
	jest.isolateModules(() => { service = require('../../../platform-tizen/src/deviceProfile'); });
	return service;
};
afterEach(() => { delete global.tizen; delete global.webapis; jest.restoreAllMocks(); });
const level = async service => (await service.getJellyfinDeviceProfile()).CodecProfiles.find(p => p.Codec === 'h264').Conditions.find(c => c.Property === 'VideoLevel').Value;
describe('Tizen H264 level policy', () => {
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

describe('Samsung 2019 BASIC1 H264 hardware limit', () => {
	test.each(['URU7000', 'URU6900', 'URUF58T', 'RUF58T'])('%s uses the documented lineup API even with an unknown retail name', async lineup => {
		expect(await level(device('unknown', '5', true, false, true, {getModel: () => lineup}))).toBe('51');
	});
	test.each([
		['4', ''], ['4', 'maybe'], ['4', 'probably'],
		['5', ''], ['5', 'probably'], ['5.5', 'maybe'], ['7', 'probably']
	])('Tizen %s and probe %j cannot override known BASIC1 hardware', async (version, response) => {
		jest.spyOn(window.HTMLMediaElement.prototype, 'canPlayType').mockReturnValue(response);
		expect(await level(device('unknown', version, true, false, true, {getModel: () => 'URU6900'}))).toBe('51');
	});
	test.each([
		'UN55RU7000', 'UA55RU7000KXXT', 'UE55RU7000KXXU',
		'UN55RU6900FXZA', 'GU55RU6900', 'KU55RU6900',
		'UA58RUF58T', 'ua55ru7000kxxt'
	])('%s retains the limit when only the full retail model is available', async model => {
		jest.spyOn(window.HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
		expect(await level(device(model, '5.5'))).toBe('51');
	});
	test('a throwing full-model API still uses the documented lineup', async () => {
		expect(await level(device('', '5.5', true, false, true, {
			getRealModel: () => { throw new Error('Unavailable'); },
			getModel: () => 'URUF58T'
		}))).toBe('51');
	});
	test('a throwing lineup API falls back to the exact retail series', async () => {
		expect(await level(device('UA55RU7000KXXT', '5', true, false, true, {
			getModel: () => { throw new Error('Unavailable'); }
		}))).toBe('51');
	});
	test.each([
		['UE55RU7100KXXU', 'URU7100'], ['UN55RU7300FXZA', 'URU7300'],
		['UE55RU7020KXXU', 'URU7100'], ['unknown', 'URU710D'],
		['unknown', 'URU730D'], ['unknown', 'unknown'],
		['UN55NU7000', 'UNU7000'], ['UN55TU7000', 'UTU7000'],
		['UN55NU7000', 'URU7000'], ['UN55TU7000', 'URU7000']
	])('%s / %s keeps the general Tizen5+ policy', async (model, lineup) => {
		jest.spyOn(window.HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('');
		expect(await level(device(model, '5.5', true, false, true, {getModel: () => lineup}))).toBe('52');
	});
	test.each([
		'UE55RU7100KXXU', 'UN55RU7300FXZA', 'UE55RU7020KXXU', 'UE55RU7099UXZG',
		'UN55NU7000', 'UN55TU7000', 'unknown', '',
		'UN55RU70000', 'prefixUN55RU7000', 'URU70000', 'URU69000', 'RUF58T2'
	])('%j is not inferred to be BASIC1 without a documented lineup', async model => {
		expect(await level(device(model, '5.5'))).toBe('52');
	});
	test('the UHD level fallback still permits FHD60 level 4.2 without a frame-rate cap', async () => {
		const profile = await device('UA55RU7000KXXT', '5').getJellyfinDeviceProfile();
		const conditions = profile.CodecProfiles.find(p => p.Codec === 'h264').Conditions;
		expect(conditions.find(c => c.Property === 'VideoLevel')).toMatchObject({Condition: 'LessThanEqual', Value: '51'});
		expect(conditions.some(c => /framerate/i.test(c.Property))).toBe(false);
		expect(profile.DirectPlayProfiles.some(p => (p.VideoCodec || '').split(',').includes('h264'))).toBe(true);
	});
});
