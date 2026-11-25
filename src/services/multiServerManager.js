import {getFromStorage, saveToStorage, removeFromStorage} from './storage';
import {platformFetch} from './secureFetch';
import {detectServerType} from '../utils/connectionErrors';

// The earlier Moonfin TV app saved servers under these keys, so an in-place upgrade keeps reading them.
const SERVERS_KEY = 'jellyfin_servers';
const ACTIVE_SERVER_KEY = 'jellyfin_active_server';
const ACTIVE_USER_KEY = 'jellyfin_active_user';
const SWITCHABLE_TYPES = ['jellyfin', 'emby'];

// Saved servers keyed by server id, each holding its users keyed by user id.
export const getAllServers = async () => {
	const serversData = await getFromStorage(SERVERS_KEY);
	if (!serversData || typeof serversData !== 'object') {
		return {};
	}
	return serversData;
};

// Whether a saved entry is a profile of the same Silo household as `self` (itself included): on the same server, the
// same account, or the same token (profiles saved before their account was, share it). Sign Out removes the household
// together, and ending the login needs every profile holding its token gone.
export const sameSiloHousehold = (entry, self, token = self?.accessToken) => Boolean(self) && self.serverType === 'silo' &&
	entry.serverId === self.serverId &&
	((Boolean(self.siloAccountId) && entry.siloAccountId === self.siloAccountId) ||
		(Boolean(token) && entry.accessToken === token));

// The type a saved Jellyfin or Emby server reports now, which differs from the stored one when another server took
// over its address or it was saved wrong. Waits two seconds at most and otherwise keeps the stored type, though an
// answer that comes later is still saved for next time.
export const checkServerType = (serverId, url, storedType) => {
	if (!SWITCHABLE_TYPES.includes(storedType) || !url) return Promise.resolve(storedType);
	const check = platformFetch(`${url}/System/Info/Public`, {}, 10000)
		.then((response) => (response.ok ? response.json() : null))
		.then(async (info) => {
			const detected = info && detectServerType(info.ProductName, info.Version);
			if (!SWITCHABLE_TYPES.includes(detected) || detected === storedType) return storedType;
			const servers = await getAllServers();
			if (servers[serverId]) {
				servers[serverId].serverType = detected;
				await saveToStorage(SERVERS_KEY, servers);
			}
			return detected;
		})
		.catch(() => storedType);
	return Promise.race([check, new Promise((resolve) => setTimeout(() => resolve(storedType), 2000))]);
};

// One entry for each user on each server.
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
						serverType: server.serverType || 'jellyfin',
						serverId: serverId,
						userId: userId,
						username: user.username,
						accessToken: user.accessToken,
						primaryImageTag: user.primaryImageTag || null,
						plexToken: user.plexToken || null,
						siloAccountId: user.siloAccountId || null,
						siloHasPin: user.siloHasPin === true,
						machineId: server.machineId || null,
						candidateAddresses: server.candidateAddresses || null,
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
				serverType: server.serverType || 'jellyfin',
				version: server.version || null,
				machineId: server.machineId || null,
				candidateAddresses: server.candidateAddresses || null,
				addedDate: server.addedDate,
				userCount: userCount
			});
		}
	}

	return result;
};

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
		serverType: server.serverType || 'jellyfin',
		serverId: activeServerId,
		userId: activeUserId,
		username: user.username,
		accessToken: user.accessToken,
		plexToken: user.plexToken || null,
		siloAccountId: user.siloAccountId || null,
		siloHasPin: user.siloHasPin === true,
		machineId: server.machineId || null,
		candidateAddresses: server.candidateAddresses || null,
		addedDate: server.addedDate,
		lastConnected: user.lastConnected,
		connected: user.connected
	};
};

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
	return true;
};

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

	return true;
};

export const addServer = async (serverUrl, serverName, userId, username, accessToken, primaryImageTag, serverType = null, serverVersion = null) => {
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
			serverType: serverType || 'jellyfin',
			version: serverVersion || null,
			addedDate: new Date().toISOString(),
			users: {}
		};
	} else {
		// Signing in again found out what the server is now, which can be Emby where Jellyfin was saved or the
		// other way around. An entry that predates serverType is filled in.
		const stored = servers[serverId].serverType;
		servers[serverId].serverType = SWITCHABLE_TYPES.includes(stored) && SWITCHABLE_TYPES.includes(serverType)
			? serverType
			: stored || serverType || 'jellyfin';
		if (serverVersion) servers[serverId].version = serverVersion;
	}

	servers[serverId].users[userId] = {
		userId: userId,
		username: username,
		accessToken: accessToken,
		primaryImageTag: primaryImageTag || null,
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

// Removes one user, or the whole server when no user is given. keepServer leaves the server saved when its last
// user goes, as signing out does.
export const removeServer = async (serverId, userId, {keepServer = false} = {}) => {
	const servers = await getAllServers();

	if (!servers[serverId]) {
		return false;
	}

	if (userId && servers[serverId].users[userId]) {
		delete servers[serverId].users[userId];

		const remainingUsers = Object.keys(servers[serverId].users);
		if (remainingUsers.length === 0 && !keepServer) {
			delete servers[serverId];
		}
	} else {
		delete servers[serverId];
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

export const hasMultipleServers = async () => {
	const servers = await getAllServers();
	const serverCount = Object.keys(servers).length;
	return serverCount > 1;
};

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
