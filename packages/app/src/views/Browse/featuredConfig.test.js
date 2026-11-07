import {featuredConfigKey} from './featuredConfig';

const base = {
	useMoonfinPlugin: false,
	mediaBarSourceType: 'random',
	featuredContentType: 'Movie,Series',
	featuredItemCount: 20,
	mediaBarLibraryIds: ['lib1'],
	mediaBarCollectionIds: [],
	excludedGenres: []
};

describe('featuredConfigKey', () => {
	test('two draws under the same settings share a key', () => {
		expect(featuredConfigKey(base)).toBe(featuredConfigKey({...base}));
	});

	// An unset list and an empty one are the same bar.
	test('an unset list reads the same as an empty one', () => {
		const unset = {...base, mediaBarLibraryIds: undefined, mediaBarCollectionIds: undefined, excludedGenres: undefined, mediaBarExternalLists: undefined};
		const empty = {...base, mediaBarLibraryIds: [], mediaBarCollectionIds: [], excludedGenres: [], mediaBarExternalLists: []};
		expect(featuredConfigKey(unset)).toBe(featuredConfigKey(empty));
	});

	test('an unset source type reads as the random default', () => {
		expect(featuredConfigKey({...base, mediaBarSourceType: undefined}))
			.toBe(featuredConfigKey({...base, mediaBarSourceType: 'random'}));
	});

	test('unified mode changes the key', () => {
		expect(featuredConfigKey(base, true)).not.toBe(featuredConfigKey(base, false));
	});

	// Each of these changes what the bar holds.
	test.each([
		['useMoonfinPlugin', {useMoonfinPlugin: true}],
		['mediaBarSourceType', {mediaBarSourceType: 'recentlyAdded'}],
		['mediaBarSourceType', {mediaBarSourceType: 'newReleases'}],
		['mediaBarNewReleaseDays', {mediaBarNewReleaseDays: 7}],
		['featuredContentType', {featuredContentType: 'Movie'}],
		['featuredItemCount', {featuredItemCount: 40}],
		['mediaBarLibraryIds', {mediaBarLibraryIds: ['lib2']}],
		['mediaBarCollectionIds', {mediaBarCollectionIds: ['col1']}],
		['excludedGenres', {excludedGenres: ['Horror']}],
		['mediaBarExternalLists', {mediaBarExternalLists: ['imdb_top_250_movies']}],
		['kidsModeEnabled', {kidsModeEnabled: true}]
	])('%s changes the key', (_label, change) => {
		expect(featuredConfigKey({...base, ...change})).not.toBe(featuredConfigKey(base));
	});
});
