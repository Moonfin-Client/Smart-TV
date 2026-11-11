import {hydrateRecentlyAddedItems} from './seerrHydration';
import {normalizeMediaItem} from './seerrHomeRows';
import seerrApi from '../services/seerrApi';

jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));
jest.mock('../services/seerrApi', () => {
	const api = {getMovie: jest.fn(), getTv: jest.fn(), getImageUrl: (path) => `img${path}`};
	return {__esModule: true, default: api, ...api};
});

describe('hydrateRecentlyAddedItems', () => {
	test("turns Seerr's media records into cards with the title's name and art", async () => {
		seerrApi.getMovie.mockResolvedValue({title: 'Heat', posterPath: '/heat.jpg', backdropPath: '/heat-bg.jpg', releaseDate: '1995-12-15'});
		seerrApi.getTv.mockResolvedValue({name: 'Severance', posterPath: '/sev.jpg', firstAirDate: '2022-02-18'});
		const records = [
			{id: 41, tmdbId: 949, mediaType: 'movie', status: 5, jellyfinMediaId: 'jf-heat'},
			{id: 42, tmdbId: 95396, mediaType: 'tv', status: 4}
		];
		const cards = (await hydrateRecentlyAddedItems(records)).map(normalizeMediaItem);

		expect(cards.map((card) => [card.Id, card.Name, card.Type, card.ProductionYear])).toEqual([
			['seerr-movie-949', 'Heat', 'Movie', 1995],
			['seerr-tv-95396', 'Severance', 'Series', 2022]
		]);
		expect(cards[0]).toMatchObject({_externalPosterUrl: 'img/heat.jpg', _seerrLibraryId: 'jf-heat', mediaInfo: {status: 5}, _seerrRaw: {mediaId: 949}});
		expect(seerrApi.getMovie).toHaveBeenCalledWith(949);
	});

	test("keeps a record whose details can't be read, by its TMDB id", async () => {
		seerrApi.getMovie.mockRejectedValue(new Error('500'));
		const [item] = await hydrateRecentlyAddedItems([{id: 7, tmdbId: 603, mediaType: 'movie', status: 5}]);
		expect(item).toMatchObject({id: 603, mediaType: 'movie'});
		expect(item.title).toBeUndefined();
	});
});
