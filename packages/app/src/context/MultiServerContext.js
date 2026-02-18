/**
 * Multi-Server Context
 * React context for managing multiple Jellyfin servers and users
 * Following Enact patterns for webOS
 */

import {createContext, useContext, useState, useEffect, useCallback, useMemo} from 'react';
import * as multiServerManager from '../services/multiServerManager';

const MultiServerContext = createContext(null);

export const MultiServerProvider = ({children}) => {
	const [servers, setServers] = useState([]);
	const [uniqueServers, setUniqueServers] = useState([]);
	const [activeServer, setActiveServerState] = useState(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isAddingServer, setIsAddingServer] = useState(false);
	const [pendingServer, setPendingServer] = useState(null);

	// Load servers on mount
	const loadServers = useCallback(async () => {
		try {
			const [allServers, unique, active] = await Promise.all([
				multiServerManager.getAllServersArray(),
				multiServerManager.getUniqueServers(),
				multiServerManager.getActiveServer()
			]);

			setServers(allServers);
			setUniqueServers(unique);
			setActiveServerState(active);
		} catch (error) {
			console.error('[MULTI-SERVER] Error loading servers:', error);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		loadServers();
	}, [loadServers]);

	/**
	 * Add a new server/user
	 */
	const addServer = useCallback(async (serverUrl, serverName, userId, username, accessToken) => {
		try {
			const result = await multiServerManager.addServer(
				serverUrl,
				serverName,
				userId,
				username,
				accessToken
			);

			await loadServers();
			return result;
		} catch (error) {
			console.error('[MULTI-SERVER] Error adding server:', error);
			throw error;
		}
	}, [loadServers]);

	/**
	 * Remove a server or user
	 */
	const removeServer = useCallback(async (serverId, userId) => {
		try {
			await multiServerManager.removeServer(serverId, userId);
			await loadServers();
			return true;
		} catch (error) {
			console.error('[MULTI-SERVER] Error removing server:', error);
			return false;
		}
	}, [loadServers]);

	/**
	 * Switch to a different server/user
	 */
	const switchServer = useCallback(async (serverId, userId) => {
		try {
			const success = await multiServerManager.setActiveServer(serverId, userId);
			if (success) {
				await loadServers();
			}
			return success;
		} catch (error) {
			console.error('[MULTI-SERVER] Error switching server:', error);
			return false;
		}
	}, [loadServers]);

	/**
	 * Get server users
	 */
	const getServerUsers = useCallback(async (serverId) => {
		return multiServerManager.getServerUsers(serverId);
	}, []);

	/**
	 * Start "Add Server" flow
	 */
	const startAddServerFlow = useCallback((serverInfo = null) => {
		setIsAddingServer(true);
		setPendingServer(serverInfo);
	}, []);

	/**
	 * Complete "Add Server" flow
	 */
	const completeAddServerFlow = useCallback(async (serverUrl, serverName, userId, username, accessToken) => {
		try {
			await addServer(serverUrl, serverName, userId, username, accessToken);
			setIsAddingServer(false);
			setPendingServer(null);
			return true;
		} catch (error) {
			console.error('[MULTI-SERVER] Error completing add server flow:', error);
			return false;
		}
	}, [addServer]);

	/**
	 * Cancel "Add Server" flow
	 */
	const cancelAddServerFlow = useCallback(() => {
		setIsAddingServer(false);
		setPendingServer(null);
	}, []);

	/**
	 * Update server details
	 */
	const updateServer = useCallback(async (serverId, updates, userId, userUpdates) => {
		try {
			await multiServerManager.updateServer(serverId, updates, userId, userUpdates);
			await loadServers();
			return true;
		} catch (error) {
			console.error('[MULTI-SERVER] Error updating server:', error);
			return false;
		}
	}, [loadServers]);

	/**
	 * Check counts
	 */
	const serverCount = useMemo(() => uniqueServers.length, [uniqueServers]);
	const totalUserCount = useMemo(() => servers.length, [servers]);
	const hasMultipleServers = useMemo(() => serverCount > 1, [serverCount]);

	const contextValue = useMemo(() => ({
		// State
		servers,
		uniqueServers,
		activeServer,
		isLoading,
		isAddingServer,
		pendingServer,
		serverCount,
		totalUserCount,
		hasMultipleServers,

		// Actions
		addServer,
		removeServer,
		switchServer,
		getServerUsers,
		updateServer,
		loadServers,

		// Add Server Flow
		startAddServerFlow,
		completeAddServerFlow,
		cancelAddServerFlow
	}), [
		servers,
		uniqueServers,
		activeServer,
		isLoading,
		isAddingServer,
		pendingServer,
		serverCount,
		totalUserCount,
		hasMultipleServers,
		addServer,
		removeServer,
		switchServer,
		getServerUsers,
		updateServer,
		loadServers,
		startAddServerFlow,
		completeAddServerFlow,
		cancelAddServerFlow
	]);

	return (
		<MultiServerContext.Provider value={contextValue}>
			{children}
		</MultiServerContext.Provider>
	);
};

export const useMultiServer = () => {
	const context = useContext(MultiServerContext);
	if (!context) {
		throw new Error('useMultiServer must be used within MultiServerProvider');
	}
	return context;
};

export default MultiServerContext;
