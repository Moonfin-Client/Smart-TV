/**
 * Tizen Discovery Service
 * Note: Tizen web apps cannot use UDP sockets, so automatic discovery is not available.
 * Users must manually enter their server URL.
 */

let listeners = [];
let discoveredServers = [];

/**
 * Subscribe to server discovery updates
 * On Tizen, this only returns manually added servers
 */
export const subscribe = (callback) => {
	listeners.push(callback);
	
	// Immediately call with current servers
	if (discoveredServers.length > 0) {
		callback(discoveredServers);
	}

	return () => {
		listeners = listeners.filter(cb => cb !== callback);
	};
};

/**
 * Get discovered servers
 * On Tizen, returns only manually added servers
 */
export const getServers = () => {
	return Promise.resolve(discoveredServers);
};

/**
 * Manually add a server (for Tizen)
 * Call this when user enters a server URL manually
 */
export const addServer = (server) => {
	// Avoid duplicates
	const exists = discoveredServers.some(s => s.Address === server.Address);
	if (!exists) {
		discoveredServers.push(server);
		notifyListeners();
	}
};

/**
 * Remove a server from the list
 */
export const removeServer = (serverId) => {
	discoveredServers = discoveredServers.filter(s => s.Id !== serverId);
	notifyListeners();
};

/**
 * Clear all discovered servers
 */
export const clearServers = () => {
	discoveredServers = [];
	notifyListeners();
};

/**
 * Try to fetch server info from a URL
 */
export const probeServer = async (serverUrl) => {
	try {
		// Normalize URL
		let url = serverUrl.trim();
		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			url = 'http://' + url;
		}
		
		// Remove trailing slash
		url = url.replace(/\/$/, '');
		
		// Try to get public system info
		const response = await fetch(`${url}/System/Info/Public`, {
			method: 'GET',
			headers: {
				'Accept': 'application/json'
			}
		});
		
		if (!response.ok) {
			throw new Error(`Server returned ${response.status}`);
		}
		
		const info = await response.json();
		
		return {
			Id: info.Id,
			Name: info.ServerName,
			Address: url,
			Version: info.Version,
			LocalAddress: info.LocalAddress
		};
	} catch (e) {
		console.error('[Discovery] Failed to probe server:', e.message);
		throw e;
	}
};

/**
 * Add a server by URL (probes it first)
 */
export const addServerByUrl = async (serverUrl) => {
	const server = await probeServer(serverUrl);
	addServer(server);
	return server;
};

const notifyListeners = () => {
	listeners.forEach(cb => cb([...discoveredServers]));
};

export default {
	subscribe,
	getServers,
	addServer,
	removeServer,
	clearServers,
	probeServer,
	addServerByUrl
};
