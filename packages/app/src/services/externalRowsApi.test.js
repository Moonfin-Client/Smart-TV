import {fetchCustomRow, fetchSeasonalRow, constructSourceUrl, _clearCacheForTesting} from './externalRowsApi';
import {fetchWithTimeout} from '../utils/fetchTimeout';

jest.mock('../utils/fetchTimeout', () => ({fetchWithTimeout: jest.fn()}));
jest.mock('./jellyfinApi', () => ({
	getServerUrl: () => 'http://server',
	getAuthHeader: () => 'MediaBrowser Token="test-token"'
}));

const mockJsonResponse = (data, status = 200) => ({
	ok: status >= 200 && status < 300,
	status,
	json: () => Promise.resolve(data)
});

describe('externalRowsApi', () => {
	beforeEach(() => {
		_clearCacheForTesting();
		fetchWithTimeout.mockReset();
	});

	describe('fetchCustomRow', () => {
		const requestArgs = {
			source: 'mdblist',
			type: 'list_url',
			params: {username: 'testuser', listname: 'my-list'}
		};

		const serverItems = [
			{
				name: 'Spirited Away',
				type: 'Movie',
				productionYear: 2001,
				posterUrl: '/poster.jpg',
				providerIds: {Tmdb: '129'}
			}
		];

		it('fetches items and normalizes them correctly', async () => {
			fetchWithTimeout.mockResolvedValue(mockJsonResponse({
				success: true,
				items: serverItems
			}));

			const items = await fetchCustomRow(requestArgs);
			expect(items).toHaveLength(1);
			expect(items[0].name).toBe('Spirited Away');
			expect(items[0].type).toBe('Movie');
			expect(items[0].productionYear).toBe(2001);
			expect(items[0].providerIds.Tmdb).toBe('129');
			expect(fetchWithTimeout).toHaveBeenCalledTimes(1);

			const [calledUrl] = fetchWithTimeout.mock.calls[0];
			expect(calledUrl).toContain('source=mdblist');
			expect(calledUrl).toContain('type=list_url');
			expect(calledUrl).not.toContain('&language=');
		});

		it('appends language query parameter when options.language is provided', async () => {
			fetchWithTimeout.mockResolvedValue(mockJsonResponse({
				success: true,
				items: serverItems
			}));

			const items = await fetchCustomRow(requestArgs, {language: 'fr-FR'});
			expect(items).toHaveLength(1);

			const [calledUrl] = fetchWithTimeout.mock.calls[0];
			expect(calledUrl).toContain('&language=fr-FR');
		});

		it('partitions cache entries by language tag', async () => {
			const englishItems = [{name: 'Spirited Away', providerIds: {Tmdb: '129'}}];
			const frenchItems = [{name: 'Le Voyage de Chihiro', providerIds: {Tmdb: '129'}}];

			fetchWithTimeout
				.mockResolvedValueOnce(mockJsonResponse({success: true, items: englishItems}))
				.mockResolvedValueOnce(mockJsonResponse({success: true, items: frenchItems}));

			const resEn = await fetchCustomRow(requestArgs, {language: 'en-US'});
			expect(resEn[0].name).toBe('Spirited Away');
			expect(fetchWithTimeout).toHaveBeenCalledTimes(1);

			const resFr = await fetchCustomRow(requestArgs, {language: 'fr-FR'});
			expect(resFr[0].name).toBe('Le Voyage de Chihiro');
			expect(fetchWithTimeout).toHaveBeenCalledTimes(2);

			// Calling en-US again should hit memory cache without network call
			const resEnCached = await fetchCustomRow(requestArgs, {language: 'en-US'});
			expect(resEnCached[0].name).toBe('Spirited Away');
			expect(fetchWithTimeout).toHaveBeenCalledTimes(2);
		});

		it('bypasses cache when forceRefresh is true', async () => {
			fetchWithTimeout
				.mockResolvedValueOnce(mockJsonResponse({success: true, items: serverItems}))
				.mockResolvedValueOnce(mockJsonResponse({success: true, items: serverItems}));

			await fetchCustomRow(requestArgs, {language: 'es-ES'});
			expect(fetchWithTimeout).toHaveBeenCalledTimes(1);

			await fetchCustomRow(requestArgs, {language: 'es-ES', forceRefresh: true});
			expect(fetchWithTimeout).toHaveBeenCalledTimes(2);

			const [secondCallUrl] = fetchWithTimeout.mock.calls[1];
			expect(secondCallUrl).toContain('&refresh=true');
			expect(secondCallUrl).toContain('&language=es-ES');
		});

		it('returns empty array when source or type is missing', async () => {
			const resNoSource = await fetchCustomRow({type: 'list_url'});
			const resNoType = await fetchCustomRow({source: 'mdblist'});
			expect(resNoSource).toEqual([]);
			expect(resNoType).toEqual([]);
			expect(fetchWithTimeout).not.toHaveBeenCalled();
		});
	});

	describe('fetchSeasonalRow', () => {
		it('fetches seasonal row with country query parameter', async () => {
			fetchWithTimeout.mockResolvedValue(mockJsonResponse({
				holiday: 'halloween',
				items: [{Id: '123'}],
				suggestions: []
			}));

			const result = await fetchSeasonalRow({country: 'CA'});
			expect(result).not.toBeNull();
			expect(result.holiday).toBe('halloween');

			const [calledUrl] = fetchWithTimeout.mock.calls[0];
			expect(calledUrl).toContain('country=CA');
		});
	});

	describe('constructSourceUrl', () => {
		it('constructs correct URLs for all supported sources', () => {
			expect(constructSourceUrl('tmdb', 'movie_collection', {id: '10'}))
				.toBe('https://www.themoviedb.org/collection/10');
			expect(constructSourceUrl('tmdb', 'user_list', {id: '20'}))
				.toBe('https://www.themoviedb.org/list/20');
			expect(constructSourceUrl('imdb', 'top_250'))
				.toBe('https://www.imdb.com/chart/top_250');
			expect(constructSourceUrl('letterboxd', 'user_diary', {user: 'alice'}))
				.toBe('https://letterboxd.com/alice/');
			expect(constructSourceUrl('mdblist', 'list_url', {username: 'bob', listname: 'favs'}))
				.toBe('https://mdblist.com/lists/bob/favs');
			expect(constructSourceUrl('unknown', 'type', {}))
				.toBe('');
		});
	});
});
