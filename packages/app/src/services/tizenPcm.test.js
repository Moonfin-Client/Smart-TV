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

describe('Tizen PCM16 codec naming across models', () => {
	test.each(models)('%s recognizes PCM16 without a model or browser-probe gate', async (model, version, uhd) => {
		jest.spyOn(window.HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('');
		const service = device(model, version, uhd);
		const caps = await service.getDeviceCapabilities();
		const profile = await service.getJellyfinDeviceProfile();
		expect(getPlayMethod(source('h264', 'mkv', {}, {Codec: 'pcm_s16le'}), caps, {})).toBe('DirectPlay');
		expect(profile.DirectPlayProfiles.find(p => p.Container.includes('mkv')).AudioCodec.split(',')).toContain('pcm_s16le');
	});
	test.each([{Codec: 'pcm_s24le'}, {Codec: 'pcm_s16le', Channels: 6}, {Codec: 'pcm_s16le', SampleRate: 192000}])('keeps out-of-scope PCM converting: %j', async audio => {
		expect(getPlayMethod(source('h264', 'mkv', {}, audio), await device().getDeviceCapabilities(), {})).not.toBe('DirectPlay');
	});
	test('local and server channel/sample-rate bounds agree', async () => {
		const profile = await device().getJellyfinDeviceProfile();
		expect(profile.CodecProfiles.find(p => p.Codec === 'pcm_s16le').Conditions).toEqual(expect.arrayContaining([
			expect.objectContaining({Property: 'AudioChannels', Value: '2'}),
			expect.objectContaining({Property: 'AudioSampleRate', Value: '48000'})
		]));
	});
});
