import {expandedCardCount, initialCardCount, shouldMountRow} from './rowWindow';

describe('row windowing', () => {
	it('mounts only the active row and its immediate neighbours', () => {
		expect(shouldMountRow(0, 0)).toBe(true);
		expect(shouldMountRow(1, 0)).toBe(true);
		expect(shouldMountRow(2, 0)).toBe(false);
		expect(shouldMountRow(2, 3)).toBe(true);
	});

	it('starts with one screen of cards and expands near the edge', () => {
		expect(initialCardCount(24)).toBe(10);
		expect(initialCardCount(6)).toBe(6);
		expect(expandedCardCount(10, 3, 24)).toBe(10);
		expect(expandedCardCount(10, 8, 24)).toBe(18);
		expect(expandedCardCount(18, 17, 24)).toBe(24);
	});

	it('mounts past the card a row opens on', () => {
		expect(initialCardCount(24, 1)).toBe(10);
		expect(initialCardCount(24, 9)).toBe(18);
		expect(initialCardCount(12, 9)).toBe(12);
	});

	it('never grows past what there is', () => {
		expect(expandedCardCount(10, 9, 12)).toBe(12);
		expect(initialCardCount(0)).toBe(0);
		expect(initialCardCount()).toBe(0);
	});
});
