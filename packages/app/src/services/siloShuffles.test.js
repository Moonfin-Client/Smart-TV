import {createSiloShuffles, siloShuffleScope} from './siloShuffles';
import {extendServerShuffle, startServerShuffle, stopServerShuffle} from './serverShuffle';

const map = (card) => ({Id: card.content_id, Name: card.title});

test('Silo shuffles shows, seasons, collections and libraries', () => {
	expect(siloShuffleScope({Id: 'series-tvdb-1', Type: 'Series'})).toEqual({kind: 'series', id: 'series-tvdb-1'});
	expect(siloShuffleScope({Id: 'season-tvdb-1-2', Type: 'Season'})).toEqual({kind: 'season', id: 'season-tvdb-1-2'});
	expect(siloShuffleScope({Id: 'silo-collection:9', Type: 'BoxSet'})).toEqual({kind: 'user_collection', id: '9'});
	expect(siloShuffleScope({Id: 'silo-libcollection:3:7', Type: 'BoxSet'})).toEqual({kind: 'library_collection', id: '7'});
	expect(siloShuffleScope({Id: '4', Type: 'CollectionFolder'})).toEqual({kind: 'library', id: '4'});
	expect(siloShuffleScope({Id: '4', Type: 'Person'})).toBeNull();
	expect(siloShuffleScope({Id: 'movie-tmdb-1', Type: 'Movie'})).toBeNull();
});

describe('a server shuffle as a growing queue', () => {
	let calls;
	let api;
	beforeEach(() => {
		stopServerShuffle();
		calls = [];
		let n = 2;
		const call = jest.fn(async (path, options = {}) => {
			calls.push({path, ...options});
			if (path === '/api/v2/shuffles/capabilities') return {state: 'available', allowed: true, scope_kinds: ['series', 'season']};
			if (path === '/api/v2/shuffles') return {id: 's1', current: {content_id: 'e1'}, next: {content_id: 'e2'}};
			n += 1;
			return {id: 's1', current: {content_id: `e${n - 1}`}, next: {content_id: `e${n}`}};
		});
		api = createSiloShuffles({call, map});
	});

	test('starts with now and next, then grows by one as each next starts', async () => {
		const first = await startServerShuffle(api, {Id: 'series-tvdb-1', Type: 'Series'});
		expect(first.map((i) => i.Id)).toEqual(['e1', 'e2']);
		expect(calls[1]).toMatchObject({path: '/api/v2/shuffles', method: 'POST', body: {scope: {kind: 'series', id: 'series-tvdb-1'}}});
		expect(await extendServerShuffle(first[0])).toBeNull();
		// The same episode queued some other way (the episode browser) doesn't move the shuffle.
		expect(await extendServerShuffle({Id: 'e2'})).toBeNull();
		const [e3] = await extendServerShuffle(first[1]);
		expect(e3.Id).toBe('e3');
		expect(calls[2]).toMatchObject({path: '/api/v2/shuffles/s1/advance', body: {from_content_id: 'e1'}});
		expect((await extendServerShuffle(e3)).map((i) => i.Id)).toEqual(['e4']);
		expect(calls[3].body).toEqual({from_content_id: 'e2'});
	});

	test('a scope the server doesn\'t shuffle is left to the app', async () => {
		expect(await startServerShuffle(api, {Id: 'silo-collection:9', Type: 'BoxSet'})).toBeNull();
		expect(await startServerShuffle({}, {Id: 'series-1'})).toBeNull();
	});
});
