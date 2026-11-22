import {getPlayMethod} from '../../../platform-tizen/src/video';

describe('Tizen DOVIInvalid', () => {
	const source = {Container: 'mkv', SupportsDirectPlay: true, SupportsDirectStream: true,
		MediaStreams: [{Type: 'Video', Codec: 'hevc', VideoRangeType: 'DOVIInvalid'}, {Type: 'Audio', Codec: 'aac'}]};

	test('direct plays on an HDR10 panel without Dolby Vision', () => {
		expect(getPlayMethod(source, {hevc: true, hdr10: true, dolbyVision: false}, {})).toBe('DirectPlay');
	});

	test('does not direct play on a panel without HDR10', () => {
		expect(getPlayMethod(source, {hevc: true, hdr10: false, dolbyVision: false}, {})).not.toBe('DirectPlay');
	});
});
