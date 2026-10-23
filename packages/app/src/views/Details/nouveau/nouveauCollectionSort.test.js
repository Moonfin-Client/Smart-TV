import {
	SORT_ALPHABETICAL, SORT_CUSTOM, SORT_RELEASE_ASCENDING, SORT_RELEASE_DESCENDING, SORT_SERVER,
	applyCollectionSort, collectionSortOptions, sortLabel
} from './nouveauCollectionSort';

const film = (Id, Name, PremiereDate) => ({Id, Name, PremiereDate});
const ids = (items) => items.map((i) => i.Id);
const names = (items) => items.map((i) => i.Name);

const library = [
	film('c', 'Carol', '2001-01-01'),
	film('a', 'Alpha', '1999-01-01'),
	film('b', 'Bravo', '2010-01-01')
];

describe('applyCollectionSort', () => {
	it('puts a collection in release order by default', () => {
		expect(ids(applyCollectionSort(library))).toEqual(['a', 'c', 'b']);
	});

	it('keeps the order the server sent on request', () => {
		expect(ids(applyCollectionSort(library, SORT_SERVER))).toEqual(['c', 'a', 'b']);
	});

	it('puts a collection in release order on request', () => {
		expect(ids(applyCollectionSort(library, SORT_RELEASE_ASCENDING))).toEqual(['a', 'c', 'b']);
	});

	it('reverses it on request', () => {
		expect(ids(applyCollectionSort(library, SORT_RELEASE_DESCENDING))).toEqual(['b', 'c', 'a']);
	});

	it('sorts by name, ignoring case', () => {
		expect(names(applyCollectionSort(library, SORT_ALPHABETICAL))).toEqual(['Alpha', 'Bravo', 'Carol']);
	});

	it('follows a saved order when there is one', () => {
		expect(ids(applyCollectionSort(library, SORT_CUSTOM, ['b', 'a', 'c']))).toEqual(['b', 'a', 'c']);
	});

	it('appends unlisted items in release order when using a saved order', () => {
		expect(ids(applyCollectionSort(library, SORT_CUSTOM, ['b']))).toEqual(['b', 'a', 'c']);
	});

	it('falls back to the server order when the saved one is empty', () => {
		expect(ids(applyCollectionSort(library, SORT_CUSTOM, []))).toEqual(['c', 'a', 'b']);
	});

	it('leaves the list it was given alone', () => {
		const original = [...library];
		applyCollectionSort(library, SORT_ALPHABETICAL);
		expect(library).toEqual(original);
	});
});

describe('collectionSortOptions', () => {
	it('offers the custom order only where one can be kept', () => {
		expect(collectionSortOptions(false).map((o) => o.id)).not.toContain('custom');
		expect(collectionSortOptions(true).map((o) => o.id)).toContain('custom');
	});

	// A remote cannot drag, so the option is named for what it is rather than for a gesture.
	it('names the custom option without promising a gesture', () => {
		expect(sortLabel(SORT_CUSTOM)).toBe('Custom Order');
	});
});
