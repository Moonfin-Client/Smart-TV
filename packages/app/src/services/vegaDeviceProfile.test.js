import {clearCapabilitiesCache, getDeviceCapabilities, getJellyfinDeviceProfile} from '../../../platform-vega/src/deviceProfile';
import {getPlayMethod} from '../../../platform-vega/src/video';

const STICK_UA = 'Mozilla/5.0 (Linux; Kepler 2.0; AFTCR001 user/55; wv) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Chrome/144.0.7559.246 Safari/537.36';

// What the Fire TV Stick 4K 3rd Gen answered on a 1080p set
const canPlayType = (type) => {
	if (/hvc1|vp09|avc1|mp4a|flac|opus/.test(type)) return 'probably';
	if (/mpegurl/.test(type)) return 'maybe';
	return '';
};

const source = (over = {}) => ({
	Container: 'mkv',
	SupportsDirectPlay: true,
	SupportsDirectStream: true,
	MediaStreams: [
		{Type: 'Video', Codec: 'hevc', VideoRangeType: 'SDR', BitRate: 12_000_000},
		{Type: 'Audio', Codec: 'aac', Index: 1}
	],
	...over
});

describe('the Vega device profile', () => {
	let capabilities;

	beforeAll(async () => {
		Object.defineProperty(window.navigator, 'userAgent', {value: STICK_UA, configurable: true});
		window.__MOONFIN_VEGA__ = {v: 1, os: {name: 'Kepler/2.0', version: '2.0'}, display: {width: 1920, height: 1080, hdr: []}, ip: '192.168.50.129'};
		jest.spyOn(window.HTMLMediaElement.prototype, 'canPlayType').mockImplementation(canPlayType);
		clearCapabilitiesCache();
		capabilities = await getDeviceCapabilities();
	});

	afterAll(() => {
		delete window.__MOONFIN_VEGA__;
	});

	test('reads the model, the OS and the display from the shell and the probes', () => {
		expect(capabilities.modelName).toBe('AFTCR001');
		expect(capabilities.vegaVersionDisplay).toBe('Vega OS 2.0');
		expect(capabilities.uhd).toBe(false);
		expect(capabilities.hdr10).toBe(false);
		expect(capabilities.hevc).toBe(true);
		expect(capabilities.av1).toBe(false);
		expect(capabilities.ac3).toBe(false);
		expect(capabilities.nativeHls).toBe(true);
	});

	test('offers the server only what the WebView decodes', async () => {
		const profile = await getJellyfinDeviceProfile();
		const mp4 = profile.DirectPlayProfiles.find((entry) => entry.Container === 'mp4,m4v');
		expect(mp4.VideoCodec).toBe('h264,hevc,dvh1');
		expect(mp4.AudioCodec).not.toContain('ac3');
		expect(profile.DirectPlayProfiles.find((entry) => entry.Container === 'mkv').AudioCodec.split(',')).toEqual(expect.arrayContaining(['pcm_s16le', 'pcm_s24le']));
		expect(profile.TranscodingProfiles[0]).toMatchObject({Protocol: 'hls', Container: 'mp4', VideoCodec: 'hevc,h264', AudioCodec: 'aac,mp2', SegmentLength: 2});
		expect(profile.DirectPlayProfiles.some((entry) => entry.Container.split(',').includes('ts'))).toBe(false);
		expect(profile.DirectPlayProfiles.find((entry) => entry.Container === 'hls').VideoCodec).toBe('h264');
		expect(profile.CodecProfiles.find((entry) => entry.Codec === 'hevc').Conditions[1].Value).toBe('SDR|DOVIWithSDR');
		expect(profile.CodecProfiles.some((entry) => entry.Codec === 'av1')).toBe(false);
	});

	test('direct plays what the WebView handles and transcodes the rest', () => {
		expect(getPlayMethod(source(), capabilities)).toBe('DirectPlay');
		expect(getPlayMethod(source({MediaStreams: [{Type: 'Video', Codec: 'hevc'}, {Type: 'Audio', Codec: 'ac3', Index: 1}]}), capabilities)).toBe('Transcode');
		expect(getPlayMethod(source({MediaStreams: [{Type: 'Video', Codec: 'av1'}, {Type: 'Audio', Codec: 'aac', Index: 1}]}), capabilities)).toBe('Transcode');
		expect(getPlayMethod(source({MediaStreams: [{Type: 'Video', Codec: 'hevc', VideoRangeType: 'HDR10'}, {Type: 'Audio', Codec: 'aac', Index: 1}]}), capabilities)).toBe('Transcode');
		expect(getPlayMethod(source({Container: 'avi'}), capabilities)).toBe('Transcode');
		expect(getPlayMethod(source({SupportsDirectPlay: false}), capabilities)).toBe('DirectStream');
	});

	test("an audio track other than the first one has the server remux, since the WebView can't switch tracks", async () => {
		const profile = await getJellyfinDeviceProfile();
		expect(profile.CodecProfiles).toContainEqual({
			Type: 'VideoAudio',
			Conditions: [{Condition: 'Equals', Property: 'IsSecondaryAudio', Value: 'false', IsRequired: false}]
		});
	});

	test('live TV gets an H.264 TS profile after the fMP4 one, since the server only takes TS for a channel', async () => {
		const profile = await getJellyfinDeviceProfile();
		expect(profile.TranscodingProfiles[1]).toMatchObject({Protocol: 'hls', Container: 'ts', VideoCodec: 'h264', AudioCodec: 'aac', Context: 'Streaming'});
	});

	test('an MPEG-TS source is never direct played, whatever the server offers', () => {
		expect(getPlayMethod(source({Container: 'ts', MediaStreams: [{Type: 'Video', Codec: 'h264'}, {Type: 'Audio', Codec: 'aac', Index: 1}]}), capabilities)).toBe('Transcode');
	});

	test('a file the server marks as remux only is direct streamed when every track plays', () => {
		expect(getPlayMethod(source({SupportsDirectPlay: false, Container: 'mp4'}), capabilities)).toBe('DirectStream');
	});
});

describe('the Vega play method bitrate caps', () => {
	const hevc = (bitRate, modelName) => getPlayMethod(
		{Container: 'mkv', SupportsDirectPlay: true, SupportsDirectStream: true, MediaStreams: [{Type: 'Video', Codec: 'hevc', BitRate: bitRate}, {Type: 'Audio', Codec: 'aac', Index: 1}]},
		{modelName, hevc: true, hdr10: false, hlg: false}
	);
	const h264 = (bitRate, modelName) => getPlayMethod(
		{Container: 'mp4', SupportsDirectPlay: true, SupportsDirectStream: true, MediaStreams: [{Type: 'Video', Codec: 'h264', BitRate: bitRate}, {Type: 'Audio', Codec: 'aac', Index: 1}]},
		{modelName}
	);
	const vp9 = (bitRate, modelName) => getPlayMethod(
		{Container: 'webm', SupportsDirectPlay: true, SupportsDirectStream: true, MediaStreams: [{Type: 'Video', Codec: 'vp9', BitRate: bitRate}, {Type: 'Audio', Codec: 'opus', Index: 1}]},
		{modelName, vp9: true}
	);

	test('follows what each stick decodes', () => {
		expect(h264(25_000_000, 'AFTCA002')).toBe('DirectPlay');
		expect(h264(25_000_000, 'AFTCR001')).toBe('Transcode');
		expect(hevc(110_000_000, 'AFTCA002')).toBe('DirectPlay');
		expect(hevc(130_000_000, 'AFTCR001')).toBe('Transcode');
		expect(vp9(25_000_000, 'AFTCR001')).toBe('DirectPlay');
		expect(vp9(25_000_000, 'AFTCL001')).toBe('Transcode');
	});

	test('a bitrate the user chose wins', () => {
		expect(getPlayMethod(
			{Container: 'mp4', SupportsDirectPlay: true, MediaStreams: [{Type: 'Video', Codec: 'h264', BitRate: 25_000_000}]},
			{modelName: 'AFTCR001'},
			{maxBitrate: 30_000_000}
		)).toBe('DirectPlay');
	});
});
