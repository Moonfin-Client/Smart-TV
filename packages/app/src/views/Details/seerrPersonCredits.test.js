import {groupSeerrCredits, filterSeerrCredits, creditAsCard, seerrPersonCards} from './seerrPersonCredits';

jest.mock('../../services/seerrApi', () => ({
	getImageUrl: (path, size) => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null),
	getPersonCombinedCredits: jest.fn()
}));

const credit = (over) => ({id: 1, title: 'A Film', poster_path: '/a.jpg', media_type: 'movie', ...over});

describe('filterSeerrCredits', () => {
	it('drops the credits with no artwork', () => {
		expect(filterSeerrCredits([credit({id: 1}), credit({id: 2, poster_path: null})]).map((c) => c.id)).toEqual([1]);
	});

	it('drops the courtesy crew jobs but keeps them for a cast list', () => {
		const list = [credit({id: 1, job: 'Director'}), credit({id: 2, job: 'Thanks'}), credit({id: 3, job: 'Special Thanks'})];
		expect(filterSeerrCredits(list, true).map((c) => c.id)).toEqual([1]);
		expect(filterSeerrCredits(list, false).map((c) => c.id)).toEqual([1, 2, 3]);
	});
});

describe('groupSeerrCredits', () => {
	it('folds a title credited twice into one entry naming both jobs', () => {
		const list = [credit({id: 5, job: 'Director'}), credit({id: 5, job: 'Writer'})];
		const grouped = groupSeerrCredits(list, true);
		expect(grouped).toHaveLength(1);
		expect(grouped[0]._credit).toBe('Director, Writer');
	});

	it('names the character rather than the job for a cast list', () => {
		const grouped = groupSeerrCredits([credit({id: 5, character: 'Ripley', job: 'Director'})], false);
		expect(grouped[0]._credit).toBe('Ripley');
	});

	it('says nothing when the credit carries no part at all', () => {
		expect(groupSeerrCredits([credit({id: 5})], false)[0]._credit).toBeNull();
	});

	it('lists a repeated part once', () => {
		const grouped = groupSeerrCredits([credit({id: 5, job: 'Producer'}), credit({id: 5, job: 'Producer'})], true);
		expect(grouped[0]._credit).toBe('Producer');
	});

	it('keeps separate titles apart', () => {
		expect(groupSeerrCredits([credit({id: 1}), credit({id: 2})], false)).toHaveLength(2);
	});

	it('keeps a movie and a show apart when they share an id', () => {
		const list = [credit({id: 5, media_type: 'movie'}), credit({id: 5, media_type: 'tv', title: undefined, name: 'A Show'})];
		expect(groupSeerrCredits(list, false)).toHaveLength(2);
	});
});

describe('creditAsCard', () => {
	it('carries the credit line and stable cardKey onto the card', () => {
		const cardWithCreditId = creditAsCard({...credit({id: 9, character: 'Ripley', credit_id: 'cid-999'}), _credit: 'Ripley'});
		expect(cardWithCreditId.Id).toBe('seerr-movie-9');
		expect(cardWithCreditId.Name).toBe('A Film');
		expect(cardWithCreditId._seerrCredit).toBe('Ripley');
		expect(cardWithCreditId.cardKey).toBe('cid-999');
		expect(cardWithCreditId._externalPosterUrl).toBe('https://image.tmdb.org/t/p/w342/a.jpg');

		const cardFallbackKey = creditAsCard({...credit({id: 9, character: 'Ripley'}), _credit: 'Ripley'});
		expect(cardFallbackKey.cardKey).toBe('movie-9-Ripley');
	});
});

describe('seerrPersonCards', () => {
	const list = [
		credit({id: 1, title: 'Zulu', release_date: '2001-01-01', job: 'Director'}),
		credit({id: 2, title: 'Alpha', release_date: '2010-01-01', job: 'Writer'}),
		credit({id: 1, title: 'Zulu', release_date: '2001-01-01', job: 'Writer'})
	];

	it('keeps every credit and names its own part unless grouping is on', () => {
		const cards = seerrPersonCards(list, true, {personPageGroupItems: false, personPageSortOption: 'alphabetical'});
		expect(cards.map((c) => c._seerrCredit)).toEqual(['Writer', 'Director', 'Writer']);
	});

	it('folds the repeats when grouping is on', () => {
		const cards = seerrPersonCards(list, true, {personPageGroupItems: true, personPageSortOption: 'alphabetical'});
		expect(cards.map((c) => c._seerrCredit)).toEqual(['Writer', 'Director, Writer']);
	});

	it('orders by release date when asked', () => {
		const cards = seerrPersonCards(list, true, {personPageGroupItems: true, personPageSortOption: 'releaseDateDesc'});
		expect(cards.map((c) => c.Name)).toEqual(['Alpha', 'Zulu']);
	});
});
