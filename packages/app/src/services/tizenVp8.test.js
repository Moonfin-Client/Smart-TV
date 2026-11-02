import {getPlayMethod} from '../../../platform-tizen/src/video';

const source = (codec, container = 'mkv', video = {}, audio = {}) => ({
	Container: container, SupportsDirectPlay: true, SupportsDirectStream: true,
	MediaStreams: [{Type: 'Video', Index: 0, Codec: codec, Width: 1280, Height: 720, VideoRangeType: 'SDR', ...video},
		{Type: 'Audio', Index: 1, Codec: 'aac', Channels: 2, SampleRate: 48000, ...audio}]
});
const device = (model = 'QN55S95BAFXZA', version = '6.5', uhd = true, uhd8K = false, hdr = true) => {
	global.tizen = {systeminfo: {getCapability: () => version}};
	global.webapis = {productinfo: {getRealModel: () => model, isUdPanelSupported: () => uhd, is8KPanelSupported: () => uhd8K}, avinfo: {isHdrTvSupport: () => hdr}};
	let service;
	jest.isolateModules(() => { service = require('../../../platform-tizen/src/deviceProfile'); });
	return service;
};
afterEach(() => { delete global.tizen; delete global.webapis; jest.restoreAllMocks(); });
const models = [
	['UN55KU6300', '2.4', true],
	['UN40N5200AFXZA', '4', false],
	['UN32T5300', '5.5', false],
	['QN55S95BAFXZA', '6.5', true],
	['GQ65S90C', '7', true],
	['QN65QN900B', '6.5', true],
	['QN65QN80HAFXZA', '10', true],
	['unknown', '6.5', true]
];

describe('Probed VP8 WebM across Tizen versions and models', () => {
	test.each(models)('%s allows probed WebM without a model/year whitelist', async (model, version, uhd) => {
		jest.spyOn(window.HTMLMediaElement.prototype, 'canPlayType').mockImplementation(type => type === 'video/webm; codecs="vp8"' ? 'maybe' : '');
		const service = device(model, version, uhd);
		const caps = await service.getDeviceCapabilities();
		expect(caps.vp8).toBe(true);
		expect(getPlayMethod(source('vp8', 'webm', {}, {Codec: 'vorbis'}), caps, {})).toBe('DirectPlay');
		const profile = await service.getJellyfinDeviceProfile();
		expect(profile.DirectPlayProfiles.find(p => p.Container === 'webm').VideoCodec.split(',')).toContain('vp8');
	});
	test.each(['', 'no', 'maybe', 'probably'])('interprets canPlayType %j consistently with Jellyfin', async response => {
		jest.spyOn(window.HTMLMediaElement.prototype, 'canPlayType').mockReturnValue(response);
		expect((await device().getDeviceCapabilities()).vp8).toBe(['maybe', 'probably'].includes(response));
	});
	test('an unavailable probe retains conversion', async () => {
		jest.spyOn(document, 'createElement').mockReturnValue({});
		expect((await device().getDeviceCapabilities()).vp8).toBe(false);
	});
	test('a throwing probe retains conversion', async () => {
		jest.spyOn(window.HTMLMediaElement.prototype, 'canPlayType').mockImplementation(() => { throw new Error('Unavailable'); });
		expect((await device().getDeviceCapabilities()).vp8).toBe(false);
	});
	test.each(['mp4', 'mkv'])('does not expand VP8 into %s', async container => {
		jest.spyOn(window.HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
		const service = device();
		expect(getPlayMethod(source('vp8', container), await service.getDeviceCapabilities(), {})).not.toBe('DirectPlay');
		expect((await service.getJellyfinDeviceProfile()).DirectPlayProfiles.find(p => p.Container.includes(container)).VideoCodec.split(',')).not.toContain('vp8');
	});
});
