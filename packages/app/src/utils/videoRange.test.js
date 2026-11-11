import {baseLayerLabel, isHdrVideoStream, findVideoStream, isHdrOutput, videoRangeBadges, videoRangeLabel, videoRangeTypeOf} from './videoRange';

describe('isHdrVideoStream', () => {
	it.each(['HDR10', 'HDR10Plus', 'HLG', 'DOVI'])('treats %s as HDR', (rangeType) => {
		expect(isHdrVideoStream({VideoRangeType: rangeType})).toBe(true);
	});

	it('treats SDR as not HDR', () => {
		expect(isHdrVideoStream({VideoRangeType: 'SDR'})).toBe(false);
	});

	it('falls back to VideoRange when the type is missing', () => {
		expect(isHdrVideoStream({VideoRange: 'HDR'})).toBe(true);
		expect(isHdrVideoStream({VideoRange: 'SDR'})).toBe(false);
	});

	it('prefers the type over the coarse field', () => {
		expect(isHdrVideoStream({VideoRangeType: 'SDR', VideoRange: 'HDR'})).toBe(false);
	});

	it('handles missing input', () => {
		expect(isHdrVideoStream(null)).toBe(false);
		expect(isHdrVideoStream({})).toBe(false);
	});

	it('reads an Emby stream from the fields Emby fills in', () => {
		expect(isHdrVideoStream({ExtendedVideoType: 'Hdr10'})).toBe(true);
		expect(isHdrVideoStream({VideoRange: 'HDR 10'})).toBe(true);
		expect(isHdrVideoStream({ExtendedVideoType: 'None'})).toBe(false);
	});
});

describe('videoRangeLabel', () => {
	it.each([
		['DOVI', 'Dolby Vision'],
		['DOVIWithHDR10', 'Dolby Vision'],
		['HDR10Plus', 'HDR10+'],
		['HDR10', 'HDR10'],
		['HLG', 'HLG'],
		['SDR', 'SDR']
	])('reads a Jellyfin %s as %s', (rangeType, expected) => {
		expect(videoRangeLabel({VideoRangeType: rangeType})).toBe(expected);
	});

	it.each([
		['Hdr10', 'HDR10'],
		['Hdr10Plus', 'HDR10+'],
		['HyperLogGamma', 'HLG'],
		['DolbyVision', 'Dolby Vision'],
		['None', 'SDR']
	])('reads an Emby %s as %s', (extended, expected) => {
		expect(videoRangeLabel({ExtendedVideoType: extended})).toBe(expected);
	});

	it('reads the range written out as prose', () => {
		expect(videoRangeLabel({VideoRange: 'HDR 10'})).toBe('HDR10');
		expect(videoRangeLabel({VideoRange: 'HDR 10+'})).toBe('HDR10+');
		expect(videoRangeLabel({VideoRange: 'Dolby Vision'})).toBe('Dolby Vision');
		expect(videoRangeLabel({VideoRange: 'HDR'})).toBe('HDR');
	});

	it('takes the typed field over the prose written from it', () => {
		expect(videoRangeLabel({ExtendedVideoType: 'None', VideoRange: 'HDR 10'})).toBe('SDR');
	});

	it('says SDR when the server gave nothing', () => {
		expect(videoRangeLabel(null)).toBe('SDR');
		expect(videoRangeLabel({})).toBe('SDR');
		expect(videoRangeLabel({VideoRangeType: '   '})).toBe('SDR');
	});
});

describe('findVideoStream', () => {
	it('picks the video stream out of a media source', () => {
		const source = {MediaStreams: [{Type: 'Audio'}, {Type: 'Video', Codec: 'hevc'}]};

		expect(findVideoStream(source).Codec).toBe('hevc');
	});

	it('returns null when there is none', () => {
		expect(findVideoStream({MediaStreams: [{Type: 'Audio'}]})).toBeNull();
		expect(findVideoStream(null)).toBeNull();
	});
});

describe('isHdrOutput', () => {
	const hdrSource = {MediaStreams: [{Type: 'Video', VideoRangeType: 'HDR10'}]};

	it('is HDR when an HDR stream is not being transcoded', () => {
		expect(isHdrOutput(hdrSource, false)).toBe(true);
	});

	it('is not HDR while transcoding', () => {
		expect(isHdrOutput(hdrSource, true)).toBe(false);
	});

	it('is not HDR for an SDR source', () => {
		expect(isHdrOutput({MediaStreams: [{Type: 'Video', VideoRangeType: 'SDR'}]}, false)).toBe(false);
	});
});

// A Dolby Vision stream as Emby describes it: no VideoRangeType, the profile typed in
// ExtendedVideoSubType and VideoRange derived from it.
const embyDolbyVision = (subType) => ({
	Type: 'Video',
	Codec: 'hevc',
	ExtendedVideoType: 'DolbyVision',
	ExtendedVideoSubType: subType,
	VideoRange: 'DolbyVision'
});

describe('videoRangeTypeOf', () => {
	it('keeps the range type Jellyfin gives', () => {
		expect(videoRangeTypeOf({VideoRangeType: 'DOVIWithHDR10', ExtendedVideoSubType: 'DoviProfile50'})).toBe('DOVIWithHDR10');
	});

	it.each(['DoviProfile81', 'DoviProfile61'])('reads Emby %s as Dolby Vision over an HDR10 base layer', (subType) => {
		expect(videoRangeTypeOf(embyDolbyVision(subType))).toBe('DOVIWithHDR10');
	});

	it('reads an Emby profile 5 as the bare Dolby Vision it is', () => {
		expect(videoRangeTypeOf(embyDolbyVision('DoviProfile50'))).toBe('DOVI');
	});

	it('reads an Emby profile 7 as carrying an enhancement layer', () => {
		expect(videoRangeTypeOf(embyDolbyVision('DoviProfile76'))).toBe('DOVIWithEL');
	});

	it('asks for a Dolby Vision decoder when the profile has no HDR10 base layer or is missing', () => {
		expect(videoRangeTypeOf(embyDolbyVision('DoviProfile84'))).toBe('DolbyVision');
		expect(videoRangeTypeOf(embyDolbyVision(undefined))).toBe('DolbyVision');
		expect(videoRangeTypeOf({Type: 'Video', VideoRange: 'DolbyVision'})).toBe('DolbyVision');
	});

	it("leaves a stream that isn't Dolby Vision to the other checks", () => {
		expect(videoRangeTypeOf({Type: 'Video', ExtendedVideoType: 'Hdr10', VideoRange: 'HDR 10'})).toBe('');
		expect(videoRangeTypeOf({Type: 'Video'})).toBe('');
		expect(videoRangeTypeOf(null)).toBe('');
	});
});

describe('baseLayerLabel', () => {
	it.each([
		['DOVIWithHDR10', 'HDR10'],
		['DOVIWithHDR10Plus', 'HDR10+'],
		['DOVIWithHLG', 'HLG'],
		['DOVIWithSDR', 'SDR'],
		['DOVIWithEL', 'HDR10'],
		['DOVIWithELHDR10Plus', 'HDR10+']
	])('names the layer under a Jellyfin %s as %s', (rangeType, expected) => {
		expect(baseLayerLabel({VideoRangeType: rangeType})).toBe(expected);
	});

	it('reads the layer under an Emby profile from its sub type', () => {
		expect(baseLayerLabel(embyDolbyVision('DoviProfile81'))).toBe('HDR10');
		expect(baseLayerLabel(embyDolbyVision('DoviProfile76'))).toBe('HDR10');
	});

	it('has nothing to name for bare Dolby Vision or a stream without it', () => {
		expect(baseLayerLabel({VideoRangeType: 'DOVI'})).toBeNull();
		expect(baseLayerLabel(embyDolbyVision('DoviProfile50'))).toBeNull();
		expect(baseLayerLabel({VideoRangeType: 'HDR10'})).toBeNull();
		expect(baseLayerLabel(null)).toBeNull();
	});
});

describe('videoRangeBadges', () => {
	it('names the Dolby Vision profile, then the layer it falls back to', () => {
		expect(videoRangeBadges({VideoRangeType: 'DOVIWithHDR10Plus', DvProfile: 8})).toEqual(['DV P8', 'HDR10+']);
		expect(videoRangeBadges({VideoRangeType: 'DOVIWithHDR10', DvProfile: 8})).toEqual(['DV P8', 'HDR10']);
		expect(videoRangeBadges({VideoRangeType: 'DOVI', DvProfile: 5})).toEqual(['DV P5']);
		expect(videoRangeBadges({VideoRangeType: 'DOVIWithHLG', DvProfile: 8})).toEqual(['DV P8', 'HLG']);
	});

	it("reads Emby's profile from ExtendedVideoSubType", () => {
		expect(videoRangeBadges({ExtendedVideoType: 'DolbyVision', ExtendedVideoSubType: 'DoviProfile81'})).toEqual(['DV P8', 'HDR10']);
		expect(videoRangeBadges({ExtendedVideoType: 'DolbyVision', ExtendedVideoSubType: 'DoviProfile84'})).toEqual(['DV P8', 'HLG']);
		expect(videoRangeBadges({ExtendedVideoType: 'DolbyVision', ExtendedVideoSubType: 'DoviProfile100'})).toEqual(['DV P10']);
	});

	it('keeps the HDR10 under a profile 7 enhancement layer', () => {
		expect(videoRangeBadges({VideoRangeType: 'DOVIWithEL', DvProfile: 7})).toEqual(['DV P7', 'HDR10']);
	});

	it('says DV alone without a profile, and nothing for an SDR fallback', () => {
		expect(videoRangeBadges({VideoRangeType: 'DOVI'})).toEqual(['DV']);
		expect(videoRangeBadges({VideoRangeType: 'DOVIWithSDR', DvProfile: 8})).toEqual(['DV P8']);
	});

	it('reads Dolby Vision the server calls invalid as its VideoRange', () => {
		expect(videoRangeBadges({VideoRangeType: 'DOVIInvalid', VideoRange: 'HDR'})).toEqual(['HDR']);
		expect(videoRangeBadges({VideoRangeType: 'DOVIInvalid', VideoRange: 'SDR'})).toEqual(['SDR']);
	});

	it('has no badge for a stream with no range field', () => {
		expect(videoRangeBadges({})).toEqual([]);
		expect(videoRangeBadges(null)).toEqual([]);
	});

	it('is the plain range label without Dolby Vision', () => {
		expect(videoRangeBadges({VideoRangeType: 'HDR10Plus'})).toEqual(['HDR10+']);
		expect(videoRangeBadges({VideoRangeType: 'SDR'})).toEqual(['SDR']);
	});
});
