import {clampIndex, initialOf, initialsColor, slotOf} from './profileCarousel';

describe('profileCarousel', () => {
	test('initialsColor sums the id and wraps over the six colors', () => {
		// 97 + 98 + 99 = 294, and 294 % 6 = 0
		expect(initialsColor('abc')).toBe('#2B6CB0');
		// 97 + 98 + 100 = 295, and 295 % 6 = 1
		expect(initialsColor('abd')).toBe('#9C4221');
		expect(initialsColor(undefined)).toBe('#2B6CB0');
	});

	test('initialOf takes the first letter in upper case', () => {
		expect(initialOf('alex')).toBe('A');
		expect(initialOf('  sam')).toBe('S');
		expect(initialOf('')).toBe('');
		expect(initialOf(null)).toBe('');
	});

	test('clampIndex keeps the selection on the list', () => {
		expect(clampIndex(-1, 3)).toBe(0);
		expect(clampIndex(5, 3)).toBe(2);
		expect(clampIndex(1, 3)).toBe(1);
	});

	test('slotOf shows two either side and parks the rest past the edge', () => {
		expect(slotOf(4, 4)).toBe(0);
		expect(slotOf(2, 4)).toBe(-2);
		expect(slotOf(0, 4)).toBe(-3);
		expect(slotOf(9, 4)).toBe(3);
	});
});
