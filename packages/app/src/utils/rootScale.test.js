import {rem, stylePx} from './rootScale';

describe('stylePx', () => {
	afterEach(() => {
		document.documentElement.style.fontSize = '';
	});

	test('reads a px length as it is', () => {
		expect(stylePx('133px')).toBe(133);
	});

	test('reads a rem() length at the root font the UI scale sets', () => {
		document.documentElement.style.fontSize = '24px';
		expect(stylePx(rem(120))).toBeCloseTo(120);
		document.documentElement.style.fontSize = '30px';
		expect(stylePx(rem(120))).toBeCloseTo(150);
	});

	test('reads a missing length as zero', () => {
		expect(stylePx('')).toBe(0);
	});
});
