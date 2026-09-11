jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));
jest.mock('./jellyfinApi', () => ({
	HOME_ROW_ITEM_FIELDS: 'Id,Name,Type'
}));

import {loadSinceYouWatchedRows, mergeRecommendations, RECOMMENDATION_FETCH_LIMIT} from './homeRecommendations';
import {
	getSinceYouWatchedSourceOptions,
	getRecommendationSystemSourceOptions
} from '../views/Settings/settingsOptions';

describe('recommendation settings options', () => {
	test('both settings offer the same four engines', () => {
		const values = getRecommendationSystemSourceOptions().map((opt) => opt.value);
		expect(values).toEqual(['local', 'server', 'online', 'hybrid']);
		expect(getSinceYouWatchedSourceOptions()).toEqual(getRecommendationSystemSourceOptions());
	});
});

describe('mergeRecommendations', () => {
	const item = (id) => ({Id: id});

	test('leads with the first list and tops up from the second', () => {
		const merged = mergeRecommendations([item('a')], [item('b'), item('c')], 5);
		expect(merged.map((entry) => entry.Id)).toEqual(['a', 'b', 'c']);
	});

	test('shows an item once however many lists picked it', () => {
		const merged = mergeRecommendations([item('a'), item('b')], [item('b'), item('c')], 5);
		expect(merged.map((entry) => entry.Id)).toEqual(['a', 'b', 'c']);
	});

	test('stops at the limit and copes with a list that never arrived', () => {
		expect(mergeRecommendations([item('a'), item('b')], [item('c')], 2)).toHaveLength(2);
		expect(mergeRecommendations(null, undefined, 5)).toEqual([]);
	});
});

describe('loadSinceYouWatchedRows', () => {
	const mockSeed = {
		Id: 'seed-movie-1',
		Name: 'Inception',
		Type: 'Movie',
		Genres: ['Action', 'Sci-Fi'],
		Tags: ['Dream'],
		People: []
	};

	const makeApi = (overrides = {}) => ({
		getItems: jest.fn().mockResolvedValue({
			Items: [mockSeed]
		}),
		getSimilar: jest.fn().mockResolvedValue({
			Items: [
				{Id: 'sim-1', Name: 'Interstellar', Type: 'Movie', UserData: {Played: false}},
				{Id: 'sim-2', Name: 'Tenet', Type: 'Movie', UserData: {Played: true}}
			]
		}),
		getMoonfinSimilar: jest.fn().mockResolvedValue({
			Items: [
				{Id: 'mf-1', Name: 'Memento', Type: 'Movie', UserData: {Played: false}},
				{Id: 'mf-2', Name: 'The Prestige', Type: 'Movie', UserData: {Played: true}}
			]
		}),
		...overrides
	});

	test('uses Moonbase getMoonfinSimilar when source is local and the server can score', async () => {
		const api = makeApi();
		const settings = {
			sinceYouWatchedSource: 'local',
			sinceYouWatchedIncludeWatched: false,
			recommendationsSupported: true
		};

		const rows = await loadSinceYouWatchedRows(api, settings, [1], false);

		expect(api.getMoonfinSimilar).toHaveBeenCalledWith('seed-movie-1', RECOMMENDATION_FETCH_LIMIT);
		expect(rows).toHaveLength(1);
		expect(rows[0].items).toHaveLength(1);
		expect(rows[0].items[0].Id).toBe('mf-1');
	});

	test('never asks a server that cannot score, and goes straight to client scoring', async () => {
		const api = makeApi({
			getItems: jest.fn().mockImplementation((params) => Promise.resolve({
				Items: params?.SortBy === 'DatePlayed'
					? [mockSeed]
					: [{Id: 'cand-1', Name: 'Dark Knight', Type: 'Movie', Genres: ['Action'], UserData: {Played: false}}]
			}))
		});
		const settings = {sinceYouWatchedSource: 'local', sinceYouWatchedIncludeWatched: false};

		const rows = await loadSinceYouWatchedRows(api, settings, [1], false);

		expect(api.getMoonfinSimilar).not.toHaveBeenCalled();
		expect(rows[0].items[0].Id).toBe('cand-1');
	});

	test('includes watched items in local Moonbase results when includeWatched is true', async () => {
		const api = makeApi();
		const settings = {
			sinceYouWatchedSource: 'local',
			sinceYouWatchedIncludeWatched: true,
			recommendationsSupported: true
		};

		const rows = await loadSinceYouWatchedRows(api, settings, [1], false);

		expect(api.getMoonfinSimilar).toHaveBeenCalledWith('seed-movie-1', RECOMMENDATION_FETCH_LIMIT);
		expect(rows).toHaveLength(1);
		expect(rows[0].items).toHaveLength(2);
	});

	test('falls back to client candidate scoring when Moonbase getMoonfinSimilar fails', async () => {
		const api = makeApi({
			getMoonfinSimilar: jest.fn().mockRejectedValue(new Error('404 Not Found')),
			getItems: jest.fn().mockImplementation((params) => {
				if (params?.SortBy === 'DatePlayed') {
					return Promise.resolve({Items: [mockSeed]});
				}
				// Candidate queries for genres / tags
				return Promise.resolve({
					Items: [
						{Id: 'cand-1', Name: 'Dark Knight', Type: 'Movie', Genres: ['Action'], UserData: {Played: false}}
					]
				});
			})
		});
		const settings = {
			sinceYouWatchedSource: 'local',
			sinceYouWatchedIncludeWatched: false,
			recommendationsSupported: true
		};

		const rows = await loadSinceYouWatchedRows(api, settings, [1], false);

		expect(api.getMoonfinSimilar).toHaveBeenCalled();
		expect(rows).toHaveLength(1);
		expect(rows[0].items[0].Id).toBe('cand-1');
	});

	test('uses api.getSimilar with bypass=moonfin when source is server', async () => {
		const api = makeApi();
		const settings = {
			sinceYouWatchedSource: 'server',
			sinceYouWatchedIncludeWatched: false
		};

		const rows = await loadSinceYouWatchedRows(api, settings, [1], false);

		expect(api.getSimilar).toHaveBeenCalledWith('seed-movie-1', RECOMMENDATION_FETCH_LIMIT, 'moonfin');
		expect(rows).toHaveLength(1);
		expect(rows[0].items).toHaveLength(1);
		expect(rows[0].items[0].Id).toBe('sim-1');
	});

	test('hybrid leads with the server and tops up from the library', async () => {
		const api = makeApi();
		const settings = {
			sinceYouWatchedSource: 'hybrid',
			sinceYouWatchedIncludeWatched: false,
			recommendationsSupported: true
		};

		const rows = await loadSinceYouWatchedRows(api, settings, [1], false);

		expect(api.getSimilar).toHaveBeenCalledWith('seed-movie-1', RECOMMENDATION_FETCH_LIMIT, 'moonfin');
		expect(api.getMoonfinSimilar).toHaveBeenCalledWith('seed-movie-1', RECOMMENDATION_FETCH_LIMIT);
		expect(rows[0].items.map((entry) => entry.Id)).toEqual(['sim-1', 'mf-1']);
	});

	test('hybrid on a server that cannot score tops up from client scoring instead', async () => {
		const api = makeApi({
			getItems: jest.fn().mockImplementation((params) => Promise.resolve({
				Items: params?.SortBy === 'DatePlayed'
					? [mockSeed]
					: [{Id: 'cand-1', Name: 'Dark Knight', Type: 'Movie', Genres: ['Action'], UserData: {Played: false}}]
			}))
		});
		const settings = {sinceYouWatchedSource: 'hybrid', sinceYouWatchedIncludeWatched: false};

		const rows = await loadSinceYouWatchedRows(api, settings, [1], false);

		expect(api.getMoonfinSimilar).not.toHaveBeenCalled();
		expect(rows[0].items.map((entry) => entry.Id)).toEqual(['sim-1', 'cand-1']);
	});

	test('a server answering nothing stays on Jellyfin rather than quietly scoring it', async () => {
		const api = makeApi({
			getSimilar: jest.fn().mockResolvedValue({Items: []}),
			getItems: jest.fn().mockImplementation((params) => Promise.resolve({
				Items: params?.SortBy === 'DatePlayed'
					? [mockSeed]
					: [{Id: 'cand-1', Name: 'Dark Knight', Type: 'Movie', Genres: ['Action'], UserData: {Played: false}}]
			}))
		});
		const settings = {
			sinceYouWatchedSource: 'server',
			sinceYouWatchedIncludeWatched: false,
			recommendationsSupported: true
		};

		const rows = await loadSinceYouWatchedRows(api, settings, [1], false);

		expect(api.getMoonfinSimilar).not.toHaveBeenCalled();
		expect(rows[0].items[0].Id).toBe('cand-1');
	});
});
