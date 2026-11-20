import {buildDeviceProfile, clearCapabilitiesCache, getDeviceCapabilities, getJellyfinDeviceProfile} from '../../../platform-web/src/deviceProfile';
import {browserFromUserAgent} from '../../../platform-web/src/deviceInfo';
import {getPlayMethod} from '../../../platform-web/src/video';

const CHROME_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

// Desktop Chrome on a machine with an HEVC decoder and no Dolby audio
const chrome = (type) => {
	if (/avc1|hvc1|vp09|av01|mp4a|flac|opus/.test(type)) return 'probably';
	return '';
};

const source = (over = {}, streams = null) => ({
	Container: 'mp4',
	SupportsDirectPlay: true,
	SupportsDirectStream: true,
	MediaStreams: streams || [
		{Type: 'Video', Codec: 'h264', VideoRangeType: 'SDR', BitRate: 8_000_000},
		{Type: 'Audio', Codec: 'aac', Index: 1}
	],
	...over
});

const hevc = (rangeType) => [
	{Type: 'Video', Codec: 'hevc', VideoRangeType: rangeType, BitRate: 20_000_000},
	{Type: 'Audio', Codec: 'eac3', Index: 1},
	{Type: 'Audio', Codec: 'aac', Index: 2}
];

const withDisplay = async (hdr) => {
	window.matchMedia = jest.fn(() => ({matches: hdr}));
	clearCapabilitiesCache();
	return getDeviceCapabilities();
};

describe('the web device profile', () => {
	// The app's jest config resets every mock before each test.
	beforeEach(() => {
		Object.defineProperty(window.navigator, 'userAgent', {value: CHROME_UA, configurable: true});
		jest.spyOn(window.HTMLMediaElement.prototype, 'canPlayType').mockImplementation(chrome);
	});

	test('names the browser', () => {
		expect(browserFromUserAgent(CHROME_UA)).toBe('Chrome 141');
		expect(browserFromUserAgent('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15')).toBe('Safari 17');
		expect(browserFromUserAgent('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0')).toBe('Edge 141');
	});

	test("offers what the probes found and nothing it can't be sure of", async () => {
		const caps = await withDisplay(false);
		expect(caps).toMatchObject({hevc: true, av1: true, ac3: false, eac3: false, dts: false, mkv: false, ts: false, hdr10: false, dolbyVision: false});

		const profile = await getJellyfinDeviceProfile();
		const mp4 = profile.DirectPlayProfiles.find((entry) => entry.Container === 'mp4,m4v');
		expect(mp4.VideoCodec).toBe('h264,hevc,av1');
		expect(mp4.AudioCodec).toBe('aac,mp3,flac');
		expect(profile.DirectPlayProfiles.some((entry) => /mkv|ts/.test(entry.Container))).toBe(false);
		// SDR only, so an HDR file is tone mapped by the server
		expect(profile.CodecProfiles.find((entry) => entry.Codec === 'hevc').Conditions[1].Value).toBe('SDR');
	});

	test('puts fMP4 HLS first so an HEVC remux is copied, and keeps TS for live TV', async () => {
		await withDisplay(false);
		const [fmp4, ts] = (await getJellyfinDeviceProfile()).TranscodingProfiles;
		expect(fmp4).toMatchObject({Container: 'mp4', Protocol: 'hls', VideoCodec: 'hevc,h264', AudioCodec: 'aac'});
		expect(ts).toMatchObject({Container: 'ts', Protocol: 'hls', VideoCodec: 'h264', AudioCodec: 'aac'});
	});

	// jsdom has audioTracks, where Chrome and Firefox only have it behind a flag
	test("has the server pick the audio track when the page can't", async () => {
		const caps = await withDisplay(false);
		const withoutTracks = buildDeviceProfile({...caps, audioTracks: false}, 'test');
		expect(withoutTracks.CodecProfiles.find((entry) => entry.Type === 'VideoAudio').Conditions[0]).toMatchObject({Property: 'IsSecondaryAudio', Value: 'false'});
		const withTracks = buildDeviceProfile({...caps, audioTracks: true}, 'test');
		expect(withTracks.CodecProfiles.some((entry) => entry.Type === 'VideoAudio')).toBe(false);
	});

	describe('decides', () => {
		test.each([
			['H.264 and AAC in MP4', source(), false, 'DirectPlay'],
			['H.264 in MKV, which the server remuxes', source({Container: 'mkv'}), false, 'Transcode'],
			['HEVC in MKV, which the server remuxes', source({Container: 'mkv'}, hevc('SDR')), false, 'Transcode'],
			['HDR10 HEVC on an SDR display', source({}, hevc('HDR10')), false, 'Transcode'],
			['HDR10 HEVC on an HDR display', source({}, hevc('HDR10')), true, 'DirectPlay'],
			['Dolby Vision with an HDR10 base layer', source({}, hevc('DOVIWithHDR10')), true, 'Transcode'],
			['only DTS audio', source({}, [{Type: 'Video', Codec: 'h264', VideoRangeType: 'SDR'}, {Type: 'Audio', Codec: 'dts', Index: 1}]), false, 'Transcode'],
			['DTS with an AAC track to switch to', source({}, [{Type: 'Video', Codec: 'h264', VideoRangeType: 'SDR'}, {Type: 'Audio', Codec: 'dts', Index: 1}, {Type: 'Audio', Codec: 'aac', Index: 2}]), false, 'DirectPlay'],
			['a live channel in MPEG-TS', source({Container: 'ts', SupportsDirectPlay: true}), false, 'Transcode'],
			['a source the server refused to direct play', source({SupportsDirectPlay: false, SupportsDirectStream: false}), false, 'Transcode'],
			['FLAC music', source({Container: 'flac'}, [{Type: 'Audio', Codec: 'flac', Index: 0}]), false, 'DirectPlay']
		])('%s', async (name, mediaSource, hdr, method) => {
			const caps = await withDisplay(hdr);
			expect(getPlayMethod(mediaSource, caps)).toBe(method);
		});

		test('a file over the bitrate the user set is transcoded', async () => {
			const caps = await withDisplay(false);
			expect(getPlayMethod(source(), caps, {maxBitrate: 4_000_000})).toBe('Transcode');
		});
	});
});
