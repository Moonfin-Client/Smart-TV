// Discovers and caches whether an item belongs to any playlists or collections
// on the media server (Jellyfin, Emby, Plex, Silo).

const CACHE_TTL_MS = 5 * 60 * 1000;
const COLLECTION_FETCH_LIMIT = 500;
const PLAYLIST_ITEMS_LIMIT = 300;
const MAX_CONCURRENT_BATCH = 16;
const MAX_PAGED_ITEMS = 5000;

let sessionGeneration = 0;

// serverKey -> Map<playlistId, Array<{itemId, entryId}>>
const playlistItemsByServer = new Map();
// serverKey -> Map<playlistId, string>
const playlistNamesByServer = new Map();
// serverKey -> number (timestamp)
const playlistLastFetched = new Map();
// serverKey -> Promise<void>
const playlistInFlight = new Map();
// serverKey -> number
const playlistMutationGenerations = new Map();

// serverKey -> Map<collectionId, Set<string>>
const collectionMembersByServer = new Map();
// serverKey -> Map<collectionId, string>
const collectionNamesByServer = new Map();
// serverKey -> number (timestamp)
const collectionLastFetched = new Map();
// serverKey -> Promise<void>
const collectionInFlight = new Map();
// serverKey -> number
const collectionMutationGenerations = new Map();

export const isExternalItem = (item) => {
	if (!item) return true;
	if (item._seerr || item._seerrRaw || item._seerrCredit || item._mdblist || item._letterboxd || item._external) {
		return true;
	}
	const id = String(item.Id || '');
	return !id || id.startsWith('seerr-') || id.startsWith('tt');
};

export const canonicalServerKey = (item, {serverUrl = '', userId = ''} = {}) => {
	const resolvedUrl = item?._serverUrl || serverUrl || 'active';
	const resolvedUser = item?._serverUserId || userId || 'user';
	return `${resolvedUrl}::${resolvedUser}`;
};

const isFresh = (map, serverKey) => {
	const ts = map.get(serverKey);
	return typeof ts === 'number' && (Date.now() - ts) < CACHE_TTL_MS;
};

export const getCachedPlaylistsContaining = (item, context = {}) => {
	if (isExternalItem(item)) return [];
	const serverKey = canonicalServerKey(item, context);
	const pItems = playlistItemsByServer.get(serverKey);
	const pNames = playlistNamesByServer.get(serverKey);
	if (!pItems || !pNames) return [];

	const result = [];
	for (const [playlistId, members] of pItems.entries()) {
		const match = members.find((m) => m.itemId === String(item.Id));
		if (match) {
			result.push({
				playlistId,
				playlistName: pNames.get(playlistId) || '',
				entryId: match.entryId
			});
		}
	}
	return result;
};

export const getCachedCollectionsContaining = (item, context = {}) => {
	if (isExternalItem(item)) return [];
	const serverKey = canonicalServerKey(item, context);
	const cMembers = collectionMembersByServer.get(serverKey);
	const cNames = collectionNamesByServer.get(serverKey);
	if (!cMembers || !cNames) return [];

	const result = [];
	for (const [collectionId, memberIds] of cMembers.entries()) {
		if (memberIds.has(String(item.Id))) {
			result.push({
				collectionId,
				collectionName: cNames.get(collectionId) || ''
			});
		}
	}
	return result;
};

const fetchAllPlaylistItems = async (api, playlistId, isStale) => {
	const allItems = [];
	let startIndex = 0;
	while (startIndex < MAX_PAGED_ITEMS) {
		if (isStale?.()) break;
		const res = await api.getPlaylistItems(playlistId, PLAYLIST_ITEMS_LIMIT, startIndex);
		const page = Array.isArray(res?.Items) ? res.Items : [];
		allItems.push(...page);
		startIndex += page.length;
		const total = typeof res?.TotalRecordCount === 'number' ? res.TotalRecordCount : null;
		if (page.length < PLAYLIST_ITEMS_LIMIT || (total !== null && startIndex >= total)) {
			break;
		}
	}
	return allItems;
};

const fetchAllCollectionItems = async (api, collectionId, isStale) => {
	const allItems = [];
	let startIndex = 0;
	let useMembersEndpoint = Boolean(api.getCollectionMembers);
	while (startIndex < MAX_PAGED_ITEMS) {
		if (isStale?.()) break;
		let res;
		if (useMembersEndpoint) {
			try {
				res = await api.getCollectionMembers(collectionId, COLLECTION_FETCH_LIMIT, startIndex);
			} catch (err) {
				if (err?.status === 501 && api.getCollectionItems) {
					useMembersEndpoint = false;
					res = startIndex === 0
						? await api.getCollectionItems(collectionId, COLLECTION_FETCH_LIMIT)
						: await api.getCollectionItems(collectionId, COLLECTION_FETCH_LIMIT, null, 'Ascending', startIndex);
				} else {
					throw err;
				}
			}
		} else {
			res = startIndex === 0
				? await api.getCollectionItems(collectionId, COLLECTION_FETCH_LIMIT)
				: await api.getCollectionItems(collectionId, COLLECTION_FETCH_LIMIT, null, 'Ascending', startIndex);
		}
		const page = Array.isArray(res?.Items) ? res.Items : [];
		allItems.push(...page);
		startIndex += page.length;
		const total = typeof res?.TotalRecordCount === 'number' ? res.TotalRecordCount : null;
		if (page.length < COLLECTION_FETCH_LIMIT || (total !== null && startIndex >= total)) {
			break;
		}
	}
	return allItems;
};

const syncPlaylists = (api, serverKey) => {
	if (!api?.getPlaylists) return Promise.resolve();
	const existing = playlistInFlight.get(serverKey);
	if (existing) return existing;

	const generation = sessionGeneration;
	const mutationGen = playlistMutationGenerations.get(serverKey) || 0;
	const isStale = () =>
		generation !== sessionGeneration ||
		mutationGen !== (playlistMutationGenerations.get(serverKey) || 0);

	const promise = (async () => {
		try {
			const data = await api.getPlaylists();
			if (isStale()) return;
			const items = Array.isArray(data?.Items) ? data.Items : [];
			const previous = playlistItemsByServer.get(serverKey);
			const nameMap = new Map();
			const itemMap = new Map();

			for (let i = 0; i < items.length; i += MAX_CONCURRENT_BATCH) {
				if (isStale()) return;
				await Promise.all(items.slice(i, i + MAX_CONCURRENT_BATCH).map(async (pl) => {
					const id = pl?.Id != null ? String(pl.Id) : '';
					const name = pl?.Name != null ? String(pl.Name) : '';
					if (!id || !name) return;
					nameMap.set(id, name);

					try {
						const memberList = await fetchAllPlaylistItems(api, id, isStale);
						const members = [];
						for (const m of memberList) {
							const itemId = m?.Id != null ? String(m.Id) : '';
							const entryId = m?.PlaylistItemId != null ? String(m.PlaylistItemId) : itemId;
							if (itemId && entryId) {
								members.push({itemId, entryId});
							}
						}
						itemMap.set(id, members);
					} catch {
						const old = previous?.get(id);
						if (old) itemMap.set(id, old);
					}
				}));
			}

			if (isStale()) return;
			playlistNamesByServer.set(serverKey, nameMap);
			playlistItemsByServer.set(serverKey, itemMap);
			playlistLastFetched.set(serverKey, Date.now());
		} catch {
			// Ignore network errors
		} finally {
			if (playlistInFlight.get(serverKey) === promise) {
				playlistInFlight.delete(serverKey);
			}
		}
	})();

	playlistInFlight.set(serverKey, promise);
	return promise;
};

const syncCollections = (api, serverKey) => {
	if (!api?.getCollections && !api?.getEditableCollections) return Promise.resolve();
	const existing = collectionInFlight.get(serverKey);
	if (existing) return existing;

	const generation = sessionGeneration;
	const mutationGen = collectionMutationGenerations.get(serverKey) || 0;
	const isStale = () =>
		generation !== sessionGeneration ||
		mutationGen !== (collectionMutationGenerations.get(serverKey) || 0);

	const promise = (async () => {
		try {
			const res = await (api.getEditableCollections
				? api.getEditableCollections()
				: api.getCollections(COLLECTION_FETCH_LIMIT, 'SortName', 'Ascending', {editableOnly: true}));
			if (isStale()) return;
			const items = Array.isArray(res?.Items) ? res.Items : [];
			const previous = collectionMembersByServer.get(serverKey);
			const nameMap = new Map();
			const memberMap = new Map();
			const candidates = [];

			for (const boxSet of items) {
				const id = boxSet?.Id != null ? String(boxSet.Id) : '';
				const name = boxSet?.Name != null ? String(boxSet.Name) : '';
				if (!id || !name) continue;
				nameMap.set(id, name);
				candidates.push({id, name});
			}

			for (let i = 0; i < candidates.length; i += MAX_CONCURRENT_BATCH) {
				if (isStale()) return;
				const batch = candidates.slice(i, i + MAX_CONCURRENT_BATCH);
				await Promise.all(batch.map(async (candidate) => {
					try {
						const membersList = await fetchAllCollectionItems(api, candidate.id, isStale);
						const memberIds = new Set();
						for (const m of membersList) {
							if (m?.Id != null) memberIds.add(String(m.Id));
						}
						memberMap.set(candidate.id, memberIds);
					} catch {
						const old = previous?.get(candidate.id);
						if (old) memberMap.set(candidate.id, old);
					}
				}));
			}

			if (isStale()) return;
			collectionNamesByServer.set(serverKey, nameMap);
			collectionMembersByServer.set(serverKey, memberMap);
			collectionLastFetched.set(serverKey, Date.now());
		} catch {
			// Ignore network errors
		} finally {
			if (collectionInFlight.get(serverKey) === promise) {
				collectionInFlight.delete(serverKey);
			}
		}
	})();

	collectionInFlight.set(serverKey, promise);
	return promise;
};

export const getPlaylistsContaining = async (item, api, context = {}) => {
	if (isExternalItem(item) || !api) return [];
	const serverKey = canonicalServerKey(item, context);
	const generation = sessionGeneration;

	if (context.forceRefresh || !isFresh(playlistLastFetched, serverKey)) {
		await syncPlaylists(api, serverKey);
		if (generation !== sessionGeneration) return [];
		if (!playlistLastFetched.has(serverKey)) {
			await syncPlaylists(api, serverKey);
			if (generation !== sessionGeneration) return [];
		}
	}

	return getCachedPlaylistsContaining(item, context);
};

export const getCollectionsContaining = async (item, api, context = {}) => {
	if (isExternalItem(item) || !api) return [];
	if (context.canManageCollections === false) return [];

	const serverKey = canonicalServerKey(item, context);
	const generation = sessionGeneration;

	const ancestorBoxSets = new Map();
	if (api.getAncestors) {
		try {
			const ancestors = await api.getAncestors(item.Id);
			if (generation !== sessionGeneration) return [];
			if (Array.isArray(ancestors)) {
				for (const ancestor of ancestors) {
					if (ancestor?.Type === 'BoxSet' && ancestor.Id && ancestor.Name) {
						if (typeof api.canEditCollection === 'function' && api.canEditCollection(ancestor) === false) {
							continue;
						}
						if (ancestor._smart || ancestor.smart === 1 || ancestor.smart === '1' || ancestor.smart === true) {
							continue;
						}
						ancestorBoxSets.set(String(ancestor.Id), {name: String(ancestor.Name), ancestor});
					}
				}
			}
		} catch {
			// Ignore ancestor lookup failures
		}
	}

	if (context.forceRefresh || !isFresh(collectionLastFetched, serverKey)) {
		await syncCollections(api, serverKey);
		if (generation !== sessionGeneration) return [];
		if (!collectionLastFetched.has(serverKey)) {
			await syncCollections(api, serverKey);
			if (generation !== sessionGeneration) return [];
		}
	}

	const results = [...getCachedCollectionsContaining(item, context)];

	for (const [colId, {name: colName, ancestor}] of ancestorBoxSets.entries()) {
		if (!results.some((c) => c.collectionId === colId)) {
			if (typeof api.canEditCollection === 'function' && api.canEditCollection(ancestor) === false) {
				continue;
			}
			if (api.getCollectionMembers || api.getCollectionItems) {
				try {
					const members = await fetchAllCollectionItems(api, colId, () => generation !== sessionGeneration);
					if (generation !== sessionGeneration) return [];
					const isDirectMember = members.some((m) => String(m?.Id) === String(item.Id));
					if (!isDirectMember) continue;
				} catch {
					continue;
				}
			}
			results.push({collectionId: colId, collectionName: colName});
		}
	}

	return results;
};

export const notifyItemAddedToPlaylist = (serverKey, playlistId, itemIds, api) => {
	if (!serverKey) return;
	playlistMutationGenerations.set(serverKey, (playlistMutationGenerations.get(serverKey) || 0) + 1);
	playlistLastFetched.delete(serverKey);
	if (api?.getPlaylists) {
		const generation = sessionGeneration;
		const inFlight = playlistInFlight.get(serverKey);
		if (inFlight) {
			inFlight.finally(() => {
				if (
					generation === sessionGeneration &&
					!playlistInFlight.has(serverKey) &&
					!playlistLastFetched.has(serverKey)
				) {
					syncPlaylists(api, serverKey);
				}
			});
		} else {
			syncPlaylists(api, serverKey);
		}
	}
};

export const notifyItemRemovedFromPlaylist = (serverKey, playlistId, itemId) => {
	if (!serverKey) return;
	playlistMutationGenerations.set(serverKey, (playlistMutationGenerations.get(serverKey) || 0) + 1);
	const serverPlaylists = playlistItemsByServer.get(serverKey);
	if (serverPlaylists && itemId != null) {
		if (playlistId != null && serverPlaylists.has(String(playlistId))) {
			const filtered = serverPlaylists.get(String(playlistId)).filter((m) => m.itemId !== String(itemId));
			serverPlaylists.set(String(playlistId), filtered);
		} else if (playlistId == null) {
			for (const [plId, members] of serverPlaylists.entries()) {
				serverPlaylists.set(plId, members.filter((m) => m.itemId !== String(itemId)));
			}
		}
	}
	playlistLastFetched.delete(serverKey);
};

export const notifyItemAddedToCollection = (serverKey, collectionId, itemIds = []) => {
	if (!serverKey) return;
	collectionMutationGenerations.set(serverKey, (collectionMutationGenerations.get(serverKey) || 0) + 1);
	const serverCollections = collectionMembersByServer.get(serverKey);
	if (serverCollections?.has(String(collectionId))) {
		const set = serverCollections.get(String(collectionId));
		for (const id of itemIds) {
			if (id != null) set.add(String(id));
		}
	}
	collectionLastFetched.delete(serverKey);
};

export const notifyItemRemovedFromCollection = (serverKey, collectionId, itemId) => {
	if (!serverKey) return;
	collectionMutationGenerations.set(serverKey, (collectionMutationGenerations.get(serverKey) || 0) + 1);
	const serverCollections = collectionMembersByServer.get(serverKey);
	if (serverCollections && itemId != null) {
		if (collectionId != null && serverCollections.has(String(collectionId))) {
			serverCollections.get(String(collectionId)).delete(String(itemId));
		} else if (collectionId == null) {
			for (const set of serverCollections.values()) {
				set.delete(String(itemId));
			}
		}
	}
	collectionLastFetched.delete(serverKey);
};

export const warmMembershipCache = (api, {serverUrl = '', userId = '', canManageCollections = true, supportsPlaylists = true} = {}) => {
	if (!api) return;
	const serverKey = canonicalServerKey(null, {serverUrl, userId});
	if (supportsPlaylists && !isFresh(playlistLastFetched, serverKey)) {
		syncPlaylists(api, serverKey);
	}
	if (canManageCollections && !isFresh(collectionLastFetched, serverKey)) {
		syncCollections(api, serverKey);
	}
};

export const clearMembershipCache = () => {
	sessionGeneration++;
	playlistItemsByServer.clear();
	playlistNamesByServer.clear();
	playlistLastFetched.clear();
	playlistInFlight.clear();
	playlistMutationGenerations.clear();
	collectionMembersByServer.clear();
	collectionNamesByServer.clear();
	collectionLastFetched.clear();
	collectionInFlight.clear();
	collectionMutationGenerations.clear();
};

