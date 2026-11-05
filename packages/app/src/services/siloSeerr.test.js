import {SILO_ROW_PREFIX, createSiloSeerr, stableId} from './siloSeerr';

const title = (over = {}) => ({
	media_type: 'movie', tmdb_id: 11, title: 'Film', poster_path: '/p.jpg', release_date: '2026-01-02',
	availability: 'missing', ...over
});

const setup = (routes) => {
	const calls = [];
	const call = jest.fn(async (path, options = {}) => {
		calls.push({path, ...options});
		const answer = routes[`${options.method || 'GET'} ${path}`];
		if (answer instanceof Error) throw answer;
		return typeof answer === 'function' ? answer(options) : answer;
	});
	return {seerr: createSiloSeerr({call, baseUrl: 'http://silo/', random: () => 0}), calls};
};

const refused = (status) => Object.assign(new Error('no'), {status});

describe('Silo requests in Seerr\'s shapes', () => {
	test('status says the account is the requests user, with manage rights for an admin', async () => {
		const {seerr} = setup({
			'GET /api/v2/requests/status': {requests_enabled: true, allowed: true},
			'GET /api/v2/admin/requests/capabilities': {},
			'GET /api/v2/account/me': {id: '4', username: 'brady'}
		});
		expect(await seerr.status()).toEqual({enabled: true, authenticated: true, seerrUserId: 4, displayName: 'brady', permissions: 32 | 262144 | 524288 | 16});
	});

	test('a Discover row maps to Seerr\'s page and cards', async () => {
		const {seerr} = setup({
			'GET /api/v2/requests/discover/popular_movies': {page: 1, total_pages: 3, results: [title({request: {request_id: '9', state: 'pending'}})]}
		});
		const page = await seerr.request('/discover/movies?page=1');
		expect(page).toMatchObject({page: 1, totalPages: 3, results: [{
			id: 11, mediaType: 'movie', title: 'Film', releaseDate: '2026-01-02',
			mediaInfo: {status: 2, requests: [{id: 9, status: 1}]}
		}]});
	});

	test('search leaves out titles already in the library, and a row slider reads its Silo row', async () => {
		const {seerr, calls} = setup({
			'GET /api/v2/requests/search': {results: [title(), title({tmdb_id: 12, library_content_id: 'movie-tmdb-12'})]},
			'GET /api/v2/requests/discover/rows/my_row': {results: [title({tmdb_id: 13})]},
			'GET /api/v2/requests/discover': {row_order: [
				{key: 'trending_movies', type: 'tmdb_chart', title: 'Trending'},
				{key: 'my_row', type: 'tmdb_list', title: 'Mine'}
			]}
		});
		expect((await seerr.request('/search?query=film&page=1')).results.map((r) => r.id)).toEqual([11]);
		expect(await seerr.request('/settings/discover')).toEqual([{id: stableId('my_row'), type: 17, enabled: true, title: 'Mine', data: `${SILO_ROW_PREFIX}my_row`}]);
		expect((await seerr.request(`/search?query=${encodeURIComponent(`${SILO_ROW_PREFIX}my_row`)}&page=1`)).results.map((r) => r.id)).toEqual([13]);
		expect(calls.some((c) => c.path === '/api/v2/requests/discover/rows/my_row')).toBe(true);
	});

	test('a viewer\'s requests come from their own list, and an id past 2^53 maps back exactly', async () => {
		const big = '9007199254740993123';
		const {seerr, calls} = setup({
			'GET /api/v2/admin/requests/capabilities': refused(403),
			'GET /api/v2/requests/mine': {items: [{id: big, media_type: 'series', tmdb_id: 5, title: 'Show', state: 'approved', seasons: [1, 2]}]},
			[`POST /api/v2/requests/${big}/cancel`]: {}
		});
		const list = await seerr.request('/request?filter=all&take=20&skip=0&sort=added');
		expect(list.results[0]).toMatchObject({status: 2, type: 'tv', media: {name: 'Show', status: 3}, seasonCount: 2});
		await seerr.request(`/request/${list.results[0].id}`, {method: 'DELETE'});
		expect(calls.pop().path).toBe(`/api/v2/requests/${big}/cancel`);
	});

	test('a request is created with the title Silo needs, from the detail', async () => {
		const {seerr, calls} = setup({
			'GET /api/v2/requests/detail/series/5': {tmdb_id: 5, tvdb_id: 7, title: 'Show', year: 2020, poster_path: '/s.jpg'},
			'POST /api/v2/requests': (options) => ({id: '1', media_type: 'series', tmdb_id: 5, title: options.body.title, state: 'pending', seasons: [1]})
		});
		const created = await seerr.request('/request', {method: 'POST', body: {mediaType: 'tv', mediaId: 5, seasons: [1], is4k: false}});
		expect(calls.pop().body).toEqual({media_type: 'series', tmdb_id: 5, tvdb_id: 7, title: 'Show', year: 2020, poster_path: '/s.jpg', seasons: [1]});
		expect(created).toMatchObject({id: 1, status: 1, type: 'tv'});
	});

	test('the watchlist adds and removes by type and TMDB id', async () => {
		const {seerr, calls} = setup({'PUT /api/v2/watchlist/titles/movie/11': null, 'DELETE /api/v2/watchlist/titles/series/5': null});
		await seerr.request('/watchlist', {method: 'POST', body: {tmdbId: 11, mediaType: 'movie'}});
		await seerr.request('/watchlist/5?mediaType=tv', {method: 'DELETE'});
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['PUT /api/v2/watchlist/titles/movie/11', 'DELETE /api/v2/watchlist/titles/series/5']);
	});

	test('the calendar reads Silo\'s in 31-day parts and answers in Radarr\'s and Sonarr\'s shapes', async () => {
		const {seerr, calls} = setup({
			'GET /api/v2/calendar': (options) => (options.query.start === '2026-11-01' ? {events: [{items: [
				{type: 'movie', content_id: 'movie-tmdb-11', title: 'Film', air_at: '2026-11-03T20:00:00Z', poster_url: '/img/p'},
				{type: 'episode', series_id: 'series-tvdb-7', title: 'Show', episode_title: 'Pilot', season_number: 1, episode_number: 1, air_date: '2026-11-04'}
			]}]} : {events: []}),
			'GET /api/v2/catalog/items/movie-tmdb-11': {tmdb_id: 11, overview: 'o', year: 2026, backdrop_url: 'https://cdn/b'},
			'GET /api/v2/catalog/items/series-tvdb-7': {tvdb_id: '7', tmdb_id: 5, overview: 's'}
		});
		const movies = await seerr.calendar('movie', '2026-11-01', '2027-01-30');
		expect(calls.filter((c) => c.path === '/api/v2/calendar').map((c) => [c.query.start, c.query.end]))
			.toEqual([['2026-11-01', '2026-12-01'], ['2026-12-02', '2027-01-01'], ['2027-01-02', '2027-01-30']]);
		expect(movies).toEqual([{tmdbId: 11, title: 'Film', overview: 'o', year: 2026, digitalRelease: '2026-11-03T20:00:00.000Z', images: [
			{coverType: 'poster', remoteUrl: 'http://silo/img/p'}, {coverType: 'fanart', remoteUrl: 'https://cdn/b'}
		]}]);
		const episodes = await seerr.calendar('tv', '2026-11-01', '2026-11-30');
		expect(episodes[0]).toMatchObject({series: {tvdbId: 7, tmdbId: 5, title: 'Show'}, title: 'Pilot', seasonNumber: 1, episodeNumber: 1});
		expect(episodes[0].airDateUtc).toBe(new Date(2026, 10, 4).toISOString());
	});
});
