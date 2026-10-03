import {createContext, useContext, useState, useEffect, useCallback, useMemo, useRef} from 'react';
import $L from '@enact/i18n/$L';
import * as jellyfinApi from '../services/jellyfinApi';
import {initStorage, getFromStorage, saveToStorage, removeFromStorage} from '../services/storage';
import * as multiServerManager from '../services/multiServerManager';
import {clearImageCache} from '../services/imageProxy';
import {clearAnimeMarkerCache} from '../services/animeMarkersApi';
import {resetLibraryScope} from '../services/libraryScope';
import {resetBlockedContentGate} from '../services/blockedContentGate';
import * as serverSocket from '../services/serverSocket';
import * as userDataSync from '../services/userDataSync';
import * as remoteControl from '../services/remoteControl';
import serverLogger from '../services/serverLogger';

import {clearProxiedImageCache} from '../hooks/useProxiedImage';
import {parseUrl} from '../utils/urlCompat';

const REVALIDATE_INTERVAL = 5 * 60 * 1000;
const BACKOFF_DELAYS = [5000, 10000, 20000];
const RECOVERY_MAX_DELAY = 60000;

// Retry quickly at first, then settle into a slow poll for as long as the server
// stays down.
const recoveryDelay = (attempt) => BACKOFF_DELAYS[attempt] ?? RECOVERY_MAX_DELAY;

// An empty 200 from a reverse proxy resolves without throwing, so reachable means
// a truthy body rather than the call merely not failing.
const probeServer = async () => {
	try {
		return Boolean(await jellyfinApi.api.getPublicInfo());
	} catch {
		return false;
	}
};

// Clear all memory caches - call on logout or server switch
const clearAllCaches = () => {
	clearImageCache();
	clearProxiedImageCache();
	// Verdicts are keyed by bare item id, so they would otherwise follow the user onto
	// the next server and label its items from the previous one.
	clearAnimeMarkerCache();
	// The policy and the hidden library list belong to the account that just left.
	resetLibraryScope();
	resetBlockedContentGate();
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
	const [serverType, setServerType] = useState('jellyfin');

	// Multi-server state
	const [servers, setServers] = useState([]);
	const [uniqueServers, setUniqueServers] = useState([]);
	const [activeServerInfo, setActiveServerInfo] = useState(null);
	const [isAddingServer, setIsAddingServer] = useState(false);
	const [pendingServer, setPendingServer] = useState(null);

	// Last known server (for auto-login disabled flow)
	const [lastServerUrl, setLastServerUrl] = useState(null);
	const [lastServerName, setLastServerName] = useState(null);

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
			try {
				await initStorage();
				await jellyfinApi.initDeviceId();

				const {allServers, active} = await loadServers();

				const storedSettings = await getFromStorage('settings');
				// Three behaviors, the way the other clients do it: disabled, the last
				// used account, or one pinned account. Settings saved before the picker
				// only had the on off toggle.
				const behavior = storedSettings?.autoLoginBehavior ||
					(storedSettings?.autoLogin === false ? 'disabled' : 'lastUser');
				const autoLogin = behavior !== 'disabled' && storedSettings?.alwaysAuthenticate !== true;

				let restoreTarget = active;
				if (behavior === 'currentUser' && storedSettings?.autoLoginUserId) {
					const pinned = allServers.find((s) =>
						s.serverId === storedSettings.autoLoginServerId &&
						s.userId === storedSettings.autoLoginUserId);
					if (pinned) restoreTarget = pinned;
				}

				if (restoreTarget) {
					setLastServerUrl(restoreTarget.url);
					setLastServerName(restoreTarget.name);

					if (autoLogin) {
						if (restoreTarget !== active) {
							await multiServerManager.setActiveServer(restoreTarget.serverId, restoreTarget.userId);
						}
						jellyfinApi.setServer(restoreTarget.url);
						jellyfinApi.setServerType(restoreTarget.serverType || 'jellyfin');
						jellyfinApi.setAuth(restoreTarget.userId, restoreTarget.accessToken);
						setServerUrl(restoreTarget.url);
						setServerName(restoreTarget.name);
						setAccessToken(restoreTarget.accessToken);
						setServerType(restoreTarget.serverType || 'jellyfin');

						try {
							const userInfo = await jellyfinApi.api.getUserConfiguration();
							setUser(userInfo);
							setIsAuthenticated(true);
							if (userInfo.PrimaryImageTag && restoreTarget.serverId) {
								multiServerManager.updateServer(restoreTarget.serverId, null, restoreTarget.userId, {
									primaryImageTag: userInfo.PrimaryImageTag
								});
							}
						} catch (e) {
							console.warn('[AUTH] Token validation failed, requiring re-login');
							jellyfinApi.setAuth(null, null);
							setAccessToken(null);
						}
					}
				} else {
					const storedAuth = await getFromStorage('auth');
					if (storedAuth) {
						setLastServerUrl(storedAuth.serverUrl);

						if (autoLogin) {
							jellyfinApi.setServer(storedAuth.serverUrl);
							jellyfinApi.setServerType('jellyfin');
							jellyfinApi.setAuth(storedAuth.userId, storedAuth.token);

							try {
								const userInfo = await jellyfinApi.api.getUserConfiguration();
								setServerUrl(storedAuth.serverUrl);
								setAccessToken(storedAuth.token);
								setUser(userInfo);
								setIsAuthenticated(true);
							} catch (e) {
								console.warn('[AUTH] Stored token validation failed, requiring re-login');
								jellyfinApi.setAuth(null, null);
							}
						}
					}
				}
			} catch (e) {
				console.error('[AUTH] Init failed:', e);
			} finally {
				setIsLoading(false);
			}
		};
		init();
	}, [loadServers]);

	const login = useCallback(async (server, username, password, options = {}) => {
		const {serverName: sName, serverType: sType = 'jellyfin', serverVersion: sVersion = null, isAddingNewServer = false, switchToNewUser = true} = options;

		jellyfinApi.setServer(server);
		jellyfinApi.setServerType(sType);

		const result = await jellyfinApi.api.authenticateByName(username, password);

		jellyfinApi.setAuth(result.User.Id, result.AccessToken);

		// Use provided server name or extract from URL
		let finalServerName = sName;
		if (!finalServerName) {
			try {
				const url = parseUrl(server);
				finalServerName = url.hostname;
			} catch (e) {
				finalServerName = $L('Media Server');
			}
		}

		// Add to multi-server system
		const serverResult = await multiServerManager.addServer(
			server,
			finalServerName,
			result.User.Id,
			result.User.Name,
			result.AccessToken,
			result.User.PrimaryImageTag,
			sType,
			sVersion
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
			setServerType(sType);
			setUser(result.User);
			setIsAuthenticated(true);
		}

		return {...result, serverResult};
	}, [loadServers]);

	const loginWithToken = useCallback(async (server, authResult, options = {}) => {
		const {serverName: sName, serverType: sType = 'jellyfin', serverVersion: sVersion = null, isAddingNewServer = false, switchToNewUser = true} = options;

		jellyfinApi.setServer(server);
		jellyfinApi.setServerType(sType);
		jellyfinApi.setAuth(authResult.User.Id, authResult.AccessToken);

		// Use provided server name or extract from URL
		let finalServerName = sName;
		if (!finalServerName) {
			try {
				const url = parseUrl(server);
				finalServerName = url.hostname;
			} catch (e) {
				finalServerName = $L('Media Server');
			}
		}

		const serverResult = await multiServerManager.addServer(
			server,
			finalServerName,
			authResult.User.Id,
			authResult.User.Name,
			authResult.AccessToken,
			authResult.User.PrimaryImageTag,
			sType,
			sVersion
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
			setServerType(sType);
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
			jellyfinApi.setServerType(active.serverType || 'jellyfin');
			jellyfinApi.setAuth(active.userId, active.accessToken);

			// Update state
			setServerUrl(active.url);
			setServerName(active.name);
			setAccessToken(active.accessToken);
			setServerType(active.serverType || 'jellyfin');

			// Get fresh user info
			try {
				const userInfo = await jellyfinApi.api.getUserConfiguration();
				setUser(userInfo);
				if (userInfo.PrimaryImageTag) {
					await multiServerManager.updateServer(serverId, null, userId, {
						primaryImageTag: userInfo.PrimaryImageTag
					});
				}
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
	 * Forget a server and every account saved against it
	 */
	const removeServerEntry = useCallback(async (serverId) => {
		try {
			await multiServerManager.removeServer(serverId);
			// Forgetting a server is not a request to be signed in as somebody
			// else, so the remaining accounts are only reloaded, never resumed.
			await loadServers();
			return true;
		} catch (error) {
			console.error('[AUTH] Error removing server:', error);
			return false;
		}
	}, [loadServers]);

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

	const [connectionState, setConnectionState] = useState('connected');
	const lastRevalidateRef = useRef(0);

	const revalidateSession = useCallback(async (force) => {
		if (!isAuthenticated) return;

		const now = Date.now();
		if (!force && now - lastRevalidateRef.current < REVALIDATE_INTERVAL) {
			serverLogger.info(serverLogger.LOG_CATEGORIES.AUTHENTICATION, 'Standby diag: revalidateSession skipped, within interval', {
				msSinceLast: now - lastRevalidateRef.current
			});
			return;
		}
		lastRevalidateRef.current = now;

		// One attempt straight away, then another after each backoff delay.
		let serverReachable = await probeServer();
		let attempts = 1;
		for (let i = 0; !serverReachable && i < BACKOFF_DELAYS.length; i++) {
			setConnectionState('reconnecting');
			await new Promise(r => setTimeout(r, BACKOFF_DELAYS[i]));
			serverReachable = await probeServer();
			attempts += 1;
		}

		if (!serverReachable) {
			serverLogger.info(serverLogger.LOG_CATEGORIES.AUTHENTICATION, 'Standby diag: revalidateSession found server unreachable', {attempts});
			setConnectionState('disconnected');
			return;
		}

		try {
			await jellyfinApi.api.getUserConfiguration();
			serverLogger.info(serverLogger.LOG_CATEGORIES.AUTHENTICATION, 'Standby diag: revalidateSession succeeded', {
				attempts,
				socketConnected: serverSocket.isConnected()
			});
			setConnectionState('connected');
		} catch (e) {
			const status = e?.status || e?.response?.status;
			serverLogger.info(serverLogger.LOG_CATEGORIES.AUTHENTICATION, 'Standby diag: revalidateSession getUserConfiguration failed', {
				attempts,
				status: status ?? null
			});
			if (status === 401 || status === 403) {
				console.warn('[AUTH] Session expired, requiring re-login');
				jellyfinApi.setAuth(null, null);
				setAccessToken(null);
				setUser(null);
				setIsAuthenticated(false);
				setConnectionState('connected');
			} else {
				setConnectionState('disconnected');
			}
		}
	}, [isAuthenticated]);

	// The session socket, and the watched state and remote control it carries, belong to whoever
	// is signed in, so all of it starts over when the account or the server changes. A server that
	// restarts forgets what this session can do, so it's told again on every connect.
	useEffect(() => {
		if (!isAuthenticated) return undefined;
		serverSocket.connect();
		userDataSync.bindTo(serverSocket.onMessage, jellyfinApi.getUserId());
		remoteControl.bindTo(serverSocket.onMessage);
		const stopReporting = serverSocket.onConnectionChange((open) => {
			if (open) jellyfinApi.reportCapabilities();
		});
		return () => {
			stopReporting();
			remoteControl.reset();
			userDataSync.reset();
			serverSocket.disconnect();
		};
	}, [isAuthenticated, serverUrl, accessToken]);

	// Nothing else moves the state off disconnected, so the banner would sit there
	// until someone pressed Retry. Probe in the background instead and drop it as
	// soon as the server answers.
	useEffect(() => {
		if (!isAuthenticated || connectionState !== 'disconnected') return undefined;

		let cancelled = false;
		let timer = null;
		let attempt = 0;

		const check = async () => {
			const reachable = await probeServer();
			if (cancelled) return;
			serverLogger.info(serverLogger.LOG_CATEGORIES.AUTHENTICATION, 'Standby diag: disconnected-recovery probe', {
				attempt: attempt + 1,
				reachable,
				socketConnected: serverSocket.isConnected()
			});
			if (reachable) {
				setConnectionState('connected');
				return;
			}
			attempt += 1;
			timer = setTimeout(check, recoveryDelay(attempt));
		};

		timer = setTimeout(check, recoveryDelay(attempt));
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [isAuthenticated, connectionState]);

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
		serverType,

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

		// Last known server (for login screen when auto-login disabled)
		lastServerUrl,
		lastServerName,

		// Connection state
		connectionState,
		revalidateSession,

		// Actions
		login,
		loginWithToken,
		logout,
		logoutAll,
		switchUser,
		removeUser,
		removeServerEntry,
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
		serverType,
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
		lastServerUrl,
		lastServerName,
		connectionState,
		revalidateSession,
		login,
		loginWithToken,
		logout,
		logoutAll,
		switchUser,
		removeUser,
		removeServerEntry,
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
