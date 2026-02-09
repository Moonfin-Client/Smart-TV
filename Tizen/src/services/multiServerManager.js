/**
 * Multi-Server Manager
 * Handles multiple Jellyfin server connections with unified content view
 * Adapted for Tizen
 */

import {getFromStorage, saveToStorage, removeFromStorage} from './storage';

const SERVERS_KEY = 'jellyfin_servers';
const ACTIVE_SERVER_KEY = 'jellyfin_active_server';
const ACTIVE_USER_KEY = 'jellyfin_active_user';

/**
 * Get all configured servers (normalized structure)
 * Returns object with serverId -> { server info, users: { userId -> user info } }
 * @returns {Promise<Object>} Object with server data
 */
export const getAllServers = async () => {
	const serversData = await getFromStorage(SERVERS_KEY);
	if (!serversData || typeof serversData !== 'object') {
		return {};
	}
	return serversData;
};

/**
 * Get all servers as array (for compatibility and rendering)
 * Each user on each server is returned as a separate entry
 * @returns {Promise<Array>} Array of server/user objects
 */
export const getAllServersArray = async () => {
	const serversData = await getAllServers();
	const result = [];

	for (const serverId in serversData) {
		if (Object.prototype.hasOwnProperty.call(serversData, serverId)) {
			const server = serversData[serverId];
			const users = server.users || {};

			for (const userId in users) {
				if (Object.prototype.hasOwnProperty.call(users, userId)) {
					const user = users[userId];
					result.push({
						id: serverId,
						name: server.name,
						url: server.url,
						serverId: serverId,
						userId: userId,
						username: user.username,
						accessToken: user.accessToken,
						addedDate: server.addedDate,
						lastConnected: user.lastConnected,
						connected: user.connected
					});
				}
			}
		}
	}

	return result;
};

/**
 * Get unique servers (without user duplication)
 * @returns {Promise<Array>} Array of server objects
 */
export const getUniqueServers = async () => {
	const servers = await getAllServers();
	const result = [];

	for (const serverId in servers) {
		if (Object.prototype.hasOwnProperty.call(servers, serverId)) {
			const server = servers[serverId];
			const userCount = Object.keys(server.users || {}).length;

			result.push({
				id: serverId,
				serverId: serverId,
				name: server.name,
				url: server.url,
				addedDate: server.addedDate,
				userCount: userCount
			});
		}
	}

	return result;
};

/**
 * Get all users for a specific server
 * @param {string} serverId - Server ID
 * @returns {Promise<Array>} Array of user objects
 */
export const getServerUsers = async (serverId) => {
	const servers = await getAllServers();
	const server = servers[serverId];

	if (!server || !server.users) {
		return [];
	}

	const result = [];
	for (const userId in server.users) {
		if (Object.prototype.hasOwnProperty.call(server.users, userId)) {
			const user = server.users[userId];
			result.push({
				serverId: serverId,
				serverName: server.name,
				serverUrl: server.url,
				userId: userId,
				username: user.username,
				accessToken: user.accessToken,
				lastConnected: user.lastConnected,
				connected: user.connected,
				addedDate: user.addedDate
			});
		}
	}

	return result;
};

/**
 * Get currently active server and user
 * @returns {Promise<Object|null>} Active server/user object or null
 */
export const getActiveServer = async () => {
	const activeServerId = await getFromStorage(ACTIVE_SERVER_KEY);
	const activeUserId = await getFromStorage(ACTIVE_USER_KEY);

	if (!activeServerId || !activeUserId) {
		return null;
	}

	const servers = await getAllServers();
	const server = servers[activeServerId];

	if (!server || !server.users || !server.users[activeUserId]) {
		return null;
	}

	const user = server.users[activeUserId];

	return {
		id: activeServerId,
		name: server.name,
		url: server.url,
		serverId: activeServerId,
		userId: activeUserId,
		username: user.username,
		accessToken: user.accessToken,
		addedDate: server.addedDate,
		lastConnected: user.lastConnected,
		connected: user.connected
	};
};

/**
 * Update server or user details
 * @param {string} serverId - Server ID
 * @param {Object} updates - Properties to update (server-level)
 * @param {string} userId - User ID (optional, for user-level updates)
 * @param {Object} userUpdates - User properties to update (optional)
 * @returns {Promise<boolean>} Success status
 */
export const updateServer = async (serverId, updates, userId, userUpdates) => {
	const servers = await getAllServers();
	const server = servers[serverId];

	if (!server) {
		return false;
	}

	if (updates) {
		for (const key in updates) {
			if (Object.prototype.hasOwnProperty.call(updates, key) && key !== 'id' && key !== 'users') {
				server[key] = updates[key];
			}
		}
	}

	if (userId && userUpdates && server.users[userId]) {
		for (const userKey in userUpdates) {
			if (Object.prototype.hasOwnProperty.call(userUpdates, userKey) && userKey !== 'userId') {
				server.users[userId][userKey] = userUpdates[userKey];
			}
		}
	}

	await saveToStorage(SERVERS_KEY, servers);
	console.log('[MULTI-SERVER] Updated server:', serverId);
	return true;
};

/**
 * Set active server and user
 * @param {string} serverId - Server ID to activate
 * @param {string} userId - User ID to activate
 * @returns {Promise<boolean>} Success status
 */
export const setActiveServer = async (serverId, userId) => {
	const servers = await getAllServers();
	const server = servers[serverId];

	if (!server || !server.users[userId]) {
		return false;
	}

	await saveToStorage(ACTIVE_SERVER_KEY, serverId);
	await saveToStorage(ACTIVE_USER_KEY, userId);

	await updateServer(serverId, null, userId, {
		lastConnected: new Date().toISOString()
	});

	console.log('[MULTI-SERVER] Activated server:', server.name, '(user:', server.users[userId].username, ')');
	return true;
};

/**
 * Add a new server or user to existing server
 * @param {string} serverUrl - Server URL
 * @param {string} serverName - Display name for server
 * @param {string} userId - User ID
 * @param {string} username - Username
 * @param {string} accessToken - Access token
 * @returns {Promise<Object>} Created server/user object
 */
export const addServer = async (serverUrl, serverName, userId, username, accessToken) => {
	const servers = await getAllServers();

	let existingServerId = null;
	for (const sId in servers) {
		if (Object.prototype.hasOwnProperty.call(servers, sId) && servers[sId].url === serverUrl) {
			existingServerId = sId;
			break;
		}
	}

	let serverId = existingServerId;

	if (!serverId) {
		serverId = 'server_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
		servers[serverId] = {
			id: serverId,
			name: serverName,
			url: serverUrl,
			addedDate: new Date().toISOString(),
			users: {}
		};
		console.log('[MULTI-SERVER] Added new server:', serverName);
	} else {
		console.log('[MULTI-SERVER] Server already exists, adding user');
	}

	servers[serverId].users[userId] = {
		userId: userId,
		username: username,
		accessToken: accessToken,
		lastConnected: new Date().toISOString(),
		connected: true,
		addedDate: new Date().toISOString()
	};

	await saveToStorage(SERVERS_KEY, servers);

	const activeServerId = await getFromStorage(ACTIVE_SERVER_KEY);
	const activeUserId = await getFromStorage(ACTIVE_USER_KEY);

	if (!activeServerId || !activeUserId) {
		await setActiveServer(serverId, userId);
	}

	console.log('[MULTI-SERVER] Added user:', username, 'to server:', serverName);

	return {
		id: serverId,
		serverId: serverId,
		userId: userId,
		name: serverName,
		url: serverUrl,
		username: username,
		accessToken: accessToken
	};
};

/**
 * Remove a user from a server (or entire server if last user)
 * @param {string} serverId - Server ID
 * @param {string} userId - User ID to remove
 * @returns {Promise<boolean>} Success status
 */
export const removeServer = async (serverId, userId) => {
	const servers = await getAllServers();

	if (!servers[serverId]) {
		return false;
	}

	if (userId && servers[serverId].users[userId]) {
		delete servers[serverId].users[userId];

		const remainingUsers = Object.keys(servers[serverId].users);
		if (remainingUsers.length === 0) {
			delete servers[serverId];
			console.log('[MULTI-SERVER] Removed server (no users left):', serverId);
		} else {
			console.log('[MULTI-SERVER] Removed user from server:', userId);
		}
	} else {
		delete servers[serverId];
		console.log('[MULTI-SERVER] Removed server:', serverId);
	}

	await saveToStorage(SERVERS_KEY, servers);

	const activeServerId = await getFromStorage(ACTIVE_SERVER_KEY);
	const activeUserId = await getFromStorage(ACTIVE_USER_KEY);

	if (activeServerId === serverId && (!userId || activeUserId === userId)) {
		let firstServer = null;
		let firstUser = null;

		for (const sId in servers) {
			if (Object.prototype.hasOwnProperty.call(servers, sId)) {
				for (const uId in servers[sId].users) {
					if (Object.prototype.hasOwnProperty.call(servers[sId].users, uId)) {
						firstServer = sId;
						firstUser = uId;
						break;
					}
				}
				if (firstServer) break;
			}
		}

		if (firstServer && firstUser) {
			await setActiveServer(firstServer, firstUser);
		} else {
			await removeFromStorage(ACTIVE_SERVER_KEY);
			await removeFromStorage(ACTIVE_USER_KEY);
		}
	}

	return true;
};

/**
 * Get server by ID
 * @param {string} serverId - Server ID
 * @param {string} userId - User ID (optional)
 * @returns {Promise<Object|null>} Server object or null
 */
export const getServer = async (serverId, userId) => {
	const servers = await getAllServers();
	const server = servers[serverId];

	if (!server) {
		return null;
	}

	if (userId && server.users[userId]) {
		const user = server.users[userId];
		return {
			id: serverId,
			serverId: serverId,
			name: server.name,
			url: server.url,
			addedDate: server.addedDate,
			userId: userId,
			username: user.username,
			accessToken: user.accessToken,
			lastConnected: user.lastConnected,
			connected: user.connected
		};
	}

	return {
		id: serverId,
		serverId: serverId,
		name: server.name,
		url: server.url,
		addedDate: server.addedDate,
		users: server.users
	};
};

/**
 * Get authentication object for API calls to a specific server/user
 * @param {string} serverId - Server ID (optional, uses active server if not provided)
 * @param {string} userId - User ID (optional, uses active user if not provided)
 * @returns {Promise<Object|null>} Auth object or null
 */
export const getServerAuth = async (serverId, userId) => {
	let server;

	if (serverId && userId) {
		server = await getServer(serverId, userId);
	} else {
		server = await getActiveServer();
	}

	if (!server) {
		return null;
	}

	return {
		serverAddress: server.url,
		userId: server.userId,
		username: server.username,
		accessToken: server.accessToken,
		serverId: server.serverId || server.id,
		serverName: server.name
	};
};

/**
 * Check if multiple servers are configured
 * @returns {Promise<boolean>}
 */
export const hasMultipleServers = async () => {
	const servers = await getAllServers();
	const serverCount = Object.keys(servers).length;
	return serverCount > 1;
};

/**
 * Get server count
 * @returns {Promise<number>}
 */
export const getServerCount = async () => {
	const servers = await getAllServers();
	return Object.keys(servers).length;
};

/**
 * Get total user count across all servers
 * @returns {Promise<number>}
 */
export const getTotalUserCount = async () => {
	const servers = await getAllServers();
	let count = 0;

	for (const serverId in servers) {
		if (Object.prototype.hasOwnProperty.call(servers, serverId) && servers[serverId].users) {
			count += Object.keys(servers[serverId].users).length;
		}
	}

	return count;
};

/**
 * Check if any servers exist
 * @returns {Promise<boolean>}
 */
export const hasServers = async () => {
	const count = await getTotalUserCount();
	return count > 0;
};

const multiServerManager = {
	getAllServers,
	getAllServersArray,
	getUniqueServers,
	getServerUsers,
	getActiveServer,
	addServer,
	removeServer,
	updateServer,
	setActiveServer,
	getServer,
	getServerAuth,
	hasMultipleServers,
	getServerCount,
	getTotalUserCount,
	hasServers
};

export default multiServerManager;
