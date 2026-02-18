/**
 * Connection Pool Manager
 * Manages API requests across multiple Jellyfin servers
 * Handles request routing, response aggregation, and failover
 */

import * as multiServerManager from './multiServerManager';
import {createApiForServer} from './jellyfinApi';

/**
 * Execute a request to all servers and aggregate results
 * @param {Function} apiFn - Function that takes (api, serverInfo) and returns a promise
 * @param {Object} options - Aggregation options
 * @returns {Promise<Array>} Aggregated results from all servers
 */
export const executeAll = async (apiFn, options = {}) => {
	const servers = await multiServerManager.getAllServersArray();

	if (servers.length === 0) {
		console.warn('[ConnectionPool] No servers configured');
		return [];
	}

	const {
		sortBy = null,
		limit = null,
		dedupe = null,
		ignoreErrors = true
	} = options;

	const results = [];

	// Execute requests to all servers in parallel
	const promises = servers.map(async (server) => {
		try {
			const api = createApiForServer(server.url, server.accessToken, server.userId);
			const data = await apiFn(api, server);

			// Tag results with server info
			if (Array.isArray(data)) {
				return data.map(item => ({
					...item,
					_serverId: server.serverId,
					_serverName: server.name,
					_serverUrl: server.url,
					_serverUserId: server.userId,
					_serverAccessToken: server.accessToken
				}));
			} else if (data && typeof data === 'object') {
				return [{
					...data,
					_serverId: server.serverId,
					_serverName: server.name,
					_serverUrl: server.url,
					_serverUserId: server.userId,
					_serverAccessToken: server.accessToken
				}];
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

	// Flatten results from all servers
	allResults.forEach(serverResults => {
		results.push(...serverResults);
	});

	// Deduplicate if requested (by item Id or custom field)
	let processedResults = results;
	if (dedupe) {
		const seen = new Set();
		processedResults = results.filter(item => {
			const key = item[dedupe];
			if (seen.has(key)) {
				return false;
			}
			seen.add(key);
			return true;
		});
	}

	if (sortBy && typeof sortBy === 'function') {
		processedResults.sort(sortBy);
	}

	if (limit && limit > 0) {
		processedResults = processedResults.slice(0, limit);
	}

	return processedResults;
};

/**
 * Get resume items from all servers
 * @returns {Promise<Array>} Merged resume items sorted by last played date
 */
export const getResumeItemsFromAllServers = async () => {
	return executeAll(
		async (api) => {
			const result = await api.getResumeItems();
			return result.Items || [];
		},
		{
			sortBy: (a, b) => {
				const dateA = new Date(a.UserData?.LastPlayedDate || 0);
				const dateB = new Date(b.UserData?.LastPlayedDate || 0);
				return dateB - dateA;
			},
			dedupe: 'Id'
		}
	);
};

/**
 * Get next up items from all servers
 * @returns {Promise<Array>} Merged next up items
 */
export const getNextUpFromAllServers = async () => {
	return executeAll(
		async (api) => {
			const result = await api.getNextUp();
			return result.Items || [];
		},
		{
			sortBy: (a, b) => {
				const seriesA = a.SeriesName || '';
				const seriesB = b.SeriesName || '';
				if (seriesA !== seriesB) {
					return seriesA.localeCompare(seriesB);
				}
				return (a.IndexNumber || 0) - (b.IndexNumber || 0);
			},
			dedupe: 'Id'
		}
	);
};

/**
 * Get libraries from all servers
 * @returns {Promise<Array>} All libraries tagged with server info
 */
export const getLibrariesFromAllServers = async () => {
	return executeAll(
		async (api) => {
			const result = await api.getLibraries();
			return result.Items || [];
		},
		{
			sortBy: (a, b) => {
				if (a._serverName !== b._serverName) {
					return a._serverName.localeCompare(b._serverName);
				}
				return (a.Name || '').localeCompare(b.Name || '');
			}
		}
	);
};

/**
 * Get latest items from all servers for a specific library type
 * @param {string} libraryId - Library ID (or null for all)
 * @param {string} itemType - Item type filter
 * @returns {Promise<Array>} Latest items from all servers
 */
export const getLatestItemsFromAllServers = async (libraryId = null) => {
	return executeAll(
		async (api, server) => {
			if (libraryId && !libraryId.startsWith(server.serverId)) {
				return [];
			}

			const result = await api.getLatestMedia(libraryId, 16);
			return result || [];
		},
		{
			sortBy: (a, b) => {
				const dateA = new Date(a.DateCreated || a.PremiereDate || 0);
				const dateB = new Date(b.DateCreated || b.PremiereDate || 0);
				return dateB - dateA;
			},
			limit: 50
		}
	);
};

/**
 * Get latest items per library from all servers
 * Returns an array of {lib, latest, serverName} for each library
 * @param {Array} excludedLibraryIds - Library IDs to exclude
 * @param {Array} excludedCollectionTypes - Collection types to exclude
 * @returns {Promise<Array>} Array of {lib, latest} objects
 */
export const getLatestPerLibraryFromAllServers = async (excludedLibraryIds = [], excludedCollectionTypes = []) => {
	const servers = await multiServerManager.getAllServersArray();

	if (servers.length === 0) {
		return [];
	}

	const results = [];

	// Fetch libraries and latest items from each server
	await Promise.all(servers.map(async (server) => {
		try {
			const api = createApiForServer(server.url, server.accessToken, server.userId);
			const librariesResult = await api.getLibraries();
			const libraries = librariesResult.Items || [];

			const eligibleLibraries = libraries.filter(lib => {
				if (excludedCollectionTypes.includes(lib.CollectionType?.toLowerCase())) {
					return false;
				}
				if (excludedLibraryIds.includes(lib.Id)) {
					return false;
				}
				return true;
			});

			// Fetch latest for each library
			await Promise.all(eligibleLibraries.map(async (lib) => {
				try {
					const latest = await api.getLatestMedia(lib.Id, 16);
					if (latest && latest.length > 0) {
						const taggedItems = latest.map(item => ({
							...item,
							_serverId: server.serverId,
							_serverName: server.name,
							_serverUrl: server.url,
							_serverUserId: server.userId,
							_serverAccessToken: server.accessToken
						}));

						results.push({
							lib: {
								...lib,
								_serverName: server.name
							},
							latest: taggedItems,
							serverName: server.name
						});
					}
				} catch {
					// Individual library fetch failed - continue with others
				}
			}));
		} catch (e) {
			console.warn(`[ConnectionPool] Error fetching libraries from ${server.name}:`, e);
		}
	}));

	results.sort((a, b) => {
		if (a.serverName !== b.serverName) {
			return a.serverName.localeCompare(b.serverName);
		}
		return (a.lib.Name || '').localeCompare(b.lib.Name || '');
	});

	return results;
};

/**
 * Get random items from all servers
 * @param {string} contentType - 'movies', 'tv', or 'both'
 * @param {number} limit - Total max items to return (distributed across servers)
 * @returns {Promise<Array>} Random items from all servers
 */
export const getRandomItemsFromAllServers = async (contentType = 'both', limit = 10) => {
	// Calculate per-server limit to get roughly equal distribution
	// Fetch a bit more from each to account for potential duplicates
	const servers = await multiServerManager.getAllServersArray();
	const serverCount = servers.length;
	const perServerLimit = Math.ceil((limit * 1.5) / Math.max(serverCount, 1));

	return executeAll(
		async (api) => {
			const result = await api.getRandomItems(contentType, perServerLimit);
			return result.Items || [];
		},
		{
			sortBy: () => Math.random() - 0.5,
			limit: limit, // Respect the total limit setting
			dedupe: 'Id'
		}
	);
};

/**
 * Search across all servers
 * @param {string} query - Search query
 * @param {number} limit - Total max results to return
 * @returns {Promise<Array>} Search results from all servers
 */
export const searchAllServers = async (query, limit = 20) => {
	// Calculate per-server limit for distribution
	const servers = await multiServerManager.getAllServersArray();
	const serverCount = servers.length;
	const perServerLimit = Math.ceil((limit * 1.5) / Math.max(serverCount, 1));

	return executeAll(
		async (api) => {
			const result = await api.search(query, perServerLimit);
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
			dedupe: 'Id',
			limit: limit // Respect the total limit setting
		}
	);
};

/**
 * Get favorites from all servers
 * @returns {Promise<Array>} All favorited items from all servers
 */
export const getFavoritesFromAllServers = async () => {
	return executeAll(
		async (api) => {
			const fetchResult = await api.getItems({
				Recursive: true,
				Filters: 'IsFavorite',
				IncludeItemTypes: 'Movie,Series,Episode,Person',
				SortBy: 'SortName',
				SortOrder: 'Ascending',
				Fields: 'PrimaryImageAspectRatio,ProductionYear,ParentIndexNumber,IndexNumber,SeriesName'
			});
			return fetchResult.Items || [];
		},
		{
			sortBy: (a, b) => (a.Name || '').localeCompare(b.Name || ''),
			dedupe: 'Id'
		}
	);
};

/**
 * Get item details from the correct server
 * @param {Object} item - Item with _serverUrl, _serverAccessToken, _serverUserId
 * @returns {Promise<Object>} Full item details
 */
export const getItemFromServer = async (item) => {
	if (!item._serverUrl || !item._serverAccessToken) {
		throw new Error('Item missing server info');
	}

	const api = createApiForServer(item._serverUrl, item._serverAccessToken, item._serverUserId);
	return api.getItem(item.Id);
};

/**
 * Check if an item has cross-server info attached
 * @param {Object} item - Item to check
 * @returns {boolean} True if item has server info
 */
export const hasCrossServerInfo = (item) => {
	return !!(item && item._serverUrl && item._serverAccessToken);
};

/**
 * Get API instance for an item's server
 * @param {Object} item - Item with server info
 * @returns {Object} API instance for that server
 */
export const getApiForItem = (item) => {
	if (!hasCrossServerInfo(item)) {
		return null;
	}
	return createApiForServer(item._serverUrl, item._serverAccessToken, item._serverUserId);
};

/**
 * Get genres from all servers
 * @param {string} parentId - Optional library ID to filter by
 * @returns {Promise<Array>} Merged genres from all servers with item counts
 */
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

/**
 * Get items for a genre from all servers
 * @param {Object} params - Query parameters (Genres, IncludeItemTypes, etc.)
 * @returns {Promise<Object>} {Items: Array, TotalRecordCount: number}
 */
export const getGenreItemsFromAllServers = async (params) => {
	const servers = await multiServerManager.getAllServersArray();

	if (servers.length === 0) {
		return { Items: [], TotalRecordCount: 0 };
	}

	// Query all servers in parallel for items and counts
	const results = await Promise.all(
		servers.map(async (server) => {
			try {
				const api = createApiForServer(server.url, server.accessToken, server.userId);
				const result = await api.getItems(params);
				const items = (result.Items || []).map(item => ({
					...item,
					_serverId: server.serverId,
					_serverName: server.name,
					_serverUrl: server.url,
					_serverUserId: server.userId,
					_serverAccessToken: server.accessToken
				}));
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

	const allItems = results.flatMap(r => r.items);
	const totalCount = results.reduce((sum, r) => sum + r.count, 0);

	return {
		Items: allItems,
		TotalRecordCount: totalCount
	};
};

/**
 * Get all libraries from all servers including hidden ones
 * @returns {Promise<Array>} All libraries (including hidden) tagged with server info
 */
export const getAllLibrariesFromAllServers = async () => {
	return executeAll(
		async (api) => {
			const result = await api.getAllLibraries();
			return result.Items || [];
		},
		{
			sortBy: (a, b) => {
				if (a._serverName !== b._serverName) {
					return a._serverName.localeCompare(b._serverName);
				}
				return (a.Name || '').localeCompare(b.Name || '');
			}
		}
	);
};

/**
 * Get user configuration from all servers
 * @returns {Promise<Array>} Array of {serverUrl, userId, accessToken, serverName, configuration} per server
 */
export const getUserConfigFromAllServers = async () => {
	const servers = await multiServerManager.getAllServersArray();
	const results = [];
	for (const server of servers) {
		try {
			const api = createApiForServer(server.url, server.accessToken, server.userId);
			const userData = await api.getUserConfiguration();
			results.push({
				serverUrl: server.url,
				userId: server.userId,
				accessToken: server.accessToken,
				serverName: server.name,
				configuration: userData.Configuration
			});
		} catch (e) {
			console.error(`[ConnectionPool] Failed to get config from ${server.name}:`, e);
		}
	}
	return results;
};

/**
 * Update user configuration on a specific server
 * @param {string} serverUrl - Server URL
 * @param {string} accessToken - Auth token
 * @param {string} userId - User ID
 * @param {Object} config - Updated configuration object
 */
export const updateUserConfigOnServer = async (serverUrl, accessToken, userId, config) => {
	const api = createApiForServer(serverUrl, accessToken, userId);
	return api.updateUserConfiguration(config);
};

const connectionPool = {
	executeAll,
	getResumeItemsFromAllServers,
	getNextUpFromAllServers,
	getLibrariesFromAllServers,
	getAllLibrariesFromAllServers,
	getUserConfigFromAllServers,
	updateUserConfigOnServer,
	getLatestItemsFromAllServers,
	getRandomItemsFromAllServers,
	searchAllServers,
	getFavoritesFromAllServers,
	getGenresFromAllServers,
	getGenreItemsFromAllServers,
	getItemFromServer,
	hasCrossServerInfo,
	getApiForItem
};

export default connectionPool;
