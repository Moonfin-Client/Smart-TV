jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));
jest.mock('./jellyfinApi', () => ({
	HOME_ROW_ITEM_FIELDS: 'Id,Name,Type'
}));

import {loadSinceYouWatchedRows} from './homeRecommendations';
import {
	getSinceYouWatchedSourceOptions,
	getRecommendationSystemSourceOptions
} from '../views/Settings/settingsOptions';

describe('recommendation settings options', () => {
	test('getSinceYouWatchedSourceOptions provides local, server, and online options', () => {
		const options = getSinceYouWatchedSourceOptions();
		const values = options.map((opt) => opt.value);
		expect(values).toContain('local');
		expect(values).toContain('server');
		expect(values).toContain('online');
	});

	test('getRecommendationSystemSourceOptions provides local, server, and online options', () => {
		const options = getRecommendationSystemSourceOptions();
		const values = options.map((opt) => opt.value);
		expect(values).toContain('local');
		expect(values).toContain('server');
		expect(values).toContain('online');
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

	test('uses Moonbase getMoonfinSimilar when source is local and Moonbase is available', async () => {
		const api = makeApi();
		const settings = {
			sinceYouWatchedSource: 'local',
			sinceYouWatchedIncludeWatched: false
		};

		const rows = await loadSinceYouWatchedRows(api, settings, [1], false);

		expect(api.getMoonfinSimilar).toHaveBeenCalledWith('seed-movie-1', 100);
		expect(rows).toHaveLength(1);
		expect(rows[0].items).toHaveLength(1);
		expect(rows[0].items[0].Id).toBe('mf-1');
	});

	test('includes watched items in local Moonbase results when includeWatched is true', async () => {
		const api = makeApi();
		const settings = {
			sinceYouWatchedSource: 'local',
			sinceYouWatchedIncludeWatched: true
		};

		const rows = await loadSinceYouWatchedRows(api, settings, [1], false);

		expect(api.getMoonfinSimilar).toHaveBeenCalledWith('seed-movie-1', 100);
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
			sinceYouWatchedIncludeWatched: false
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

		expect(api.getSimilar).toHaveBeenCalledWith('seed-movie-1', 100, 'moonfin');
		expect(rows).toHaveLength(1);
		expect(rows[0].items).toHaveLength(1);
		expect(rows[0].items[0].Id).toBe('sim-1');
	});
});
