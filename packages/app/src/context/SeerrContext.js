import {createContext, useContext, useState, useEffect, useCallback, useRef} from 'react';
import * as seerrApi from '../services/seerrApi';
import {getFromStorage, saveToStorage, removeFromStorage} from '../services/storage';
import {useSettings} from './SettingsContext';
import {useAuth} from './AuthContext';

const SeerrContext = createContext(null);

const normalizeMoonfinAuthType = (authType) => (authType === 'local' ? 'local' : 'jellyfin');

const STREAM_RECONNECT_MIN_MS = 5000;
const STREAM_RECONNECT_MAX_MS = 60000;

export const SeerrProvider = ({children}) => {
	const {settings, syncFromServer} = useSettings();
	const pluginEnabled = settings.useMoonfinPlugin;
	const {serverUrl: authServerUrl, accessToken: authAccessToken, serverType: authServerType} = useAuth();
	const [isEnabled, setIsEnabled] = useState(false);
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [user, setUser] = useState(null);
	const [serverUrl, setServerUrl] = useState(null);
	const [isMoonfin, setIsMoonfin] = useState(false);
	const [variant, setVariant] = useState('seerr');
	const [displayName, setDisplayName] = useState('Seerr');
	const [pluginInfo, setPluginInfo] = useState(null);
	const [streamNotification, setStreamNotification] = useState(null);
	// Bumped whenever the server says its messages changed, so the messages
	// provider knows to ask for them again.
	const [messagesSignal, setMessagesSignal] = useState(0);
	const streamRef = useRef({subscription: null, retryTimer: null, retryDelay: STREAM_RECONNECT_MIN_MS});
	// Tracks the Jellyfin token currently pushed into seerrApi so a user switch can
	// tell whether it still points at the previous account and needs reconfiguring.
	const configuredTokenRef = useRef(null);
	const [moonfinAuthType, setMoonfinAuthTypeState] = useState('jellyfin');

	const dismissStreamNotification = useCallback(() => setStreamNotification(null), []);

	const handleStreamEvent = useCallback((event) => {
		// Any event proves the connection is healthy, so reset the backoff.
		streamRef.current.retryDelay = STREAM_RECONNECT_MIN_MS;
		if (!event || typeof event !== 'object') return;

		if (event.type === 'seerrNotification') {
			const title = typeof event.title === 'string' ? event.title : '';
			const body = typeof event.body === 'string' ? event.body : '';
			if (title || body) {
				setStreamNotification({title, body, key: Date.now()});
			}
			return;
		}

		// A broadcast is saved as a message set to open the window, so refreshing
		// is enough for it too.
		if (event.type === 'adminMessage' || event.type === 'messagesChanged') {
			setMessagesSignal((n) => n + 1);
		}
	}, []);

	const stopSettingsStream = useCallback(() => {
		const stream = streamRef.current;
		if (stream.retryTimer) {
			clearTimeout(stream.retryTimer);
			stream.retryTimer = null;
		}
		if (stream.subscription) {
			stream.subscription.abort();
			stream.subscription = null;
		}
		stream.retryDelay = STREAM_RECONNECT_MIN_MS;
	}, []);

	const startSettingsStream = useCallback((jellyfinServer, token) => {
		if (!jellyfinServer || !token) return;
		stopSettingsStream();

		const connect = () => {
			const stream = streamRef.current;
			stream.retryTimer = null;
			try {
				stream.subscription = seerrApi.subscribeMoonfinSettingsStream(
					jellyfinServer,
					token,
					handleStreamEvent,
					(error) => {
						stream.subscription = null;
						// A rejected token won't heal by retrying. The stream restarts
						// when the Moonfin config is established again.
						if (error?.status === 401) return;
						const delay = stream.retryDelay;
						stream.retryDelay = Math.min(delay * 2, STREAM_RECONNECT_MAX_MS);
						stream.retryTimer = setTimeout(connect, delay);
					}
				);
			} catch (e) {
				console.log('[Seerr] Settings stream failed to start:', e.message);
			}
		};

		connect();
	}, [handleStreamEvent, stopSettingsStream]);

	useEffect(() => () => stopSettingsStream(), [stopSettingsStream]);

	useEffect(() => {
		const init = async () => {
			try {
				let config = await getFromStorage('seerr');
				// Carry over pre-rename data stored under the old 'jellyseerr' key.
				if (!config) {
					const legacyConfig = await getFromStorage('jellyseerr');
					if (legacyConfig) {
						config = legacyConfig;
						await saveToStorage('seerr', legacyConfig);
					}
				}
				if (config?.moonfin) {
					const initialAuthType = normalizeMoonfinAuthType(config.moonfinAuthType);
					setMoonfinAuthTypeState(initialAuthType);
					seerrApi.setMoonfinConfig(config.jellyfinServerUrl, config.jellyfinAccessToken);
					configuredTokenRef.current = config.jellyfinAccessToken;
					seerrApi.setMoonfinMode(true);
					setServerUrl(config.url || config.jellyfinServerUrl);
					setIsEnabled(true);
					setIsMoonfin(true);

					try {
						const status = await seerrApi.getMoonfinStatus();
						if (status?.authenticated) {
							if (status.authType) {
								setMoonfinAuthTypeState(normalizeMoonfinAuthType(status.authType));
							}
							setUser({
								displayName: status.displayName,
								seerrUserId: status.seerrUserId,
								permissions: status.permissions ?? 0xFFFFFFFF
							});
							setIsAuthenticated(true);
							setServerUrl(status.url || config.url || config.jellyfinServerUrl);
						}
					} catch (e) {
						console.log('[Seerr] Moonfin status check failed:', e.message);
					}

					try {
						const [pingResult, configResult] = await Promise.all([
							seerrApi.moonfinPing(config.jellyfinServerUrl, config.jellyfinAccessToken).catch(() => null),
							seerrApi.getMoonfinConfig(config.jellyfinServerUrl, config.jellyfinAccessToken).catch(() => null)
						]);
						if (pingResult) {
							setPluginInfo(pingResult);
						}
						if (configResult) {
							const v = configResult.variant || 'seerr';
							setVariant(v);
							setDisplayName(configResult.displayName || 'Seerr');
						}
					} catch (e) {
						console.log('[Seerr] Plugin info fetch failed:', e.message);
					}

					syncFromServer(config.jellyfinServerUrl, config.jellyfinAccessToken).catch(e =>
						console.log('[Seerr] Settings sync failed:', e.message)
					);

					startSettingsStream(config.jellyfinServerUrl, config.jellyfinAccessToken);
				}
			} catch (e) {
				console.error('[Seerr] Init failed:', e);
			} finally {
				setIsLoading(false);
			}
		};
		init();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const configureWithMoonfin = useCallback(async (jellyfinServer, token) => {
		// Claimed before the first await, so the effect below sees this token as handled
		// and the plugin toggle calling straight in here cant set off a second run.
		seerrApi.setMoonfinConfig(jellyfinServer, token);
		configuredTokenRef.current = token;
		seerrApi.setMoonfinMode(true);

		const existingConfig = await getFromStorage('seerr');
		const savedAuthType = normalizeMoonfinAuthType(existingConfig?.moonfinAuthType);
		setMoonfinAuthTypeState(savedAuthType);

		const [status, pingResult, configResult] = await Promise.all([
			seerrApi.getMoonfinStatus(),
			seerrApi.moonfinPing(jellyfinServer, token).catch(() => null),
			seerrApi.getMoonfinConfig(jellyfinServer, token).catch(() => null)
		]);

		if (pingResult) {
			setPluginInfo(pingResult);
		}
		if (configResult) {
			const v = configResult.variant || 'seerr';
			setVariant(v);
			setDisplayName(configResult.displayName || 'Seerr');
		}

		syncFromServer(jellyfinServer, token).catch(e =>
			console.log('[Seerr] Settings sync failed:', e.message)
		);

		startSettingsStream(jellyfinServer, token);

		if (status?.authenticated) {
			const resolvedAuthType = normalizeMoonfinAuthType(status.authType || savedAuthType);
			if (status.authType) {
				setMoonfinAuthTypeState(normalizeMoonfinAuthType(status.authType));
			}
			const userData = {
				displayName: status.displayName,
				seerrUserId: status.seerrUserId,
				permissions: status.permissions ?? 0xFFFFFFFF
			};
			setUser(userData);
			setIsAuthenticated(true);
			setServerUrl(status.url || jellyfinServer);
			setIsEnabled(true);
			setIsMoonfin(true);

			await saveToStorage('seerr', {
				moonfin: true,
				url: status.url || jellyfinServer,
				jellyfinServerUrl: jellyfinServer,
				jellyfinAccessToken: token,
				userId: status.seerrUserId,
				moonfinAuthType: resolvedAuthType
			});

			return {authenticated: true, user: userData, url: status.url};
		} else {
			setUser(null);
			setIsAuthenticated(false);
			setServerUrl(jellyfinServer);
			setIsEnabled(true);
			setIsMoonfin(true);

			await saveToStorage('seerr', {
				moonfin: true,
				jellyfinServerUrl: jellyfinServer,
				jellyfinAccessToken: token,
				moonfinAuthType: savedAuthType
			});

			return {authenticated: false, url: status?.url};
		}
	}, [syncFromServer, startSettingsStream]);

	// The Seerr identity is decided by the Jellyfin token we hand the plugin, so a
	// user switch has to re-push the now-active token. Without this the previous
	// user's token stays configured and their requests show for everyone.
	// It also does the first setup, since the plugin setting turns itself on the first
	// time a server answers with a profile and nothing else would hand it a token.
	useEffect(() => {
		// Stored config settles this on its own, so waiting for it to load keeps the two
		// from configuring the same token at once.
		if (isLoading) return;
		// Seerr goes through the plugin, and a Plex server has none.
		if (authServerType === 'plex') {
			configuredTokenRef.current = null;
			stopSettingsStream();
			return;
		}
		if (!pluginEnabled && !(isEnabled && isMoonfin)) return;
		if (!authAccessToken || !authServerUrl) return;
		if (authAccessToken === configuredTokenRef.current) return;
		configureWithMoonfin(authServerUrl, authAccessToken).catch(e =>
			console.log('[Seerr] Configure against the plugin failed:', e.message)
		);
	}, [authAccessToken, authServerUrl, authServerType, isLoading, pluginEnabled, isEnabled, isMoonfin, configureWithMoonfin, stopSettingsStream]);

	const loginWithMoonfin = useCallback(async (username, password, authType = 'jellyfin') => {
		const normalizedAuthType = normalizeMoonfinAuthType(authType);
		await seerrApi.moonfinLogin(username, password, normalizedAuthType);
		const status = await seerrApi.getMoonfinStatus();
		if (status?.authenticated) {
			const userData = {
				displayName: status.displayName,
				seerrUserId: status.seerrUserId,
				permissions: status.permissions ?? 0xFFFFFFFF
			};
			setMoonfinAuthTypeState(normalizedAuthType);
			const config = await getFromStorage('seerr');
			const resolvedUrl = status.url || config?.url || config?.jellyfinServerUrl || null;
			setUser(userData);
			setIsAuthenticated(true);
			setServerUrl(resolvedUrl);

			await saveToStorage('seerr', {
				...config,
				url: resolvedUrl,
				userId: status.seerrUserId,
				moonfinAuthType: normalizedAuthType
			});

			return userData;
		}
		throw new Error('Login succeeded but session not established');
	}, []);

	const setMoonfinAuthType = useCallback(async (authType) => {
		const normalizedAuthType = normalizeMoonfinAuthType(authType);
		setMoonfinAuthTypeState(normalizedAuthType);

		const config = await getFromStorage('seerr');
		if (config?.moonfin) {
			await saveToStorage('seerr', {
				...config,
				moonfinAuthType: normalizedAuthType
			});
		}
	}, []);

	const logout = useCallback(async () => {
		try { await seerrApi.moonfinLogout(); } catch (e) { void e; }
		setUser(null);
		setIsAuthenticated(false);

		const config = await getFromStorage('seerr');
		if (config?.moonfin) {
			await saveToStorage('seerr', {
				...config,
				url: config.jellyfinServerUrl || config.url,
				userId: null,
				moonfinAuthType: normalizeMoonfinAuthType(config.moonfinAuthType || moonfinAuthType)
			});
			setServerUrl(config.jellyfinServerUrl || config.url || null);
		}
	}, [moonfinAuthType]);

	// Asks the plugin again what it offers, without setting anything else up a second time
	const refreshPluginInfo = useCallback(async (jellyfinServer, token) => {
		const pingResult = await seerrApi.moonfinPing(jellyfinServer, token).catch(() => null);
		setPluginInfo(pingResult || null);
	}, []);

	const disable = useCallback(async () => {
		stopSettingsStream();
		await removeFromStorage('seerr');
		seerrApi.setMoonfinMode(false);
		seerrApi.setMoonfinConfig(null, null);
		configuredTokenRef.current = null;
		setServerUrl(null);
		setUser(null);
		setIsEnabled(false);
		setIsAuthenticated(false);
		setIsMoonfin(false);
		setVariant('seerr');
		setDisplayName('Seerr');
		setPluginInfo(null);
		setMoonfinAuthTypeState('jellyfin');
	}, [stopSettingsStream]);

	return (
		<SeerrContext.Provider value={{
			isEnabled: isEnabled && authServerType !== 'plex',
			isAuthenticated,
			isLoading,
			user,
			serverUrl,
			isMoonfin,
			variant,
			displayName,
			pluginInfo,
			moonfinAuthType,
			api: seerrApi,
			configureWithMoonfin,
			refreshPluginInfo,
			loginWithMoonfin,
			setMoonfinAuthType,
			logout,
			disable,
			streamNotification,
			dismissStreamNotification,
			messagesSignal
		}}>
			{children}
		</SeerrContext.Provider>
	);
};

export const useSeerr = () => {
	const context = useContext(SeerrContext);
	if (!context) {
		throw new Error('useSeerr must be used within SeerrProvider');
	}
	return context;
};
