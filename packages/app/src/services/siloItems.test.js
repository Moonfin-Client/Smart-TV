import {createSiloItems} from './siloItems';
import {siloItemToBaseItem, siloRuleGroups, siloSortFor, siloTypesForQuery} from './siloMapper';
import {createSiloPager} from './siloPager';

const memoryImages = () => {
	const kept = {};
	return {
		register: (itemId, type, url, index = 0) => {
			if (!url) return null;
			kept[`${itemId}|${type}|${index}`] = url;
			return `tag:${url}`;
		},
		tagFor: (itemId, type, index = 0) => (kept[`${itemId}|${type}|${index}`] ? `tag:${kept[`${itemId}|${type}|${index}`]}` : null),
		kept
	};
};

describe('item mapping', () => {
	test('a movie maps its core fields, artwork and user data', () => {
		const images = memoryImages();
		const item = siloItemToBaseItem({
			content_id: 'movie-tmdb-1', type: 'movie', title: 'The Hobbit', year: 2012, release_date: '2012-12-14',
			genres: ['Fantasy'], studios: ['WingNut'], networks: [], content_rating: 'PG-13', rating_tmdb: 7.26,
			runtime: 169, imdb_id: 'tt0903624', tmdb_id: 49051, poster_url: '/p.webp', backdrop_urls: ['/b0.webp', '/b1.webp'],
			logo_url: '/l.webp', user_state: {played: false, is_favorite: true}, user_rating: 4,
			videos: [{site: 'YouTube', site_key: 'abc', kind: 'trailer', name: 'Trailer'}],
			cast: [{person_id: 9, name: 'Second', character: 'B', order: 2}, {person_id: 8, name: 'First', character: 'A', order: 1}],
			crew: [{person_id: 7, name: 'Peter', job: 'Director'}, {person_id: 6, name: 'Fran', job: 'Executive Producer'}]
		}, {images});
		expect(item).toMatchObject({
			Id: 'movie-tmdb-1', Type: 'Movie', MediaType: 'Video', IsFolder: false, SortName: 'Hobbit, The', ProductionYear: 2012,
			PremiereDate: '2012-12-14T00:00:00.0000000Z', OfficialRating: 'PG-13', CommunityRating: 7.3, RunTimeTicks: 169 * 60 * 10000000,
			ProviderIds: {Imdb: 'tt0903624', Tmdb: '49051'},
			ImageTags: {Primary: 'tag:/p.webp', Logo: 'tag:/l.webp', Thumb: 'tag:/b0.webp'},
			BackdropImageTags: ['tag:/b0.webp', 'tag:/b1.webp'],
			UserData: {IsFavorite: true, Played: false, Rating: 8},
			RemoteTrailers: [{Url: 'https://www.youtube.com/watch?v=abc', Name: 'Trailer'}],
			Studios: [{Name: 'WingNut', Id: 'silo-studio:WingNut'}]
		});
		expect(item.People.map((p) => `${p.Name}:${p.Type}:${p.Role || ''}`)).toEqual([
			'First:Actor:A', 'Second:Actor:B', 'Peter:Director:', 'Fran:Producer:Executive Producer'
		]);
	});

	test("an episode's series poster and backdrop go to the series, and come back as its parent artwork", () => {
		const images = memoryImages();
		const episode = siloItemToBaseItem({
			content_id: 'episode-tvdb-5-1-2', type: 'episode', title: 'Two', series_id: 'series-tvdb-5', series_title: 'Show',
			season_number: 1, episode_number: 2, still_url: '/still.webp', series_poster_url: '/series.webp',
			backdrop_urls: ['/series-backdrop.webp'], backdrop_is_episode_still: false
		}, {images});
		expect(episode).toMatchObject({
			Type: 'Episode', IndexNumber: 2, ParentIndexNumber: 1, SeasonId: 'season-tvdb-5-1', SeriesId: 'series-tvdb-5', SeriesName: 'Show',
			ImageTags: {Primary: 'tag:/still.webp'}, BackdropImageTags: [],
			SeriesPrimaryImageTag: 'tag:/series.webp', ParentBackdropItemId: 'series-tvdb-5', ParentBackdropImageTags: ['tag:/series-backdrop.webp']
		});
	});

	test("a search card's series backdrop becomes the episode's parent backdrop", () => {
		const episode = siloItemToBaseItem({
			content_id: 'episode-tvdb-5-1-2', type: 'episode', series_id: 'series-tvdb-5', season_number: 1, episode_number: 2,
			poster_url: '/series.webp', poster_is_episode_still: false, series_backdrop_url: '/series-backdrop.webp'
		}, {images: memoryImages()});
		expect(episode).toMatchObject({
			ImageTags: {}, BackdropImageTags: [],
			ParentBackdropItemId: 'series-tvdb-5', ParentBackdropImageTags: ['tag:/series-backdrop.webp']
		});
	});

	test("an episode's logo is its series', so the episode's detail without one still has the series logo", () => {
		const images = memoryImages();
		const card = siloItemToBaseItem({
			content_id: 'episode-tvdb-5-1-2', type: 'episode', series_id: 'series-tvdb-5', season_number: 1, episode_number: 2,
			logo_url: '/series-logo.webp'
		}, {images});
		expect(card).toMatchObject({ParentLogoItemId: 'series-tvdb-5', ParentLogoImageTag: 'tag:/series-logo.webp'});
		const detail = siloItemToBaseItem({
			content_id: 'episode-tvdb-5-1-2', type: 'episode', series_id: 'series-tvdb-5', season_number: 1, episode_number: 2
		}, {images});
		expect(detail).toMatchObject({ParentLogoItemId: 'series-tvdb-5', ParentLogoImageTag: 'tag:/series-logo.webp'});
	});

	test('a season list entry takes its type and series from the caller', () => {
		const season = siloItemToBaseItem({content_id: 'season-tvdb-5-0', season_number: 0, episode_count: 3},
			{images: memoryImages(), type: 'season', series: {id: 'series-tvdb-5', name: 'Show'}});
		expect(season).toMatchObject({Type: 'Season', IndexNumber: 0, ChildCount: 3, SeriesId: 'series-tvdb-5', SeriesName: 'Show'});
	});

	test('a podcast or an item without an id is dropped', () => {
		expect(siloItemToBaseItem({content_id: 'x', type: 'podcast'}, {images: memoryImages()})).toBe(null);
		expect(siloItemToBaseItem({type: 'movie'}, {images: memoryImages()})).toBe(null);
	});
});

describe('queries', () => {
	test('types Silo has are kept, and a query only for others asks for nothing', () => {
		expect(siloTypesForQuery('Movie,Series,BoxSet')).toEqual(['movie', 'series']);
		expect(siloTypesForQuery('MusicAlbum')).toEqual([]);
		expect(siloTypesForQuery(null)).toBe(null);
	});

	test('sorts map to Silo fields', () => {
		expect(siloSortFor('SortName,ProductionYear', 'Descending')).toBe('-title');
		expect(siloSortFor('DateCreated', 'Ascending')).toBe('added_at');
		expect(siloSortFor('Random', 'Ascending')).toBe(null);
	});

	test('filters become rule groups', () => {
		expect(siloRuleGroups({genres: ['Drama', 'Comedy'], filters: ['IsUnplayed'], isHd: true})).toEqual([
			{match: 'any', rules: [{field: 'genre', op: 'is', value: 'Drama'}, {field: 'genre', op: 'is', value: 'Comedy'}]},
			{match: 'any', rules: [{field: 'watched', op: 'is', value: false}]},
			{match: 'any', rules: [{field: 'resolution', op: 'is', value: '1080p'}, {field: 'resolution', op: 'is', value: '720p'}]}
		]);
	});
});

describe('pager', () => {
	test('offsets walk Silo cursors and reuse the pages already read', async () => {
		const all = Array.from({length: 250}, (_, i) => ({id: i}));
		const fetchPage = jest.fn(async ({cursor, limit}) => {
			const start = cursor ? Number(cursor) : 0;
			const end = Math.min(start + limit, all.length);
			return {items: all.slice(start, end), nextCursor: end < all.length ? String(end) : null, hasMore: end < all.length, total: 250, totalExact: true};
		});
		const pager = createSiloPager({pageSize: 100});
		const first = await pager.page({signature: 'q', startIndex: 0, limit: 75, fetch: fetchPage});
		const second = await pager.page({signature: 'q', startIndex: 75, limit: 75, fetch: fetchPage});
		expect(first.items.map((i) => i.id)).toEqual(Array.from({length: 75}, (_, i) => i));
		expect(second.items.map((i) => i.id)).toEqual(Array.from({length: 75}, (_, i) => i + 75));
		expect(second.totalRecordCount).toBe(250);
		expect(fetchPage).toHaveBeenCalledTimes(2);
	});
});

describe('items', () => {
	const setup = (answers) => {
		const calls = [];
		const call = jest.fn(async (path, options = {}) => {
			calls.push({path, query: options.query || {}});
			const answer = answers[path];
			return typeof answer === 'function' ? answer(options) : answer;
		});
		const items = createSiloItems({call, images: memoryImages(), getConfiguration: async () => ({OrderedViews: ['2'], MyMediaExcludes: []})});
		return {items, calls};
	};

	test('libraries keep the profile order and leave out audiobooks', async () => {
		const {items} = setup({'/api/v2/user/libraries': {items: [
			{id: 1, name: 'Movies', type: 'movies'}, {id: 2, name: 'TV Shows', type: 'series'}, {id: 3, name: 'Books', type: 'audiobooks'}
		]}});
		const views = await items.getLibraries();
		expect(views.Items.map((v) => `${v.Id}:${v.CollectionType}`)).toEqual(['2:tvshows', '1:movies']);
	});

	test('a library grid asks the catalog with its library, type, sort and filters', async () => {
		const {items, calls} = setup({'/api/v2/catalog': {items: [{content_id: 'movie-1', type: 'movie', title: 'A'}], page: {has_more: false}}});
		const result = await items.getItems({
			ParentId: '1', IncludeItemTypes: 'Movie', SortBy: 'SortName', SortOrder: 'Ascending', StartIndex: 0, Limit: 50,
			Filters: 'IsFavorite', NameStartsWith: 'A'
		});
		expect(result).toMatchObject({TotalRecordCount: 1, Items: [{Id: 'movie-1', ParentId: '1'}]});
		expect(calls[0].query).toMatchObject({
			library_id: '1', type: 'movie', sort: 'title', name_prefix: 'A', image_size: 'medium', limit: 100,
			groups: JSON.stringify([{match: 'any', rules: [{field: 'favorited', op: 'is', value: true}]}])
		});
	});

	test("a series' children are its seasons", async () => {
		const {items} = setup({
			'/api/v2/catalog/series/series-x/seasons': {items: [{content_id: 'season-x-1', season_number: 1}]}
		});
		const result = await items.getItems({ParentId: 'series-x'});
		expect(result.Items.map((s) => s.Id)).toEqual(['season-x-1']);
	});

	test('a search that Silo turns off for the profile answers empty without asking', async () => {
		const {items, calls} = setup({'/api/v2/catalog/search/capabilities': {state: 'disabled', allowed: true}});
		const result = await items.getItems({SearchTerm: 'hobbit'});
		expect(result.Items).toEqual([]);
		expect(calls.map((c) => c.path)).toEqual(['/api/v2/catalog/search/capabilities']);
	});

	test('Continue Watching comes from the home layout, without the next-up cards', async () => {
		const {items} = setup({
			'/api/v2/home/layout': {sections: [{id: 'cw', section_type: 'continue_watching'}]},
			'/api/v2/home/sections/cw/items': {items: [
				{content_id: 'movie-1', type: 'movie', title: 'A', position_seconds: 60, duration_seconds: 600},
				{content_id: 'episode-x-1-2', type: 'episode', title: 'B', item_source: 'next_up'}
			]}
		});
		const result = await items.getResumeItems(10);
		expect(result.Items.map((i) => i.Id)).toEqual(['movie-1']);
		expect(result.Items[0].UserData.PlayedPercentage).toBe(10);
		const next = await items.getNextUp(10);
		expect(next.Items.map((i) => i.Id)).toEqual(['episode-x-1-2']);
	});
});

describe('writes', () => {
	const setup = (answers = {}) => {
		const calls = [];
		const published = [];
		const call = jest.fn(async (path, options = {}) => {
			calls.push(`${options.method || 'GET'} ${path}${options.body ? ' ' + JSON.stringify(options.body) : ''}`);
			const answer = answers[`${options.method || 'GET'} ${path}`];
			return typeof answer === 'function' ? answer(options) : answer;
		});
		const items = createSiloItems({
			call, images: memoryImages(), getConfiguration: async () => ({}), getUserId: () => 'p1',
			publishUserData: (id, patch) => published.push([id, patch])
		});
		return {items, calls, published};
	};

	test('favorite, watched and ratings write to Silo and tell the app', async () => {
		const {items, calls, published} = setup();
		await items.setFavorite('movie-1', true);
		await items.setWatched('episode-x-1-2', false);
		await items.setNumericRating('movie-1', 7);
		await items.setRating('movie-1', false);
		await items.clearRating('movie-1');
		expect(calls).toEqual([
			'PUT /api/v2/favorites/movie-1',
			'DELETE /api/v2/watched/episode-x-1-2',
			'PUT /api/v2/ratings/movie-1 {"rating":4}',
			'PUT /api/v2/ratings/movie-1 {"rating":1}',
			'DELETE /api/v2/ratings/movie-1'
		]);
		expect(published[0]).toEqual(['movie-1', {IsFavorite: true}]);
		expect(published[2]).toEqual(['movie-1', {Rating: 8}]);
	});

	test('a genre, studio, collection or library has no favorite on Silo', async () => {
		const {items, calls} = setup();
		await expect(items.setFavorite('silo-genre:Drama', true)).rejects.toMatchObject({status: 501});
		await expect(items.setFavorite('3', true)).rejects.toMatchObject({status: 501});
		expect(calls).toEqual([]);
	});

	test('hiding from Continue Watching sends the progress it hides as of', async () => {
		const {items, calls} = setup();
		await items.hideFromResume('movie-1', {Id: 'movie-1', _silo: {progress_updated_at: '2026-10-30T10:00:00Z'}});
		await items.hideFromNextUp({Id: 'episode-x-1-2', SeriesId: 'series-x'});
		expect(calls).toEqual([
			'PUT /api/v2/home/dismissals/continue_watching/movie-1 {"progress_updated_at":"2026-10-30T10:00:00Z"}',
			'PUT /api/v2/home/dismissals/next_up/episode-x-1-2 {"series_id":"series-x"}'
		]);
	});

	test("only the profile's own manual collections take items, by Silo's collection id", async () => {
		const {items, calls} = setup({
			'GET /api/v2/collections': {items: [
				{id: 'c1', title: 'Mine', collection_type: 'manual', creator_profile_id: 'p1'},
				{id: 'c2', title: 'Theirs', collection_type: 'manual', creator_profile_id: 'p2'},
				{id: 'c3', title: 'Smart', collection_type: 'smart', creator_profile_id: 'p1'}
			]}
		});
		const editable = await items.getEditableCollections();
		expect(editable.Items.map((c) => c.Id)).toEqual(['silo-collection:c1']);
		await items.addToCollection('silo-collection:c1', ['movie-1']);
		expect(calls[1]).toBe('PUT /api/v2/collections/c1/items/movie-1 {"position":0}');
		await expect(items.addToCollection('silo-libcollection:1:c9', ['movie-1'])).rejects.toMatchObject({status: 501});
	});
});
