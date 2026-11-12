import {PORTRAIT_HEIGHT, boxArtCell, boxArtNeedsFill, medianAspect, gameDisplayTitle, gameHeadline} from './gameArt';

describe('boxArtCell', () => {
	test('art with no size is the portrait card', () => {
		expect(boxArtCell(null)).toEqual({width: 1, height: PORTRAIT_HEIGHT});
		expect(boxArtCell(0)).toEqual({width: 1, height: PORTRAIT_HEIGHT});
		expect(boxArtCell(Infinity)).toEqual({width: 1, height: PORTRAIT_HEIGHT});
	});

	test('portrait and square art keep the width and get shorter', () => {
		expect(boxArtCell(1)).toEqual({width: 1, height: 1});
		expect(boxArtCell(0.8).height).toBeCloseTo(1.25);
	});

	test('art taller than the portrait card stops at it', () => {
		expect(boxArtCell(0.5)).toEqual({width: 1, height: PORTRAIT_HEIGHT});
	});

	test('landscape art widens up to half again', () => {
		const cell = boxArtCell(512 / 357);
		expect(cell.width).toBeCloseTo(1 + (512 / 357 - 1) * 1.16);
		expect(cell.width / cell.height).toBeCloseTo(512 / 357);
		expect(boxArtCell(3)).toEqual({width: 1.5, height: 1});
	});
});

describe('boxArtNeedsFill', () => {
	test('art within five percent of its card fills it', () => {
		expect(boxArtNeedsFill(0.72, 0.746)).toBe(false);
		expect(boxArtNeedsFill(1, 0.746)).toBe(true);
	});

	test('art with no size is left alone', () => {
		expect(boxArtNeedsFill(null, 1)).toBe(false);
	});
});

describe('medianAspect', () => {
	test('takes the middle shape, or the mean of the middle two', () => {
		expect(medianAspect(new Map([['a', 1.4], ['b', 0.7], ['c', 1]]))).toBe(1);
		expect(medianAspect(new Map([['a', 0.7], ['b', 1]]))).toBeCloseTo(0.85);
	});

	test('no sizes, no shape', () => {
		expect(medianAspect(new Map())).toBeNull();
	});
});

describe('game titles', () => {
	test('a name copied through a Mac or Samba share reads as typed', () => {
		expect(gameDisplayTitle('Super Mario Bros\uF029', 'Super Mario Bros. (World).nes')).toBe('Super Mario Bros.');
		expect(gameDisplayTitle('Zelda\uF022 A Link', 'z.sfc')).toBe('Zelda: A Link');
	});

	test('the headline drops trailing No-Intro tags', () => {
		expect(gameHeadline('Sonic The Hedgehog 2 (World) (Rev B)', 's.md')).toBe('Sonic The Hedgehog 2');
	});
});
