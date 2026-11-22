import {act, renderHook} from '@testing-library/react';

jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (text) => text}));
jest.mock('../../services/playback', () => ({getNextEpisode: jest.fn(() => Promise.resolve(null))}));
jest.mock('../../services/mdblistApi', () => ({
	fetchTmdbSeasonRatings: jest.fn(), resolveSeriesTmdbId: jest.fn(), isRatingSourceAllowed: () => false
}));
jest.mock('../../services/subtitlePrefs', () => ({
	getItemAudioPref: jest.fn(), getSeriesAudioPref: jest.fn(), syncSeriesTrackChoices: jest.fn(() => Promise.resolve())
}));
jest.mock('../../services/homeRecommendations', () => ({
	canScoreSeedLocally: () => false, getOnlineRecommendations: jest.fn(), getRecommendations: jest.fn(), mergeRecommendations: jest.fn()
}));
jest.mock('../../services/blockedContentGate', () => ({
	isBlocked: () => Promise.resolve(false), isBlockedNow: () => false, observeItem: () => {}
}));
jest.mock('../../services/parentalControls', () => ({
	getActiveParentalFilter: () => ({isActive: false}), withoutBlockedItems: (items) => items
}));
jest.mock('./parentCollection', () => ({findParentCollections: () => Promise.resolve([])}));

import * as userDataSync from '../../services/userDataSync';
import useDetailsItem from './useDetailsItem';

const SERIES = {Id: 'series', Type: 'Series', Name: 'Show'};
const episode = (id, userData = {}) => ({Id: id, Type: 'Episode', SeriesId: 'series', UserData: userData});
const page = (items) => ({Items: items});

// A promise the test settles by hand, for a request that's still out.
const deferred = () => {
	let resolve;
	let reject;
	const promise = new Promise((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return {promise, resolve, reject};
};

const makeApi = (getNextUp) => ({
	getItemForDetail: jest.fn(() => Promise.resolve(SERIES)),
	getSeasons: jest.fn(() => Promise.resolve(page([]))),
	getEpisodes: jest.fn(() => Promise.resolve(page([]))),
	getNextUp: jest.fn(getNextUp),
	getSimilar: jest.fn(() => Promise.resolve(page([]))),
	getSpecialFeatures: jest.fn(() => Promise.resolve([]))
});

const settle = () => act(async () => {
	await new Promise((resolve) => setTimeout(resolve, 0));
});

const SETTINGS = {recommendationSystemSource: 'server', detailScreenStyle: 'v2'};
const identity = (items) => items;

const renderSeries = (api) => renderHook(() => useDetailsItem({
	itemId: 'series',
	initialItem: null,
	effectiveApi: api,
	effectiveServerUrl: 'https://server',
	settings: SETTINGS,
	recommendationsSupported: false,
	seerrEnabled: false,
	tagWithServerInfo: identity,
	skip: false
}));

afterEach(() => {
	act(() => userDataSync.reset());
});

describe('a series Next Up', () => {
	test('is asked for again once an episode is marked played', async () => {
		const answers = [page([episode('e2')]), page([episode('e3')])];
		const api = makeApi(() => Promise.resolve(answers.shift()));
		const {result} = renderSeries(api);
		await settle();
		expect(result.current.nextUp[0].Id).toBe('e2');

		act(() => userDataSync.publish('e2', {Played: true}));
		await settle();

		expect(api.getNextUp).toHaveBeenCalledTimes(2);
		expect(result.current.nextUp[0].Id).toBe('e3');
	});

	test('keeps the shown one when the new request fails', async () => {
		const api = makeApi(() => Promise.resolve(page([episode('e2')])));
		const {result} = renderSeries(api);
		await settle();

		api.getNextUp.mockImplementationOnce(() => Promise.reject(new Error('offline')));
		act(() => userDataSync.publish('e2', {Played: true}));
		await settle();

		expect(result.current.nextUp[0].Id).toBe('e2');
		expect(result.current.nextUp[0].UserData.Played).toBe(true);
	});

	test('takes the newest answer when an older one lands after it', async () => {
		const first = deferred();
		const api = makeApi(() => first.promise);
		const {result} = renderSeries(api);
		await settle();

		api.getNextUp.mockImplementationOnce(() => Promise.resolve(page([episode('e3')])));
		act(() => userDataSync.publish('e1', {Played: true}));
		await settle();
		await act(async () => {
			first.resolve(page([episode('e2')]));
			await first.promise;
		});
		await settle();

		expect(result.current.nextUp[0].Id).toBe('e3');
	});
});

describe('a collection', () => {
	const BOX_SET = {Id: 'box', Type: 'BoxSet', Name: 'Star Wars Collection'};
	const film = (i) => ({Id: `m${i}`, Type: 'Movie', Name: `Film ${i}`, People: [{Id: `d${i}`, Name: `Director ${i}`, Type: 'Director'}]});

	// Answers a page of the collection by StartIndex and Limit, the whole of it when unpaged, and a
	// playlist page by its ids.
	const collectionApi = (total) => {
		const all = Array.from({length: total}, (_, i) => film(i));
		return {
			getItemForDetail: jest.fn(() => Promise.resolve(BOX_SET)),
			getEpisodes: jest.fn(() => Promise.resolve(page([]))),
			removeFromCollection: jest.fn(() => Promise.resolve()),
			getItems: jest.fn((query) => {
				if (query.Ids) return Promise.resolve(page(all.filter((entry) => query.Ids.split(',').includes(entry.Id))));
				const start = query.StartIndex || 0;
				return Promise.resolve({Items: all.slice(start, query.Limit ? start + query.Limit : total), TotalRecordCount: total});
			})
		};
	};

	const pageReads = (api) => api.getItems.mock.calls.map(([query]) => query).filter((query) => query.Limit === 50);

	const renderCollection = (api) => renderHook(() => useDetailsItem({
		itemId: 'box',
		initialItem: null,
		effectiveApi: api,
		effectiveServerUrl: 'https://server',
		settings: SETTINGS,
		recommendationsSupported: false,
		seerrEnabled: false,
		tagWithServerInfo: identity,
		skip: false
	}));

	test('loads its titles 50 at a time, and Play still has the whole collection', async () => {
		const api = collectionApi(120);
		const {result} = renderCollection(api);
		await settle();

		expect(pageReads(api).map((query) => query.StartIndex)).toEqual([0]);
		expect(result.current.collectionItems).toHaveLength(50);
		expect(result.current.collectionMembers).toHaveLength(120);

		act(() => result.current.loadMoreCollectionTitles());
		// A second ask while the page is out is the same ask.
		act(() => result.current.loadMoreCollectionTitles());
		await settle();
		expect(result.current.collectionItems).toHaveLength(100);

		act(() => result.current.loadMoreCollectionTitles());
		await settle();
		expect(result.current.collectionItems).toHaveLength(120);
		expect(result.current.collectionItems[119].Id).toBe('m119');

		act(() => result.current.loadMoreCollectionTitles());
		await settle();
		expect(pageReads(api).map((query) => query.StartIndex)).toEqual([0, 50, 100]);
	});

	test('takes its people from the titles loaded so far', async () => {
		const api = collectionApi(60);
		const {result} = renderCollection(api);
		await settle();
		expect(result.current.cast).toHaveLength(50);
		expect(result.current.cast[0].Name).toBe('Director 0');

		act(() => result.current.loadMoreCollectionTitles());
		await settle();
		expect(result.current.cast).toHaveLength(60);
		expect(result.current.cast[59].Name).toBe('Director 59');
	});

	test('reads the next page one sooner once a loaded title leaves the collection', async () => {
		const api = collectionApi(120);
		const {result} = renderCollection(api);
		await settle();

		await act(() => result.current.removeFromCollection(result.current.collectionItems[3]));
		expect(result.current.collectionItems).toHaveLength(49);
		expect(result.current.collectionMembers).toHaveLength(119);

		act(() => result.current.loadMoreCollectionTitles());
		await settle();
		expect(pageReads(api).map((query) => query.StartIndex)).toEqual([0, 49]);
	});
});
