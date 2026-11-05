import {
	clampSecondaryDelay, isSecondaryEligible, restoreSecondaryIndex, secondaryCandidates,
	secondaryCueText, secondarySelection, secondaryTextStyle
} from './secondarySubtitle';

const TICKS_PER_SECOND = 10000000;

const stream = (index, overrides = {}) => ({
	index,
	codec: 'srt',
	language: 'eng',
	displayTitle: `Track ${index}`,
	isExternal: false,
	isForced: false,
	isHearingImpaired: false,
	isTextBased: true,
	...overrides
});

describe('isSecondaryEligible', () => {
	it('takes SRT and WebVTT only', () => {
		expect(isSecondaryEligible(stream(1, {codec: 'subrip'}))).toBe(true);
		expect(isSecondaryEligible(stream(1, {codec: 'WebVTT'}))).toBe(true);
		expect(isSecondaryEligible(stream(1, {codec: 'ass'}))).toBe(false);
		expect(isSecondaryEligible(stream(1, {codec: 'pgssub', isTextBased: false}))).toBe(false);
	});

	it("leaves out text the server can't extract", () => {
		expect(isSecondaryEligible(stream(1, {isEmbeddedNative: true}))).toBe(false);
	});

	it('leaves out a track read out of the playing file', () => {
		expect(isSecondaryEligible(stream(1, {inBandText: {streamUrl: 'u', ordinal: 0}}))).toBe(false);
	});
});

describe('secondaryCandidates', () => {
	it('drops the primary track and moves the preferred language to the top', () => {
		const streams = [stream(1), stream(2, {language: 'spa'}), stream(3, {language: 'fre'}), stream(4, {codec: 'ass'})];

		const result = secondaryCandidates(streams, 1, {preferredLanguage: 'fre'});

		expect(result.map((s) => s.index)).toEqual([3, 2]);
	});

	it('keeps the primary picker order without a preferred language', () => {
		const streams = [stream(5, {isExternal: true}), stream(2), stream(3)];

		expect(secondaryCandidates(streams, -1, {}).map((s) => s.index)).toEqual([2, 3, 5]);
		expect(secondaryCandidates(streams, -1, {preferExternal: true}).map((s) => s.index)).toEqual([5, 2, 3]);
	});
});

describe('remembered secondary track', () => {
	it('saves off for no track', () => {
		expect(secondarySelection([stream(1)], -1)).toEqual({off: true});
		expect(secondarySelection([stream(1)], 9)).toEqual({off: true});
	});

	it('restores the same track by index', () => {
		const streams = [stream(1), stream(2, {language: 'spa'})];
		const saved = JSON.parse(JSON.stringify(secondarySelection(streams, 2)));

		expect(restoreSecondaryIndex(saved, streams)).toBe(2);
	});

	it('finds the track again when its index moved', () => {
		const spanish = {language: 'spa', displayTitle: 'Spanish'};
		const saved = secondarySelection([stream(1), stream(2, spanish)], 2);
		const moved = [stream(4), stream(7, spanish)];

		expect(restoreSecondaryIndex(saved, moved)).toBe(7);
	});

	it('reads off and nothing saved apart', () => {
		expect(restoreSecondaryIndex({off: true}, [stream(1)])).toBe(-1);
		expect(restoreSecondaryIndex(undefined, [stream(1)])).toBeUndefined();
	});

	it('gives up when the track is gone', () => {
		const saved = secondarySelection([stream(1), stream(2, {language: 'spa'})], 2);

		expect(restoreSecondaryIndex(saved, [stream(1)])).toBe(-1);
	});

	it('falls back to the position when two tracks look the same', () => {
		const streams = [stream(1, {displayTitle: 'Same'}), stream(2, {displayTitle: 'Same'})];
		const saved = secondarySelection(streams, 2);
		const renumbered = [stream(5, {displayTitle: 'Same'}), stream(6, {displayTitle: 'Same'})];

		expect(restoreSecondaryIndex(saved, renumbered)).toBe(6);
	});
});

describe('secondaryCueText', () => {
	const events = [
		{StartPositionTicks: 10 * TICKS_PER_SECOND, EndPositionTicks: 12 * TICKS_PER_SECOND, Text: 'one'},
		{StartPositionTicks: 11 * TICKS_PER_SECOND, EndPositionTicks: 13 * TICKS_PER_SECOND, Text: 'two'}
	];

	it('joins the lines showing at the position', () => {
		expect(secondaryCueText(events, 11.5 * TICKS_PER_SECOND)).toBe('one\ntwo');
		expect(secondaryCueText(events, 20 * TICKS_PER_SECOND)).toBeNull();
	});

	it('holds the lines back by a positive delay', () => {
		expect(secondaryCueText(events, 10.5 * TICKS_PER_SECOND, 1)).toBeNull();
		expect(secondaryCueText(events, 11.5 * TICKS_PER_SECOND, 1)).toBe('one');
	});
});

describe('secondary layout', () => {
	it('clamps the delay to five seconds either way', () => {
		expect(clampSecondaryDelay(7)).toBe(5);
		expect(clampSecondaryDelay(-5.1)).toBe(-5);
		expect(clampSecondaryDelay(0.3)).toBe(0.3);
	});

	it('follows the primary size and color until they are set', () => {
		const primary = {fontSize: '44px', color: '#ffffff', textShadow: 'x'};

		expect(secondaryTextStyle({secondarySubtitleSize: 0, secondarySubtitleColor: ''}, primary))
			.toEqual({...primary, marginBottom: '8px'});
		expect(secondaryTextStyle({secondarySubtitleSize: 60, secondarySubtitleColor: '#ffff00'}, primary))
			.toEqual({fontSize: '60px', color: '#ffff00', textShadow: 'x', marginBottom: '8px'});
	});
});
