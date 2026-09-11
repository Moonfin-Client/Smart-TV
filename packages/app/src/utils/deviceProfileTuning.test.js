import {applyProfileTuning} from './deviceProfileTuning';

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
		expect(tuned.CodecProfiles[0].Conditions).toEqual(capped(1920, 1080));
		expect(tuned.TranscodingProfiles[0].Conditions).toEqual(capped(1920, 1080));
	});

	it('caps the audio channels on the transcoding profiles', () => {
		const tuned = applyProfileTuning(profile(), {downmixToStereo: true});
		expect(tuned.TranscodingProfiles[0].MaxAudioChannels).toBe('2');
	});

	it('caps a 1080p panel when the user asked for no limit', () => {
		const tuned = applyProfileTuning(profile(), {}, fhdPanel);
		expect(tuned.CodecProfiles[0].Conditions).toEqual(capped(1920, 1080));
		expect(tuned.TranscodingProfiles[0].Conditions).toEqual(capped(1920, 1080));
	});

	it('leaves the audio transcoding profile out of it', () => {
		const tuned = applyProfileTuning(profile(), {}, fhdPanel);
		expect(tuned.TranscodingProfiles[1]).toEqual({Container: 'mp3', Type: 'Audio'});
	});

	it('lets a 4K panel through to DCI 4K', () => {
		const tuned = applyProfileTuning(profile(), {}, uhdPanel);
		expect(tuned.CodecProfiles[0].Conditions).toEqual(capped(4096, 2160));
	});

	it('leaves an 8K panel uncapped', () => {
		const original = profile();
		expect(applyProfileTuning(original, {}, {uhd: true, uhd8K: true})).toBe(original);
	});

	it('takes the panel when the chosen resolution is larger than it', () => {
		const tuned = applyProfileTuning(profile(), {maxVideoResolution: 'res2160p'}, fhdPanel);
		expect(tuned.CodecProfiles[0].Conditions).toEqual(capped(1920, 1080));
	});

	it('takes the chosen resolution when it is smaller than the panel', () => {
		const tuned = applyProfileTuning(profile(), {maxVideoResolution: 'res1080p'}, uhdPanel);
		expect(tuned.CodecProfiles[0].Conditions).toEqual(capped(1920, 1080));
	});

	it('has no panel to cap to when nothing was detected', () => {
		const original = profile();
		expect(applyProfileTuning(original, {})).toBe(original);
	});

	it('keeps both caps on the same transcoding profile', () => {
		const tuned = applyProfileTuning(profile(), {downmixToStereo: true}, fhdPanel);
		expect(tuned.TranscodingProfiles[0].Conditions).toEqual(capped(1920, 1080));
		expect(tuned.TranscodingProfiles[0].MaxAudioChannels).toBe('2');
	});
});
