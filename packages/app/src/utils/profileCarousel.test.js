import {clampIndex, initialOf, initialsColor, reachFor, slotOf, unitsWide} from './profileCarousel';

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

	test('slotOf shows two either side and parks the rest one step past them', () => {
		expect(slotOf(4, 4)).toBe(0);
		expect(slotOf(2, 4)).toBe(-2);
		expect(slotOf(0, 4)).toBe(-3);
		expect(slotOf(9, 4)).toBe(3);
	});

	test('slotOf parks the rest one step past a longer reach', () => {
		expect(slotOf(1, 4, 3)).toBe(-3);
		expect(slotOf(0, 4, 3)).toBe(-4);
		expect(slotOf(9, 4, 1)).toBe(2);
	});

	test('reachFor grows with the width and keeps clear of the edge', () => {
		expect(reachFor(699)).toBe(1);
		expect(reachFor(700)).toBe(2);
		// A third step needs its own width plus a gap past it on both sides.
		expect(reachFor(1003)).toBe(2);
		expect(reachFor(1004)).toBe(3);
		// The switcher and Who's watching are 1034 units wide on a TV.
		expect(reachFor(1034)).toBe(3);
		expect(reachFor(1228)).toBe(4);
		expect(reachFor(10000)).toBe(5);
		expect(reachFor(0)).toBe(2);
		expect(reachFor(Infinity)).toBe(2);
	});

	test('unitsWide measures the strip by the face drawn at 168 units', () => {
		expect(unitsWide(1726, 280.5)).toBeCloseTo(1033.75, 2);
		expect(unitsWide(800, 0)).toBe(0);
	});
});
