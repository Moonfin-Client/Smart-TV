jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));
jest.mock('./uiLocale', () => ({uiLocale: () => 'en-US'}));

import {
	clearTmdbReviewsCache, loadTmdbReviews, parseReviews, reviewDateLabel, reviewInitial,
	reviewMeta, reviewPreview, reviewRatingLabel, reviewsLanguage, reviewsQuery
} from './tmdbReviews';

const answer = (reviews) => ({success: true, totalResults: reviews.length, reviews});

describe('the TMDB reviews helpers', () => {
	beforeEach(() => clearTmdbReviewsCache());

	it('asks only about films and shows that carry a TMDB id', () => {
		expect(reviewsQuery({Type: 'Movie', ProviderIds: {Tmdb: 557}})).toEqual({tmdbId: '557', type: 'movie'});
		expect(reviewsQuery({Type: 'Series', ProviderIds: {Tmdb: '105248'}})).toEqual({tmdbId: '105248', type: 'tv'});
		expect(reviewsQuery({Type: 'Episode', ProviderIds: {Tmdb: '1'}})).toBeNull();
		expect(reviewsQuery({Type: 'Movie', ProviderIds: {}})).toBeNull();
		expect(reviewsQuery(null)).toBeNull();
	});

	it('keeps what the cards draw and drops the TMDB link and empty reviews', () => {
		const reviews = parseReviews(answer([
			{id: 'a', author: ' Brett Pascoe ', rating: 9, content: 'Great.', createdAt: '2021-06-23T10:11:12.000Z', avatarUrl: 'https://img/a.jpg', url: 'https://www.themoviedb.org/review/a'},
			{id: 'b', author: 'Nobody', rating: null, content: '   ', avatarUrl: null},
			{author: 'Sam', rating: 'nine', content: 'Fine.', avatarUrl: 'data:image/png;base64,AAAA'}
		]));
		expect(reviews).toEqual([
			{id: 'a', author: 'Brett Pascoe', rating: 9, content: 'Great.', createdAt: '2021-06-23T10:11:12.000Z', avatarUrl: 'https://img/a.jpg'},
			{id: '1', author: 'Sam', rating: null, content: 'Fine.', createdAt: null, avatarUrl: null}
		]);
	});

	it('reads a failure as no answer at all', () => {
		expect(parseReviews({success: false, error: 'TMDB is down'})).toBeNull();
		expect(parseReviews(null)).toBeNull();
	});

	it('asks once per title and language, and asks again after a failure', async () => {
		const api = {getTmdbReviews: jest.fn().mockResolvedValue(answer([{id: 'a', author: 'A', content: 'x'}]))};
		const query = {tmdbId: '557', type: 'movie'};
		expect(await loadTmdbReviews(api, query, 'en-US')).toHaveLength(1);
		expect(await loadTmdbReviews(api, query, 'en-US')).toHaveLength(1);
		expect(api.getTmdbReviews).toHaveBeenCalledTimes(1);
		expect(api.getTmdbReviews).toHaveBeenCalledWith('557', 'movie', 'en-US');

		const failing = {getTmdbReviews: jest.fn().mockRejectedValue(new Error('offline'))};
		expect(await loadTmdbReviews(failing, {tmdbId: '1', type: 'tv'}, 'en-US')).toEqual([]);
		expect(await loadTmdbReviews(failing, {tmdbId: '1', type: 'tv'}, 'en-US')).toEqual([]);
		expect(failing.getTmdbReviews).toHaveBeenCalledTimes(2);
		expect(await loadTmdbReviews({}, query, 'de-DE')).toEqual([]);
	});

	it('sends a real language tag, even when the interface follows the system', () => {
		expect(reviewsLanguage('pt-BR')).toBe('pt-BR');
		expect(reviewsLanguage('de')).toBe('de');
		expect(reviewsLanguage('system')).toBe(window.navigator.language);
		expect(reviewsLanguage('')).toBe(window.navigator.language);
	});

	it('writes the rating, the date, the initial and a one line preview', () => {
		expect(reviewRatingLabel(9)).toBe('9 / 10');
		expect(reviewRatingLabel(7.5)).toBe('7.5 / 10');
		expect(reviewRatingLabel(null)).toBe('');
		expect(reviewDateLabel('2021-06-23T10:11:12.000Z')).toBe('Jun 23, 2021');
		expect(reviewDateLabel('not a date')).toBe('');
		expect(reviewMeta({rating: 8, createdAt: '2024-02-14T12:00:00.000Z'})).toBe('8 / 10 · Feb 14, 2024');
		expect(reviewMeta({rating: null, createdAt: null})).toBe('');
		expect(reviewInitial(' brett')).toBe('B');
		expect(reviewInitial('')).toBe('?');
		expect(reviewPreview('## A heading\n\nSome **bold** words and a [link](https://x.y).\n\n> quoted')).toBe('A heading Some bold words and a link. quoted');
	});
});
