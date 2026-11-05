import {readDatedSource, readFeaturedSources} from './featuredSources';

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

	test('New Seasons & Episodes has nothing for movies only, so the bar falls back', async () => {
		const getItems = jest.fn();
		expect(await readDatedSource({getItems}, 'newReleases', null, {contentType: 'movies', days: 30})).toEqual([]);
		expect(getItems).not.toHaveBeenCalled();
	});

	test('Recently Released sorts by air date up to today', async () => {
		const getItems = jest.fn(async () => ({Items: [{Id: 'x'}]}));
		expect(await readDatedSource({getItems}, 'recentlyReleased', 'films', {contentType: 'movies', days: 30})).toEqual([{Id: 'x'}]);
		expect(getItems.mock.calls[0][0]).toMatchObject({ParentId: 'films', IncludeItemTypes: 'Movie', SortBy: 'PremiereDate', Recursive: true});
		expect(getItems.mock.calls[0][0].MaxPremiereDate).toBeTruthy();
	});

	test('Recently Added reads the Latest list, which comes back as a bare array', async () => {
		const getLatestItems = jest.fn(async () => [{Id: 'new'}]);
		expect(await readDatedSource({getLatestItems}, 'recentlyAdded', null, {contentType: 'tv', days: 30})).toEqual([{Id: 'new'}]);
		expect(getLatestItems.mock.calls[0][0]).toMatchObject({IncludeItemTypes: 'Series'});
	});
});
