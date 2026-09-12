import {findParentCollection, findParentCollections, __resetCollectionMembership} from './parentCollection';

const ACE = {Id: 'box-ace', Name: 'Ace Ventura Collection', ProviderIds: {Tmdb: '3167'}};
const ALIEN = {Id: 'box-alien', Name: 'Alien Collection', ProviderIds: {Tmdb: '8091'}};
const HAND_MADE = {Id: 'box-mine', Name: 'Saturday Night'};

const notFound = () => Promise.reject(new Error('Not Found'));

// Stands in for a server too old to carry the route: the collections it holds, and what
// each one contains.
const serverWith = (collections, members = {}) => {
	const calls = {collections: 0, members: 0, direct: 0};
	const api = {
		getItemCollections: () => {
			calls.direct++;
			return notFound();
		},
		getItems: ({IncludeItemTypes, ParentId}) => {
			if (IncludeItemTypes === 'BoxSet') {
				calls.collections++;
				return Promise.resolve({Items: collections});
			}
			calls.members++;
			return Promise.resolve({Items: members[ParentId] || []});
		}
	};
	return {api, calls};
};

// Stands in for a server that answers the question itself.
const serverAnswering = (holding) => {
	const calls = {collections: 0, direct: 0};
	const api = {
		getItemCollections: () => {
			calls.direct++;
			return Promise.resolve({Items: holding});
		},
		getItems: () => {
			calls.collections++;
			return Promise.resolve({Items: []});
		}
	};
	return {api, calls};
};

const movie = (over = {}) => ({Id: 'movie-1', Name: 'Ace Ventura', ...over});

describe('findParentCollection', () => {
	beforeEach(() => __resetCollectionMembership());

	test('a title naming a collection is matched on that id alone', async () => {
		const {api, calls} = serverWith([ALIEN, ACE]);

		const found = await findParentCollection(api, movie({ProviderIds: {TmdbCollection: '3167'}}));

		expect(found).toBe(ACE);
		expect(calls.members).toBe(0);
	});

	test('the ids are read whatever case the server spells them in', async () => {
		const {api} = serverWith([{...ACE, ProviderIds: {tmdb: '3167'}}]);

		const found = await findParentCollection(api, movie({ProviderIds: {tmdbcollection: '3167'}}));

		expect(found.Id).toBe('box-ace');
	});

	test('a hand made collection is found by asking each one what it holds', async () => {
		const {api, calls} = serverWith([ACE, HAND_MADE], {'box-mine': [{Id: 'movie-1'}]});

		const found = await findParentCollection(api, movie());

		expect(found).toBe(HAND_MADE);
		expect(calls.members).toBe(2);
	});

	test('what each collection holds is asked once and reused', async () => {
		const {api, calls} = serverWith([ACE, HAND_MADE], {'box-mine': [{Id: 'movie-1'}, {Id: 'movie-2'}]});

		await findParentCollection(api, movie());
		await findParentCollection(api, movie({Id: 'movie-2'}));

		expect(calls.members).toBe(2);
	});

	test('a title in no collection comes back with nothing', async () => {
		const {api} = serverWith([ACE], {'box-ace': [{Id: 'someone-else'}]});

		expect(await findParentCollection(api, movie({Id: 'stray'}))).toBeNull();
	});

	test('a collection id nothing on the server carries falls through to the asking', async () => {
		const {api, calls} = serverWith([ACE], {'box-ace': [{Id: 'movie-1'}]});

		const found = await findParentCollection(api, movie({ProviderIds: {TmdbCollection: '999999'}}));

		expect(found).toBe(ACE);
		expect(calls.members).toBe(1);
	});

	test('a server with no collections is left alone', async () => {
		const {api, calls} = serverWith([]);

		expect(await findParentCollection(api, movie())).toBeNull();
		expect(calls.members).toBe(0);
	});

	test('a collection that cant be read is skipped rather than failing the rest', async () => {
		const api = {
			getItemCollections: notFound,
			getItems: ({IncludeItemTypes, ParentId}) => {
				if (IncludeItemTypes === 'BoxSet') return Promise.resolve({Items: [ACE, HAND_MADE]});
				if (ParentId === 'box-ace') return Promise.reject(new Error('gone'));
				return Promise.resolve({Items: [{Id: 'movie-1'}]});
			}
		};

		expect(await findParentCollection(api, movie())).toBe(HAND_MADE);
	});

	test('nothing to go on is handled without throwing', async () => {
		const {api} = serverWith([ACE]);

		expect(await findParentCollection(api, null)).toBeNull();
		expect(await findParentCollection(null, movie())).toBeNull();
	});
});

describe('findParentCollection and the direct route', () => {
	beforeEach(() => __resetCollectionMembership());

	test('the answer is taken as given and nothing is worked out', async () => {
		const {api, calls} = serverAnswering([HAND_MADE]);

		expect(await findParentCollection(api, movie())).toBe(HAND_MADE);
		expect(calls.collections).toBe(0);
	});

	test('the collection the title names wins when it is in several', async () => {
		const {api} = serverAnswering([HAND_MADE, ACE]);

		const found = await findParentCollection(api, movie({ProviderIds: {TmdbCollection: '3167'}}));

		expect(found).toBe(ACE);
	});

	test('the first stands when the title names none of them', async () => {
		const {api} = serverAnswering([HAND_MADE, ACE]);

		expect(await findParentCollection(api, movie())).toBe(HAND_MADE);
	});

	test('an empty answer is the whole answer', async () => {
		const {api, calls} = serverAnswering([]);

		expect(await findParentCollection(api, movie())).toBeNull();
		expect(calls.collections).toBe(0);
	});

	test('a server that turns the route away is worked out the long way instead', async () => {
		const {api, calls} = serverWith([ACE], {'box-ace': [{Id: 'movie-1'}]});

		expect(await findParentCollection(api, movie())).toBe(ACE);
		expect(calls.direct).toBe(1);
		expect(calls.collections).toBe(1);
	});
});

describe('findParentCollections', () => {
	beforeEach(__resetCollectionMembership);

	it('lists every collection the server says holds the title', async () => {
		const {api} = serverAnswering([ACE, ALIEN]);
		const found = await findParentCollections(api, {Id: 'movie-1'});
		expect(found.map((c) => c.Id)).toEqual(['box-ace', 'box-alien']);
	});

	it('leads with the collection the title names', async () => {
		const {api} = serverAnswering([ACE, ALIEN]);
		const found = await findParentCollections(api, {Id: 'movie-1', ProviderIds: {TmdbCollection: '8091'}});
		expect(found.map((c) => c.Id)).toEqual(['box-alien', 'box-ace']);
	});

	it('lists every hand made collection holding the title on a server without the route', async () => {
		const {api} = serverWith([HAND_MADE, ACE], {'box-mine': [{Id: 'movie-1'}], 'box-ace': [{Id: 'movie-1'}]});
		const found = await findParentCollections(api, {Id: 'movie-1'});
		expect(found.map((c) => c.Id)).toEqual(['box-mine', 'box-ace']);
	});

	it('has nothing to list when no collection holds the title', async () => {
		const {api} = serverAnswering([]);
		expect(await findParentCollections(api, {Id: 'movie-1'})).toEqual([]);
		expect(await findParentCollections(null, {Id: 'movie-1'})).toEqual([]);
	});

	it('still answers the single collection question with the first of them', async () => {
		const {api} = serverAnswering([ACE, ALIEN]);
		expect((await findParentCollection(api, {Id: 'movie-1'})).Id).toBe('box-ace');
	});
});
