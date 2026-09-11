import {isLiveTvLibrary, librariesForNav} from './liveTvLibrary';

const movies = {Id: 'm', CollectionType: 'movies'};
const liveTv = {Id: 'l', CollectionType: 'livetv'};

describe('isLiveTvLibrary', () => {
	test('matches however the server spells it', () => {
		for (const spelling of ['livetv', 'LiveTV', 'LIVETV', 'liveTv']) {
			expect(isLiveTvLibrary({CollectionType: spelling})).toBe(true);
		}
	});

	test('says no to anything else, and to nothing at all', () => {
		expect(isLiveTvLibrary(movies)).toBe(false);
		expect(isLiveTvLibrary({})).toBe(false);
		expect(isLiveTvLibrary(null)).toBe(false);
	});
});

describe('librariesForNav', () => {
	test('drops Live TV once it has a button of its own', () => {
		expect(librariesForNav([movies, liveTv], true)).toEqual([movies]);
	});

	test('keeps it in the list when there is no button', () => {
		expect(librariesForNav([movies, liveTv], false)).toEqual([movies, liveTv]);
	});

	test('copes with nothing to filter', () => {
		expect(librariesForNav(undefined, true)).toEqual([]);
		expect(librariesForNav([], true)).toEqual([]);
	});
});
