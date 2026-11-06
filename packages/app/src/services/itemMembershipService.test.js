import {
	canonicalServerKey,
	clearMembershipCache,
	getCachedCollectionsContaining,
	getCachedPlaylistsContaining,
	getCollectionsContaining,
	getPlaylistsContaining,
	notifyItemAddedToCollection,
	notifyItemAddedToPlaylist,
	notifyItemRemovedFromCollection,
	notifyItemRemovedFromPlaylist
} from './itemMembershipService';

describe('itemMembershipService', () => {
	beforeEach(() => {
		clearMembershipCache();
	});

	test('discovers playlists containing item and updates on removal', async () => {
		const api = {
			getPlaylists: jest.fn(async () => ({
				Items: [
					{Id: 'pl-1', Name: 'The Hux List'},
					{Id: 'pl-2', Name: 'Other Playlist'}
				]
			})),
			getPlaylistItems: jest.fn(async (id) => ({
				Items: id === 'pl-1'
					? [{Id: 'm1', PlaylistItemId: 'entry-100'}]
					: [{Id: 'm2', PlaylistItemId: 'entry-200'}]
			}))
		};

		const item = {Id: 'm1', Type: 'Movie', Name: 'Fireball 500'};
		const ctx = {serverUrl: 'http://jf', userId: 'u1'};

		const playlists = await getPlaylistsContaining(item, api, ctx);
		expect(playlists).toEqual([
			{playlistId: 'pl-1', playlistName: 'The Hux List', entryId: 'entry-100'}
		]);
		expect(api.getPlaylists).toHaveBeenCalledTimes(1);

		// Second call uses cache
		const cached = await getPlaylistsContaining(item, api, ctx);
		expect(cached).toHaveLength(1);
		expect(api.getPlaylists).toHaveBeenCalledTimes(1);

		// Removal updates cache immediately
		const serverKey = canonicalServerKey(item, ctx);
		notifyItemRemovedFromPlaylist(serverKey, 'pl-1', 'm1');
		expect(getCachedPlaylistsContaining(item, ctx)).toEqual([]);
	});

	test('discovers collections containing item, validates ancestor BoxSets, and updates on mutations', async () => {
		const api = {
			getAncestors: jest.fn(async () => [
				{Id: 'col-outer', Name: 'Outer Collection', Type: 'BoxSet'},
				{Id: 'col-direct', Name: 'Becky Collection', Type: 'BoxSet'}
			]),
			getCollections: jest.fn(async () => ({Items: []})),
			getCollectionMembers: jest.fn(async (colId) => ({
				Items: colId === 'col-direct' ? [{Id: 'm1'}] : [{Id: 'col-direct'}]
			}))
		};

		const item = {Id: 'm1', Type: 'Movie', Name: 'The Wrath of Becky'};
		const ctx = {serverUrl: 'http://jf', userId: 'u1', canManageCollections: true};

		const collections = await getCollectionsContaining(item, api, ctx);
		expect(collections).toEqual([
			{collectionId: 'col-direct', collectionName: 'Becky Collection'}
		]);
	});

	test('notifyItemAddedToPlaylist refreshes server-assigned PlaylistItemId and clearMembershipCache discards stale in-flight syncs', async () => {
		let resolveFirst;
		let callCount = 0;
		const api = {
			getPlaylists: jest.fn(() => {
				callCount++;
				if (callCount === 1) {
					return new Promise((resolve) => {
						resolveFirst = resolve;
					});
				}
				return Promise.resolve({
					Items: [{Id: 'pl-1', Name: 'The Hux List'}]
				});
			}),
			getPlaylistItems: jest.fn(async () => ({
				Items: [{Id: 'm1', PlaylistItemId: 'server-entry-999'}]
			}))
		};

		const item = {Id: 'm1', Type: 'Movie'};
		const ctx = {serverUrl: 'http://jf', userId: 'u1'};
		const serverKey = canonicalServerKey(item, ctx);

		const lookup = getPlaylistsContaining(item, api, ctx);
		notifyItemAddedToPlaylist(serverKey);
		resolveFirst({Items: []});

		const result = await lookup;
		expect(result).toEqual([
			{playlistId: 'pl-1', playlistName: 'The Hux List', entryId: 'server-entry-999'}
		]);

		// Collection add/remove notifications update cached sets
		const colApi = {
			getCollections: jest.fn(async () => ({Items: [{Id: 'c1', Name: 'Col 1'}]})),
			getCollectionMembers: jest.fn(async () => ({Items: []}))
		};
		await getCollectionsContaining(item, colApi, ctx);
		notifyItemAddedToCollection(serverKey, 'c1', ['m1']);
		expect(getCachedCollectionsContaining(item, ctx)).toEqual([
			{collectionId: 'c1', collectionName: 'Col 1'}
		]);
		notifyItemRemovedFromCollection(serverKey, 'c1', 'm1');
		expect(getCachedCollectionsContaining(item, ctx)).toEqual([]);
	});

	test('pages through playlist and collection items beyond the first page', async () => {
		const playlistFirstPage = Array.from({length: 300}, (_, idx) => ({
			Id: `pl-item-${idx}`,
			PlaylistItemId: `entry-${idx}`
		}));
		const collectionFirstPage = Array.from({length: 500}, (_, idx) => ({
			Id: `col-item-${idx}`
		}));

		const api = {
			getPlaylists: jest.fn(async () => ({
				Items: [{Id: 'pl-large', Name: 'Large Playlist'}]
			})),
			getPlaylistItems: jest.fn(async (_id, _limit, startIndex = 0) => ({
				Items: startIndex === 0
					? playlistFirstPage
					: [{Id: 'm-late', PlaylistItemId: 'entry-301'}],
				TotalRecordCount: 301
			})),
			getCollections: jest.fn(async () => ({
				Items: [{Id: 'col-large', Name: 'Large Collection'}]
			})),
			getCollectionMembers: jest.fn(async (_colId, _limit, startIndex) => ({
				Items: startIndex === 0
					? collectionFirstPage
					: [{Id: 'm-late'}],
				TotalRecordCount: 501
			}))
		};

		const item = {Id: 'm-late', Type: 'Movie', Name: 'Late Entry'};
		const ctx = {serverUrl: 'http://jf', userId: 'u1', canManageCollections: true};

		const playlists = await getPlaylistsContaining(item, api, ctx);
		expect(playlists).toEqual([
			{playlistId: 'pl-large', playlistName: 'Large Playlist', entryId: 'entry-301'}
		]);
		expect(api.getPlaylistItems).toHaveBeenCalledTimes(2);
		expect(api.getPlaylistItems).toHaveBeenNthCalledWith(1, 'pl-large', 300, 0, true);
		expect(api.getPlaylistItems).toHaveBeenNthCalledWith(2, 'pl-large', 300, 300, true);

		const collections = await getCollectionsContaining(item, api, ctx);
		expect(collections).toEqual([
			{collectionId: 'col-large', collectionName: 'Large Collection'}
		]);
		expect(api.getCollectionMembers).toHaveBeenCalledTimes(2);
		expect(api.getCollectionMembers).toHaveBeenNthCalledWith(1, 'col-large', 500, 0);
		expect(api.getCollectionMembers).toHaveBeenNthCalledWith(2, 'col-large', 500, 500);
	});

	test('leaves out a playlist entry the server gave no entry id, since it cant be removed', async () => {
		const api = {
			getPlaylists: jest.fn(async () => ({Items: [{Id: 'pl-1', Name: 'The Hux List'}]})),
			getPlaylistItems: jest.fn(async () => ({Items: [{Id: 'm1'}]}))
		};

		expect(await getPlaylistsContaining({Id: 'm1', Type: 'Movie'}, api, {serverUrl: 'http://jf', userId: 'u1'})).toEqual([]);
	});

	test('excludes non-editable Silo ancestors via api.canEditCollection', async () => {
		const api = {
			getAncestors: jest.fn(async () => [
				{Id: 'col-shared', Name: 'Shared Collection', Type: 'BoxSet', _silo: {collection_type: 'manual', creator_profile_id: 'other'}},
				{Id: 'col-own', Name: 'Own Collection', Type: 'BoxSet', _silo: {collection_type: 'manual', creator_profile_id: 'u1'}}
			]),
			canEditCollection: jest.fn((box) => box?._silo?.creator_profile_id === 'u1'),
			getEditableCollections: jest.fn(async () => ({Items: []})),
			getCollectionMembers: jest.fn(async () => ({
				Items: [{Id: 'm1'}]
			}))
		};

		const item = {Id: 'm1', Type: 'Movie', Name: 'Silo Movie'};
		const ctx = {serverUrl: 'http://silo', userId: 'u1', canManageCollections: true};

		const collections = await getCollectionsContaining(item, api, ctx);
		expect(collections).toEqual([
			{collectionId: 'col-own', collectionName: 'Own Collection'}
		]);
		expect(api.canEditCollection).toHaveBeenCalled();
		expect(api.getCollectionMembers).toHaveBeenCalledTimes(1);
		expect(api.getCollectionMembers).toHaveBeenCalledWith('col-own', 500, 0);
	});
});

