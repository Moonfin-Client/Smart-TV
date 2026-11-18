import {readDatedSource, readFeaturedSources, withBarFields} from './featuredSources';

jest.mock('@enact/i18n/$L', () => ({__esModule: true, default: (str) => str}));

const titles = (source, n) => ({Items: Array.from({length: n}, (_, i) => ({Id: `${source}-${i}`, BackdropImageTags: ['b']}))});
const usable = (item) => item.BackdropImageTags?.length > 0;

describe('readFeaturedSources', () => {
	test('reads six sources at once and skips the rest once there are twice the titles the bar shows', async () => {
		const sources = Array.from({length: 20}, (_, i) => `lib${i}`);
		const fetchSource = jest.fn((id) => Promise.resolve(titles(id, 10)));
		const items = await readFeaturedSources(sources, fetchSource, usable, 5);
		expect(fetchSource).toHaveBeenCalledTimes(6);
		expect(items).toHaveLength(60);
	});

	test('counts a title two sources share once and only usable ones toward enough', async () => {
		const shared = {Items: [{Id: 'same', BackdropImageTags: ['b']}, {Id: 'bare'}]};
		const fetchSource = jest.fn(() => Promise.resolve(shared));
		const items = await readFeaturedSources(['a', 'b', 'c'], fetchSource, usable, 1);
		expect(fetchSource).toHaveBeenCalledTimes(3);
		expect(items.map((item) => item.Id)).toEqual(['same', 'bare']);
	});

	test('carries on past a source that fails', async () => {
		const fetchSource = jest.fn((id) => (id === 'bad' ? Promise.reject(new Error('403')) : Promise.resolve(titles(id, 2))));
		expect(await readFeaturedSources(['bad', 'good'], fetchSource, usable, 5)).toHaveLength(2);
	});
});

describe('readDatedSource', () => {
	const aired = (seriesId, daysAgo) => ({SeriesId: seriesId, LocationType: 'FileSystem', PremiereDate: new Date(Date.now() - daysAgo * 86400000).toISOString()});

	test('New Seasons & Episodes finds the series through episodes that aired in the window', async () => {
		const getItems = jest.fn(async (query) => (query.Ids
			? {Items: query.Ids.split(',').map((Id) => ({Id, Type: 'Series'}))}
			: {Items: [aired('a', 1), aired('b', 3), aired('a', 8), aired('old', 45)]}));
		const items = await readDatedSource({getItems}, 'newReleases', 'shows', {contentType: 'both', days: 30});
		expect(items.map((item) => item.Id)).toEqual(['a', 'b']);
		expect(getItems.mock.calls[0][0]).toMatchObject({ParentId: 'shows', IncludeItemTypes: 'Episode', SortBy: 'PremiereDate', SortOrder: 'Descending'});
	});

	test('New Releases for movies only reads the movies in their window, and drops one a server sends from outside it', async () => {
		const fresh = {Id: 'fresh', Type: 'Movie', PremiereDate: new Date(Date.now() - 10 * 86400000).toISOString()};
		const old = {Id: 'old', Type: 'Movie', PremiereDate: new Date(Date.now() - 400 * 86400000).toISOString()};
		const getItems = jest.fn(async () => ({Items: [fresh, old]}));
		expect(await readDatedSource({getItems}, 'newReleases', null, {contentType: 'movies', days: 30, movieDays: 120})).toEqual([fresh]);
		expect(getItems).toHaveBeenCalledTimes(1);
		expect(getItems.mock.calls[0][0]).toMatchObject({IncludeItemTypes: 'Movie', SortBy: 'PremiereDate'});
		expect(getItems.mock.calls[0][0].MinPremiereDate).toBeTruthy();
	});

	test('Recently Released in Episode mode reads the episodes and shows their series, with movies as before', async () => {
		const getItems = jest.fn(async ({IncludeItemTypes, Ids}) => {
			if (Ids) return {Items: Ids.split(',').map((Id) => ({Id, Type: 'Series'}))};
			if (IncludeItemTypes === 'Episode') return {Items: [{Id: 'e1', SeriesId: 'a'}, {Id: 'e2', SeriesId: 'b'}, {Id: 'e3', SeriesId: 'a'}]};
			return {Items: [{Id: 'm1', Type: 'Movie'}]};
		});
		const items = await readDatedSource({getItems}, 'recentlyReleased', null, {contentType: 'both', seriesType: 'episode', count: 10});
		expect(items.map((item) => item.Id)).toEqual(['a', 'b', 'm1']);
	});

	test('Recently Released in Season mode keeps the series of a collection, which lists no seasons', async () => {
		const getItems = jest.fn(async ({IncludeItemTypes}) => ({Items: IncludeItemTypes === 'Series' ? [{Id: 's1', Type: 'Series'}] : []}));
		const items = await readDatedSource({getItems}, 'recentlyReleased', 'boxset', {contentType: 'tv', seriesType: 'season', count: 10});
		expect(items.map((item) => item.Id)).toEqual(['s1']);
	});

	test('Recently Released sorts by air date up to today', async () => {
		const getItems = jest.fn(async () => ({Items: [{Id: 'x'}]}));
		expect(await readDatedSource({getItems}, 'recentlyReleased', 'films', {contentType: 'movies', days: 30})).toEqual([{Id: 'x'}]);
		expect(getItems.mock.calls[0][0]).toMatchObject({ParentId: 'films', IncludeItemTypes: 'Movie', SortBy: 'PremiereDate', Recursive: true});
		expect(getItems.mock.calls[0][0].MaxPremiereDate).toBeTruthy();
	});

	test('both pools leave watched titles out while Hide Watched is on', async () => {
		const watched = {Id: 'seen', Type: 'Movie', UserData: {Played: true}};
		const fresh = {Id: 'new', Type: 'Movie', UserData: {Played: false}};
		const getItems = jest.fn(async () => ({Items: [watched, fresh]}));
		const getLatestItems = jest.fn(async () => [watched, fresh]);
		const options = {contentType: 'movies', days: 30, hideWatched: true};
		expect(await readDatedSource({getItems}, 'recentlyReleased', null, options)).toEqual([fresh]);
		expect(await readDatedSource({getLatestItems}, 'recentlyAdded', null, options)).toEqual([fresh]);
	});

	test('Recently Added reads the Latest list, which comes back as a bare array', async () => {
		const getLatestItems = jest.fn(async () => [{Id: 'new'}]);
		expect(await readDatedSource({getLatestItems}, 'recentlyAdded', null, {contentType: 'tv', days: 30})).toEqual([{Id: 'new'}]);
		expect(getLatestItems.mock.calls[0][0]).toMatchObject({IncludeItemTypes: 'Series'});
	});
});

describe('withBarFields', () => {
	test('fills ids and season counts onto the plugin cards in one call', async () => {
		const fetchItems = jest.fn(() => Promise.resolve({Items: [{Id: 'a', ProviderIds: {Tmdb: '1'}, ChildCount: 3}]}));
		const items = await withBarFields([{Id: 'a', Name: 'A'}, {Id: 'b', ProviderIds: {Tmdb: '2'}}], fetchItems);
		expect(fetchItems).toHaveBeenCalledTimes(1);
		expect(fetchItems.mock.calls[0][0].Ids).toBe('a,b');
		expect(items).toEqual([{Id: 'a', Name: 'A', ProviderIds: {Tmdb: '1'}, ChildCount: 3}, {Id: 'b', ProviderIds: {Tmdb: '2'}, ChildCount: undefined}]);
	});

	test('keeps the cards when the call fails', async () => {
		const items = await withBarFields([{Id: 'a'}], () => Promise.reject(new Error('500')));
		expect(items[0].Id).toBe('a');
	});
});
