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
	TranscodingProfiles: [{Container: 'ts', MaxAudioChannels: '6'}]
});

const formats = (tuned) => tuned.SubtitleProfiles.map((p) => p.Format);

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
		expect(tuned.CodecProfiles[0].Conditions).toEqual([
			{Condition: 'LessThanEqual', Property: 'Width', Value: '1920', IsRequired: false},
			{Condition: 'LessThanEqual', Property: 'Height', Value: '1080', IsRequired: false}
		]);
	});

	it('caps the audio channels on the transcoding profiles', () => {
		const tuned = applyProfileTuning(profile(), {downmixToStereo: true});
		expect(tuned.TranscodingProfiles[0].MaxAudioChannels).toBe('2');
	});
});
