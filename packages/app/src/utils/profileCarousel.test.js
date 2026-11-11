import {FAR_STEP, clampIndex, initialOf, initialsColor, reachFor, slotOf} from './profileCarousel';

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

	test('reachFor grows with the width and keeps clear of the edge', () => {
		expect(reachFor(699)).toBe(1);
		expect(reachFor(700)).toBe(2);
		// A third step needs its own width plus a gap past it on both sides
		expect(reachFor(1003)).toBe(2);
		expect(reachFor(1004)).toBe(3);
		expect(reachFor(1228)).toBe(4);
		expect(reachFor(0)).toBe(2);
		expect(reachFor(Infinity)).toBe(2);
	});

	test('slotOf sizes and fades by distance', () => {
		expect(slotOf(4, 4, 2)).toEqual({distance: 0, visible: true, x: 0, scale: 1, opacity: 1});
		expect(slotOf(3, 4, 2)).toMatchObject({x: -188, opacity: 0.55});
		expect(slotOf(2, 4, 2)).toMatchObject({x: -314, opacity: 0.3});
		expect(slotOf(5, 4, 2).scale).toBeCloseTo(100 / 168);
		expect(slotOf(6, 4, 2).scale).toBeCloseTo(72 / 168);
	});

	test('slotOf shows as far as the reach and parks the rest one step past it', () => {
		expect(slotOf(1, 4, 3)).toMatchObject({visible: true, x: -(314 + FAR_STEP), opacity: 0.3});
		expect(slotOf(0, 4, 3)).toMatchObject({visible: false, x: -(314 + 2 * FAR_STEP), opacity: 0});
		expect(slotOf(9, 4, 3)).toMatchObject({visible: false, x: 314 + 2 * FAR_STEP});
		expect(slotOf(7, 4, 2)).toMatchObject({visible: false, x: 314 + FAR_STEP});
		expect(slotOf(6, 4, 1)).toMatchObject({visible: false, x: 314, opacity: 0});
	});
});
