import {createSiloAdminItems, SILO_PROVIDER_IDS_KEY} from './siloAdminItems';

const setup = (answers) => {
	const calls = [];
	const forget = jest.fn();
	const call = jest.fn(async (path, options = {}) => {
		calls.push({path, ...options});
		const answer = answers[`${options.method || 'GET'} ${path}`];
		return typeof answer === 'function' ? answer(options) : answer;
	});
	return {admin: createSiloAdminItems({call, forget}), calls, forget};
};

test('Identify searches Silo for the item and applies the match with Silo\'s own ids, answering a new id', async () => {
	const {admin, calls, forget} = setup({
		'POST /api/v2/admin/items/local-9/match/search': {candidates: [
			{title: 'Get a Job', year: 2016, sources: ['tmdb'], provider_ids: {tmdb: 186759, imdb: 'tt2'}},
			{title: 'No ids'}
		]},
		'POST /api/v2/admin/items/local-9/match/apply': {content_id: 'movie-tmdb-186759'}
	});
	const found = await admin.searchRemote('Movie', {ItemId: 'local-9', Name: ' Get a Job ', Year: 2016, ProviderIds: {Tmdb: '186759'}});
	expect(calls[0].body).toEqual({title: 'Get a Job', year: 2016, tmdb_id: '186759'});
	expect(found).toEqual([{Name: 'Get a Job', ProductionYear: 2016, SearchProviderName: 'TheMovieDb',
		ProviderIds: {Tmdb: '186759', Imdb: 'tt2'}, [SILO_PROVIDER_IDS_KEY]: {tmdb: 186759, imdb: 'tt2'}}]);
	expect(await admin.applyRemoteSearchResult('local-9', found[0])).toBe('movie-tmdb-186759');
	expect(calls[1].body).toEqual({provider_ids: {tmdb: 186759, imdb: 'tt2'}});
	expect(forget).toHaveBeenCalled();
});

test('artwork lists one kind of Silo\'s choices and applies the picked one by its original link', async () => {
	const {admin, calls} = setup({
		'GET /api/v2/admin/items/movie-1/images': {items: [
			{type: 'poster', url: 'https://img/p1', original_url: 'https://orig/p1', provider_id: 'tmdb', width: 1000, height: 1500, language: 'en'},
			{type: 'poster', url: null},
			{type: 'backdrop', url: 'https://img/b1', original_url: 'https://orig/b1'}
		], page: {}}
	});
	const posters = await admin.getRemoteImages('movie-1', 'Primary');
	expect(posters).toEqual({TotalRecordCount: 1, Images: [{Url: 'https://img/p1', ProviderName: 'TheMovieDb', Type: 'Primary', Width: 1000, Height: 1500, Language: 'en'}]});
	expect((await admin.getRemoteImages('movie-1', 'Banner')).Images).toEqual([]);
	await admin.downloadRemoteImage('movie-1', 'Backdrop', 'https://img/b1');
	expect(calls.filter((c) => c.path.endsWith('/images'))).toHaveLength(1);
	expect(calls.pop()).toMatchObject({path: '/api/v2/admin/items/movie-1/images/apply', method: 'POST', body: {original_url: 'https://orig/b1', type: 'backdrop'}});
	await expect(admin.deleteItemImage('movie-1', 'Primary')).rejects.toThrow(/can't delete/);
});

test('a full refresh is Silo\'s complete mode', async () => {
	const {admin, calls} = setup({});
	await admin.refreshItem('series-1', {replaceAllMetadata: true});
	await admin.refreshItem('series-1');
	expect(calls.map((c) => c.body.mode)).toEqual(['complete', 'quick']);
});
