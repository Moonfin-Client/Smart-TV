import {buildPlaybackInfo, whyLines} from './playbackInfo';

const hevcHdr10 = {
	Type: 'Video', Index: 0, Codec: 'hevc', Profile: 'Main 10', Width: 3840, Height: 2160,
	RealFrameRate: 23.976025, VideoRangeType: 'HDR10', BitRate: 64000000
};
const trueHdAtmos = {
	Type: 'Audio', Index: 1, Codec: 'truehd', Profile: 'Dolby TrueHD + Dolby Atmos', Language: 'eng',
	Channels: 8, IsDefault: true, BitRate: 4400000
};
const commentary = {Type: 'Audio', Index: 2, Codec: 'ac3', Language: 'eng', Title: 'Commentary', Channels: 2};
const pgs = {Type: 'Subtitle', Index: 3, Codec: 'PGSSUB', Language: 'eng', IsForced: true};

const movieSource = (extra = {}) => ({
	Path: '/media/Movies/Dune (2021)/Dune (2021) - 2160p.mkv',
	Container: 'mkv',
	Size: 62491774976,
	Bitrate: 68400000,
	MediaStreams: [hevcHdr10, trueHdAtmos, commentary, pgs],
	...extra
});

const session = (mediaSource, capabilities = {}) => ({
	mediaSource,
	capabilities: {modelName: 'OLED65C3PUA', webosVersionDisplay: 'webOS 23', dolbyVision: true, ...capabilities}
});

// Rows as label: value lines, with a note shown as its text alone, so a whole dialog reads as one list.
const flatten = (sections) => sections.map((section) => [
	section.title,
	...section.rows.map((row) => (row.note ? `  (${row.note})` : `  ${row.label}: ${row.value}${row.bold ? ' [bold]' : ''}`))
]).reduce((all, lines) => all.concat(lines), []);

const JELLYFIN_TRANSCODE = '/videos/2b22d064-8c75-fb2e-4de3-9bfec52551cb/master.m3u8?DeviceId=abc' +
	'&MediaSourceId=2b22d0648c75fb2e4de39bfec52551cb&VideoCodec=hevc,h264&AudioCodec=aac,ac3,eac3&AudioStreamIndex=1' +
	'&VideoBitrate=19680000&AudioBitrate=320000&MaxFramerate=23.976025&SegmentContainer=ts&PlaySessionId=f772' +
	'&TranscodingMaxAudioChannels=6&RequireAvc=false&hevc-level=150&hevc-profile=main10' +
	'&TranscodeReasons=ContainerBitrateExceedsLimit,AudioCodecNotSupported&ApiKey=secret';

// Emby writes the path in lower case and puts the same parameters in its own order.
const EMBY_TRANSCODE = '/videos/15/master.m3u8?DeviceId=abc&MediaSourceId=mediasource_15&PlaySessionId=1071' +
	'&api_key=secret&VideoCodec=h264,hevc&AudioCodec=aac,ac3,eac3&VideoBitrate=119360000&AudioBitrate=640000' +
	'&AudioStreamIndex=1&TranscodingMaxAudioChannels=6&SegmentContainer=ts&TranscodeReasons=ContainerNotSupported';

describe('reading the transcoding url', () => {
	const reasonsRow = (TranscodingUrl, transcodingInfo) => flatten(buildPlaybackInfo({
		session: session(movieSource({TranscodingUrl})), playMethod: 'Transcode', selectedAudioIndex: 1, transcodingInfo
	})).find((row) => row.indexOf('  Transcode Reasons: ') === 0);

	it('matches the name in any case, decodes it and keeps each reason once', () => {
		const url = '/videos/1/master.m3u8?transcodereasons=VideoCodecNotSupported%2CAudioCodecNotSupported%2Cvideocodecnotsupported';
		expect(reasonsRow(url)).toBe('  Transcode Reasons: VideoCodecNotSupported, AudioCodecNotSupported');
	});

	it('gives nothing back for a url without reasons', () => {
		expect(reasonsRow('/videos/1/stream.mkv?Static=true')).toBeUndefined();
		expect(reasonsRow(undefined)).toBeUndefined();
	});

	it('falls back to the session reasons, as an array or a comma string, only when the url has none', () => {
		const url = '/videos/1/master.m3u8?VideoCodec=h264';
		expect(reasonsRow(url, {TranscodeReasons: ['AudioCodecNotSupported', 'DirectPlayError', 'audiocodecnotsupported']}))
			.toBe('  Transcode Reasons: AudioCodecNotSupported, DirectPlayError');
		expect(reasonsRow(url, {TranscodeReasons: 'VideoCodecNotSupported, AudioCodecNotSupported'}))
			.toBe('  Transcode Reasons: VideoCodecNotSupported, AudioCodecNotSupported');
		expect(reasonsRow(JELLYFIN_TRANSCODE, {TranscodeReasons: ['DirectPlayError']}))
			.toBe('  Transcode Reasons: ContainerBitrateExceedsLimit, AudioCodecNotSupported');
	});
});

describe('why lines', () => {
	// A 4K HEVC Main 10 Dolby Vision Profile 7 file with Dolby TrueHD with Atmos 7.1 and PGS subtitles.
	const facts = {
		video: {
			Codec: 'hevc', Profile: 'Main 10', Level: 153, BitDepth: 10, Width: 3840, Height: 2160, RealFrameRate: 59.94,
			VideoRangeType: 'DOVIWithHDR10', DvProfile: 7
		},
		audio: {Codec: 'truehd', Profile: 'Dolby TrueHD + Dolby Atmos', Channels: 8, SampleRate: 96000, BitDepth: 24},
		subtitle: {Codec: 'PGSSUB'},
		container: 'MKV',
		bitrate: 68400000,
		limit: 20000000
	};

	it.each([
		['ContainerBitrateExceedsLimit', '68.4 Mbps is above the 20 Mbps streaming limit'],
		['VideoBitrateNotSupported', '68.4 Mbps is above the 20 Mbps streaming limit'],
		['AudioBitrateNotSupported', '68.4 Mbps is above the 20 Mbps streaming limit'],
		['VideoBitrateExceedsLimit', '68.4 Mbps is above the 20 Mbps streaming limit'],
		['BitrateLimitExceeded', '68.4 Mbps is above the 20 Mbps streaming limit'],
		['ContainerBitrateNotSupported', '68.4 Mbps is above the 20 Mbps streaming limit'],
		['ContainerNotSupported', "This device can't open MKV files"],
		['VideoCodecNotSupported', "This device can't play HEVC video"],
		['VideoCodecTagNotSupported', "This device can't play HEVC video"],
		['VideoProfileNotSupported', "This device can't play HEVC Main 10 video"],
		['VideoLevelNotSupported', "This device can't play HEVC level 5.1 video"],
		['VideoBitDepthNotSupported', "This device can't play 10-bit video"],
		['VideoResolutionNotSupported', "This device can't play 4K video"],
		['VideoFramerateNotSupported', "This device can't play 59.94 fps video"],
		['InterlacedVideoNotSupported', "This device can't play interlaced video"],
		['AnamorphicVideoNotSupported', "This device can't play anamorphic video"],
		['RefFramesNotSupported', "This device can't play this video format"],
		['UnknownVideoStreamInfo', "This device can't play this video format"],
		['VideoRangeTypeNotSupported', "This device can't display Dolby Vision Profile 7"],
		['VideoRangeNotSupported', "This device can't display Dolby Vision Profile 7"],
		['AudioCodecNotSupported', "This device can't play Dolby TrueHD audio"],
		['AudioProfileNotSupported', "This device can't play Dolby TrueHD with Atmos"],
		['AudioChannelsNotSupported', "This device can't play 7.1 audio"],
		['AudioSampleRateNotSupported', "This device can't play 96 kHz audio"],
		['AudioBitDepthNotSupported', "This device can't play 24-bit audio"],
		['AudioIsExternal', 'The audio track is in a separate file'],
		['SecondaryAudioNotSupported', 'This device can only play the first audio track'],
		['UnknownAudioStreamInfo', "This device can't play this audio format"],
		['SubtitleCodecNotSupported', 'PGS subtitles are being burned into the video'],
		['DirectPlayError', "The file couldn't be played directly"],
		['StreamCountExceedsLimit', "The file couldn't be played directly"],
		['SomethingNew', "The file couldn't be played directly"]
	])('names what %s blocked', (reason, line) => {
		expect(whyLines([reason], facts)).toEqual([line]);
		expect(whyLines([reason.toLowerCase()], facts)).toEqual([line]);
	});

	it('only adds the forced line for the setting, and nothing for no reasons', () => {
		expect(whyLines([], {forced: true})).toEqual(['Transcoding is forced in settings']);
		expect(whyLines([], facts)).toEqual([]);
	});

	it('gives the example from the spec in its fixed order', () => {
		const reasons = ['ContainerBitrateExceedsLimit', 'VideoRangeTypeNotSupported', 'AudioCodecNotSupported', 'SubtitleCodecNotSupported'];
		expect(whyLines(reasons, facts)).toEqual([
			'68.4 Mbps is above the 20 Mbps streaming limit',
			"This device can't display Dolby Vision Profile 7",
			"This device can't play Dolby TrueHD audio",
			'PGS subtitles are being burned into the video'
		]);
	});

	it('sorts several reasons into the table order whatever order the server sent them in', () => {
		const reasons = ['DirectPlayError', 'SubtitleCodecNotSupported', 'AudioChannelsNotSupported', 'VideoResolutionNotSupported',
			'AudioCodecNotSupported', 'VideoLevelNotSupported', 'ContainerNotSupported', 'VideoBitrateNotSupported', 'AudioIsExternal',
			'InterlacedVideoNotSupported', 'VideoCodecNotSupported'];
		expect(whyLines(reasons, {...facts, forced: true})).toEqual([
			'Transcoding is forced in settings',
			'68.4 Mbps is above the 20 Mbps streaming limit',
			"This device can't open MKV files",
			"This device can't play HEVC video",
			"This device can't play HEVC level 5.1 video",
			"This device can't play 4K video",
			"This device can't play interlaced video",
			"This device can't play Dolby TrueHD audio",
			"This device can't play 7.1 audio",
			'The audio track is in a separate file',
			'PGS subtitles are being burned into the video',
			"The file couldn't be played directly"
		]);
	});

	it('shows identical lines once, where the first of them sits', () => {
		expect(whyLines(['UnknownVideoStreamInfo', 'RefFramesNotSupported'], facts)).toEqual(["This device can't play this video format"]);
		expect(whyLines(['RefFramesNotSupported', 'VideoBitDepthNotSupported', 'InterlacedVideoNotSupported'], {video: {Codec: 'hevc'}})).toEqual([
			"This device can't play this video format",
			"This device can't play interlaced video"
		]);
		expect(whyLines(['VideoCodecNotSupported', 'VideoProfileNotSupported', 'VideoLevelNotSupported'], {video: {Codec: 'h264'}}))
			.toEqual(["This device can't play H.264 video"]);
		expect(whyLines(['ContainerBitrateExceedsLimit', 'VideoBitrateNotSupported'], facts)).toEqual(['68.4 Mbps is above the 20 Mbps streaming limit']);
	});

	it('works the level out for H.264, HEVC and the other codecs', () => {
		const level = (Codec, Level) => whyLines(['VideoLevelNotSupported'], {video: {Codec, Level}})[0];
		expect(level('h264', 51)).toBe("This device can't play H.264 level 5.1 video");
		expect(level('avc', 40)).toBe("This device can't play H.264 level 4 video");
		expect(level('hevc', 153)).toBe("This device can't play HEVC level 5.1 video");
		expect(level('hevc', 120)).toBe("This device can't play HEVC level 4 video");
		expect(level('h265', 93)).toBe("This device can't play HEVC level 3.1 video");
		expect(level('av1', 8)).toBe("This device can't play AV1 level 8 video");
		expect(level('vc1', 3)).toBe("This device can't play VC-1 level 3 video");
	});

	it('floors the limit and uses the fallback when either number is missing or the file is under it', () => {
		const bitrate = (values) => whyLines(['ContainerBitrateExceedsLimit'], values)[0];
		expect(bitrate({bitrate: 68400000, limit: 20480000})).toBe('68.4 Mbps is above the 20 Mbps streaming limit');
		expect(bitrate({bitrate: 3229681, limit: 2999999})).toBe('3.2 Mbps is above the 2 Mbps streaming limit');
		expect(bitrate({bitrate: 3229681, limit: 999999})).toBe('The bitrate is above the streaming limit');
		expect(bitrate({bitrate: 10000000, limit: 20000000})).toBe('The bitrate is above the streaming limit');
		expect(bitrate({bitrate: 68400000})).toBe('The bitrate is above the streaming limit');
		expect(bitrate({limit: 20000000})).toBe('The bitrate is above the streaming limit');
	});

	it('falls back for every line whose value is missing', () => {
		const one = (reason, values) => whyLines([reason], values)[0];
		expect(one('ContainerNotSupported', {})).toBe("This device can't play this file type");
		expect(one('VideoCodecNotSupported', {video: {}})).toBe("This device can't play this video format");
		expect(one('VideoProfileNotSupported', {video: {Codec: 'hevc', Profile: ''}})).toBe("This device can't play HEVC video");
		expect(one('VideoProfileNotSupported', {video: {Codec: 'hevc', Profile: 0}})).toBe("This device can't play HEVC video");
		expect(one('VideoProfileNotSupported', {video: {Codec: 'hevc', Profile: '0'}})).toBe("This device can't play HEVC video");
		expect(one('VideoProfileNotSupported', {video: {Profile: 'Main 10'}})).toBe("This device can't play this video format");
		expect(one('VideoLevelNotSupported', {video: {Codec: 'hevc', Level: 0}})).toBe("This device can't play HEVC video");
		expect(one('VideoLevelNotSupported', {video: {Codec: 'hevc', Level: '0'}})).toBe("This device can't play HEVC video");
		expect(one('VideoLevelNotSupported', {video: {Codec: 'hevc', Level: ''}})).toBe("This device can't play HEVC video");
		expect(one('VideoLevelNotSupported', {})).toBe("This device can't play this video format");
		expect(one('VideoBitDepthNotSupported', {video: {Codec: 'hevc'}})).toBe("This device can't play this video format");
		expect(one('VideoResolutionNotSupported', {video: {Codec: 'hevc', Width: 1920}})).toBe("This device can't play this video format");
		expect(one('VideoFramerateNotSupported', {video: {Codec: 'hevc'}})).toBe("This device can't play this video format");
		expect(one('VideoRangeTypeNotSupported', {video: {Codec: 'hevc'}})).toBe("This device can't display this HDR format");
		expect(one('VideoRangeTypeNotSupported', {video: {Codec: 'hevc', VideoRangeType: 'SDR'}})).toBe("This device can't display this HDR format");
		expect(one('VideoRangeNotSupported', {})).toBe("This device can't display this HDR format");
		expect(one('AudioCodecNotSupported', {})).toBe("This device can't play this audio format");
		expect(one('AudioProfileNotSupported', {audio: {Codec: 'dts'}})).toBe("This device can't play DTS audio");
		expect(one('AudioProfileNotSupported', {})).toBe("This device can't play this audio format");
		expect(one('AudioChannelsNotSupported', {audio: {Codec: 'aac'}})).toBe("This device can't play this audio format");
		expect(one('AudioSampleRateNotSupported', {audio: {Codec: 'aac'}})).toBe("This device can't play this audio format");
		expect(one('AudioBitDepthNotSupported', {audio: {Codec: 'flac'}})).toBe("This device can't play this audio format");
		expect(one('SubtitleCodecNotSupported', {})).toBe('Subtitles are being burned into the video');
	});

	it('names the values the way the other rows do', () => {
		const one = (reason, values) => whyLines([reason], values)[0];
		expect(one('AudioCodecNotSupported', {audio: {Codec: 'dts', Profile: 'DTS-HD MA'}})).toBe("This device can't play DTS audio");
		expect(one('AudioProfileNotSupported', {audio: {Codec: 'dts', Profile: 'DTS-HD MA'}})).toBe("This device can't play DTS-HD Master Audio");
		expect(one('AudioCodecNotSupported', {audio: {Codec: 'dca', Profile: 'DTS-HD MA'}})).toBe("This device can't play DTS audio");
		expect(one('AudioProfileNotSupported', {audio: {Codec: 'dca', Profile: 'DTS-HD MA'}})).toBe("This device can't play DTS-HD Master Audio");
		expect(one('AudioCodecNotSupported', {audio: {Codec: 'opus'}})).toBe("This device can't play Opus audio");
		expect(one('AudioChannelsNotSupported', {audio: {Channels: 6}})).toBe("This device can't play 5.1 audio");
		expect(one('AudioChannelsNotSupported', {audio: {Channels: 3}})).toBe("This device can't play 3-channel audio");
		expect(one('AudioSampleRateNotSupported', {audio: {SampleRate: 44100}})).toBe("This device can't play 44.1 kHz audio");
		expect(one('VideoFramerateNotSupported', {video: {AverageFrameRate: 23.976025}})).toBe("This device can't play 23.976 fps video");
		expect(one('VideoResolutionNotSupported', {video: {Width: 720, Height: 480}})).toBe("This device can't play SD video");
		expect(one('VideoRangeTypeNotSupported', {video: {VideoRangeType: 'HDR10Plus'}})).toBe("This device can't display HDR10+");
		expect(one('VideoRangeTypeNotSupported', {video: {VideoRange: 'HDR', ExtendedVideoType: 'DolbyVision', ExtendedVideoSubType: 'DoviProfile81'}}))
			.toBe("This device can't display Dolby Vision Profile 8");
		expect(one('SubtitleCodecNotSupported', {subtitle: {Codec: 'mov_text'}})).toBe('MP4 text subtitles are being burned into the video');
		expect(one('SubtitleCodecNotSupported', {subtitle: {Codec: 'ass'}})).toBe('ASS subtitles are being burned into the video');
		expect(one('SubtitleCodecNotSupported', {subtitle: {Codec: 'dvd_subtitle'}})).toBe('VobSub subtitles are being burned into the video');
	});
});

describe('buildPlaybackInfo', () => {
	it('lays out a 4K HDR10 TrueHD Atmos direct play', () => {
		const sections = buildPlaybackInfo({
			session: session(movieSource()),
			playMethod: 'DirectPlay',
			selectedAudioIndex: 1,
			selectedSubtitleIndex: -1,
			maxBitrate: 0
		});
		expect(flatten(sections)).toEqual([
			'Playback',
			'  Play Method: Direct Play [bold]',
			'  (Playing the original file as is.)',
			'  Bitrate: 68.4 Mbps',
			'Video',
			'  Resolution: 4K (3840×2160)',
			'  Frame Rate: 23.976 fps',
			'  Format: HEVC Main 10',
			'  HDR: HDR10',
			'Audio',
			'  Track: English, Default',
			'  Format: Dolby TrueHD with Atmos',
			'  Channels: 7.1 surround',
			'File',
			'  Name: Dune (2021) - 2160p.mkv',
			'  Container: MKV',
			'  Size: 58.2 GB',
			'Technical',
			'  Player: HTML5 video',
			'  Device: OLED65C3PUA, webOS 23'
		]);
	});

	it('lays out a Jellyfin transcode for the quality limit and the audio codec', () => {
		const sections = buildPlaybackInfo({
			session: session(movieSource({TranscodingUrl: JELLYFIN_TRANSCODE})),
			playMethod: 'Transcode',
			selectedAudioIndex: 1,
			selectedSubtitleIndex: -1,
			maxBitrate: 20000000,
			isTizen: true
		});
		expect(flatten(sections)).toEqual([
			'Playback',
			'  Play Method: Transcoding [bold]',
			'  (The server is converting the video and audio so this device can play it.)',
			"  Why: 68.4 Mbps is above the 20 Mbps streaming limit\nThis device can't play Dolby TrueHD audio",
			'  Bitrate: 20.0 Mbps (original 68.4 Mbps)',
			'  Quality Limit: 20 Mbps',
			'Video',
			'  Resolution: 4K (3840×2160)',
			'  Frame Rate: 23.976 fps',
			'  Format: HEVC Main 10',
			'  HDR: HDR10',
			'Audio',
			'  Track: English, Default',
			'  Format: AAC (converted from Dolby TrueHD)',
			'  Channels: 5.1 surround (converted from 7.1)',
			'File',
			'  Name: Dune (2021) - 2160p.mkv',
			'  Container: MKV',
			'  Size: 58.2 GB',
			'Technical',
			'  Player: AVPlay (Native)',
			'  Device: OLED65C3PUA, webOS 23',
			'  Transcode Reasons: ContainerBitrateExceedsLimit, AudioCodecNotSupported'
		]);
	});

	it('reads an Emby remux, where both codecs are on the list the server may copy', () => {
		const source = {
			Path: 'D:\\Media\\UHD Probe.mkv', Container: 'mkv', Size: 734003200, TranscodingUrl: EMBY_TRANSCODE,
			MediaStreams: [
				{Type: 'Video', Index: 0, Codec: 'hevc', Width: 1920, Height: 800, AverageFrameRate: 29.97, VideoRange: 'SDR'},
				{Type: 'Audio', Index: 1, Codec: 'ac3', Channels: 6, Language: 'jpn'}
			]
		};
		const rows = flatten(buildPlaybackInfo({session: session(source, {modelName: 'Unknown'}), playMethod: 'Transcode', selectedAudioIndex: 1}));
		expect(rows).toEqual([
			'Playback',
			'  Play Method: Transcoding [bold]',
			'  (The server is converting this file so this device can play it.)',
			"  Why: This device can't open MKV files",
			'Video',
			'  Resolution: 1080p (1920×800)',
			'  Frame Rate: 29.97 fps',
			'  Format: HEVC',
			'  HDR: SDR',
			'Audio',
			'  Track: Japanese',
			'  Format: Dolby Digital',
			'  Channels: 5.1 surround',
			'File',
			'  Name: UHD Probe.mkv',
			'  Container: MKV',
			'  Size: 700 MB',
			'Technical',
			'  Player: HTML5 video',
			'  Device: webOS 23',
			'  Transcode Reasons: ContainerNotSupported'
		]);
	});

	it('names the converted video codec and a burned in subtitle', () => {
		const url = '/videos/1/master.m3u8?VideoCodec=h264&AudioCodec=aac,eac3&SubtitleMethod=Encode' +
			'&TranscodeReasons=VideoCodecNotSupported,SubtitleCodecNotSupported';
		const source = {MediaStreams: [
			{Type: 'Video', Index: 0, Codec: 'av1', Profile: 'Main', Width: 1920, Height: 1080},
			{Type: 'Audio', Index: 1, Codec: 'eac3', Channels: 6},
			{Type: 'Subtitle', Index: 2, Codec: 'dvd_subtitle', Language: 'fre', IsHearingImpaired: true, DeliveryMethod: 'Encode'}
		], TranscodingUrl: url};
		const sections = buildPlaybackInfo({session: session(source), playMethod: 'Transcode', selectedAudioIndex: 1, selectedSubtitleIndex: 2, transcodeForced: true});
		const rows = flatten(sections);
		expect(rows).toContain('  (The server is converting the video so this device can play it.)');
		expect(rows).toContain("  Why: Transcoding is forced in settings\nThis device can't play AV1 video\nVobSub subtitles are being burned into the video");
		expect(rows).toContain('  Format: H.264 (converted from AV1)');
		expect(rows).toContain('  Format: Dolby Digital Plus');
		expect(rows.slice(rows.indexOf('Subtitles'), rows.indexOf('Subtitles') + 4)).toEqual([
			'Subtitles', '  Track: French, SDH', '  Format: VobSub (image)', '  Delivery: Burned in by the server'
		]);
	});

	it('only counts a burn in when the url names the subtitle track', () => {
		const url = '/videos/1/master.m3u8?VideoCodec=hevc,h264&AudioCodec=aac&SubtitleMethod=Encode&TranscodeReasons=AudioCodecNotSupported';
		const srt = {Type: 'Subtitle', Index: 4, Codec: 'subrip', Language: 'eng', DeliveryMethod: 'External'};
		const rowsFor = (transcodingUrl) => flatten(buildPlaybackInfo({
			session: session(movieSource({TranscodingUrl: transcodingUrl, MediaStreams: [hevcHdr10, trueHdAtmos, srt]})),
			playMethod: 'Transcode', selectedAudioIndex: 1, selectedSubtitleIndex: 4
		}));
		const drawn = rowsFor(url);
		expect(drawn).toContain('  (The server is converting the audio so this device can play it.)');
		expect(drawn).toContain('  Delivery: Embedded');
		const burned = rowsFor(url + '&SubtitleStreamIndex=4');
		expect(burned).toContain('  (The server is converting the video and audio so this device can play it.)');
		expect(burned).toContain('  Delivery: Burned in by the server');
		const otherTrack = rowsFor(url + '&SubtitleStreamIndex=3');
		expect(otherTrack).toContain('  (The server is converting the audio so this device can play it.)');
		expect(otherTrack).toContain('  Delivery: Embedded');
	});

	it("doesn't count the subtitle reason alone, or any burn in without a selected track, as burning", () => {
		const url = '/videos/1/master.m3u8?VideoCodec=hevc,h264&AudioCodec=aac&SubtitleMethod=Encode&SubtitleStreamIndex=4' +
			'&TranscodeReasons=AudioCodecNotSupported,SubtitleCodecNotSupported';
		const pgs4 = {Type: 'Subtitle', Index: 4, Codec: 'PGSSUB', Language: 'eng'};
		const reasonOnly = flatten(buildPlaybackInfo({
			session: session(movieSource({TranscodingUrl: url.replace('&SubtitleStreamIndex=4', ''), MediaStreams: [hevcHdr10, trueHdAtmos, pgs4]})),
			playMethod: 'Transcode', selectedAudioIndex: 1, selectedSubtitleIndex: 4
		}));
		expect(reasonOnly).toContain('  (The server is converting the audio so this device can play it.)');
		expect(reasonOnly).toContain("  Why: This device can't play Dolby TrueHD audio\nPGS subtitles are being burned into the video");
		expect(reasonOnly).toContain('  Delivery: Embedded');
		const noneSelected = flatten(buildPlaybackInfo({
			session: session(movieSource({TranscodingUrl: url, MediaStreams: [hevcHdr10, trueHdAtmos, pgs4]})),
			playMethod: 'Transcode', selectedAudioIndex: 1, selectedSubtitleIndex: -1
		}));
		expect(noneSelected).toContain('  (The server is converting the audio so this device can play it.)');
		expect(noneSelected).toContain("  Why: This device can't play Dolby TrueHD audio\nSubtitles are being burned into the video");
	});

	it('counts a 4K picture scaled down to the url size as converted video, even when Emby gives no video reason', () => {
		const url = '/videos/12151/master.m3u8?MediaSourceId=mediasource_12151&api_key=secret&VideoCodec=hevc,h264' +
			'&AudioCodec=eac3,ac3,aac&VideoBitrate=79616000&AudioBitrate=384000&MaxWidth=1920&MaxHeight=1080' +
			'&TranscodeReasons=AudioCodecNotSupported,DirectPlayError';
		const rows = flatten(buildPlaybackInfo({session: session(movieSource({TranscodingUrl: url})), playMethod: 'Transcode', selectedAudioIndex: 1}));
		expect(rows).toContain('  (The server is converting the video and audio so this device can play it.)');
		const fits = url.replace('MaxWidth=1920&MaxHeight=1080', 'MaxWidth=3840&MaxHeight=2160');
		expect(flatten(buildPlaybackInfo({session: session(movieSource({TranscodingUrl: fits})), playMethod: 'Transcode', selectedAudioIndex: 1})))
			.toContain('  (The server is converting the audio so this device can play it.)');
	});

	it('reads what the server is really sending from the session, as Emby reports a 4K DTS file it sends as H.264', () => {
		const url = '/videos/12151/master.m3u8?MediaSourceId=mediasource_12151&VideoCodec=hevc,h264&AudioCodec=eac3,ac3,aac' +
			'&VideoBitrate=39616000&AudioBitrate=384000&MaxWidth=1920&MaxHeight=1080&TranscodingMaxAudioChannels=6' +
			'&TranscodeReasons=AudioCodecNotSupported,DirectPlayError';
		const dts = {Type: 'Audio', Index: 1, Codec: 'dts', Profile: 'DTS-HD MA', Channels: 6, IsDefault: true};
		const info = {
			IsVideoDirect: false, IsAudioDirect: false, VideoCodec: 'h264', AudioCodec: 'eac3', Bitrate: 22192522,
			Width: 1920, Height: 1080, AudioChannels: 6, TranscodeReasons: ['AudioCodecNotSupported', 'DirectPlayError']
		};
		const rows = flatten(buildPlaybackInfo({
			session: session(movieSource({TranscodingUrl: url, Bitrate: 14539015, MediaStreams: [hevcHdr10, dts]})),
			playMethod: 'Transcode', selectedAudioIndex: 1, transcodingInfo: info
		}));
		expect(rows.slice(0, 5)).toEqual([
			'Playback',
			'  Play Method: Transcoding [bold]',
			'  (The server is converting the video and audio so this device can play it.)',
			"  Why: This device can't play DTS audio\nThe file couldn't be played directly",
			'  Bitrate: 22.2 Mbps (original 14.5 Mbps)'
		]);
		expect(rows).toContain('  Resolution: 1080p (1920×1080, converted from 4K)');
		expect(rows).toContain('  Format: H.264 (converted from HEVC)');
		expect(rows).toContain('  Format: Dolby Digital Plus (converted from DTS)');
		expect(rows).toContain('  Channels: 5.1 surround');
	});

	it('ignores session details left by another transcode whose reasons differ from the url', () => {
		const url = '/videos/1/master.m3u8?VideoCodec=hevc,h264&AudioCodec=eac3,ac3,aac&MaxWidth=1920&MaxHeight=1080' +
			'&TranscodeReasons=AudioCodecNotSupported,VideoLevelNotSupported,VideoResolutionNotSupported';
		const earlier = {
			IsVideoDirect: false, IsAudioDirect: true, VideoCodec: 'h264', AudioCodec: 'eac3', Bitrate: 2384000,
			Width: 1280, Height: 533, AudioChannels: 6, TranscodeReasons: ['ContainerBitrateExceedsLimit']
		};
		const rows = flatten(buildPlaybackInfo({
			session: session(movieSource({TranscodingUrl: url})), playMethod: 'Transcode', selectedAudioIndex: 1, transcodingInfo: earlier
		}));
		expect(rows).toContain('  (The server is converting the video and audio so this device can play it.)');
		expect(rows).toContain('  Resolution: 4K (3840×2160)');
		expect(rows).toContain('  Format: HEVC Main 10');
		expect(rows).toContain('  Bitrate: 68.4 Mbps');
		const current = {...earlier, IsAudioDirect: false, AudioCodec: 'ac3', Width: 1920, Height: 1080, Bitrate: 22216255,
			TranscodeReasons: ['VideoResolutionNotSupported', 'AudioCodecNotSupported', 'VideoLevelNotSupported']};
		const matched = flatten(buildPlaybackInfo({
			session: session(movieSource({TranscodingUrl: url})), playMethod: 'Transcode', selectedAudioIndex: 1, transcodingInfo: current
		}));
		expect(matched).toContain('  Resolution: 1080p (1920×1080, converted from 4K)');
		expect(matched).toContain('  Format: Dolby Digital (converted from Dolby TrueHD)');
	});

	it('names the container from a known file extension, which Jellyfin can narrow to mov for an mp4', () => {
		const url = '/videos/1/master.m3u8?VideoCodec=hevc,h264&AudioCodec=truehd&TranscodeReasons=ContainerNotSupported';
		const containerOf = (Path, Container) => {
			const rows = flatten(buildPlaybackInfo({session: session(movieSource({Path, Container, TranscodingUrl: url})), playMethod: 'Transcode', selectedAudioIndex: 1}));
			return [rows.find((row) => row.indexOf('  Container: ') === 0), rows.find((row) => row.indexOf('  Why: ') === 0)];
		};
		expect(containerOf('/media/Movies/Elemental (2023)/Elemental (2023).mp4', 'mov')).toEqual([
			'  Container: MP4', "  Why: This device can't open MP4 files"
		]);
		expect(containerOf('/media/Movies/Clip.m4v', 'mov,mp4,m4a')[0]).toBe('  Container: M4V');
		expect(containerOf('D:\\Media\\Film.MKV', 'mkv')[0]).toBe('  Container: MKV');
		expect(containerOf(undefined, 'mov,mp4,m4a')[0]).toBe('  Container: MP4');
		expect(containerOf('/media/Some.Folder/film', 'avi')[0]).toBe('  Container: AVI');
		expect(containerOf('/media/Movies/Avatar.2009.BluRay', 'mkv')).toEqual(['  Container: MKV', "  Why: This device can't open MKV files"]);
		expect(containerOf('/media/Movies/Film.2009', 'mov,mp4,m4a')[0]).toBe('  Container: MP4');
		expect(containerOf('http://192.168.50.35/hdhr/auto/v6?quality=1.5', 'ts')[0]).toBe('  Container: TS');
	});

	it('lets the session overrule the url, and names fewer channels from it', () => {
		const url = '/videos/1/master.m3u8?VideoCodec=h264&AudioCodec=aac';
		const rows = flatten(buildPlaybackInfo({
			session: session(movieSource({TranscodingUrl: url})),
			playMethod: 'Transcode', selectedAudioIndex: 1,
			transcodingInfo: {IsVideoDirect: true, IsAudioDirect: false, VideoCodec: 'hevc', AudioCodec: 'aac', AudioChannels: 2, Width: 3840, Height: 2160}
		}));
		expect(rows).toContain('  (The server is converting the audio so this device can play it.)');
		expect(rows).toContain('  Resolution: 4K (3840×2160)');
		expect(rows).toContain('  Format: HEVC Main 10');
		expect(rows).toContain('  Format: AAC (converted from Dolby TrueHD)');
		expect(rows).toContain('  Channels: Stereo (converted from 7.1)');
		expect(rows).toContain('  Bitrate: 68.4 Mbps');
	});

	it('takes the reasons from the session when the url has none, and ignores the session outside a transcode', () => {
		const info = {IsVideoDirect: false, IsAudioDirect: true, VideoCodec: 'h264', Bitrate: 8000000, TranscodeReasons: 'VideoCodecNotSupported'};
		const transcode = flatten(buildPlaybackInfo({
			session: session(movieSource({TranscodingUrl: '/videos/1/master.m3u8?VideoCodec=h264'})),
			playMethod: 'Transcode', selectedAudioIndex: 1, transcodingInfo: info
		}));
		expect(transcode).toContain("  Why: This device can't play HEVC video");
		expect(transcode).toContain('  Transcode Reasons: VideoCodecNotSupported');
		expect(transcode).toContain('  Bitrate: 8.0 Mbps (original 68.4 Mbps)');
		const direct = flatten(buildPlaybackInfo({session: session(movieSource()), playMethod: 'DirectPlay', selectedAudioIndex: 1, transcodingInfo: info}));
		expect(direct).toContain('  Bitrate: 68.4 Mbps');
		expect(direct).toContain('  Format: HEVC Main 10');
		expect(direct.some((row) => row.indexOf('Why') !== -1 || row.indexOf('Transcode Reasons') !== -1)).toBe(false);
	});

	it('reads dca as DTS, which the server copies when DTS is on the list', () => {
		const url = '/videos/1/master.m3u8?VideoCodec=h264&AudioCodec=dts,aac&TranscodeReasons=VideoCodecNotSupported';
		const dca = {Type: 'Audio', Index: 1, Codec: 'dca', Profile: 'DTS-HD MA', Channels: 6, IsDefault: true};
		const rows = flatten(buildPlaybackInfo({
			session: session(movieSource({TranscodingUrl: url, MediaStreams: [hevcHdr10, dca]})), playMethod: 'Transcode', selectedAudioIndex: 1
		}));
		expect(rows).toContain('  (The server is converting the video so this device can play it.)');
		expect(rows).toContain('  Format: DTS-HD Master Audio');
		const converted = flatten(buildPlaybackInfo({
			session: session(movieSource({TranscodingUrl: url.replace('dts,aac', 'aac'), MediaStreams: [hevcHdr10, dca]})),
			playMethod: 'Transcode', selectedAudioIndex: 1
		}));
		expect(converted).toContain('  Format: AAC (converted from DTS)');
	});

	it('only lets a url cap stand in for the bitrate when it sits below the file', () => {
		const url = '/videos/1/master.m3u8?VideoCodec=hevc,h264&AudioCodec=aac&VideoBitrate=79616000&AudioBitrate=384000';
		const rows = flatten(buildPlaybackInfo({session: session(movieSource({TranscodingUrl: url})), playMethod: 'Transcode', selectedAudioIndex: 1}));
		expect(rows).toContain('  Bitrate: 68.4 Mbps');
	});

	it('only says the audio is converted when the video is copied', () => {
		const url = '/videos/1/master.m3u8?VideoCodec=hevc,h264&AudioCodec=aac&TranscodeReasons=AudioCodecNotSupported';
		const rows = flatten(buildPlaybackInfo({session: session(movieSource({TranscodingUrl: url})), playMethod: 'Transcode', selectedAudioIndex: 2}));
		expect(rows).toContain('  (The server is converting the audio so this device can play it.)');
		expect(rows).toContain('  Track: English');
		expect(rows).toContain('  Format: AAC (converted from Dolby Digital)');
		expect(rows).toContain('  Channels: Stereo');
	});

	it('says what a direct stream is and leaves the reasons out of it', () => {
		const rows = flatten(buildPlaybackInfo({session: session(movieSource({TranscodingUrl: EMBY_TRANSCODE})), playMethod: 'DirectStream'}));
		expect(rows.slice(0, 3)).toEqual([
			'Playback', '  Play Method: Direct Stream [bold]', '  (The server is repackaging the file without converting it.)'
		]);
		expect(rows.some((row) => row.indexOf('Why') !== -1 || row.indexOf('Transcode Reasons') !== -1)).toBe(false);
	});

	it('says a live channel is relayed rather than repackaged', () => {
		const source = {MediaStreams: [{Type: 'Video', Index: 0, Codec: 'mpeg2video', Width: 1920, Height: 1080}], Container: 'ts'};
		const rows = flatten(buildPlaybackInfo({session: session(source), playMethod: 'DirectStream', isLiveTV: true}));
		expect(rows).toContain('  (The server is relaying the channel without converting it.)');
	});

	it("reads the scan type off the server's interlaced flag, and says nothing without one", () => {
		const scan = (extra) => flatten(buildPlaybackInfo({
			session: session({MediaStreams: [{Type: 'Video', Index: 0, Codec: 'h264', Width: 1920, Height: 1080, ...extra}]}),
			playMethod: 'DirectPlay'
		})).find((row) => row.indexOf('Scan:') !== -1);
		expect(scan({IsInterlaced: true})).toBe('  Scan: Interlaced');
		expect(scan({IsInterlaced: false})).toBe('  Scan: Progressive');
		expect(scan({})).toBeUndefined();
	});

	it('shows the channel and program for live TV and no file section', () => {
		const source = {MediaStreams: [{Type: 'Video', Index: 0, Codec: 'mpeg2video', Width: 1280, Height: 720, RealFrameRate: 59.94}], Container: 'ts'};
		const sections = buildPlaybackInfo({
			session: session(source), playMethod: 'DirectPlay', isLiveTV: true,
			item: {ChannelNumber: '4.1', Name: 'WRC-HD'}, liveProgram: {Name: 'Evening News'}
		});
		expect(sections.map((section) => section.id)).toEqual(['playback', 'video', 'technical']);
		expect(flatten(sections).slice(0, 4)).toEqual(['Playback', '  Channel: 4.1 WRC-HD', '  Program: Evening News', '  Play Method: Direct Play [bold]']);
		expect(flatten(sections)).toContain('  Resolution: 720p (1280×720)');
	});

	it('names the Dolby Vision profile, also from the field Emby fills, and the base layer a panel without it shows', () => {
		const dv = {Type: 'Video', Index: 0, Codec: 'hevc', VideoRangeType: 'DOVIWithHDR10', DvProfile: 8};
		const emby = {Type: 'Video', Index: 0, Codec: 'hevc', ExtendedVideoType: 'DolbyVision', ExtendedVideoSubType: 'DoviProfile81'};
		const hdr = (stream, capabilities) => flatten(buildPlaybackInfo({session: session({MediaStreams: [stream]}, capabilities), playMethod: 'DirectPlay'}))
			.find((row) => row.indexOf('HDR:') !== -1);
		expect(hdr(dv)).toBe('  HDR: Dolby Vision Profile 8');
		expect(hdr(emby)).toBe('  HDR: Dolby Vision Profile 8');
		expect(hdr(dv, {dolbyVision: false})).toBe('  HDR: HDR10 (converted from Dolby Vision Profile 8)');
	});

	it('says how the Xbox console player sent the sound, and the dropped frames when there is a count', () => {
		const rows = (format) => flatten(buildPlaybackInfo({
			session: session(movieSource()), playMethod: 'DirectPlay', selectedAudioIndex: 1,
			hostAudioOutput: {decoder: null, format}, droppedFrames: 12
		}));
		expect(rows('TrueHD 8 ch 48000 Hz')).toContain('  Output: Passthrough (Dolby TrueHD with Atmos)');
		expect(rows('PCM 8 ch 48000 Hz')).toContain('  Output: Decoded (7.1)');
		expect(rows('PCM 48000 Hz')).toContain('  Output: Decoded (7.1)');
		expect(rows('{00000000-0000-0000-0000-000000000000} 48000 Hz').some((row) => row.indexOf('Output') !== -1)).toBe(false);
		expect(rows('PCM 8 ch 48000 Hz')).toContain('  Dropped Frames: 12');
	});

	it('names the player each platform plays with', () => {
		const player = (capabilities, isTizen) => flatten(buildPlaybackInfo({session: session(movieSource(), capabilities), playMethod: 'DirectPlay', isTizen}))
			.find((row) => row.indexOf('Player:') !== -1);
		expect(player({}, true)).toBe('  Player: AVPlay (Native)');
		expect(player({nativePlayer: true})).toBe('  Player: Console Video Player');
		expect(player({nativePlayer: false})).toBe('  Player: HTML5 video');
	});

	it('hides rows it has nothing for and never says unknown', () => {
		const sections = buildPlaybackInfo({session: null, playMethod: null});
		expect(sections).toEqual([]);
		const mp4 = flatten(buildPlaybackInfo({session: session({Container: 'mov,mp4,m4a', Name: 'Clip', MediaStreams: []}), playMethod: 'DirectPlay'}));
		expect(mp4).toContain('  Name: Clip');
		expect(mp4).toContain('  Container: MP4');
		expect(mp4.join('\n')).not.toMatch(/Unknown/);
	});
});
