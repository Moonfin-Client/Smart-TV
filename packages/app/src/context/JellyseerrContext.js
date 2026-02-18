import {createContext, useContext, useState, useEffect, useCallback} from 'react';
import * as jellyseerrApi from '../services/jellyseerrApi';
import {getFromStorage, saveToStorage, removeFromStorage} from '../services/storage';
import {useSettings} from './SettingsContext';

const JellyseerrContext = createContext(null);

export const JellyseerrProvider = ({children}) => {
	const {syncFromServer} = useSettings();
	const [isEnabled, setIsEnabled] = useState(false);
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [user, setUser] = useState(null);
	const [serverUrl, setServerUrl] = useState(null);
	const [isMoonfin, setIsMoonfin] = useState(false);
	const [variant, setVariant] = useState('jellyseerr');
	const [displayName, setDisplayName] = useState('Jellyseerr');
	const [pluginInfo, setPluginInfo] = useState(null);

	useEffect(() => {
		const init = async () => {
			try {
				const config = await getFromStorage('jellyseerr');
				if (config?.moonfin) {
					jellyseerrApi.setMoonfinConfig(config.jellyfinServerUrl, config.jellyfinAccessToken);
					jellyseerrApi.setMoonfinMode(true);
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
						}
					} catch (e) {
						console.log('[Jellyseerr] Moonfin status check failed:', e.message);
					}

					try {
						const [pingResult, configResult] = await Promise.all([
							jellyseerrApi.moonfinPing(config.jellyfinServerUrl, config.jellyfinAccessToken).catch(() => null),
							jellyseerrApi.getMoonfinConfig(config.jellyfinServerUrl, config.jellyfinAccessToken).catch(() => null)
						]);
						if (pingResult) {
							setPluginInfo(pingResult);
						}
						if (configResult) {
							const v = configResult.variant || 'jellyseerr';
							setVariant(v);
							setDisplayName(configResult.displayName || (v === 'seerr' ? 'Seerr' : 'Jellyseerr'));
						}
					} catch (e) {
						console.log('[Jellyseerr] Plugin info fetch failed:', e.message);
					}

					syncFromServer(config.jellyfinServerUrl, config.jellyfinAccessToken).catch(e =>
						console.log('[Jellyseerr] Settings sync failed:', e.message)
					);
				}
			} catch (e) {
				console.error('[Jellyseerr] Init failed:', e);
			} finally {
				setIsLoading(false);
			}
		};
		init();
	}, []);

	const configureWithMoonfin = useCallback(async (jellyfinServer, token) => {
		jellyseerrApi.setMoonfinConfig(jellyfinServer, token);
		jellyseerrApi.setMoonfinMode(true);
		jellyseerrApi.setConfig(jellyfinServer, 'moonfin-user');

		const [status, pingResult, configResult] = await Promise.all([
			jellyseerrApi.getMoonfinStatus(),
			jellyseerrApi.moonfinPing(jellyfinServer, token).catch(() => null),
			jellyseerrApi.getMoonfinConfig(jellyfinServer, token).catch(() => null)
		]);

		if (pingResult) {
			setPluginInfo(pingResult);
		}
		if (configResult) {
			const v = configResult.variant || 'jellyseerr';
			setVariant(v);
			setDisplayName(configResult.displayName || (v === 'seerr' ? 'Seerr' : 'Jellyseerr'));
		}

		syncFromServer(jellyfinServer, token).catch(e =>
			console.log('[Jellyseerr] Settings sync failed:', e.message)
		);

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
	}, [syncFromServer]);

	const loginWithMoonfin = useCallback(async (username, password) => {
		await jellyseerrApi.moonfinLogin(username, password);
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

	const logout = useCallback(async () => {
		try { await jellyseerrApi.moonfinLogout(); } catch (e) { void e; }
		setUser(null);
		setIsAuthenticated(false);
	}, []);

	const disable = useCallback(async () => {
		await removeFromStorage('jellyseerr');
		jellyseerrApi.setConfig(null, null, null);
		jellyseerrApi.setMoonfinMode(false);
		jellyseerrApi.setMoonfinConfig(null, null);
		setServerUrl(null);
		setUser(null);
		setIsEnabled(false);
		setIsAuthenticated(false);
		setIsMoonfin(false);
		setVariant('jellyseerr');
		setDisplayName('Jellyseerr');
		setPluginInfo(null);
	}, []);

	return (
		<JellyseerrContext.Provider value={{
			isEnabled,
			isAuthenticated,
			isLoading,
			user,
			serverUrl,
			isMoonfin,
			variant,
			displayName,
			pluginInfo,
			api: jellyseerrApi,
			configureWithMoonfin,
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
