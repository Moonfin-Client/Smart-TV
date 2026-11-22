import {clearCapabilitiesCache, detectXboxVersion, getDeviceCapabilities, getDeviceName, getH264FallbackProfile, getJellyfinDeviceProfile} from '../../../platform-xbox/src/deviceProfile';
import {getPlayMethod, notePlaybackError, resumesAfterFirstFrame} from '../../../platform-xbox/src/video';

// Chromium with the HEVC decoder present
const canPlayType = (type) => (/hvc1|avc1|mp4a|flac/.test(type) ? 'probably' : '');

const boot = (over = {}) => ({
	v: 1,
	os: {name: 'Windows.Xbox', version: '10.0.26100.5000'},
	device: {form: 'Xbox One S'},
	display: {width: 3840, height: 2160, hdr: ['hdr10'], modes: []},
	protection: {hevc: true, uhd: true, uhdHdr: true, hdcp22: true},
	webview: {version: '140.0.3485.54'},
	ip: '192.168.50.140',
	...over
});

const source = (over = {}) => ({
	Container: 'mkv',
	SupportsDirectPlay: true,
	SupportsDirectStream: true,
	MediaStreams: [
		{Type: 'Video', Codec: 'h264', VideoRangeType: 'SDR', Width: 1920, BitRate: 12_000_000},
		{Type: 'Audio', Codec: 'aac', Index: 1}
	],
	...over
});

const video = (over) => source({MediaStreams: [{Type: 'Video', Codec: 'h264', VideoRangeType: 'SDR', Width: 1920, ...over}, {Type: 'Audio', Codec: 'aac', Index: 1}]});

const capabilitiesFor = async (bootData) => {
	if (bootData) window.__MOONFIN_XBOX__ = bootData;
	else delete window.__MOONFIN_XBOX__;
	clearCapabilitiesCache();
	return getDeviceCapabilities();
};

// The suite resets mocks between tests, so the probes are stood in for each time
beforeEach(() => {
	jest.spyOn(window.HTMLMediaElement.prototype, 'canPlayType').mockImplementation(canPlayType);
	jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
	window.localStorage.removeItem('moonfin:xboxHevcRefusals');
});

afterAll(() => {
	delete window.__MOONFIN_XBOX__;
});

describe('the Xbox device profile', () => {
	test('without the host it stays at 1080p H.264', async () => {
		const capabilities = await capabilitiesFor(null);
		expect(capabilities).toMatchObject({modelName: 'Xbox', xboxVersionDisplay: 'Xbox OS', hevc: false, uhd: false, hdr10: false, ac3: false});
		const profile = await getJellyfinDeviceProfile();
		expect(profile.DirectPlayProfiles.find((entry) => entry.Container === 'mp4,m4v')).toMatchObject({VideoCodec: 'h264', AudioCodec: 'aac,mp3,flac'});
		expect(profile.DirectPlayProfiles.find((entry) => entry.Container === 'mkv').AudioCodec).toBe('aac,mp3,flac,pcm_s16le,pcm_s24le');
		expect(profile.DirectPlayProfiles.some((entry) => entry.Container === 'ogg')).toBe(false);
		expect(profile.CodecProfiles.find((entry) => entry.Codec === 'h264').Conditions[2].Value).toBe('42');
	});

	test('reads the console and its OS from the host', async () => {
		const capabilities = await capabilitiesFor(boot());
		expect(capabilities).toMatchObject({modelName: 'Xbox One S', xboxVersionDisplay: 'Xbox OS 10.0.26100.5000', fitsBitrateToLink: true, watchesDroppedFrames: true});
		expect(detectXboxVersion()).toBe('10.0.26100.5000');
		expect(await getDeviceName()).toBe('Xbox One S');
	});

	test('offers HEVC and 4K only when the WebView and the console both say so', async () => {
		expect(await capabilitiesFor(boot())).toMatchObject({hevc: true, uhd: true});
		expect(await capabilitiesFor(boot({protection: {hevc: true, uhd: false}}))).toMatchObject({hevc: true, uhd: false});
		expect(await capabilitiesFor(boot({protection: {hevc: false, uhd: true}}))).toMatchObject({hevc: false, uhd: false});
		expect(await capabilitiesFor(boot({protection: {hevc: null, uhd: null}}))).toMatchObject({hevc: false, uhd: false});

		window.HTMLMediaElement.prototype.canPlayType.mockImplementation((type) => (/hvc1/.test(type) ? '' : canPlayType(type)));
		expect(await capabilitiesFor(boot())).toMatchObject({hevc: false, uhd: false});
		window.HTMLMediaElement.prototype.canPlayType.mockImplementation(canPlayType);
	});

	test('drops HEVC once the decoder has refused two different files', async () => {
		const refusal = {code: 4, message: 'PipelineStatus::DECODER_ERROR_NOT_SUPPORTED: video decoder initialization failed with DecoderStatus::Codes::kUnsupportedConfig'};
		const hevcFile = (id) => ({Id: id, MediaStreams: [{Type: 'Video', Codec: 'hevc'}]});
		expect(await capabilitiesFor(boot())).toMatchObject({hevc: true});

		notePlaybackError(refusal, hevcFile('a'), 'DirectPlay');
		notePlaybackError(refusal, hevcFile('a'), 'DirectPlay');
		notePlaybackError(refusal, {Id: 'b', MediaStreams: [{Type: 'Video', Codec: 'h264'}]}, 'DirectPlay');
		notePlaybackError(refusal, hevcFile('c'), 'Transcode');
		notePlaybackError({code: 2, message: 'network'}, hevcFile('d'), 'DirectPlay');
		expect(await capabilitiesFor(boot())).toMatchObject({hevc: true, uhd: true});

		notePlaybackError(refusal, hevcFile('e'), 'DirectStream');
		expect(await getDeviceCapabilities()).toMatchObject({hevc: false, uhd: false});
		expect((await getJellyfinDeviceProfile()).DirectPlayProfiles.find((entry) => entry.Container === 'mkv').VideoCodec).toBe('h264');
	});

	test('offers the sound formats the WebView says it plays, and never DTS', async () => {
		window.HTMLMediaElement.prototype.canPlayType.mockImplementation((type) => (/ac-3|ec-3|opus|vorbis|dtsc/.test(type) ? 'probably' : canPlayType(type)));
		const capabilities = await capabilitiesFor(boot());
		expect(capabilities).toMatchObject({ac3: true, eac3: true, opus: true, vorbis: true, dts: false});

		const profile = await getJellyfinDeviceProfile();
		expect(profile.DirectPlayProfiles.find((entry) => entry.Container === 'mp4,m4v').AudioCodec).toBe('aac,mp3,flac,ac3,eac3,opus');
		expect(profile.DirectPlayProfiles.find((entry) => entry.Container === 'mkv').AudioCodec).toBe('aac,mp3,flac,ac3,eac3,opus,vorbis,pcm_s16le,pcm_s24le');
		expect(profile.DirectPlayProfiles.find((entry) => entry.Container === 'mov').AudioCodec).toBe('aac');
		expect(profile.DirectPlayProfiles.some((entry) => entry.Container === 'ogg' && entry.Type === 'Audio')).toBe(true);
		expect(JSON.stringify(profile.DirectPlayProfiles)).not.toMatch(/dts|dca|truehd/);

		const withSound = (codec) => source({MediaStreams: [{Type: 'Video', Codec: 'h264', Width: 1920}, {Type: 'Audio', Codec: codec, Index: 1}]});
		expect(getPlayMethod(withSound('eac3'), capabilities)).toBe('DirectPlay');
		expect(getPlayMethod(withSound('vorbis'), capabilities)).toBe('DirectPlay');
		expect(getPlayMethod(withSound('dts'), capabilities)).toBe('Transcode');
		expect(getPlayMethod(withSound('truehd'), capabilities)).toBe('Transcode');
	});

	test('holds HDR back whatever the display says, and the sound formats the WebView turns down', async () => {
		await capabilitiesFor(boot());
		const profile = await getJellyfinDeviceProfile();
		const mp4 = profile.DirectPlayProfiles.find((entry) => entry.Container === 'mp4,m4v');
		expect(mp4.VideoCodec).toBe('h264,hevc');
		expect(mp4.AudioCodec).toBe('aac,mp3,flac');
		expect(profile.CodecProfiles.find((entry) => entry.Codec === 'hevc').Conditions[1].Value).toBe('SDR');
		expect(profile.DirectPlayProfiles.some((entry) => /(^|,)(ts|webm)(,|$)/.test(entry.Container))).toBe(false);
	});

	test('keeps H.264 at 1080p on any console, and HEVC there too until the console reports 4K', async () => {
		const conditions = (profile, codec) => profile.CodecProfiles.find((entry) => entry.Codec === codec).Conditions;
		const widthLimit = (list) => list.find((condition) => condition.Property === 'Width');
		const level = (list) => list.find((condition) => condition.Property === 'VideoLevel').Value;

		await capabilitiesFor(boot());
		const full = await getJellyfinDeviceProfile();
		expect(level(conditions(full, 'h264'))).toBe('42');
		expect(level(conditions(full, 'hevc'))).toBe('153');
		expect(widthLimit(conditions(full, 'hevc'))).toBeUndefined();

		await capabilitiesFor(boot({protection: {hevc: true, uhd: false}}));
		const hd = await getJellyfinDeviceProfile();
		expect(level(conditions(hd, 'hevc'))).toBe('153');
		expect(widthLimit(conditions(hd, 'hevc'))).toMatchObject({Condition: 'LessThanEqual', Value: '1920'});
	});

	test('every transcode is H.264 and stereo AAC over HLS', async () => {
		await capabilitiesFor(boot());
		const profile = await getJellyfinDeviceProfile();
		expect(profile.TranscodingProfiles[0]).toMatchObject({Protocol: 'hls', Container: 'ts', VideoCodec: 'h264', AudioCodec: 'aac', MaxAudioChannels: '2'});
		expect(profile.TranscodingProfiles.some((entry) => /hevc/.test(entry.VideoCodec || ''))).toBe(false);
	});
});

describe('the Xbox play method', () => {
	let full;
	let bare;

	beforeEach(async () => {
		full = {...await capabilitiesFor(boot())};
		bare = {...await capabilitiesFor(null)};
	});

	test('plays 1080p H.264 with AAC as it is on any console', () => {
		expect(getPlayMethod(source(), bare)).toBe('DirectPlay');
		expect(getPlayMethod(source({Container: 'mp4'}), bare)).toBe('DirectPlay');
	});

	test('transcodes what isnt offered', () => {
		expect(getPlayMethod(video({Codec: 'hevc'}), bare)).toBe('Transcode');
		expect(getPlayMethod(video({Width: 3840}), bare)).toBe('Transcode');
		expect(getPlayMethod(video({Codec: 'vp9'}), full)).toBe('Transcode');
		expect(getPlayMethod(video({Codec: 'hevc', VideoRangeType: 'HDR10'}), full)).toBe('Transcode');
		expect(getPlayMethod(video({Codec: 'hevc', VideoRangeType: 'DOVIWithHDR10'}), full)).toBe('Transcode');
		expect(getPlayMethod(source({Container: 'ts'}), full)).toBe('Transcode');
		expect(getPlayMethod(source({MediaStreams: [{Type: 'Video', Codec: 'h264', Width: 1920}, {Type: 'Audio', Codec: 'eac3', Index: 1}]}), full)).toBe('Transcode');
	});

	test('plays SDR HEVC and 4K where the console reported them, and 4K in no other codec', () => {
		expect(getPlayMethod(video({Codec: 'hevc'}), full)).toBe('DirectPlay');
		expect(getPlayMethod(video({Codec: 'hevc', Width: 3840}), full)).toBe('DirectPlay');
		expect(getPlayMethod(video({Width: 3840}), full)).toBe('Transcode');
		expect(getPlayMethod(video({Codec: 'hevc', Width: 3840}), {...full, uhd: false})).toBe('Transcode');
	});

	test('only an HEVC file has to show its first frame before it is resumed', () => {
		expect(resumesAfterFirstFrame(video({Codec: 'hevc'}))).toBe(true);
		expect(resumesAfterFirstFrame(video({Codec: 'h264'}))).toBe(false);
		expect(resumesAfterFirstFrame(null)).toBe(false);
	});

	test('respects a bitrate limit the user set', () => {
		expect(getPlayMethod(video({BitRate: 30_000_000}), full, {maxBitrate: 20_000_000})).toBe('Transcode');
		expect(getPlayMethod(video({BitRate: 30_000_000}), full)).toBe('DirectPlay');
	});

	test('plays an audio file it has the codec for', () => {
		const song = (codec, container) => ({Container: container, SupportsDirectPlay: true, SupportsDirectStream: true, MediaStreams: [{Type: 'Audio', Codec: codec}]});
		expect(getPlayMethod(song('flac', 'flac'), bare)).toBe('DirectPlay');
		expect(getPlayMethod(song('opus', 'ogg'), bare)).toBe('Transcode');
	});
});

describe('the profile with the console player', () => {
	const nativeBoot = (over = {}) => boot({nativePlayer: {v: 1}, ...over});

	afterEach(() => {
		window.localStorage.removeItem('moonfin_settings');
	});

	test('takes HEVC from the host alone, whatever the WebView said or refused', async () => {
		window.HTMLMediaElement.prototype.canPlayType.mockImplementation((type) => (/hvc1/.test(type) ? '' : canPlayType(type)));
		window.localStorage.setItem('moonfin:xboxHevcRefusals', JSON.stringify(['a', 'b']));
		const capabilities = await capabilitiesFor(nativeBoot());
		expect(capabilities).toMatchObject({nativePlayer: true, hevc: true, uhd: true, hdr10: true, nativeHls: true, watchesDroppedFrames: false, dts: true, webm: true, ts: true});
		expect(await capabilitiesFor(nativeBoot({protection: {hevc: false, uhd: true}}))).toMatchObject({hevc: false, uhd: false});
		expect(await capabilitiesFor(nativeBoot({display: {hdr: []}}))).toMatchObject({hdr10: false});
	});

	test('offers what the player decodes itself and lets HDR10 through', async () => {
		await capabilitiesFor(nativeBoot());
		const profile = await getJellyfinDeviceProfile();
		expect(profile.DirectPlayProfiles.find((entry) => entry.Container === 'mkv').AudioCodec).toContain('dts,truehd');
		expect(profile.DirectPlayProfiles.some((entry) => entry.Container === 'webm')).toBe(true);
		expect(profile.DirectPlayProfiles.some((entry) => entry.Container === 'ts,mpegts')).toBe(true);
		expect(profile.DirectPlayProfiles.some((entry) => entry.Container === 'hls')).toBe(true);
		const range = profile.CodecProfiles.find((entry) => entry.Codec === 'hevc').Conditions.find((condition) => condition.Property === 'VideoRangeType');
		expect(range.Value).toBe('SDR|HDR10|HDR10Plus|DOVIWithHDR10|DOVIWithHDR10Plus|DOVIWithEL|DOVIWithELHDR10Plus|DOVIInvalid');
		expect(profile.SubtitleProfiles.find((entry) => entry.Format === 'dvdsub').Method).toBe('Embed');
		expect(profile.SubtitleProfiles.find((entry) => entry.Format === 'pgssub').Method).toBe('External');

		const capabilities = await getDeviceCapabilities();
		expect(getPlayMethod(video({Codec: 'hevc', VideoRangeType: 'HDR10', Width: 3840}), capabilities)).toBe('DirectPlay');
		expect(getPlayMethod(video({Codec: 'hevc', VideoRangeType: 'HLG'}), capabilities)).toBe('Transcode');
		expect(getPlayMethod(video({Codec: 'hevc', VideoRangeType: 'DOVIWithHDR10', Width: 3840}), capabilities)).toBe('DirectPlay');
		expect(getPlayMethod(video({Codec: 'hevc', VideoRangeType: 'DOVIWithEL', Width: 3840}), capabilities)).toBe('DirectPlay');
		expect(getPlayMethod(video({Codec: 'hevc', VideoRangeType: 'DOVI', Width: 3840}), capabilities)).toBe('Transcode');
		expect(profile.DirectPlayProfiles.find((entry) => entry.Container === 'mkv').VideoCodec).toBe('h264,hevc,mpeg2video,mpeg4,vc1');
		expect(getPlayMethod(video({Codec: 'mpeg2video', Width: 720}), capabilities)).toBe('DirectPlay');
		expect(getPlayMethod(video({Codec: 'vc1', Width: 1920}), capabilities)).toBe('DirectPlay');
		expect(getPlayMethod(video({Codec: 'vc1', Width: 3840}), capabilities)).toBe('Transcode');
		expect(getPlayMethod(video({Codec: 'mpeg2video'}), {...capabilities, nativePlayer: false})).toBe('Transcode');
		expect(getPlayMethod({...video({Codec: 'h264'}), Container: 'ts'}, capabilities)).toBe('DirectPlay');
		expect(getPlayMethod({...video({Codec: 'h264'}), Container: 'webm'}, capabilities)).toBe('DirectPlay');
		expect(getPlayMethod(source({MediaStreams: [{Type: 'Video', Codec: 'h264', VideoRangeType: 'SDR', Width: 1920}, {Type: 'Audio', Codec: 'dts', Index: 1}]}), capabilities)).toBe('DirectPlay');
	});

	test('transcodes to 7.1 AAC in fMP4 for the console player and stereo TS for the WebView', async () => {
		await capabilitiesFor(nativeBoot());
		expect((await getJellyfinDeviceProfile()).TranscodingProfiles[0]).toMatchObject({Protocol: 'hls', Container: 'mp4', AudioCodec: 'aac', VideoCodec: 'h264,hevc', MaxAudioChannels: '8'});
		expect((await getH264FallbackProfile()).TranscodingProfiles[0]).toMatchObject({Container: 'mp4', VideoCodec: 'h264'});
		window.localStorage.setItem('moonfin_settings', JSON.stringify({xboxNativePlayer: false}));
		await capabilitiesFor(nativeBoot());
		expect((await getJellyfinDeviceProfile()).TranscodingProfiles[0]).toMatchObject({Protocol: 'hls', Container: 'ts', VideoCodec: 'h264', MaxAudioChannels: '2'});
	});

	test('plays Dolby Vision profiles 5, 8.2 and 8.4 as they are only with the console processor, a Dolby Vision mode and the setting on', async () => {
		const HDR10_LIST = 'SDR|HDR10|HDR10Plus|DOVIWithHDR10|DOVIWithHDR10Plus|DOVIWithEL|DOVIWithELHDR10Plus|DOVIInvalid';
		const dvBoot = (over = {}) => nativeBoot({display: {hdr: ['hdr10', 'dolbyvision'], modes: []}, dolbyVision: {effect: ['dvhe.05']}, ...over});
		const hevcEntries = (profile) => profile.CodecProfiles.filter((entry) => entry.Codec === 'hevc');
		const rangeOf = (entry) => entry.Conditions.find((condition) => condition.Property === 'VideoRangeType').Value;
		const file = (range, container) => ({...video({Codec: 'hevc', VideoRangeType: range, Width: 3840}), Container: container});

		const on = await capabilitiesFor(dvBoot());
		expect(on).toMatchObject({dolbyVision: true, consoleDolbyVision: true});
		const [hls, general] = hevcEntries(await getJellyfinDeviceProfile());
		expect(hls).toMatchObject({Container: 'hls'});
		expect(rangeOf(hls)).toBe(HDR10_LIST);
		expect(general.Container).toBeUndefined();
		expect(rangeOf(general)).toBe(`${HDR10_LIST}|DOVI|DOVIWithHLG|DOVIWithSDR`);
		for (const container of ['mp4', 'mkv']) {
			for (const range of ['DOVI', 'DOVIWithHDR10', 'DOVIWithEL', 'DOVIWithHLG', 'DOVIWithSDR']) {
				expect(getPlayMethod(file(range, container), on)).toBe('DirectPlay');
			}
		}

		// No processor, an empty effect list, no Dolby Vision mode
		for (const bootData of [dvBoot({dolbyVision: undefined}), dvBoot({dolbyVision: {effect: []}}), dvBoot({display: {hdr: ['hdr10'], modes: []}})]) {
			const off = await capabilitiesFor(bootData);
			expect(off).toMatchObject({dolbyVision: false, consoleDolbyVision: false});
			const entries = hevcEntries(await getJellyfinDeviceProfile());
			expect(entries).toHaveLength(1);
			expect(rangeOf(entries[0])).toBe(HDR10_LIST);
			for (const range of ['DOVI', 'DOVIWithHLG', 'DOVIWithSDR']) expect(getPlayMethod(file(range, 'mp4'), off)).toBe('Transcode');
			expect(getPlayMethod(file('DOVIWithHDR10', 'mp4'), off)).toBe('DirectPlay');
			expect(getPlayMethod(file('DOVIWithEL', 'mkv'), off)).toBe('DirectPlay');
		}

		// The row in Settings still shows, so it can be turned back on
		window.localStorage.setItem('moonfin_settings', JSON.stringify({xboxDolbyVision: false}));
		const turnedOff = await capabilitiesFor(dvBoot());
		expect(turnedOff).toMatchObject({dolbyVision: false, consoleDolbyVision: true, hdr10: true});
		expect(hevcEntries(await getJellyfinDeviceProfile()).map(rangeOf)).toEqual([HDR10_LIST]);
		expect(getPlayMethod(file('DOVI', 'mkv'), turnedOff)).toBe('Transcode');

		window.localStorage.setItem('moonfin_settings', JSON.stringify({xboxNativePlayer: false}));
		expect(await capabilitiesFor(dvBoot())).toMatchObject({dolbyVision: false});
	});

	test('turned off, the WebView answers as before', async () => {
		window.localStorage.setItem('moonfin_settings', JSON.stringify({xboxNativePlayer: false}));
		window.HTMLMediaElement.prototype.canPlayType.mockImplementation((type) => (/hvc1/.test(type) ? '' : canPlayType(type)));
		expect(await capabilitiesFor(nativeBoot())).toMatchObject({nativePlayer: false, hevc: false, hdr10: false, dts: false, webm: false, watchesDroppedFrames: true});
		expect((await getJellyfinDeviceProfile()).SubtitleProfiles.find((entry) => entry.Format === 'dvdsub').Method).toBe('Encode');
	});
});
