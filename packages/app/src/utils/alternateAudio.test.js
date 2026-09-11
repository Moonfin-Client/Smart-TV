import {selectCompatibleAlternateAudio} from './alternateAudio';

// Samsung decodes no DTS on any set, so that is the codec that sends the
// negotiation looking for a stand-in.
const playableOnSamsung = (stream) => !/^dts/i.test(stream.Codec || '');

const audio = (index, codec, extra = {}) => ({
	Type: 'Audio', Index: index, Codec: codec, Language: 'eng', Channels: 6, ...extra
});

// The file from issue #411: a DTS main mix and two English commentaries, all 5.1.
const issue411Streams = [
	audio(1, 'dts', {DisplayTitle: 'DTS - English - 5.1 - Default', Title: 'DTS', IsDefault: true}),
	audio(2, 'aac', {DisplayTitle: 'Commentary - English - HE-AAC - 5.1', Title: 'Commentary'}),
	audio(17, 'aac', {DisplayTitle: 'Commentary 2 - English - HE-AAC - 5.1', Title: 'Commentary 2'}),
	{Type: 'Subtitle', Index: 3, Codec: 'subrip', Language: 'eng'}
];

describe('selectCompatibleAlternateAudio', () => {
	test('never stands in a commentary for an unplayable default', () => {
		const alternate = selectCompatibleAlternateAudio(
			issue411Streams, issue411Streams[0], playableOnSamsung);

		// No main mix the set can decode, so the caller has to transcode instead.
		expect(alternate).toBeNull();
	});

	test('takes a real alternate mix in the same language', () => {
		const streams = [
			audio(1, 'truehd', {Title: 'TrueHD Atmos', IsDefault: true, Channels: 8}),
			audio(2, 'eac3', {Title: 'Surround'}),
			audio(3, 'aac', {Title: 'Stereo', Channels: 2})
		];

		const alternate = selectCompatibleAlternateAudio(
			streams, streams[0], (s) => s.Codec !== 'truehd');

		expect(alternate.Index).toBe(2);
	});

	test('prefers the widest mix among the candidates', () => {
		const streams = [
			audio(1, 'dts', {IsDefault: true}),
			audio(2, 'aac', {Title: 'Stereo', Channels: 2}),
			audio(3, 'eac3', {Title: 'Surround', Channels: 6})
		];

		expect(selectCompatibleAlternateAudio(streams, streams[0], playableOnSamsung).Index).toBe(3);
	});

	test('stays in the language of the default track', () => {
		const streams = [
			audio(1, 'dts', {IsDefault: true}),
			audio(2, 'eac3', {Language: 'fra'})
		];

		expect(selectCompatibleAlternateAudio(streams, streams[0], playableOnSamsung)).toBeNull();
	});

	test('rules out a description track the same way', () => {
		const streams = [
			audio(1, 'dts', {IsDefault: true}),
			audio(2, 'eac3', {Title: 'English Audio Description'}),
			audio(3, 'eac3', {IsAudioDescription: true})
		];

		expect(selectCompatibleAlternateAudio(streams, streams[0], playableOnSamsung)).toBeNull();
	});

	test('ignores tracks the set cannot decode either', () => {
		const streams = [
			audio(1, 'dts', {IsDefault: true}),
			audio(2, 'dts-hd', {Title: 'DTS-HD MA'})
		];

		expect(selectCompatibleAlternateAudio(streams, streams[0], playableOnSamsung)).toBeNull();
	});

	test('has nothing to choose without a default track', () => {
		expect(selectCompatibleAlternateAudio(issue411Streams, null, playableOnSamsung)).toBeNull();
		expect(selectCompatibleAlternateAudio(null, issue411Streams[0], playableOnSamsung)).toBeNull();
	});
});
