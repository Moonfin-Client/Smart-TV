import * as multiServerManager from './multiServerManager';
import {createApiForServer} from './jellyfinApi';
import {withoutBlockedItems} from './parentalControls';
import {profileProof, siloSessionOfAccount} from './siloSession';
import {deduplicateMediaItems} from '../utils/mediaDedup';
import {foldCopies} from '../utils/mergedCopies';
import {searchLibrary} from '../utils/searchGroups';
import {shuffled} from '../utils/shuffled';

// The server an item came from, carried on it so it can be reached again.
const serverTags = (server) => ({
	_serverId: server.serverId,
	_serverName: server.name,
	_serverUrl: server.url,
	_serverUserId: server.userId,
	_serverAccessToken: server.accessToken,
	_serverType: server.serverType || 'jellyfin'
});

// Just the server fields `serverTags` puts on an item.
const tagsOf = (item) => Object.keys(serverTags({})).reduce((tags, key) => ({...tags, [key]: item[key]}), {});

const timeOf = (value) => {
	const time = value ? new Date(value).getTime() : NaN;
	return Number.isNaN(time) ? 0 : time;
};

// Whether a Silo profile would ask for its PIN now: it has one, and no proof of it that's still good is kept.
const siloNeedsPin = (account) => account.siloHasPin === true &&
	!profileProof(siloSessionOfAccount(account.url, account.siloAccountId), account.userId);

// The account each server is read with: the signed-in one on its own server, elsewhere the first saved account with a
// token, or for Silo the most recently used profile that can act without asking for its PIN. A server with none of
// those is left out. One account per server keeps a title several servers hold to one copy per server, and marking it
// watched from here never reaches another saved account.
const oneAccountPerServer = (servers, active) => {
	const activeServerId = active?.serverId || active?.id;
	const byServer = new Map();
	(servers || []).forEach((server) => {
		if (!byServer.has(server.serverId)) byServer.set(server.serverId, []);
		byServer.get(server.serverId).push(server);
	});
	const chosen = [];
	byServer.forEach((accounts, serverId) => {
		const usable = accounts.filter((entry) => entry.accessToken);
		let picked = serverId === activeServerId ? usable.find((entry) => entry.userId === active?.userId) : null;
		if (!picked) {
			picked = (accounts[0]?.serverType === 'silo')
				? usable.filter((entry) => !siloNeedsPin(entry)).sort((a, b) => timeOf(b.lastConnected) - timeOf(a.lastConnected))[0]
				: usable[0];
		}
		if (picked) chosen.push(picked);
	});
	return chosen;
};

const getLoggedInServers = async () => {
	const [servers, active] = await Promise.all([
		multiServerManager.getAllServersArray(),
		multiServerManager.getActiveServer()
	]);
	return oneAccountPerServer(servers, active);
};

export const executeAll = async (apiFn, options = {}) => {
	const servers = await getLoggedInServers();

	if (servers.length === 0) {
		console.warn('[ConnectionPool] No servers configured');
		return [];
	}

	const {
		sortBy = null,
		shuffle = false,
		limit = null,
		dedupe = null,
		ignoreErrors = true
	} = options;

	const results = [];

	const promises = servers.map(async (server) => {
		try {
			const api = createApiForServer(server.url, server.accessToken, server.userId, server.serverType || 'jellyfin');
			const data = await apiFn(api, server);

			if (Array.isArray(data)) {
				return data.map(item => ({...item, ...serverTags(server)}));
			} else if (data && typeof data === 'object') {
				return [{...data, ...serverTags(server)}];
			}
			return [];
		} catch (err) {
			console.warn(`[ConnectionPool] Error from server ${server.name}:`, err);
			if (!ignoreErrors) {
				throw err;
			}
			return [];
		}
	});

	const allResults = await Promise.all(promises);

	allResults.forEach(serverResults => {
		results.push(...serverResults);
	});

	// Libraries and the like carry no rating, so they pass through untouched.
	let processedResults = withoutBlockedItems(results);

	if (dedupe === 'provider') {
		processedResults = deduplicateMediaItems(processedResults);
	} else if (dedupe === 'fold') {
		// Merged libraries keep the other servers' copies on the card instead of dropping them.
		processedResults = foldCopies(processedResults);
	} else if (dedupe) {
		const seen = new Set();
		processedResults = processedResults.filter(item => {
			const key = item[dedupe];
			if (seen.has(key)) {
				return false;
			}
			seen.add(key);
			return true;
		});
	}

	if (shuffle) {
		processedResults = shuffled(processedResults);
	} else if (sortBy && typeof sortBy === 'function') {
		processedResults.sort(sortBy);
	}

	if (limit && limit > 0) {
		processedResults = processedResults.slice(0, limit);
	}

	return processedResults;
};

// Each server hands its libraries back in the order the viewer arranged them
// there, so group the servers and leave those runs alone. The index holds a run
// together because sort isn't stable on the older TV engines.
const groupLibrariesByServer = (libraries) => libraries
	.map((library, index) => ({library, index}))
	.sort((a, b) =>
		(a.library._serverName || '').localeCompare(b.library._serverName || '') ||
		a.index - b.index
	)
	.map((entry) => entry.library);

// Every server's libraries, plus whether every server answered. A server that was slow to come up would otherwise
// stay missing, along with the libraries merged across it, until the next reload, so a caller can try again.
export const readLibrariesFromAllServers = async () => {
	const servers = await getLoggedInServers();
	let complete = true;
	const perServer = await Promise.all(servers.map(async (server) => {
		try {
			const api = createApiForServer(server.url, server.accessToken, server.userId, server.serverType || 'jellyfin');
			const result = await api.getLibraries();
			return (result?.Items || []).map((library) => ({...library, ...serverTags(server)}));
		} catch (err) {
			console.warn(`[ConnectionPool] Libraries lookup failed on ${server.name}:`, err);
			complete = false;
			return [];
		}
	}));
	return {libraries: groupLibrariesByServer(withoutBlockedItems(perServer.flat())), complete};
};

export const getLibrariesFromAllServers = async () => (await readLibrariesFromAllServers()).libraries;

// The server libraries a merged library of `collectionType` ('movies' or 'tvshows') reads, the active server's first
// so a tie in the sort shows that copy. A server that doesn't answer is left out, and `complete` says whether every
// one answered.
export const getMergedLibrarySources = async (collectionType) => {
	const [{libraries, complete}, active] = await Promise.all([
		readLibrariesFromAllServers(),
		multiServerManager.getActiveServer()
	]);
	const activeId = active?.serverId || active?.id;
	const sources = libraries
		.filter((library) => (library.CollectionType || '').toLowerCase() === collectionType)
		.map((library) => ({
			api: createApiForServer(library._serverUrl, library._serverAccessToken, library._serverUserId, library._serverType),
			libraryId: library.Id,
			server: tagsOf(library)
		}));
	return {sources: [
		...sources.filter((source) => source.server._serverId === activeId),
		...sources.filter((source) => source.server._serverId !== activeId)
	], complete};
};

export const getRandomItemsFromAllServers = async (contentType = 'both', limit = 10, libraryIds = []) => {
	// Each server is asked for a bit more than its share since duplicates get dropped.
	const servers = await getLoggedInServers();
	const serverCount = servers.length;
	const perServerLimit = Math.ceil((limit * 1.5) / Math.max(serverCount, 1));

	const wanted = new Set((libraryIds || []).map(id => String(id).replace(/-/g, '').toLowerCase()));
	const bareId = id => String(id).replace(/-/g, '').toLowerCase();

	return executeAll(
		async (api) => {
			if (wanted.size === 0) {
				const result = await api.getRandomItems(contentType, perServerLimit);
				return result.Items || [];
			}
			// With a selection, only pull from the chosen libraries this server has.
			const libs = await api.getLibraries().catch(() => ({Items: []}));
			const owned = (libs.Items || []).filter(lib => wanted.has(bareId(lib.Id)));
			if (owned.length === 0) return [];
			const perLib = Math.ceil(perServerLimit / owned.length) || 1;
			const results = await Promise.all(
				owned.map(lib => api.getRandomItems(contentType, perLib, lib.Id).catch(() => null))
			);
			const items = [];
			results.forEach(r => { if (r?.Items) items.push(...r.Items); });
			return items;
		},
		{
			shuffle: true,
			limit: limit,
			dedupe: 'provider'
		}
	);
};

// Runs one search on every server and ranks the answers by how well they match the query. With `fold`, a title several
// servers hold is one result carrying the others as copies, as merged libraries show it.
const searchEveryServer = async (query, limit, search, cut = true, fold = false) => {
	const servers = await getLoggedInServers();
	const serverCount = servers.length;
	const perServerLimit = Math.ceil((limit * 1.5) / Math.max(serverCount, 1));

	return executeAll(
		async (api, server) => {
			const result = await search(api, perServerLimit, server);
			return result.Items || [];
		},
		{
			sortBy: (a, b) => {
				const queryLower = query.toLowerCase();
				const aName = (a.Name || '').toLowerCase();
				const bName = (b.Name || '').toLowerCase();

				if (aName === queryLower && bName !== queryLower) return -1;
				if (bName === queryLower && aName !== queryLower) return 1;
				if (aName.startsWith(queryLower) && !bName.startsWith(queryLower)) return -1;
				if (bName.startsWith(queryLower) && !aName.startsWith(queryLower)) return 1;

				return aName.localeCompare(bName);
			},
			dedupe: fold ? 'fold' : 'provider',
			limit: cut ? limit : null
		}
	);
};

// Each row is capped on its own, so the merged results aren't cut, or the rows a server refilled could be pushed
// out again.
export const searchAllServers = (query, limit = 20, {foldCopies: fold = false} = {}) =>
	searchEveryServer(query, limit, (api, perServerLimit, server) =>
		searchLibrary(api, query, perServerLimit, server.serverType || 'jellyfin'), false, fold);

export const searchPeopleAllServers = (query, limit = 24) =>
	searchEveryServer(query, limit, (api, perServerLimit) => api.searchPeople(query, perServerLimit));

const DEFAULT_FAVORITE_TYPES = 'Movie,Series,Episode,Person';
const DEFAULT_FAVORITE_FIELDS = 'PrimaryImageAspectRatio,ProductionYear,ParentIndexNumber,IndexNumber,SeriesName,ProviderIds,UserData';

export const getFavoritesFromAllServers = async ({includeItemTypes, fields} = {}) => {
	return executeAll(
		async (api) => {
			const fetchResult = await api.getItems({
				Recursive: true,
				Filters: 'IsFavorite',
				IncludeItemTypes: includeItemTypes || DEFAULT_FAVORITE_TYPES,
				SortBy: 'SortName',
				SortOrder: 'Ascending',
				Fields: fields || DEFAULT_FAVORITE_FIELDS
			});
			return fetchResult.Items || [];
		},
		{
			sortBy: (a, b) => (a.Name || '').localeCompare(b.Name || ''),
			dedupe: 'provider'
		}
	);
};

const hasCrossServerInfo = (item) => {
	return !!(item && item._serverUrl && item._serverAccessToken);
};

export const getApiForItem = (item) => {
	if (!hasCrossServerInfo(item)) {
		return null;
	}
	return createApiForServer(item._serverUrl, item._serverAccessToken, item._serverUserId, item._serverType || 'jellyfin');
};

export const getGenresFromAllServers = async (parentId = null) => {
	const allGenres = await executeAll(
		async (api) => {
			const result = await api.getGenres(parentId);
			return result.Items || [];
		},
		{ignoreErrors: true}
	);

	const genreMap = new Map();
	for (const genre of allGenres) {
		const existing = genreMap.get(genre.Name);
		if (existing) {
			existing.ChildCount = (existing.ChildCount || 0) + (genre.ChildCount || 0);
		} else {
			genreMap.set(genre.Name, {
				Id: genre.Id,
				Name: genre.Name,
				ChildCount: genre.ChildCount || 0,
				_unifiedGenre: true
			});
		}
	}

	return Array.from(genreMap.values());
};

export const getGenreItemsFromAllServers = async (params) => {
	const servers = await getLoggedInServers();

	if (servers.length === 0) {
		return { Items: [], TotalRecordCount: 0 };
	}

	const results = await Promise.all(
		servers.map(async (server) => {
			try {
				const api = createApiForServer(server.url, server.accessToken, server.userId, server.serverType || 'jellyfin');
				const result = await api.getItems(params);
				const items = (result.Items || []).map(item => ({...item, ...serverTags(server)}));
				return {
					items,
					count: result.TotalRecordCount || 0
				};
			} catch (err) {
				console.warn(`[ConnectionPool] Error fetching genre items from ${server.name}:`, err);
				return { items: [], count: 0 };
			}
		})
	);

	const allItems = withoutBlockedItems(results.flatMap(r => r.items));
	const totalCount = results.reduce((sum, r) => sum + r.count, 0);

	return {
		Items: allItems,
		TotalRecordCount: totalCount
	};
};

export const getAllLibrariesFromAllServers = async () => {
	const libraries = await executeAll(async (api) => {
		const result = await api.getAllLibraries();
		return result.Items || [];
	});

	return groupLibrariesByServer(libraries);
};

export const getUserConfigFromAllServers = async () => {
	const servers = await multiServerManager.getAllServersArray();
	const results = [];
	for (const server of servers) {
		try {
			const api = createApiForServer(server.url, server.accessToken, server.userId, server.serverType || 'jellyfin');
			const userData = await api.getUserConfiguration();
			results.push({
				serverUrl: server.url,
				userId: server.userId,
				accessToken: server.accessToken,
				serverName: server.name,
				serverType: server.serverType || 'jellyfin',
				configuration: userData.Configuration
			});
		} catch (e) {
			console.error(`[ConnectionPool] Failed to get config from ${server.name}:`, e);
		}
	}
	return results;
};

// The server type matters because Emby takes the configuration on its own route.
export const updateUserConfigOnServer = async (serverUrl, accessToken, userId, config, serverType = 'jellyfin') => {
	const api = createApiForServer(serverUrl, accessToken, userId, serverType);
	return api.updateUserConfiguration(config);
};

const connectionPool = {
	executeAll,
	getLibrariesFromAllServers,
	readLibrariesFromAllServers,
	getAllLibrariesFromAllServers,
	getMergedLibrarySources,
	getUserConfigFromAllServers,
	updateUserConfigOnServer,
	getRandomItemsFromAllServers,
	searchAllServers,
	searchPeopleAllServers,
	getFavoritesFromAllServers,
	getGenresFromAllServers,
	getGenreItemsFromAllServers,
	getApiForItem
};

export default connectionPool;
