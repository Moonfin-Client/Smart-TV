import {contrastRatio, ensureVisible, MIN_BUTTON_CONTRAST, readableInk} from './themeSpec';

const DARK = ['#FF101010', '#FF1A1A1A'];

describe('ensureVisible', () => {
	it('leaves a color that already reads exactly as picked', () => {
		expect(ensureVisible('#ff0000', DARK)).toBe('#ff0000');
		expect(ensureVisible('#ffffff', DARK)).toBe('#ffffff');
	});

	it('lifts black over dark surfaces until it can be seen, and no further', () => {
		const lifted = ensureVisible('#000000', DARK);
		expect(lifted).not.toBe('#000000');
		DARK.forEach((surface) => expect(contrastRatio(lifted, surface)).toBeGreaterThanOrEqual(MIN_BUTTON_CONTRAST));
		// One step back would have been too dark, so this is the smallest nudge that works.
		expect(contrastRatio(lifted, '#101010')).toBeLessThan(MIN_BUTTON_CONTRAST * 1.4);
	});

	it('keeps the hue of a dark color it has to lift', () => {
		const [r, g, b] = [1, 3, 5].map((i) => parseInt(ensureVisible('#000080', DARK).slice(i, i + 2), 16));
		expect(b).toBeGreaterThan(r);
		expect(b).toBeGreaterThan(g);
	});

	it('darkens white over light surfaces', () => {
		const darkened = ensureVisible('#ffffff', ['#FFF5F5F5']);
		expect(darkened).not.toBe('#ffffff');
		expect(contrastRatio(darkened, '#f5f5f5')).toBeGreaterThanOrEqual(MIN_BUTTON_CONTRAST);
	});

	it('asks nothing of a caller that names no surface', () => {
		expect(ensureVisible('#000000', [])).toBe('#000000');
		expect(ensureVisible('#000000')).toBe('#000000');
	});
});

describe('readableInk', () => {
	it('keeps the preferred ink where it reads on the fill', () => {
		expect(readableInk('#003366', '#FFFFFFFF')).toBe('rgb(255, 255, 255)');
	});

	it('swaps to dark ink on a fill the preferred ink would vanish on', () => {
		expect(readableInk('#ffffff', '#FFFFFFFF')).toBe('rgba(0, 0, 0, 0.92)');
		expect(readableInk('#ffff00', '#FFFFFFFF')).toBe('rgba(0, 0, 0, 0.92)');
	});

	it('picks by the fill alone when there is no preference', () => {
		expect(readableInk('#000000')).toBe('rgba(255, 255, 255, 0.92)');
	});
});
