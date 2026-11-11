import {nouveauSectionOrder, seerrDiscoveryExpected, shouldIncludeDiscovery} from './nouveauSections';

// The order and the gates are checked against the builder alone, so a page can be proven without
// drawing one.

describe('nouveauSectionOrder', () => {
	it('offers episodes to a series and a season, and to nothing else', () => {
		expect(nouveauSectionOrder({type: 'Series'})).toContain('episodes');
		expect(nouveauSectionOrder({type: 'Season'})).toContain('episodes');
		expect(nouveauSectionOrder({type: 'Movie'})).not.toContain('episodes');
		expect(nouveauSectionOrder({type: 'Episode'})).not.toContain('episodes');
	});

	// Chapters answer to the list rather than the type, which is the one gate that surprises.
	it('shows chapters for anything that carries them', () => {
		['Movie', 'Episode', 'Video'].forEach((type) => {
			expect(nouveauSectionOrder({type, chapterCount: 1})).toContain('chapters');
		});
		expect(nouveauSectionOrder({type: 'Video'})).not.toContain('chapters');
	});

	it('lists a book series\' books and leaves out the details of the book it features', () => {
		expect(nouveauSectionOrder({type: 'Book', isBookSeries: true})).toEqual(['books']);
		expect(nouveauSectionOrder({type: 'Book'})).toEqual(['details']);
	});

	it('gives a box set its collection and nothing it has no people or extras for', () => {
		const sections = nouveauSectionOrder({type: 'BoxSet'});
		expect(sections).toContain('collection');
		expect(sections).not.toContain('people');
		expect(sections).not.toContain('extras');
		expect(sections).not.toContain('discovery');
	});

	it('shows people when either list has somebody in it', () => {
		expect(nouveauSectionOrder({type: 'Movie', actorCount: 1})).toContain('people');
		expect(nouveauSectionOrder({type: 'Movie', directorCount: 1})).toContain('people');
		expect(nouveauSectionOrder({type: 'Movie'})).not.toContain('people');
	});

	it('ends every page with the details footer, however little else there is', () => {
		expect(nouveauSectionOrder({type: 'Episode'})).toEqual(['details']);
		expect(nouveauSectionOrder({}).at(-1)).toBe('details');
	});

	// A movie is not the example to reach for above, because it keeps a discovery slot from the
	// start and only gives it up once the lookup has come back with nothing.
	it('holds a discovery slot on a movie until its lookup lands', () => {
		expect(nouveauSectionOrder({type: 'Movie'})).toEqual(['discovery', 'details']);
		expect(nouveauSectionOrder({type: 'Movie', similarLoaded: true})).toEqual(['details']);
	});

	it('keeps the sections in Core order', () => {
		const sections = nouveauSectionOrder({
			type: 'Series',
			chapterCount: 2,
			extraCount: 1,
			actorCount: 3,
			similarLoaded: true,
			similarCount: 4
		});
		expect(sections).toEqual(['episodes', 'chapters', 'extras', 'discovery', 'people', 'details']);
	});

	it('puts reviews right after discovery, and only when there are some', () => {
		const state = {type: 'Movie', actorCount: 1, similarLoaded: true, similarCount: 2};
		expect(nouveauSectionOrder({...state, reviewCount: 3})).toEqual(['discovery', 'reviews', 'people', 'details']);
		expect(nouveauSectionOrder(state)).not.toContain('reviews');
	});

	it("puts a movie's other parts ahead of its extras", () => {
		expect(nouveauSectionOrder({type: 'Movie', partCount: 1, extraCount: 2, similarLoaded: true}))
			.toEqual(['additionalParts', 'extras', 'details']);
		expect(nouveauSectionOrder({type: 'Movie', similarLoaded: true})).not.toContain('additionalParts');
	});

	it('puts the collections a title belongs to after its extras and ahead of discovery', () => {
		expect(nouveauSectionOrder({type: 'Movie', extraCount: 1, parentCollectionCount: 2}))
			.toEqual(['extras', 'parentCollections', 'discovery', 'details']);
		expect(nouveauSectionOrder({type: 'Movie', extraCount: 1})).not.toContain('parentCollections');
	});

	it('leaves a box set to its own collection rather than the ones it belongs to', () => {
		const sections = nouveauSectionOrder({type: 'BoxSet', parentCollectionCount: 1});
		expect(sections).toContain('collection');
		expect(sections).not.toContain('parentCollections');
	});
});

describe('shouldIncludeDiscovery', () => {
	it('takes no interest in a type that has no recommendations of its own', () => {
		expect(shouldIncludeDiscovery({type: 'Episode', similarLoaded: true, similarCount: 9})).toBe(false);
		expect(shouldIncludeDiscovery({type: 'BoxSet', similarLoaded: true, similarCount: 9})).toBe(false);
	});

	// Holding the rail open while the answer is out is what stops it appearing late and shoving
	// everything below it down the page.
	it('holds its place while the lookup is still out', () => {
		expect(shouldIncludeDiscovery({type: 'Movie', similarLoaded: false})).toBe(true);
	});

	it('stays for a library answer and goes when there is nothing behind it', () => {
		expect(shouldIncludeDiscovery({type: 'Movie', similarLoaded: true, similarCount: 1})).toBe(true);
		expect(shouldIncludeDiscovery({type: 'Movie', similarLoaded: true})).toBe(false);
	});

	it('waits on seerr only when seerr was ever going to answer', () => {
		const base = {type: 'Movie', similarLoaded: true, similarCount: 0};
		expect(shouldIncludeDiscovery({...base, seerrExpected: true, seerrResolved: false})).toBe(true);
		expect(shouldIncludeDiscovery({...base, seerrExpected: true, seerrResolved: true})).toBe(false);
		expect(shouldIncludeDiscovery({
			...base, seerrExpected: true, seerrResolved: true, seerrRecommendationCount: 2
		})).toBe(true);
	});
});

describe('seerrDiscoveryExpected', () => {
	it('needs the plugin and an id seerr can look the title up by', () => {
		expect(seerrDiscoveryExpected({type: 'Movie', seerrAvailable: true, tmdbId: '42'})).toBe(true);
		expect(seerrDiscoveryExpected({type: 'Movie', seerrAvailable: true, imdbId: 'tt1'})).toBe(true);
		expect(seerrDiscoveryExpected({type: 'Movie', seerrAvailable: true})).toBe(false);
		expect(seerrDiscoveryExpected({type: 'Movie', tmdbId: '42'})).toBe(false);
		expect(seerrDiscoveryExpected({type: 'Season', seerrAvailable: true, tmdbId: '42'})).toBe(false);
	});
});
