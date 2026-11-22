import {getVideoDisplayAspectRatio, getZoomDisplayRect, matchDecodedOrientation} from './aspectRatioUtils';

const screen = {width: 1920, height: 1080};

describe('matchDecodedOrientation', () => {
	// A clip stored 848x480 with a 90 degree rotation flag is declared 16:9 but decodes as 480x848.
	it('turns a landscape declaration that decodes portrait', () => {
		expect(matchDecodedOrientation(16 / 9, 480 / 848)).toBeCloseTo(9 / 16);
	});

	it('turns a portrait declaration that decodes landscape', () => {
		expect(matchDecodedOrientation(9 / 16, 848 / 480)).toBeCloseTo(16 / 9);
	});

	it('keeps a declaration that already agrees with the decoder', () => {
		expect(matchDecodedOrientation(16 / 9, 848 / 480)).toBe(16 / 9);
		expect(matchDecodedOrientation(9 / 16, 480 / 848)).toBe(9 / 16);
	});

	it('keeps the declared ratio of an anamorphic source that decodes the same way round', () => {
		expect(matchDecodedOrientation(2.35, 1.78)).toBe(2.35);
	});

	it('leaves a square on either side alone', () => {
		expect(matchDecodedOrientation(1, 480 / 848)).toBe(1);
		expect(matchDecodedOrientation(16 / 9, 1)).toBe(16 / 9);
	});

	it('keeps the declaration until the decoder has reported a size', () => {
		expect(matchDecodedOrientation(16 / 9, null)).toBe(16 / 9);
		expect(matchDecodedOrientation(16 / 9, 0)).toBe(16 / 9);
		expect(matchDecodedOrientation(null, 480 / 848)).toBe(null);
	});

	it('fits a rotated clip as a portrait column instead of the whole screen', () => {
		const rect = getZoomDisplayRect(screen, matchDecodedOrientation(16 / 9, 480 / 848), 'fit');
		expect(rect).toEqual({x: 656, y: 0, width: 608, height: 1080});
	});
});

describe('getVideoDisplayAspectRatio', () => {
	it('reads the declared aspect ratio first', () => {
		const mediaSource = {MediaStreams: [{Type: 'Video', AspectRatio: '16:9', Width: 848, Height: 480}]};
		expect(getVideoDisplayAspectRatio(mediaSource)).toBeCloseTo(16 / 9);
	});

	it('falls back to the stored size', () => {
		const mediaSource = {MediaStreams: [{Type: 'Video', Width: 2160, Height: 3840}]};
		expect(getVideoDisplayAspectRatio(mediaSource)).toBeCloseTo(9 / 16);
	});
});
