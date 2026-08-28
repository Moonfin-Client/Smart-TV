import {
	initialCardCount,
	expandedCardCount,
	searchArtworkOptions,
	shouldMountSearchRow
} from './searchWindow';

describe('search result windowing', () => {
	test('mounts only the active row and its immediate neighbours', () => {
		expect(shouldMountSearchRow(0, 0)).toBe(true);
		expect(shouldMountSearchRow(1, 0)).toBe(true);
		expect(shouldMountSearchRow(2, 0)).toBe(false);
		expect(shouldMountSearchRow(2, 3)).toBe(true);
	});

	test('starts with one screen of cards and expands near the edge', () => {
		expect(initialCardCount(24)).toBe(10);
		expect(initialCardCount(6)).toBe(6);
		expect(expandedCardCount(10, 3, 24)).toBe(10);
		expect(expandedCardCount(10, 8, 24)).toBe(18);
		expect(expandedCardCount(18, 17, 24)).toBe(24);
	});

	// The same sizes and quality the rest of the app asks for, so search reads
	// the images the server already rendered.
	test('sizes artwork for its card shape', () => {
		expect(searchArtworkOptions('poster', 'poster-tag')).toEqual({
			maxHeight: 300,
			quality: 80,
			tag: 'poster-tag'
		});
		expect(searchArtworkOptions('wide')).toEqual({maxWidth: 400, quality: 80});
		expect(searchArtworkOptions('square')).toEqual({maxWidth: 400, quality: 80});
	});
});
