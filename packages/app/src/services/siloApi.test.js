import {createSiloApi, siloRuleGroups, siloSortFor} from './siloApi';
import {setSiloTokens, siloAccount} from './siloSession';
import {corsFreeFetch} from './secureFetch';
import libraries from './__fixtures__/silo/user_libraries.json';
import libraryPage from './__fixtures__/silo/catalog_library_page1.json';
import movie from './__fixtures__/silo/catalog_item_movie.json';
import seriesSeasons from './__fixtures__/silo/series_seasons.json';
import seasonEpisodes from './__fixtures__/silo/season_episodes.json';
import searchCapabilities from './__fixtures__/silo/search_capabilities.json';
import person from './__fixtures__/silo/person.json';
import catalogFilters from './__fixtures__/silo/catalog_filters.json';

jest.mock('./secureFetch', () => ({corsFreeFetch: jest.fn()}));

const BASE = 'http://silo:8090';
const account = siloAccount(BASE, 'account-api');
setSiloTokens(account, {accessToken: 'tok', refreshToken: 'ref', expiresAt: Date.now() + 3600000, lifetimeMs: 3600000});

const api = () => createSiloApi({
	getBaseUrl: () => BASE,
	getAccount: () => account,
	getProfile: () => ({id: 'profile-1'}),
	getDeviceInfo: () => ({appName: 'Moonfin for webOS', appVersion: '3.0.0', deviceName: 'LG Smart TV', deviceId: 'dev-1'})
});

const reply = (status, body) => Promise.resolve({
	ok: status >= 200 && status < 300,
	status,
	headers: {get: () => null},
	text: () => Promise.resolve(body == null ? '' : JSON.stringify(body))
});

// A Silo that answers each route from a table, and refuses anything else the way Silo does.
const serve = (routes) => corsFreeFetch.mockImplementation((url, init) => {
	const [path] = url.replace(`${BASE}/api/v2`, '').split('?');
	const key = [`${init.method} ${path}`, path].find((k) => Object.prototype.hasOwnProperty.call(routes, k));
	return key ? reply(200, routes[key]) : reply(404, {type: 'https://siloserver.org/problems/not_found', title: 'Not found'});
});

const calls = () => corsFreeFetch.mock.calls.map(([url, init]) => {
	const [path, query = ''] = url.replace(`${BASE}/api/v2`, '').split('?');
	return {method: init.method, path, query: Object.fromEntries(new URLSearchParams(query)), body: init.body ? JSON.parse(init.body) : undefined};
});

beforeEach(() => {
	corsFreeFetch.mockReset();
});

describe('sorting and filters', () => {
	test('a sort maps to Silo\'s field, descending with a dash', () => {
		expect(siloSortFor('SortName,ProductionYear', 'Descending')).toBe('-title');
		expect(siloSortFor('CommunityRating', 'Ascending')).toBe('rating_tmdb');
		expect(siloSortFor('Random')).toBeNull();
	});

	test('filters become rule groups, any value within one', () => {
		expect(siloRuleGroups({Genres: 'Action|Drama', Filters: 'IsUnplayed,IsFavorite', Studios: 'Ghibli', IsHD: 'false'})).toEqual([
			{match: 'any', rules: [{field: 'genre', op: 'is', value: 'Action'}, {field: 'genre', op: 'is', value: 'Drama'}]},
			{match: 'any', rules: [{field: 'studio', op: 'is', value: 'Ghibli'}, {field: 'network', op: 'is', value: 'Ghibli'}]},
			{match: 'any', rules: [{field: 'watched', op: 'is', value: false}]},
			{match: 'any', rules: [{field: 'favorited', op: 'is', value: true}]},
			{match: 'any', rules: [{field: 'resolution', op: 'is_not', value: '2160p'}]},
			{match: 'any', rules: [{field: 'resolution', op: 'is_not', value: '1080p'}]},
			{match: 'any', rules: [{field: 'resolution', op: 'is_not', value: '720p'}]}
		]);
	});
});

describe('browsing', () => {
	test('libraries come in the admin\'s order', async () => {
		serve({'/user/libraries': libraries});
		const {Items} = await api().getLibraries();
		expect(Items.map((view) => view.Name)).toEqual(['Movies', 'TV Shows']);
	});

	test('a library page reads the catalog with Silo\'s sort, filters and fixed page size', async () => {
		serve({'/catalog': libraryPage});
		const page = await api().getItems({ParentId: '1', IncludeItemTypes: 'Movie', SortBy: 'SortName', SortOrder: 'Descending', Genres: 'Action', StartIndex: 0, Limit: libraryPage.items.length});
		expect(page.TotalRecordCount).toBe(libraryPage.total);
		expect(page.Items.map((item) => item.Id)).toEqual(libraryPage.items.map((item) => item.content_id));
		const [{query}] = calls();
		expect(query).toMatchObject({library_id: '1', type: 'movie', sort: '-title', limit: '100', image_size: 'medium'});
		expect(JSON.parse(query.groups)).toEqual([{match: 'any', rules: [{field: 'genre', op: 'is', value: 'Action'}]}]);
	});

	test('a genre page filters the catalog by the genre its id names', async () => {
		serve({'/catalog': libraryPage});
		await api().getItems({ParentId: 'silo-genre:Science%20Fiction', IncludeItemTypes: 'Movie,Series'});
		const [{query}] = calls();
		expect(query.type).toBe('video');
		expect(JSON.parse(query.groups)[0].rules).toEqual([{field: 'genre', op: 'is', value: 'Science Fiction'}]);
	});

	test('a series\' children are its seasons, and a season\'s its episodes', async () => {
		serve({
			'/catalog/series/series-imdb-tt1641384/seasons': seriesSeasons,
			'/catalog/items/season-imdb-tt1641384-1/episodes': seasonEpisodes
		});
		const seasons = await api().getItems({ParentId: 'series-imdb-tt1641384'});
		expect(seasons.Items.map((s) => [s.Type, s.SeriesId])).toContainEqual(['Season', 'series-imdb-tt1641384']);
		const episodes = await api().getEpisodes('series-imdb-tt1641384', 'season-imdb-tt1641384-1');
		expect(episodes.Items.every((e) => e.Type === 'Episode' && e.SeasonId === 'season-imdb-tt1641384-1')).toBe(true);
	});

	test('a title\'s detail fetches its files when the detail leaves them out', async () => {
		const {versions, ...withoutFiles} = movie;
		serve({
			'/catalog/items/movie-imdb-tt0295701': withoutFiles,
			'/catalog/items/movie-imdb-tt0295701/versions': {items: versions}
		});
		const item = await api().getItemForDetail('movie-imdb-tt0295701');
		expect(item.MediaSources).toHaveLength(versions.length);
		expect(calls().map((c) => c.query.image_size)).toEqual(['large', 'large']);
	});

	test('a numeric id is a library, else a person', async () => {
		serve({'/user/libraries': libraries, '/catalog/people/146552272560604468': person});
		expect((await api().getItem('3')).Type).toBe('CollectionFolder');
		expect(await api().getItem('146552272560604468')).toMatchObject({Type: 'Person', Name: 'Vin Diesel', PremiereDate: '1967-07-18T00:00:00.0000000Z'});
	});

	test('a search asks Silo with its widest scope when Silo can search', async () => {
		serve({'/catalog/search/capabilities': searchCapabilities, '/catalog': libraryPage});
		await api().search('xxx', 20);
		const catalog = calls().find((c) => c.path === '/catalog');
		expect(catalog.query).toMatchObject({q: 'xxx', type: 'video_with_episodes'});
	});

	test('genres come from the catalog filters as items with made-up ids', async () => {
		serve({'/catalog/filters': catalogFilters});
		const {Items} = await api().getGenres('1', 'Movie');
		expect(Items[0]).toMatchObject({Name: 'Action', Id: 'silo-genre:Action', Type: 'Genre'});
		expect(calls()[0].query).toEqual({library_id: '1', type: 'movie'});
	});
});
