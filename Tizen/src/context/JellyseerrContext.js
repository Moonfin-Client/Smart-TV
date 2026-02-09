import {createContext, useContext, useState, useEffect, useCallback} from 'react';
import * as jellyseerrApi from '../services/jellyseerrApi';
import {getFromStorage, saveToStorage, removeFromStorage} from '../services/storage';

const JellyseerrContext = createContext(null);

export const JellyseerrProvider = ({children}) => {
	const [isEnabled, setIsEnabled] = useState(false);
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [user, setUser] = useState(null);
	const [serverUrl, setServerUrl] = useState(null);
	const [isMoonfin, setIsMoonfin] = useState(false);

	// Save session cookie to storage after successful operations
	const persistSession = useCallback(async () => {
		const config = await getFromStorage('jellyseerr');
		const currentSession = jellyseerrApi.getSessionCookie();
		if (config && currentSession) {
			await saveToStorage('jellyseerr', {...config, sessionCookie: currentSession});
			console.log('[Jellyseerr] Session persisted to storage');
		}
	}, []);

	useEffect(() => {
		const init = async () => {
			try {
				const config = await getFromStorage('jellyseerr');
				if (config?.moonfin) {
					// Moonfin plugin mode - restore config
					jellyseerrApi.setMoonfinConfig(config.jellyfinServerUrl, config.jellyfinAccessToken);
					jellyseerrApi.setMoonfinMode(true);
					// Set a userId so request() doesn't fail in non-moonfin code paths
					jellyseerrApi.setConfig(config.url || config.jellyfinServerUrl, config.userId || 'moonfin-user');
					setServerUrl(config.url || config.jellyfinServerUrl);
					setIsEnabled(true);
					setIsMoonfin(true);

					try {
						const status = await jellyseerrApi.getMoonfinStatus();
						if (status?.authenticated) {
							setUser({
								displayName: status.displayName,
								jellyseerrUserId: status.jellyseerrUserId,
								permissions: status.permissions || 0xFFFFFFFF
							});
							setIsAuthenticated(true);
							setServerUrl(status.url || config.url || config.jellyfinServerUrl);
							console.log('[Jellyseerr] Moonfin session restored');
						} else {
							console.log('[Jellyseerr] Moonfin session not authenticated');
						}
					} catch (e) {
						console.log('[Jellyseerr] Moonfin status check failed:', e.message);
					}
				} else if (config?.url && config?.userId) {
					// Standard direct mode - restore session cookie if saved
					jellyseerrApi.setMoonfinMode(false);
					jellyseerrApi.setConfig(
						config.url,
						config.userId,
						config.apiKey,
						config.sessionCookie
					);
					setServerUrl(config.url);
					setIsEnabled(true);
					setIsMoonfin(false);

					// If we have an API key, just verify it works with /status
					if (config.apiKey) {
						try {
							await jellyseerrApi.testConnection();
							setUser({displayName: 'API Key User', permissions: 0xFFFFFFFF});
							setIsAuthenticated(true);
							console.log('[Jellyseerr] API key validated');
						} catch (e) {
							console.log('[Jellyseerr] API key validation failed:', e.message);
						}
					} else {
						// Cookie-based auth - try to get user
						try {
							const userData = await jellyseerrApi.getUser();
							setUser(userData);
							setIsAuthenticated(true);
						} catch (e) {
							console.log('[Jellyseerr] Session check failed, may need to re-login');
							jellyseerrApi.setSessionCookie(null);
						}
					}
				}
			} catch (e) {
				console.error('[Jellyseerr] Init failed:', e);
			} finally {
				setIsLoading(false);
			}
		};
		init();
	}, []);

	const configure = useCallback(async (url, userId, apiKey = null) => {
		jellyseerrApi.setMoonfinMode(false);
		jellyseerrApi.setConfig(url, userId, apiKey);
		setServerUrl(url);
		setIsEnabled(true);
		setIsMoonfin(false);
		await saveToStorage('jellyseerr', {url, userId, apiKey, moonfin: false});

		// If using API key, validate with /status
		if (apiKey) {
			try {
				await jellyseerrApi.testConnection();
				setUser({displayName: 'API Key User', permissions: 0xFFFFFFFF});
				setIsAuthenticated(true);
				console.log('[Jellyseerr] API key validated successfully');
			} catch (e) {
				console.log('[Jellyseerr] API key validation failed:', e.message);
				throw e;
			}
		}
	}, []);

	/**
	 * Configure Jellyseerr via Moonfin server plugin
	 * @param {string} jellyfinServer - Jellyfin server URL
	 * @param {string} token - Jellyfin access token
	 * @returns {Promise<Object>} - Status from Moonfin plugin
	 */
	const configureWithMoonfin = useCallback(async (jellyfinServer, token) => {
		// Set up Moonfin proxy
		jellyseerrApi.setMoonfinConfig(jellyfinServer, token);
		jellyseerrApi.setMoonfinMode(true);
		// Set a basic config so the rest of the API module works
		jellyseerrApi.setConfig(jellyfinServer, 'moonfin-user');

		// Check status
		const status = await jellyseerrApi.getMoonfinStatus();
		console.log('[Jellyseerr] Moonfin status:', status);

		if (status?.authenticated) {
			const userData = {
				displayName: status.displayName,
				jellyseerrUserId: status.jellyseerrUserId,
				permissions: status.permissions || 0xFFFFFFFF
			};
			setUser(userData);
			setIsAuthenticated(true);
			setServerUrl(status.url || jellyfinServer);
			setIsEnabled(true);
			setIsMoonfin(true);

			await saveToStorage('jellyseerr', {
				moonfin: true,
				url: status.url || jellyfinServer,
				jellyfinServerUrl: jellyfinServer,
				jellyfinAccessToken: token,
				userId: status.jellyseerrUserId
			});

			return {authenticated: true, user: userData, url: status.url};
		} else {
			// Not authenticated yet — the user may need to login via Moonfin
			setServerUrl(jellyfinServer);
			setIsEnabled(true);
			setIsMoonfin(true);

			await saveToStorage('jellyseerr', {
				moonfin: true,
				jellyfinServerUrl: jellyfinServer,
				jellyfinAccessToken: token
			});

			return {authenticated: false, url: status?.url};
		}
	}, []);

	/**
	 * Login to Jellyseerr via Moonfin plugin
	 */
	const loginWithMoonfin = useCallback(async (username, password) => {
		await jellyseerrApi.moonfinLogin(username, password);

		// After login, check status to get user info
		const status = await jellyseerrApi.getMoonfinStatus();
		if (status?.authenticated) {
			const userData = {
				displayName: status.displayName,
				jellyseerrUserId: status.jellyseerrUserId,
				permissions: status.permissions || 0xFFFFFFFF
			};
			setUser(userData);
			setIsAuthenticated(true);
			setServerUrl(status.url);

			// Update storage with new session info
			const config = await getFromStorage('jellyseerr');
			await saveToStorage('jellyseerr', {
				...config,
				url: status.url,
				userId: status.jellyseerrUserId
			});

			return userData;
		}

		throw new Error('Login succeeded but session not established');
	}, []);

	const login = useCallback(async (email, password) => {
		const result = await jellyseerrApi.login(email, password);
		setUser(result);
		setIsAuthenticated(true);
		await persistSession();
		return result;
	}, [persistSession]);

	const loginWithJellyfin = useCallback(async (username, password, jellyfinHost) => {
		const result = await jellyseerrApi.loginWithJellyfin(username, password, jellyfinHost);
		setUser(result);
		setIsAuthenticated(true);
		await persistSession();
		return result;
	}, [persistSession]);

	const logout = useCallback(async () => {
		if (isMoonfin) {
			try {
				await jellyseerrApi.moonfinLogout();
			} catch (e) {
				console.log('[Jellyseerr] Moonfin logout error:', e.message);
			}
		} else {
			await jellyseerrApi.logout();
		}
		setUser(null);
		setIsAuthenticated(false);
	}, [isMoonfin]);

	const disable = useCallback(async () => {
		if (!isMoonfin) {
			await jellyseerrApi.clearCookies();
		}
		await removeFromStorage('jellyseerr');
		jellyseerrApi.setConfig(null, null, null);
		jellyseerrApi.setMoonfinMode(false);
		jellyseerrApi.setMoonfinConfig(null, null);
		setServerUrl(null);
		setUser(null);
		setIsEnabled(false);
		setIsAuthenticated(false);
		setIsMoonfin(false);
	}, [isMoonfin]);

	return (
		<JellyseerrContext.Provider value={{
			isEnabled,
			isAuthenticated,
			isLoading,
			user,
			serverUrl,
			isMoonfin,
			api: jellyseerrApi,
			configure,
			configureWithMoonfin,
			login,
			loginWithJellyfin,
			loginWithMoonfin,
			logout,
			disable
		}}>
			{children}
		</JellyseerrContext.Provider>
	);
};

export const useJellyseerr = () => {
	const context = useContext(JellyseerrContext);
	if (!context) {
		throw new Error('useJellyseerr must be used within JellyseerrProvider');
	}
	return context;
};
