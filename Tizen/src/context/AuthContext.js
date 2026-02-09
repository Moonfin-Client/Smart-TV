import {createContext, useContext, useState, useEffect, useCallback, useMemo} from 'react';
import * as jellyfinApi from '../services/jellyfinApi';
import {initStorage, getFromStorage, saveToStorage, removeFromStorage} from '../services/storage';
import * as multiServerManager from '../services/multiServerManager';
import {clearImageCache} from '../services/imageProxy';
import {clearImageProxyCache} from '../hooks/useProxiedImage';

// Clear all memory caches - call on logout or server switch
const clearAllCaches = () => {
	clearImageCache();
	clearImageProxyCache();
	console.log('[AuthContext] All caches cleared');
};

const AuthContext = createContext(null);

export const AuthProvider = ({children}) => {
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [user, setUser] = useState(null);
	const [serverUrl, setServerUrl] = useState(null);
	const [serverName, setServerName] = useState(null);
	const [accessToken, setAccessToken] = useState(null);

	// Multi-server state
	const [servers, setServers] = useState([]);
	const [uniqueServers, setUniqueServers] = useState([]);
	const [activeServerInfo, setActiveServerInfo] = useState(null);
	const [isAddingServer, setIsAddingServer] = useState(false);
	const [pendingServer, setPendingServer] = useState(null);

	// Load multi-server data
	const loadServers = useCallback(async () => {
		try {
			const [allServers, unique, active] = await Promise.all([
				multiServerManager.getAllServersArray(),
				multiServerManager.getUniqueServers(),
				multiServerManager.getActiveServer()
			]);

			setServers(allServers);
			setUniqueServers(unique);
			setActiveServerInfo(active);
			return {allServers, unique, active};
		} catch (error) {
			console.error('[AUTH] Error loading servers:', error);
			return {allServers: [], unique: [], active: null};
		}
	}, []);

	useEffect(() => {
		const init = async () => {
			await initStorage();
			await jellyfinApi.initDeviceId();

			// Load multi-server data
			const {active} = await loadServers();

			// If we have an active server, use it
			if (active) {
				jellyfinApi.setServer(active.url);
				jellyfinApi.setAuth(active.userId, active.accessToken);
				setServerUrl(active.url);
				setServerName(active.name);
				setAccessToken(active.accessToken);

				// Try to get user info
				try {
					const userInfo = await jellyfinApi.api.getUserConfiguration();
					setUser(userInfo);
				} catch (e) {
					// If we can't get user info, use what we have
					setUser({Id: active.userId, Name: active.username});
				}

				setIsAuthenticated(true);
			} else {
				// Fallback to old auth format
				const storedAuth = await getFromStorage('auth');
				if (storedAuth) {
					jellyfinApi.setServer(storedAuth.serverUrl);
					jellyfinApi.setAuth(storedAuth.userId, storedAuth.token);
					setServerUrl(storedAuth.serverUrl);
					setAccessToken(storedAuth.token);
					setUser(storedAuth.user);
					setIsAuthenticated(true);
				}
			}

			setIsLoading(false);
		};
		init();
	}, [loadServers]);

	const login = useCallback(async (server, username, password, options = {}) => {
		const {serverName: sName, isAddingNewServer = false, switchToNewUser = true} = options;

		jellyfinApi.setServer(server);

		const result = await jellyfinApi.api.authenticateByName(username, password);

		jellyfinApi.setAuth(result.User.Id, result.AccessToken);

		// Use provided server name or extract from URL
		let finalServerName = sName;
		if (!finalServerName) {
			try {
				const url = new URL(server);
				finalServerName = url.hostname;
			} catch (e) {
				finalServerName = 'Jellyfin Server';
			}
		}

		// Add to multi-server system
		const serverResult = await multiServerManager.addServer(
			server,
			finalServerName,
			result.User.Id,
			result.User.Name,
			result.AccessToken
		);

		// Always switch to the newly logged in user
		const shouldSwitch = switchToNewUser || !isAddingNewServer;
		if (shouldSwitch) {
			await multiServerManager.setActiveServer(serverResult.serverId, result.User.Id);
		}

		// Load servers in background, don't await
		loadServers();

		const authData = {
			serverUrl: server,
			userId: result.User.Id,
			token: result.AccessToken,
			user: result.User
		};
		await saveToStorage('auth', authData);

		// Always update state to the new user if switching
		if (shouldSwitch) {
			setServerUrl(server);
			setServerName(finalServerName);
			setAccessToken(result.AccessToken);
			setUser(result.User);
			setIsAuthenticated(true);
		}

		return {...result, serverResult};
	}, [loadServers]);

	const loginWithToken = useCallback(async (server, authResult, options = {}) => {
		const {serverName: sName, isAddingNewServer = false, switchToNewUser = true} = options;

		jellyfinApi.setServer(server);
		jellyfinApi.setAuth(authResult.User.Id, authResult.AccessToken);

		// Use provided server name or extract from URL
		let finalServerName = sName;
		if (!finalServerName) {
			try {
				const url = new URL(server);
				finalServerName = url.hostname;
			} catch (e) {
				finalServerName = 'Jellyfin Server';
			}
		}

		const serverResult = await multiServerManager.addServer(
			server,
			finalServerName,
			authResult.User.Id,
			authResult.User.Name,
			authResult.AccessToken
		);

		// Always switch to the newly logged in user
		const shouldSwitch = switchToNewUser || !isAddingNewServer;
		if (shouldSwitch) {
			await multiServerManager.setActiveServer(serverResult.serverId, authResult.User.Id);
		}

		// Load servers in background, don't await
		loadServers();

		const authData = {
			serverUrl: server,
			userId: authResult.User.Id,
			token: authResult.AccessToken,
			user: authResult.User
		};
		await saveToStorage('auth', authData);

		// Always update state to the new user if switching
		if (shouldSwitch) {
			setServerUrl(server);
			setServerName(finalServerName);
			setAccessToken(authResult.AccessToken);
			setUser(authResult.User);
			setIsAuthenticated(true);
		}

		return {...authResult, serverResult};
	}, [loadServers]);

	/**
	 * Switch to a different server/user
	 */
	const switchUser = useCallback(async (serverId, userId) => {
		try {
			const success = await multiServerManager.setActiveServer(serverId, userId);
			if (!success) return false;

			const active = await multiServerManager.getActiveServer();
			if (!active) return false;

			// Update API
			jellyfinApi.setServer(active.url);
			jellyfinApi.setAuth(active.userId, active.accessToken);

			// Update state
			setServerUrl(active.url);
			setServerName(active.name);
			setAccessToken(active.accessToken);

			// Get fresh user info
			try {
				const userInfo = await jellyfinApi.api.getUserConfiguration();
				setUser(userInfo);
			} catch (e) {
				setUser({Id: active.userId, Name: active.username});
			}

			// Update old auth format for compatibility
			await saveToStorage('auth', {
				serverUrl: active.url,
				userId: active.userId,
				token: active.accessToken,
				user: {Id: active.userId, Name: active.username}
			});

			// Reload servers
			await loadServers();

			setIsAuthenticated(true);
			return true;
		} catch (error) {
			console.error('[AUTH] Error switching user:', error);
			return false;
		}
	}, [loadServers]);

	/**
	 * Remove a server/user
	 */
	const removeUser = useCallback(async (serverId, userId) => {
		try {
			await multiServerManager.removeServer(serverId, userId);

			// Check if we still have any users
			const count = await multiServerManager.getTotalUserCount();
			if (count === 0) {
				// No users left, logout
				await removeFromStorage('auth');
				setUser(null);
				setServerUrl(null);
				setServerName(null);
				setAccessToken(null);
				setIsAuthenticated(false);
			} else {
				const active = await multiServerManager.getActiveServer();
				if (active) {
					await switchUser(active.serverId, active.userId);
				}
			}

			await loadServers();
			return true;
		} catch (error) {
			console.error('[AUTH] Error removing user:', error);
			return false;
		}
	}, [loadServers, switchUser]);

	/**
	 * Start "Add Server" flow
	 */
	const startAddServerFlow = useCallback((serverInfo = null) => {
		setIsAddingServer(true);
		setPendingServer(serverInfo);
	}, []);

	/**
	 * Cancel "Add Server" flow
	 */
	const cancelAddServerFlow = useCallback(() => {
		setIsAddingServer(false);
		setPendingServer(null);
	}, []);

	/**
	 * Complete "Add Server" flow
	 */
	const completeAddServerFlow = useCallback(() => {
		setIsAddingServer(false);
		setPendingServer(null);
	}, []);

	const logout = useCallback(async () => {
		if (activeServerInfo) {
			await multiServerManager.removeServer(activeServerInfo.serverId, activeServerInfo.userId);
		}

		const count = await multiServerManager.getTotalUserCount();
		if (count > 0) {
			const active = await multiServerManager.getActiveServer();
			if (active) {
				await switchUser(active.serverId, active.userId);
				return;
			}
		}

		// Clear all caches when fully logged out
		clearAllCaches();

		await removeFromStorage('auth');
		setUser(null);
		setServerUrl(null);
		setServerName(null);
		setAccessToken(null);
		setServers([]);
		setUniqueServers([]);
		setActiveServerInfo(null);
		setIsAuthenticated(false);
	}, [activeServerInfo, switchUser]);

	/**
	 * Full logout - remove all servers and users
	 */
	const logoutAll = useCallback(async () => {
		// Clear all caches first
		clearAllCaches();

		// Remove all servers
		const allServers = await multiServerManager.getAllServersArray();
		for (const server of allServers) {
			await multiServerManager.removeServer(server.serverId, server.userId);
		}

		await removeFromStorage('auth');
		setUser(null);
		setServerUrl(null);
		setServerName(null);
		setAccessToken(null);
		setServers([]);
		setUniqueServers([]);
		setActiveServerInfo(null);
		setIsAuthenticated(false);
	}, []);

	// Computed values
	const serverCount = useMemo(() => uniqueServers.length, [uniqueServers]);
	const totalUserCount = useMemo(() => servers.length, [servers]);
	const hasMultipleUsers = useMemo(() => servers.length > 1, [servers]);
	const hasMultipleServers = useMemo(() => uniqueServers.length > 1, [uniqueServers]);

	const contextValue = useMemo(() => ({
		// Auth state
		isAuthenticated,
		isLoading,
		user,
		serverUrl,
		serverName,
		accessToken,

		// Multi-server state
		servers,
		uniqueServers,
		activeServerInfo,
		serverCount,
		totalUserCount,
		hasMultipleUsers,
		hasMultipleServers,

		// Add server flow
		isAddingServer,
		pendingServer,
		startAddServerFlow,
		cancelAddServerFlow,
		completeAddServerFlow,

		// Actions
		login,
		loginWithToken,
		logout,
		logoutAll,
		switchUser,
		removeUser,
		loadServers,

		// API reference
		api: jellyfinApi.api
	}), [
		isAuthenticated,
		isLoading,
		user,
		serverUrl,
		serverName,
		accessToken,
		servers,
		uniqueServers,
		activeServerInfo,
		serverCount,
		totalUserCount,
		hasMultipleUsers,
		hasMultipleServers,
		isAddingServer,
		pendingServer,
		startAddServerFlow,
		cancelAddServerFlow,
		completeAddServerFlow,
		login,
		loginWithToken,
		logout,
		logoutAll,
		switchUser,
		removeUser,
		loadServers
	]);

	return (
		<AuthContext.Provider value={contextValue}>
			{children}
		</AuthContext.Provider>
	);
};

export const useAuth = () => {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error('useAuth must be used within AuthProvider');
	}
	return context;
};