import {renderHook, waitFor} from '@testing-library/react';

import useExternalRows from './useExternalRows';
import {memoryCache, resetEmptySections} from './browseCache';
import {fetchExternalPresetRow} from '../../utils/externalHomeRows';
import {fetchWatchingNow} from '../../services/mdblistApi';

jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));
jest.mock('../../services/storage', () => ({
	getFromStorage: async () => null,
	saveToStorage: async () => {},
	removeFromStorage: async () => {}
}));
jest.mock('../../utils/externalHomeRows', () => ({
	getExternalHomeRowConfigs: () => [{id: 'tmdb_popular_movies', title: 'Popular Movies'}],
	fetchExternalPresetRow: jest.fn(),
	fetchCustomHomeRow: jest.fn(),
	fetchCalendarRows: jest.fn(),
	buildSeasonalRow: jest.fn(),
	formatWatchingNowSubtitle: jest.fn(() => '1,000 watching now'),
	normalizeWatchingNowItem: jest.fn((item, idx) => ({Id: `ext-${idx}`, Name: item.title, Rank: idx + 1}))
}));
jest.mock('../../services/externalRowsApi', () => ({fetchSeasonalRow: jest.fn()}));
jest.mock('../../services/mdblistApi', () => ({fetchWatchingNow: jest.fn()}));
jest.mock('../../services/jellyfinApi', () => ({__esModule: true, resolveItemsByProviderIds: async (items) => items}));
jest.mock('../../utils/deviceCountry', () => ({resolveDeviceCountry: async () => 'US'}));

const settings = {useMoonfinPlugin: true};
const homeRows = [{id: 'tmdb_popular_movies', enabled: true}];

const load = async () => {
	const {result} = renderHook(() => useExternalRows({settings, homeRows, kidsMode: false}));
	expect(result.current.pending.map((row) => row.id)).toEqual(['tmdb_popular_movies']);
	await waitFor(() => expect(result.current.pending).toEqual([]));
};

beforeEach(() => {
	resetEmptySections();
	jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('empty external rows', () => {
	test('a row that came back empty holds no place on the next load', async () => {
		fetchExternalPresetRow.mockResolvedValue([]);
		await load();
		expect(memoryCache.emptySections.has('tmdb_popular_movies')).toBe(true);
	});

	test("a failed load isn't taken for an empty row", async () => {
		fetchExternalPresetRow.mockRejectedValue(new Error('offline'));
		await load();
		expect(memoryCache.emptySections.has('tmdb_popular_movies')).toBe(false);
	});

	test('watching now excludes items without imdb_id or tmdb_id', async () => {
		const {normalizeWatchingNowItem} = require('../../utils/externalHomeRows');
		normalizeWatchingNowItem.mockImplementation((item, idx) => ({Id: `ext-${idx}`, Name: item.title, Rank: idx + 1}));
		fetchWatchingNow.mockResolvedValue({
			items: [
				{title: 'Valid Movie', imdb_id: 'tt123456'},
				{title: 'Invalid Movie', public_id: 'pub123'}
			]
		});
		const testSettings = {useMoonfinPlugin: true, mdblistWatchingNowEnabled: true};
		const testHomeRows = [{id: 'mdblist_watching_now', enabled: true}];
		const {result} = renderHook(() => useExternalRows({settings: testSettings, homeRows: testHomeRows, kidsMode: false}));
		await waitFor(() => expect(result.current.rows.length).toBe(1));
		expect(result.current.rows[0].items.length).toBe(1);
		expect(result.current.rows[0].items[0].Name).toBe('Valid Movie');
	});
});
