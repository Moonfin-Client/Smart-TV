import {act, renderHook, waitFor} from '@testing-library/react';

import {getMovie, getWatchlist} from '../../services/seerrApi';
import {parentalFilterFromRatings} from '../../utils/parentalFilter';
import useFavoriteTabs from './useFavoriteTabs';

jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (text) => text}));
jest.mock('../../services/connectionPool', () => ({}));
jest.mock('../../services/jellyfinApi', () => ({getServerType: () => 'silo'}));
jest.mock('../../services/seerrApi', () => {
	const seerr = {getWatchlist: jest.fn(), getMovie: jest.fn(), getTv: jest.fn(), getImageUrl: (path) => `http://img${path}`};
	return {__esModule: true, ...seerr, default: seerr};
});
jest.mock('../../utils/seerrHydration', () => ({hydrateWatchlistItems: async (items) => items}));
let mockFilter = null;
jest.mock('../../services/parentalControls', () => {
	const {withoutBlocked} = jest.requireActual('../../utils/parentalFilter');
	return {getActiveParentalFilter: () => mockFilter, withoutBlockedItems: (items) => withoutBlocked(items, mockFilter)};
});

// The watchlist titles the library lacks, as Silo lists them: poster and age rating, but no backdrop or runtime.
const title = (id, contentRating) => ({id, mediaType: 'movie', title: `Film ${id}`, posterPath: `/p${id}.jpg`, releaseDate: '2026-01-02', contentRating});
const detail = (id, over = {}) => ({id, title: `Film ${id}`, backdropPath: `/b${id}.jpg`, runtime: 100 + id, overview: 'A story.', ...over});

// Holds each detail read until the test lets it go.
const pendingDetails = () => {
	const waiting = {};
	getMovie.mockImplementation((id) => new Promise((resolve) => { waiting[id] = resolve; }));
	return waiting;
};

const api = {getItems: jest.fn(async () => ({Items: [], TotalRecordCount: 0}))};
const setup = () => renderHook(() => useFavoriteTabs({api, sortBy: 'SortName', sortOrder: 'Ascending', unifiedMode: false, serverType: 'jellyfin', requestsReady: true}));
const watchlist = (result) => result.current.itemsByKey.watchlist;

beforeEach(() => {
	mockFilter = parentalFilterFromRatings([]);
	api.getItems.mockImplementation(async () => ({Items: [], TotalRecordCount: 0}));
});

test('the cards show at once and each takes its own detail as it arrives', async () => {
	getWatchlist.mockResolvedValue({page: 1, totalPages: 1, totalResults: 2, results: [title(1, 'PG'), title(2, 'PG-13')]});
	const waiting = pendingDetails();
	const {result} = setup();
	await waitFor(() => expect(watchlist(result)).toHaveLength(2));
	expect(watchlist(result)[0]).toMatchObject({Name: 'Film 1', OfficialRating: 'PG', _externalBackdropUrl: null});
	await waitFor(() => expect(waiting[2]).toBeDefined());
	await act(async () => waiting[2](detail(2)));
	expect(watchlist(result)[1]).toMatchObject({_externalBackdropUrl: 'http://img/b2.jpg', RunTimeTicks: 102 * 600000000, ProductionYear: 2026});
	expect(watchlist(result)[0]._externalBackdropUrl).toBeNull();
	await act(async () => waiting[1](detail(1)));
	expect(watchlist(result)[0]._externalBackdropUrl).toBe('http://img/b1.jpg');
});

test('with a rating blocked, an unrated card and a blocked one stay out, and the rest still fill in', async () => {
	mockFilter = parentalFilterFromRatings(['R']);
	getWatchlist.mockResolvedValue({page: 1, totalPages: 1, totalResults: 3, results: [title(1), title(2, 'PG'), title(3, 'R')]});
	const waiting = pendingDetails();
	const {result} = setup();
	await waitFor(() => expect(watchlist(result).map((c) => c.Name)).toEqual(['Film 2']));
	await waitFor(() => expect(waiting[2]).toBeDefined());
	await act(async () => waiting[2](detail(2)));
	expect(watchlist(result)).toMatchObject([{Name: 'Film 2', _externalBackdropUrl: 'http://img/b2.jpg'}]);
	expect(waiting[1]).toBeUndefined();
	expect(waiting[3]).toBeUndefined();
});

test('a failed read leaves its card as it was', async () => {
	getWatchlist.mockResolvedValue({page: 1, totalPages: 1, totalResults: 1, results: [title(1, 'PG')]});
	getMovie.mockRejectedValue(new Error('timeout'));
	const {result} = setup();
	await waitFor(() => expect(getMovie).toHaveBeenCalled());
	expect(watchlist(result)[0]).toMatchObject({Name: 'Film 1', _externalBackdropUrl: null});
});

test('a reload drops the reads still waiting and starts its own', async () => {
	getWatchlist.mockResolvedValue({page: 1, totalPages: 1, totalResults: 4, results: [1, 2, 3, 4].map((id) => title(id, 'PG'))});
	const waiting = pendingDetails();
	const {result, rerender} = renderHook((props) => useFavoriteTabs(props), {
		initialProps: {api, sortBy: 'SortName', sortOrder: 'Ascending', unifiedMode: false, serverType: 'jellyfin', requestsReady: true}
	});
	await waitFor(() => expect(Object.keys(waiting)).toHaveLength(3));
	getWatchlist.mockResolvedValue({page: 1, totalPages: 1, totalResults: 1, results: [title(9, 'PG')]});
	rerender({api, sortBy: 'SortName', sortOrder: 'Ascending', unifiedMode: false, serverType: 'silo', requestsReady: true});
	await waitFor(() => expect(watchlist(result).map((c) => c.Name)).toEqual(['Film 9']));
	await act(async () => waiting[1](detail(1)));
	// The old load's read lands on nothing, and its fourth card never asks.
	expect(watchlist(result).map((c) => c.Name)).toEqual(['Film 9']);
	await waitFor(() => expect(waiting[9]).toBeDefined());
	expect(waiting[4]).toBeUndefined();
});

test('a page that lands while cards fill in keeps the filled ones, and theirs fill in too', async () => {
	getWatchlist.mockImplementation(async (page) => (page === 1
		? {page: 1, totalPages: 2, totalResults: 2, results: [title(1, 'PG')]}
		: {page: 2, totalPages: 2, totalResults: 2, results: [title(2, 'PG')]}));
	const waiting = pendingDetails();
	const {result} = setup();
	await waitFor(() => expect(waiting[1]).toBeDefined());
	await act(async () => waiting[1](detail(1)));
	await act(async () => { await result.current.loadMore('watchlist'); });
	expect(watchlist(result).map((c) => c.Name)).toEqual(['Film 1', 'Film 2']);
	expect(watchlist(result)[0]._externalBackdropUrl).toBe('http://img/b1.jpg');
	await waitFor(() => expect(waiting[2]).toBeDefined());
	await act(async () => waiting[2](detail(2)));
	expect(watchlist(result)[1]._externalBackdropUrl).toBe('http://img/b2.jpg');
	expect(watchlist(result)[0]._externalBackdropUrl).toBe('http://img/b1.jpg');
});
