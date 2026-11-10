import {renderHook, waitFor} from '@testing-library/react';

import useExternalRows from './useExternalRows';
import {memoryCache, resetEmptySections} from './browseCache';
import {fetchCalendarRows, fetchExternalPresetRow, normalizeWatchingNowItem} from '../../utils/externalHomeRows';
import {fetchWatchingNow} from '../../services/mdblistApi';
import {resolveItemsByProviderIds} from '../../services/jellyfinApi';

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
jest.mock('../../services/jellyfinApi', () => ({__esModule: true, resolveItemsByProviderIds: jest.fn(async (items) => items)}));
jest.mock('../../utils/deviceCountry', () => ({resolveDeviceCountry: async () => 'US'}));

const settings = {useMoonfinPlugin: true};
const homeRows = [{id: 'tmdb_popular_movies', enabled: true}];
const watchingNowSettings = {useMoonfinPlugin: true, mdblistWatchingNowEnabled: true};
const watchingNowRows = [{id: 'mdblist_watching_now', enabled: true}];

const load = async () => {
	const {result} = renderHook(() => useExternalRows({settings, homeRows, kidsMode: false}));
	expect(result.current.pending.map((row) => row.id)).toEqual(['tmdb_popular_movies']);
	await waitFor(() => expect(result.current.pending).toEqual([]));
};

beforeEach(() => {
	resetEmptySections();
	resolveItemsByProviderIds.mockImplementation(async (items) => items);
	normalizeWatchingNowItem.mockImplementation((item, idx) => ({Id: `ext-${idx}`, Name: item.title, Rank: idx + 1}));
	jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	jest.useRealTimers();
	jest.restoreAllMocks();
});

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
		fetchWatchingNow.mockResolvedValue({
			items: [
				{title: 'Valid Movie', imdb_id: 'tt123456'},
				{title: 'Invalid Movie', public_id: 'pub123'}
			]
		});
		const {result} = renderHook(() => useExternalRows({settings: watchingNowSettings, homeRows: watchingNowRows, kidsMode: false}));
		await waitFor(() => expect(result.current.rows.length).toBe(1));
		expect(result.current.rows[0].items.length).toBe(1);
		expect(result.current.rows[0].items[0].Name).toBe('Valid Movie');
	});

	test('watching now skips its refresh while the app is hidden', async () => {
		jest.useFakeTimers();
		fetchWatchingNow.mockClear();
		fetchWatchingNow.mockResolvedValue({items: [{title: 'Valid Movie', imdb_id: 'tt123456'}]});
		let hidden = true;
		jest.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
		renderHook(() => useExternalRows({settings: watchingNowSettings, homeRows: watchingNowRows, kidsMode: false}));
		await jest.advanceTimersByTimeAsync(5 * 60 * 1000);
		expect(fetchWatchingNow).toHaveBeenCalledTimes(1);
		hidden = false;
		await jest.advanceTimersByTimeAsync(5 * 60 * 1000);
		expect(fetchWatchingNow).toHaveBeenCalledTimes(2);
		expect(fetchWatchingNow).toHaveBeenLastCalledWith(null, {forceRefresh: true});
	});

	test("a slow watching now feed doesn't hold back the other rows", async () => {
		fetchWatchingNow.mockReturnValue(new Promise(() => {}));
		fetchExternalPresetRow.mockResolvedValue([{Id: 'a', Name: 'A'}]);
		const bothRows = [...homeRows, ...watchingNowRows];
		const {result} = renderHook(() => useExternalRows({settings: watchingNowSettings, homeRows: bothRows, kidsMode: false}));
		await waitFor(() => expect(result.current.rows.map((row) => row.id)).toEqual(['tmdb_popular_movies']));
		expect(result.current.pending.map((row) => row.id)).toEqual(['mdblist_watching_now']);
	});

	test('owned watching now titles become library items', async () => {
		fetchWatchingNow.mockResolvedValue({items: [{title: 'Valid Movie', imdb_id: 'tt123456'}]});
		resolveItemsByProviderIds.mockImplementation(async (items) => items.map((item) => ({...item, Id: 'library-id', _resolvedFromExternal: true})));
		const {result} = renderHook(() => useExternalRows({settings: watchingNowSettings, homeRows: watchingNowRows, kidsMode: false}));
		await waitFor(() => expect(result.current.rows.length).toBe(1));
		expect(result.current.rows[0].items[0]).toMatchObject({Id: 'library-id', _resolvedFromExternal: true, Rank: 1});
	});
});

describe('calendar rows', () => {
	test('a new date format rebuilds them in that order', async () => {
		fetchCalendarRows.mockResolvedValue([]);
		const rows = [{id: 'radarr_calendar', enabled: true}];
		const {rerender} = renderHook(
			({dateFormat}) => useExternalRows({settings: {useMoonfinPlugin: true, dateFormat}, homeRows: rows, kidsMode: false}),
			{initialProps: {dateFormat: 'system'}}
		);
		await waitFor(() => expect(fetchCalendarRows).toHaveBeenLastCalledWith(expect.objectContaining({dateFormat: 'system'}), expect.anything()));

		rerender({dateFormat: 'dayMonth'});
		await waitFor(() => expect(fetchCalendarRows).toHaveBeenLastCalledWith(expect.objectContaining({dateFormat: 'dayMonth'}), expect.anything()));
	});
});
