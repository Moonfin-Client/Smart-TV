import {
	SORT_ALPHABETICAL, SORT_CUSTOM, SORT_RELEASE_ASCENDING, SORT_RELEASE_DESCENDING,
	collectionSortOptions, mergeSavedOrder, orderCollectionIndex, sortLabel
} from './nouveauCollectionSort';
import {indexEntryFor} from '../collectionPlaylist';

const film = (Id, Name, PremiereDate) => indexEntryFor({Id, Name, PremiereDate});

const library = [
	film('c', 'Carol', '2001-01-01'),
	film('a', 'alpha', '1999-01-01'),
	film('b', 'Bravo', '2010-01-01')
];

describe('orderCollectionIndex', () => {
	it('keeps the order the server sent by default', () => {
		expect(orderCollectionIndex(library)).toEqual(['c', 'a', 'b']);
	});

	it('puts a collection in release order on request', () => {
		expect(orderCollectionIndex(library, SORT_RELEASE_ASCENDING)).toEqual(['a', 'c', 'b']);
	});

	it('reverses it on request', () => {
		expect(orderCollectionIndex(library, SORT_RELEASE_DESCENDING)).toEqual(['b', 'c', 'a']);
	});

	it('sorts by name, ignoring case', () => {
		expect(orderCollectionIndex(library, SORT_ALPHABETICAL)).toEqual(['a', 'b', 'c']);
	});

	it('lists a title once however often it turns up', () => {
		expect(orderCollectionIndex([...library, film('a', 'alpha', '1999-01-01')])).toEqual(['c', 'a', 'b']);
	});

	it('leaves the list it was given alone', () => {
		const original = [...library];
		orderCollectionIndex(library, SORT_ALPHABETICAL);
		expect(library).toEqual(original);
	});
});

describe('mergeSavedOrder', () => {
	it('follows a saved order', () => {
		expect(mergeSavedOrder(['b', 'a', 'c'], library)).toEqual(['b', 'a', 'c']);
	});

	it('puts titles added since it was saved on the end in release order', () => {
		expect(mergeSavedOrder(['b'], library)).toEqual(['b', 'a', 'c']);
	});

	it('keeps the saved order as it is, listing each title once', () => {
		expect(mergeSavedOrder(['x', 'b', 'b'], library)).toEqual(['x', 'b', 'a', 'c']);
	});
});

describe('collectionSortOptions', () => {
	it('offers every order, the custom one included', () => {
		expect(collectionSortOptions().map((o) => o.id)).toEqual(['server', 'releaseAscending', 'releaseDescending', 'alphabetical', 'custom']);
	});

	// A remote cannot drag, so the option is named for what it is rather than for a gesture.
	it('names the custom option without promising a gesture', () => {
		expect(sortLabel(SORT_CUSTOM)).toBe('Custom Order');
	});
});
