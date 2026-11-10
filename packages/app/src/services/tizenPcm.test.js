import {findCompatibleAudioStreamIndex, getPlayMethod} from '../../../platform-tizen/src/video';
import {plexItemToJellyfin} from './plexMapper';

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
		expect(getPlayMethod(source('h264', 'mkv', {}, {Codec: 'pcm', Profile: 'pcm_s16le', BitDepth: 16}), caps, {})).toBe('DirectPlay');
		expect(profile.DirectPlayProfiles.find(p => p.Container.includes('mkv')).AudioCodec.split(',')).toContain('pcm_s16le');
	});
	test.each([{Codec: 'pcm_s24le'}, {Codec: 'pcm_s16le', Channels: 6}, {Codec: 'pcm_s16le', SampleRate: 192000}])('keeps out-of-scope PCM converting: %j', async audio => {
		expect(getPlayMethod(source('h264', 'mkv', {}, audio), await device().getDeviceCapabilities(), {})).not.toBe('DirectPlay');
	});
	test('local and server channel/sample-rate bounds agree', async () => {
		const profile = await device().getJellyfinDeviceProfile();
		expect(profile.CodecProfiles.find(p => p.Codec?.split(',').includes('pcm_s16le')).Conditions).toEqual(expect.arrayContaining([
			expect.objectContaining({Property: 'AudioChannels', Value: '2'}),
			expect.objectContaining({Property: 'AudioSampleRate', Value: '48000'})
		]));
	});
});

describe('Tizen PCM aliases from Plex', () => {
	test.each([
		[{profile: 'pcm_s16le', bitDepth: 16}, 'DirectPlay'],
		[{profile: 'pcm_s16le'}, 'DirectPlay'],
		[{bitDepth: 16}, 'DirectPlay'],
		[{}, 'DirectPlay'],
		[{profile: 'PCM_S16LE', bitDepth: 16}, 'DirectPlay'],
		[{profile: 'pcm_s24le'}, 'Transcode'],
		[{bitDepth: 24}, 'Transcode'],
		[{profile: 'pcm_s24le', bitDepth: 16}, 'Transcode'],
		[{profile: 'pcm_s16le', bitDepth: 24}, 'Transcode'],
		[{profile: 'pcm_s16be', bitDepth: 16}, 'Transcode'],
		[{profile: 'pcm_s16le', channels: 3}, 'Transcode'],
		[{bitDepth: 16, channels: 6}, 'Transcode'],
		[{profile: 'pcm_s16le', samplingRate: 48001}, 'Transcode'],
		[{bitDepth: 16, samplingRate: 192000}, 'Transcode']
	])('routes mapped PCM metadata %j to %s', async (audio, expected) => {
		const item = plexItemToJellyfin({
			ratingKey: 'pcm-fixture', type: 'movie',
			Media: [{container: 'mkv', Part: [{Stream: [
				{streamType: 1, index: 0, codec: 'h264', width: 1280, height: 720},
				{streamType: 2, index: 1, codec: 'pcm', channels: 2, samplingRate: 48000, ...audio}
			]}]}]
		});
		const mapped = {...item.MediaSources[0], SupportsDirectPlay: true, SupportsDirectStream: true};
		expect(getPlayMethod(mapped, await device().getDeviceCapabilities(), {})).toBe(expected);
	});

	test('skips an unsupported aliased default when finding a compatible audio track', async () => {
		const media = source('h264', 'mkv', {}, {Codec: 'pcm', Profile: 'pcm_s24le'});
		media.MediaStreams.push({Type: 'Audio', Index: 2, Codec: 'aac', Channels: 2});
		const caps = await device().getDeviceCapabilities();
		expect(findCompatibleAudioStreamIndex(media, caps)).toBe(2);
		expect(getPlayMethod(media, caps, {})).toBe('Transcode');
	});
});
