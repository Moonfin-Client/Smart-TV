import {applyProfileTuning, canTranscodeAudioCodecAway, preferMpegTsHlsForLive, transcodesAudioCodec} from './deviceProfileTuning';

const profile = () => ({
	SubtitleProfiles: [
		{Format: 'srt', Method: 'External'},
		{Format: 'ass', Method: 'External'},
		{Format: 'ssa', Method: 'External'},
		{Format: 'pgs', Method: 'External'},
		{Format: 'pgssub', Method: 'External'},
		{Format: 'dvdsub', Method: 'Encode'}
	],
	CodecProfiles: [{Type: 'Video', Codec: 'hevc', Conditions: []}],
	TranscodingProfiles: [
		{Container: 'ts', Type: 'Video', MaxAudioChannels: '6'},
		{Container: 'mp3', Type: 'Audio'}
	]
});

const formats = (tuned) => tuned.SubtitleProfiles.map((p) => p.Format);

const capped = (width, height) => ([
	{Condition: 'LessThanEqual', Property: 'Width', Value: String(width), IsRequired: false},
	{Condition: 'LessThanEqual', Property: 'Height', Value: String(height), IsRequired: false}
]);

const orientedCaps = (long, short) => ([
	{
		Type: 'Video',
		ApplyConditions: [{Condition: 'GreaterThanEqual', Property: 'Width', Value: String(short + 1), IsRequired: false}],
		Conditions: capped(long, short)
	},
	{
		Type: 'Video',
		ApplyConditions: [{Condition: 'LessThanEqual', Property: 'Width', Value: String(short), IsRequired: false}],
		Conditions: [{Condition: 'LessThanEqual', Property: 'Height', Value: String(long), IsRequired: false}]
	}
]);

const caps = (tuned) => tuned.CodecProfiles.slice(1);

const fhdPanel = {uhd: false, uhd8K: false};
const uhdPanel = {uhd: true, uhd8K: false};

describe('applyProfileTuning', () => {
	it('leaves the profile alone when nothing is limited', () => {
		const original = profile();
		expect(applyProfileTuning(original, {})).toBe(original);
		expect(applyProfileTuning(original, {assDirectPlay: true, enablePgsRendering: true})).toBe(original);
	});

	// The server only burns a track in when the profile leaves it no other way to
	// deliver it, so turning direct play off has to take the format off the list.
	it('drops pgs when its direct play is off', () => {
		const tuned = applyProfileTuning(profile(), {enablePgsRendering: false});
		expect(formats(tuned)).toEqual(['srt', 'ass', 'ssa', 'dvdsub']);
	});

	it('drops ass when its direct play is off', () => {
		const tuned = applyProfileTuning(profile(), {assDirectPlay: false});
		expect(formats(tuned)).toEqual(['srt', 'pgs', 'pgssub', 'dvdsub']);
	});

	it('drops both when neither is drawn here', () => {
		const tuned = applyProfileTuning(profile(), {assDirectPlay: false, enablePgsRendering: false});
		expect(formats(tuned)).toEqual(['srt', 'dvdsub']);
	});

	it('keeps the original profile untouched', () => {
		const original = profile();
		applyProfileTuning(original, {enablePgsRendering: false});
		expect(formats(original)).toHaveLength(6);
	});

	it('caps the resolution without touching the subtitles', () => {
		const tuned = applyProfileTuning(profile(), {maxVideoResolution: 'res1080p'});
		expect(formats(tuned)).toHaveLength(6);
		expect(tuned.CodecProfiles[0]).toEqual(profile().CodecProfiles[0]);
		expect(caps(tuned)).toEqual(orientedCaps(1920, 1080));
		expect(tuned.TranscodingProfiles[0].Conditions).toEqual(capped(1920, 1080));
	});

	it('caps the audio channels on the transcoding profiles', () => {
		const tuned = applyProfileTuning(profile(), {downmixToStereo: true});
		expect(tuned.TranscodingProfiles[0].MaxAudioChannels).toBe('2');
	});

	it('caps a 1080p panel when the user asked for no limit', () => {
		const tuned = applyProfileTuning(profile(), {}, fhdPanel);
		expect(caps(tuned)).toEqual(orientedCaps(1920, 1080));
		expect(tuned.TranscodingProfiles[0].Conditions).toEqual(capped(1920, 1080));
	});

	it('leaves the audio transcoding profile out of it', () => {
		const tuned = applyProfileTuning(profile(), {}, fhdPanel);
		expect(tuned.TranscodingProfiles[1]).toEqual({Container: 'mp3', Type: 'Audio'});
	});

	it('lets a 4K panel through to DCI 4K', () => {
		const tuned = applyProfileTuning(profile(), {}, uhdPanel);
		expect(caps(tuned)).toEqual(orientedCaps(4096, 2160));
	});

	it('leaves an 8K panel uncapped', () => {
		const original = profile();
		expect(applyProfileTuning(original, {}, {uhd: true, uhd8K: true})).toBe(original);
	});

	it('takes the panel when the chosen resolution is larger than it', () => {
		const tuned = applyProfileTuning(profile(), {maxVideoResolution: 'res2160p'}, fhdPanel);
		expect(caps(tuned)).toEqual(orientedCaps(1920, 1080));
	});

	it('takes the chosen resolution when it is smaller than the panel', () => {
		const tuned = applyProfileTuning(profile(), {maxVideoResolution: 'res1080p'}, uhdPanel);
		expect(caps(tuned)).toEqual(orientedCaps(1920, 1080));
	});

	it('has no panel to cap to when nothing was detected', () => {
		const original = profile();
		expect(applyProfileTuning(original, {})).toBe(original);
	});

	// Portrait 4K is 2160 wide by 3840 tall, so a plain height cap of 2160 would send it to a transcode.
	it('lets a portrait source use the long side for its height', () => {
		const [landscape, portrait] = caps(applyProfileTuning(profile(), {}, uhdPanel));
		expect(landscape.ApplyConditions).toEqual([{Condition: 'GreaterThanEqual', Property: 'Width', Value: '2161', IsRequired: false}]);
		expect(portrait.ApplyConditions).toEqual([{Condition: 'LessThanEqual', Property: 'Width', Value: '2160', IsRequired: false}]);
		expect(portrait.Conditions).toEqual([{Condition: 'LessThanEqual', Property: 'Height', Value: '4096', IsRequired: false}]);
	});

	it('keeps both caps on the same transcoding profile', () => {
		const tuned = applyProfileTuning(profile(), {downmixToStereo: true}, fhdPanel);
		expect(tuned.TranscodingProfiles[0].Conditions).toEqual(capped(1920, 1080));
		expect(tuned.TranscodingProfiles[0].MaxAudioChannels).toBe('2');
	});
});

describe('transcode audio codecs', () => {
	const audioProfile = () => ({
		DirectPlayProfiles: [
			{Container: 'mp4,m4v', Type: 'Video', VideoCodec: 'h264,hevc', AudioCodec: 'aac,ac3,eac3'},
			{Container: 'mkv', Type: 'Video', VideoCodec: 'h264,hevc', AudioCodec: 'aac,dca,dts,dts-hd,dtshd,eac3,pcm_s16le,pcm_s24le'},
			{Container: 'm4a', Type: 'Audio', AudioCodec: 'aac'}
		],
		TranscodingProfiles: [
			{Container: 'ts', Type: 'Video', AudioCodec: 'aac,ac3,eac3', VideoCodec: 'h264', Protocol: 'hls'},
			{Container: 'mp4', Type: 'Video', AudioCodec: 'aac', VideoCodec: 'h264', Context: 'Static'},
			{Container: 'aac', Type: 'Audio', AudioCodec: 'aac'}
		]
	});

	it('takes a picked codec out of video direct play under every name', () => {
		const tuned = applyProfileTuning(audioProfile(), {transcodeAudioCodecs: ['aac', 'dts', 'pcm']});
		expect(tuned.DirectPlayProfiles.map((p) => p.AudioCodec)).toEqual(['ac3,eac3', 'eac3', 'aac']);
	});

	it('takes it out of the transcode so the server converts it rather than copying it', () => {
		const tuned = applyProfileTuning(audioProfile(), {transcodeAudioCodecs: ['aac']});
		expect(tuned.TranscodingProfiles[0].AudioCodec).toBe('ac3,eac3');
	});

	it('never leaves a list empty, since an empty one means any codec', () => {
		const tuned = applyProfileTuning(audioProfile(), {transcodeAudioCodecs: ['aac', 'ac3', 'eac3']});
		expect(tuned.DirectPlayProfiles.map((p) => p.Container)).toEqual(['mkv', 'm4a']);
		expect(tuned.TranscodingProfiles.map((p) => p.AudioCodec)).toEqual(['aac,ac3,eac3', 'aac', 'aac']);
	});

	// The Vega shape: fMP4 converts, and the live TS profile can only carry AAC.
	const vegaProfile = () => ({
		DirectPlayProfiles: [{Container: 'mp4', Type: 'Video', VideoCodec: 'h264', AudioCodec: 'aac,ac3'}],
		TranscodingProfiles: [
			{Container: 'mp4', Type: 'Video', AudioCodec: 'aac,mp2,ac3,eac3', Context: 'Streaming', Protocol: 'hls'},
			{Container: 'ts', Type: 'Video', AudioCodec: 'aac', Context: 'Streaming', Protocol: 'hls'},
			{Container: 'mp4', Type: 'Video', AudioCodec: 'aac', Context: 'Static'}
		]
	});

	it('drops a streamed transcode that could only copy the pick when another converts it', () => {
		const tuned = applyProfileTuning(vegaProfile(), {transcodeAudioCodecs: ['aac']});
		expect(tuned.TranscodingProfiles.map((p) => `${p.Container}:${p.Context}:${p.AudioCodec}`))
			.toEqual(['mp4:Streaming:mp2,ac3,eac3', 'mp4:Static:aac']);
	});

	it('keeps it for a live channel, which only ever takes the TS profile', () => {
		const tuned = applyProfileTuning(vegaProfile(), {transcodeAudioCodecs: ['aac']}, undefined, {isLiveTV: true});
		expect(tuned.TranscodingProfiles.map((p) => p.Container)).toEqual(['mp4', 'ts', 'mp4']);
	});

	it('matches a stream codec against the picks', () => {
		const settings = {transcodeAudioCodecs: ['dts', 'pcm']};
		expect(transcodesAudioCodec(settings, 'DCA')).toBe(true);
		expect(transcodesAudioCodec(settings, 'pcm_s24le')).toBe(true);
		expect(transcodesAudioCodec(settings, 'eac3')).toBe(false);
		expect(transcodesAudioCodec({}, 'aac')).toBe(false);
	});

	// An Xbox only streams AAC out of a transcode, so an AAC pick would just be copied back.
	it('offers a codec only where a streamed transcode can turn it into another', () => {
		const xbox = {TranscodingProfiles: [
			{Container: 'ts', Type: 'Video', AudioCodec: 'aac', Context: 'Streaming', Protocol: 'hls'},
			{Container: 'mp4', Type: 'Video', AudioCodec: 'aac,ac3', Context: 'Static'}
		]};
		expect(canTranscodeAudioCodecAway(xbox, 'aac')).toBe(false);
		expect(canTranscodeAudioCodecAway(xbox, 'opus')).toBe(true);
	});
});

describe('preferMpegTsHlsForLive', () => {
	const hls = (Container, extra) => ({Container, Type: 'Video', Context: 'Streaming', Protocol: 'hls', VideoCodec: 'h264', ...extra});
	const containers = (result) => result.TranscodingProfiles.map((entry) => entry.Container);

	test('moves the TS entry ahead of fMP4', () => {
		const vega = {TranscodingProfiles: [hls('mp4'), hls('ts'), {Container: 'mp4', Type: 'Video', Context: 'Static'}]};
		expect(containers(preferMpegTsHlsForLive(vega))).toEqual(['ts', 'mp4', 'mp4']);
		expect(preferMpegTsHlsForLive(vega).TranscodingProfiles[2].Context).toBe('Static');
	});

	test('adds a TS copy where a platform offers only fMP4, at 5.1 at most', () => {
		const xbox = {TranscodingProfiles: [hls('mp4', {MaxAudioChannels: '8'}), {Container: 'mp3', Type: 'Audio'}]};
		const result = preferMpegTsHlsForLive(xbox);
		expect(containers(result)).toEqual(['ts', 'mp4', 'mp3']);
		expect(result.TranscodingProfiles[0]).toMatchObject({Protocol: 'hls', VideoCodec: 'h264', MaxAudioChannels: '6'});
	});

	test('leaves a profile that already leads with TS alone', () => {
		const tizen = {TranscodingProfiles: [hls('ts'), hls('mp4')]};
		expect(preferMpegTsHlsForLive(tizen)).toBe(tizen);
	});
});
