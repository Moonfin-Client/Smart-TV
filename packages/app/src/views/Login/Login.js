import {useState, useCallback, useEffect} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';
import {useAuth} from '../../context/AuthContext';
import * as jellyfinApi from '../../services/jellyfinApi';
import * as embyConnect from '../../services/embyConnect';
import {generateCandidates} from '../../utils/serverUrl';
import {classifyError, getConnectionMessage, getLoginMessage, isVersionSupported, INVALID_ADDRESS, SERVER_NOT_JELLYFIN, VERSION_UNSUPPORTED, INSECURE_CERT, MIN_SERVER_VERSION} from '../../utils/connectionErrors';
import {KEYS} from '../../utils/keys';
import SpottableInput from '../../components/SpottableInput/SpottableInput';

import css from './Login.module.less';

const SpottableButton = Spottable('button');
const SpottableDiv = Spottable('div');
const UserGridContainer = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');

const detectServerType = (info) => {
	const productName = (info.ProductName || '').toLowerCase();
	if (productName.includes('jellyfin')) return 'jellyfin';
	if (productName.includes('emby')) return 'emby';
	const parts = String(info.Version || '').split('.');
	const major = parseInt(parts[0], 10);
	if (!Number.isNaN(major) && parts.length >= 4 && major < 10) return 'emby';
	return null;
};

const Login = ({
	onLoggedIn,
	onServerAdded,
	isAddingServer: isAddingServerProp = false,
	isAddingUser = false,
	currentServerUrl = null,
	currentServerName = null,
	pendingServerInfo = null
}) => {
	const {
		login,
		loginWithToken,
		isLoading,
		isAuthenticated,
		isAddingServer: isAddingServerContext,
		pendingServer: pendingServerContext,
		completeAddServerFlow,
		cancelAddServerFlow,
		lastServerUrl: storedServerUrl,
		lastServerName: storedServerName,
		servers: savedAccounts,
		switchUser
	} = useAuth();

	// Determine if we're in "add server" mode (either adding new server or adding user to current)
	const isAddingServer = isAddingServerProp || isAddingServerContext;
	const isAddingToExisting = isAddingUser && currentServerUrl;
	const pendingServer = pendingServerInfo || pendingServerContext;

	const [step, setStep] = useState(isAddingToExisting ? 'connecting' : 'server');
	const [serverUrl, setServerUrl] = useState(isAddingToExisting ? currentServerUrl : (pendingServer?.url || storedServerUrl || ''));
	const [serverInfo, setServerInfo] = useState(isAddingToExisting ? {ServerName: currentServerName} : (pendingServer ? {ServerName: pendingServer.name} : (storedServerName ? {ServerName: storedServerName} : null)));
	const [publicUsers, setPublicUsers] = useState([]);
	const [selectedUser, setSelectedUser] = useState(null);
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [quickConnectCode, setQuickConnectCode] = useState('');
	const [, setQuickConnectSecret] = useState(null);
	const [quickConnectInterval, setQuickConnectInterval] = useState(null);
	const [error, setError] = useState(null);
	const [status, setStatus] = useState(null);
	const [isConnecting, setIsConnecting] = useState(false);
	const [serverType, setServerType] = useState('jellyfin');
	const [connectServers, setConnectServers] = useState([]);
	const [connectSession, setConnectSession] = useState(null);

	const handleConnect = useCallback(async () => {
		if (!serverUrl.trim()) return;

		setIsConnecting(true);
		setError(null);

		const candidates = generateCandidates(serverUrl);
		if (candidates.length === 0) {
			setError(getConnectionMessage(INVALID_ADDRESS));
			setIsConnecting(false);
			return;
		}

		let connected = false;
		let lastErrorType = null;
		for (const candidate of candidates) {
			setStatus($L('Trying {url}...').replace('{url}', candidate));
			jellyfinApi.setServer(candidate);

			try {
				const info = await jellyfinApi.api.getPublicInfo();
				if (!info) continue;

				const detectedType = detectServerType(info);
				if (!detectedType) {
					lastErrorType = SERVER_NOT_JELLYFIN;
					continue;
				}

				// Emby reports a 4.x version that has nothing to do with the Jellyfin minimum
				if (detectedType === 'jellyfin' && !isVersionSupported(info.Version)) {
					lastErrorType = VERSION_UNSUPPORTED;
					setError($L('Server version {version} is not supported. Minimum: {minimum}.').replace('{version}', info.Version).replace('{minimum}', MIN_SERVER_VERSION));
					setStatus(null);
					setIsConnecting(false);
					return;
				}

				setServerType(detectedType);
				jellyfinApi.setServerType(detectedType);
				setServerUrl(candidate);
				setServerInfo(info);
				setStatus($L('Connected to {serverName}! Loading users...').replace('{serverName}', info.ServerName));
				connected = true;

				try {
					const users = await jellyfinApi.api.getPublicUsers();
					setPublicUsers(users || []);
					if (users && users.length > 0) {
						setStep('users');
						setStatus(null);
						setTimeout(() => Spotlight.focus('[data-spotlight-id="user-0"]'), 100);
					} else {
						setStep('manual');
						setStatus(null);
						setTimeout(() => Spotlight.focus('[data-spotlight-id="username-input"]'), 100);
					}
				} catch {
					setStep('manual');
					setStatus(null);
					setTimeout(() => Spotlight.focus('[data-spotlight-id="username-input"]'), 100);
				}
				break;
			} catch (err) {
				const errType = classifyError(err);
				// A cert rejection (from the https candidate / proxy probe) is the
				// most actionable diagnosis, don't let a weaker network failure
				// from a later http candidate mask it.
				if (lastErrorType !== INSECURE_CERT) {
					lastErrorType = errType || lastErrorType;
				}
				continue;
			}
		}

		if (!connected) {
			setError(getConnectionMessage(lastErrorType));
			setStatus(null);
		}

		setIsConnecting(false);
	}, [serverUrl]);

	// If we have a pending server, adding user to existing, or a stored server (auto-login disabled), auto-connect
	useEffect(() => {
		if ((pendingServer?.url && step === 'server') || (isAddingToExisting && step === 'connecting')) {
			handleConnect();
			return;
		}
		if (storedServerUrl && !isAuthenticated && !isAddingServer && !isAddingToExisting && step === 'server') {
			// Prefer the saved-account picker so disabling autologin still lets you
			// pick an already authenticated account, even when the server has public
			// users disabled (#200). Only auto-connect when nothing is saved.
			if (savedAccounts.length > 0) {
				setStep('accounts');
				setTimeout(() => Spotlight.focus('[data-spotlight-id="account-0"]'), 100);
			} else {
				handleConnect();
			}
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		// Only auto-navigate if authenticated and NOT in adding mode
		if (isAuthenticated && !isAddingServer && !isAddingToExisting) {
			onLoggedIn?.();
		}
	}, [isAuthenticated, onLoggedIn, isAddingServer, isAddingToExisting]);

	useEffect(() => {
		if (!isLoading && step === 'server') {
			setTimeout(() => Spotlight.focus('[data-spotlight-id="server-input"]'), 100);
		}
	}, [isLoading, step]);

	const handleServerUrlChange = useCallback((e) => {
		setServerUrl(e.target.value);
	}, []);

	const handleUsernameChange = useCallback((e) => {
		setUsername(e.target.value);
	}, []);

	const handlePasswordChange = useCallback((e) => {
		setPassword(e.target.value);
	}, []);

	const handleUserSelect = useCallback(async (user) => {
		if (!user.HasPassword) {
			setSelectedUser(user);
			setUsername(user.Name);
			setPassword('');
			setIsConnecting(true);
			setError(null);
			const isAdding = isAddingServer || isAddingToExisting;
			setStatus(isAdding ? $L('Adding user...') : $L('Signing in...'));

			try {
				const result = await login(jellyfinApi.getServerUrl(), user.Name, '', {
					serverName: serverInfo?.ServerName,
					serverType,
					isAddingNewServer: isAdding,
					switchToNewUser: true
				});

				if (isAdding) {
					completeAddServerFlow?.();
					onServerAdded?.(result);
				} else {
					onLoggedIn?.();
				}
			} catch {
				setPassword('');
				setStep('password');
				setStatus(null);
				setTimeout(() => Spotlight.focus('[data-spotlight-id="password-input"]'), 100);
			} finally {
				setIsConnecting(false);
			}
			return;
		}

		setSelectedUser(user);
		setUsername(user.Name);
		setPassword('');
		setStep('password');
		setTimeout(() => Spotlight.focus('[data-spotlight-id="password-input"]'), 100);
	}, [login, onLoggedIn, isAddingServer, isAddingToExisting, serverInfo, serverType, completeAddServerFlow, onServerAdded]);

	const handleLogin = useCallback(async () => {
		if (!username) return;

		setIsConnecting(true);
		setError(null);
		const isAdding = isAddingServer || isAddingToExisting;
		setStatus(isAdding ? $L('Adding user...') : $L('Signing in...'));

		try {
			const result = await login(jellyfinApi.getServerUrl(), username, password, {
				serverName: serverInfo?.ServerName,
				serverType,
				isAddingNewServer: isAdding,
				switchToNewUser: true
			});

			if (isAdding) {
				completeAddServerFlow?.();
				onServerAdded?.(result);
			} else {
				onLoggedIn?.();
			}
		} catch (err) {
			console.error('Login error:', err);
			setError(getLoginMessage(classifyError(err)));
			setStatus(null);
		} finally {
			setIsConnecting(false);
		}
	}, [username, password, login, onLoggedIn, isAddingServer, isAddingToExisting, serverInfo, serverType, completeAddServerFlow, onServerAdded]);

	const handleBack = useCallback(() => {
		setError(null);
		setStatus(null);
		const isAdding = isAddingServer || isAddingToExisting;
		if (quickConnectInterval) {
			clearInterval(quickConnectInterval);
			setQuickConnectInterval(null);
		}
		if (step === 'embyconnect-servers') {
			setStep('embyconnect');
			setConnectServers([]);
			setConnectSession(null);
			setTimeout(() => Spotlight.focus('[data-spotlight-id="emby-username-input"]'), 100);
		} else if (step === 'embyconnect') {
			if (isAdding) {
				cancelAddServerFlow?.();
				onServerAdded?.(null);
				return;
			}
			setStep('server');
			setTimeout(() => Spotlight.focus('[data-spotlight-id="server-input"]'), 100);
		} else if (step === 'quickconnect-manual') {
			setStep('manual');
			setQuickConnectCode('');
			setQuickConnectSecret(null);
			setTimeout(() => Spotlight.focus('[data-spotlight-id="username-input"]'), 100);
		} else if (step === 'password' || step === 'passwordform' || step === 'quickconnect') {
			setStep('users');
			setSelectedUser(null);
			setPassword('');
			setQuickConnectCode('');
			setQuickConnectSecret(null);
			setTimeout(() => Spotlight.focus('[data-spotlight-id="user-0"]'), 100);
		} else if (step === 'manual' || step === 'users') {
			if (isAdding) {
				cancelAddServerFlow?.();
				onServerAdded?.(null);
				return;
			}
			setStep('server');
			setServerInfo(null);
			setPublicUsers([]);
			setTimeout(() => Spotlight.focus('[data-spotlight-id="server-input"]'), 100);
		} else if (step === 'server' && isAdding) {
			cancelAddServerFlow?.();
			onServerAdded?.(null);
		} else if (step === 'server' && savedAccounts.length > 0) {
			setStep('accounts');
			setTimeout(() => Spotlight.focus('[data-spotlight-id="account-0"]'), 100);
		}
	}, [step, quickConnectInterval, isAddingServer, isAddingToExisting, cancelAddServerFlow, onServerAdded, savedAccounts.length]);

	const handleManualLogin = useCallback(() => {
		setStep('manual');
		setSelectedUser(null);
		setUsername('');
		setPassword('');
		setTimeout(() => Spotlight.focus('[data-spotlight-id="username-input"]'), 100);
	}, []);

	const embyConnectErrorMessage = useCallback((err) => {
		switch (err?.reason) {
			case 'invalidCredentials': return $L('Invalid Emby Connect username or password');
			case 'invalidAuthResponse': return $L('Invalid Emby Connect credentials');
			case 'noLinkedServers': return $L('No servers linked to this Emby Connect account');
			case 'noReachableAddress': return $L('No reachable address provided');
			case 'unableToConnectServer': return $L('Unable to connect to the selected server');
			default: return $L('Network error while contacting Emby Connect or the selected server');
		}
	}, []);

	const handleEmbyConnectStart = useCallback(() => {
		setError(null);
		setStatus(null);
		setUsername('');
		setPassword('');
		setConnectServers([]);
		setConnectSession(null);
		setStep('embyconnect');
		setTimeout(() => Spotlight.focus('[data-spotlight-id="emby-username-input"]'), 100);
	}, []);

	const finishEmbyLogin = useCallback((server, session) => {
		const isAdding = isAddingServer || isAddingToExisting;
		return embyConnect.connectToServer(server, session.userId).then((exchange) => loginWithToken(
			exchange.resolvedBaseUrl,
			{User: {Id: exchange.localUserId, Name: session.userName || username}, AccessToken: exchange.accessToken},
			{serverName: server.name, serverType: 'emby', isAddingNewServer: isAdding, switchToNewUser: true}
		)).then((result) => {
			setIsConnecting(false);
			setStatus(null);
			if (isAdding) {
				completeAddServerFlow?.();
				onServerAdded?.(result);
			} else {
				onLoggedIn?.();
			}
		});
	}, [isAddingServer, isAddingToExisting, loginWithToken, username, completeAddServerFlow, onServerAdded, onLoggedIn]);

	const handleEmbyConnectSignIn = useCallback(async () => {
		if (!username.trim() || !password) return;
		setError(null);
		setIsConnecting(true);
		setStatus($L('Signing in...'));
		try {
			const {session, servers} = await embyConnect.authenticateAndLoadServers(username.trim(), password);
			if (!servers.length) {
				const err = new Error('No linked servers');
				err.reason = 'noLinkedServers';
				throw err;
			}
			if (servers.length === 1) {
				setStatus($L('Connecting to server...'));
				await finishEmbyLogin(servers[0], session);
				return;
			}
			setConnectSession(session);
			setConnectServers(servers);
			setStep('embyconnect-servers');
			setStatus(null);
			setIsConnecting(false);
			setTimeout(() => Spotlight.focus('[data-spotlight-id="emby-server-0"]'), 100);
		} catch (err) {
			console.error('Emby Connect sign-in error:', err?.reason || err?.message || err);
			setIsConnecting(false);
			setStatus(null);
			setError(embyConnectErrorMessage(err));
		}
	}, [username, password, finishEmbyLogin, embyConnectErrorMessage]);

	const handleEmbyServerSelect = useCallback(async (server) => {
		if (!connectSession) return;
		setError(null);
		setIsConnecting(true);
		setStatus($L('Connecting to server...'));
		try {
			await finishEmbyLogin(server, connectSession);
		} catch (err) {
			setIsConnecting(false);
			setStatus(null);
			setError(embyConnectErrorMessage(err));
		}
	}, [connectSession, finishEmbyLogin, embyConnectErrorMessage]);

	const handleEmbyServerCardClick = useCallback((e) => {
		const index = parseInt(e.currentTarget.dataset.serverIndex, 10);
		const server = connectServers[index];
		if (server) handleEmbyServerSelect(server);
	}, [connectServers, handleEmbyServerSelect]);

	const handleEmbyServerCardKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.ENTER) handleEmbyServerCardClick(e);
	}, [handleEmbyServerCardClick]);

	const handleEmbyPasswordKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.ENTER) handleEmbyConnectSignIn();
	}, [handleEmbyConnectSignIn]);

	const handleManualQuickConnect = useCallback(async () => {
		setIsConnecting(true);
		setError(null);
		setStatus($L('Initiating Quick Connect...'));
		const isAdding = isAddingServer || isAddingToExisting;

		try {
			const result = await jellyfinApi.api.initiateQuickConnect();
			setQuickConnectCode(result.Code);
			setQuickConnectSecret(result.Secret);
			setStep('quickconnect-manual');
			setStatus($L('Enter the code on another device or authorize in the Jellyfin dashboard'));

			const intervalId = setInterval(async () => {
				try {
					const state = await jellyfinApi.api.getQuickConnectState(result.Secret);
					if (state.Authenticated) {
						clearInterval(intervalId);
						setQuickConnectInterval(null);
						setStatus(isAdding ? $L('Quick Connect authorized! Adding user...') : $L('Quick Connect authorized! Signing in...'));

						const authResult = await jellyfinApi.api.authenticateQuickConnect(result.Secret);
						const loginResult = await loginWithToken(jellyfinApi.getServerUrl(), authResult, {
							serverName: serverInfo?.ServerName,
							isAddingNewServer: isAdding,
							switchToNewUser: true
						});

						if (isAdding) {
							completeAddServerFlow?.();
							onServerAdded?.(loginResult);
						} else {
							onLoggedIn?.();
						}
					}
				} catch (err) {
					console.error('Quick Connect poll error:', err);
				}
			}, 3000);

			setQuickConnectInterval(intervalId);
			setTimeout(() => Spotlight.focus('[data-spotlight-id="qc-back-btn"]'), 100);
		} catch (err) {
			console.error('Quick Connect error:', err);
			setError($L('Quick Connect is not available on this server. Use password login.'));
			setStatus(null);
		} finally {
			setIsConnecting(false);
		}
	}, [loginWithToken, onLoggedIn, isAddingServer, isAddingToExisting, serverInfo, completeAddServerFlow, onServerAdded]);

	const handleQuickConnect = useCallback(async (user) => {
		setSelectedUser(user);
		setUsername(user.Name);
		setIsConnecting(true);
		setError(null);
		setStatus($L('Initiating Quick Connect...'));
		const isAdding = isAddingServer || isAddingToExisting;

		try {
			const result = await jellyfinApi.api.initiateQuickConnect();
			setQuickConnectCode(result.Code);
			setQuickConnectSecret(result.Secret);
			setStep('quickconnect');
			setStatus($L('Enter the code on another device or authorize in the Jellyfin dashboard'));

			const intervalId = setInterval(async () => {
				try {
					const state = await jellyfinApi.api.getQuickConnectState(result.Secret);
					if (state.Authenticated) {
						clearInterval(intervalId);
						setQuickConnectInterval(null);
						setStatus(isAdding ? $L('Quick Connect authorized! Adding user...') : $L('Quick Connect authorized! Signing in...'));

						const authResult = await jellyfinApi.api.authenticateQuickConnect(result.Secret);
						const loginResult = await loginWithToken(jellyfinApi.getServerUrl(), authResult, {
							serverName: serverInfo?.ServerName,
							isAddingNewServer: isAdding,
							switchToNewUser: true
						});

						if (isAdding) {
							completeAddServerFlow?.();
							onServerAdded?.(loginResult);
						} else {
							onLoggedIn?.();
						}
					}
				} catch (err) {
					console.error('Quick Connect poll error:', err);
				}
			}, 3000);

			setQuickConnectInterval(intervalId);
			setTimeout(() => Spotlight.focus('[data-spotlight-id="qc-back-btn"]'), 100);
		} catch (err) {
			console.error('Quick Connect error:', err);
			setError($L('Quick Connect failed. Try password login instead.'));
			setStatus(null);
		} finally {
			setIsConnecting(false);
		}
	}, [loginWithToken, onLoggedIn, isAddingServer, isAddingToExisting, serverInfo, completeAddServerFlow, onServerAdded]);

	const cancelQuickConnect = useCallback(() => {
		if (quickConnectInterval) {
			clearInterval(quickConnectInterval);
			setQuickConnectInterval(null);
		}
		setQuickConnectCode('');
		setQuickConnectSecret(null);
		setStep('users');
		setSelectedUser(null);
		setTimeout(() => Spotlight.focus('[data-spotlight-id="user-0"]'), 100);
	}, [quickConnectInterval]);

	const handleServerInputKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.ENTER) {
			handleConnect();
		}
	}, [handleConnect]);

	const handlePasswordKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.ENTER) {
			handleLogin();
		}
	}, [handleLogin]);

	const handleUserCardClick = useCallback((e) => {
		const userId = e.currentTarget.dataset.userId;
		const user = publicUsers.find(u => String(u.Id) === String(userId));
		if (user) handleUserSelect(user);
	}, [publicUsers, handleUserSelect]);

	const handleUserCardKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.ENTER) {
			const userId = e.currentTarget.dataset.userId;
			const user = publicUsers.find(u => String(u.Id) === String(userId));
			if (user) handleUserSelect(user);
		} else if (e.keyCode === KEYS.DOWN) {
			e.stopPropagation();
			e.preventDefault();
			Spotlight.focus('[data-spotlight-id="manual-login-btn"]');
		}
	}, [publicUsers, handleUserSelect]);

	const handleSavedAccountSelect = useCallback(async (account) => {
		setIsConnecting(true);
		setError(null);
		setStatus($L('Signing in...'));
		const ok = await switchUser(account.serverId, account.userId);
		setIsConnecting(false);
		if (ok) {
			onLoggedIn?.();
			return;
		}
		// Stored session was rejected, fall back to a normal sign-in on that server. womp womp
		setStatus(null);
		setServerUrl(account.url);
		setServerInfo({ServerName: account.name});
		setStep('server');
		setTimeout(() => Spotlight.focus('[data-spotlight-id="connect-btn"]'), 100);
	}, [switchUser, onLoggedIn]);

	const handleAccountCardClick = useCallback((e) => {
		const {serverId, userId} = e.currentTarget.dataset;
		const account = savedAccounts.find(a => a.serverId === serverId && a.userId === userId);
		if (account) handleSavedAccountSelect(account);
	}, [savedAccounts, handleSavedAccountSelect]);

	const handleAccountCardKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.ENTER) {
			handleAccountCardClick(e);
		} else if (e.keyCode === KEYS.DOWN) {
			e.stopPropagation();
			e.preventDefault();
			Spotlight.focus('[data-spotlight-id="add-account-btn"]');
		}
	}, [handleAccountCardClick]);

	const handleAddAccount = useCallback(() => {
		setServerUrl(storedServerUrl || '');
		setStep('server');
		setTimeout(() => Spotlight.focus('[data-spotlight-id="server-input"]'), 100);
	}, [storedServerUrl]);

	const handleQuickConnectClick = useCallback(() => {
		if (selectedUser) handleQuickConnect(selectedUser);
	}, [selectedUser, handleQuickConnect]);

	const handlePasswordMethodClick = useCallback(() => {
		setStep('passwordform');
		setTimeout(() => Spotlight.focus('[data-spotlight-id="password-input"]'), 100);
	}, []);

	const handlePasswordFormCancel = useCallback(() => {
		setStep('password');
		setPassword('');
		setTimeout(() => Spotlight.focus('[data-spotlight-id="use-password-btn"]'), 100);
	}, []);

	const handleUsePasswordInstead = useCallback(() => {
		if (quickConnectInterval) {
			clearInterval(quickConnectInterval);
			setQuickConnectInterval(null);
		}
		setQuickConnectCode('');
		setQuickConnectSecret(null);
		setStep('passwordform');
		setTimeout(() => Spotlight.focus('[data-spotlight-id="password-input"]'), 100);
	}, [quickConnectInterval]);

	useEffect(() => {
		return () => {
			if (quickConnectInterval) {
				clearInterval(quickConnectInterval);
			}
		};
	}, [quickConnectInterval]);

	if (isLoading) {
		return (
			<div className={css.page}>
				<div className={css.loading}>
					<div className={css.spinner} />
					<span>{$L('Loading...')}</span>
				</div>
			</div>
		);
	}

	return (
		<div className={css.page}>
			<div className={css.container}>
				<div className={css.logoSection}>
					<img src="resources/banner-dark.png" alt="Moonfin" className={css.logo} />
				</div>

				{status && <div className={css.statusMessage}>{status}</div>}
				{error && <div className={css.errorMessage}>{error}</div>}

				<div className={css.contentWrapper}>
					{step === 'accounts' && (
						<div className={css.section}>
							<h1>{$L("Who's watching?")}</h1>
							<UserGridContainer className={css.userGrid}>
								{savedAccounts.map((account, index) => (
									<SpottableDiv
										key={`${account.serverId}-${account.userId}`}
										data-spotlight-id={`account-${index}`}
										data-server-id={account.serverId}
										data-user-id={account.userId}
										className={css.userCard}
										onClick={handleAccountCardClick}
										onKeyDown={handleAccountCardKeyDown}
									>
										{account.primaryImageTag ? (
											<img
												src={`${account.url}/Users/${account.userId}/Images/Primary?tag=${account.primaryImageTag}&quality=90&maxHeight=150`}
												alt={account.username}
												className={css.userAvatar}
											/>
										) : (
											<div className={css.userAvatarPlaceholder}>
												<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="#FFFFFF" className={css.placeholderIcon}>
													<path d="M480-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Z" />
												</svg>
											</div>
										)}
										<span className={css.userName}>{account.username}</span>
									</SpottableDiv>
								))}
							</UserGridContainer>
							<div className={css.buttonGroup}>
								<SpottableButton
									data-spotlight-id="add-account-btn"
									className={`${css.btn} ${css.btnSecondary}`}
									onClick={handleAddAccount}
								>
									{$L('Add Account')}
								</SpottableButton>
							</div>
						</div>
					)}

					{step === 'server' && (
						<div className={css.section}>
							<h2>{isAddingServer ? $L('Add New Server') : $L('Connect to Server')}</h2>
							<div className={css.formGroup}>
								<label>{$L('Server Address')}</label>
								<SpottableInput
									data-spotlight-id="server-input"
									type="text"
									className={css.input}
									placeholder="192.168.1.100 or jellyfin.example.com"
									value={serverUrl}
									onChange={handleServerUrlChange}
									onKeyDown={handleServerInputKeyDown}
									disabled={isConnecting}
								/>
								<div className={css.buttonGroup}>
									<SpottableButton
										data-spotlight-id="connect-btn"
										className={`${css.btn} ${css.btnPrimary}`}
										onClick={handleConnect}
										disabled={isConnecting || !serverUrl.trim()}
									>
										{isConnecting ? $L('Connecting...') : $L('Connect')}
									</SpottableButton>
									<SpottableButton
										data-spotlight-id="emby-connect-btn"
										className={`${css.btn} ${css.btnSecondary}`}
										onClick={handleEmbyConnectStart}
										disabled={isConnecting}
									>
										{$L('Emby Connect')}
									</SpottableButton>
									{isAddingServer && (
										<SpottableButton
											data-spotlight-id="cancel-add-btn"
											className={`${css.btn} ${css.btnSecondary}`}
											onClick={handleBack}
										>
											{$L('Cancel')}
										</SpottableButton>
									)}
								</div>
							</div>
						</div>
					)}

					{step === 'users' && (
						<div className={css.section}>
							<p className={css.serverLabel}>{serverInfo?.ServerName || (serverType === 'emby' ? 'Emby' : 'Jellyfin')}</p>
							<h1>{$L("Who's watching?")}</h1>
							<UserGridContainer className={css.userGrid}>
								{publicUsers.map((user, index) => (
									<SpottableDiv
										key={user.Id}
										data-spotlight-id={`user-${index}`}
										data-user-id={user.Id}
										className={css.userCard}
										onClick={handleUserCardClick}
										onKeyDown={handleUserCardKeyDown}
									>
										{user.PrimaryImageTag ? (
											<img
												src={`${jellyfinApi.getServerUrl()}/Users/${user.Id}/Images/Primary?tag=${user.PrimaryImageTag}&quality=90&maxHeight=150`}
												alt={user.Name}
												className={css.userAvatar}
											/>
										) : (
											<div className={css.userAvatarPlaceholder}>
												<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="#FFFFFF" className={css.placeholderIcon}>
													<path d="M480-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Z" />
												</svg>
											</div>
										)}
										<span className={css.userName}>{user.Name}</span>
									</SpottableDiv>
								))}
							</UserGridContainer>
							<div className={css.buttonGroup}>
								<SpottableButton
									data-spotlight-id="manual-login-btn"
									className={`${css.btn} ${css.btnSecondary}`}
									onClick={handleManualLogin}
								>
									{$L('Manual Login')}
								</SpottableButton>
								<SpottableButton
									data-spotlight-id="back-btn"
									className={`${css.btn} ${css.btnSecondary}`}
									onClick={handleBack}
								>
									{$L('Change Server')}
								</SpottableButton>
							</div>
						</div>
					)}

					{step === 'password' && selectedUser && (
						<div className={css.section}>
							<h2>{$L('Sign In As {name}').replace('{name}', selectedUser.Name)}</h2>
							<div className={css.selectedUserInfo}>
								{selectedUser.PrimaryImageTag ? (
									<img
										src={`${jellyfinApi.getServerUrl()}/Users/${selectedUser.Id}/Images/Primary?tag=${selectedUser.PrimaryImageTag}&quality=90&maxHeight=150`}
										alt={selectedUser.Name}
										className={css.selectedAvatar}
									/>
								) : (
									<div className={css.selectedAvatarPlaceholder}>
										{selectedUser.Name.charAt(0).toUpperCase()}
									</div>
								)}
								<span className={css.selectedName}>{selectedUser.Name}</span>
							</div>
							<div className={css.loginMethodButtons}>
								{serverType !== 'emby' && (
									<SpottableButton
										data-spotlight-id="use-qc-btn"
										className={`${css.btn} ${css.btnPrimary}`}
										onClick={handleQuickConnectClick}
									>
										{$L('Quick Connect')}
									</SpottableButton>
								)}
								<SpottableButton
									data-spotlight-id="use-password-btn"
									className={`${css.btn} ${css.btnSecondary}`}
									onClick={handlePasswordMethodClick}
								>
									{$L('Password')}
								</SpottableButton>
							</div>
							<div className={css.buttonGroup}>
								<SpottableButton
									data-spotlight-id="password-back-btn"
									className={`${css.btn} ${css.btnSecondary}`}
									onClick={handleBack}
								>
									{$L('Back')}
								</SpottableButton>
							</div>
						</div>
					)}

					{step === 'passwordform' && selectedUser && (
						<div className={css.section}>
							<h2>{$L('Enter Password')}</h2>
							<div className={css.selectedUserInfo}>
								{selectedUser.PrimaryImageTag ? (
									<img
										src={`${jellyfinApi.getServerUrl()}/Users/${selectedUser.Id}/Images/Primary?tag=${selectedUser.PrimaryImageTag}&quality=90&maxHeight=150`}
										alt={selectedUser.Name}
										className={css.selectedAvatar}
									/>
								) : (
									<div className={css.selectedAvatarPlaceholder}>
										{selectedUser.Name.charAt(0).toUpperCase()}
									</div>
								)}
								<span className={css.selectedName}>{selectedUser.Name}</span>
							</div>
							<div className={css.formGroup}>
								<SpottableInput
									data-spotlight-id="password-input"
									type="password"
									className={css.input}
									placeholder={$L('Password (leave empty if none)')}
									value={password}
									onChange={handlePasswordChange}
									onKeyDown={handlePasswordKeyDown}
									disabled={isConnecting}
								/>
								<div className={css.buttonGroup}>
									<SpottableButton
										data-spotlight-id="login-btn"
										className={`${css.btn} ${css.btnPrimary}`}
										onClick={handleLogin}
										disabled={isConnecting}
									>
										{isConnecting ? $L('Signing in...') : $L('Sign In')}
									</SpottableButton>
									<SpottableButton
										data-spotlight-id="cancel-btn"
										className={`${css.btn} ${css.btnSecondary}`}
										onClick={handlePasswordFormCancel}
									>
										{$L('Back')}
									</SpottableButton>
								</div>
							</div>
						</div>
					)}

					{step === 'quickconnect' && selectedUser && (
						<div className={css.section}>
							<h2>{$L('Quick Connect')}</h2>
							<div className={css.selectedUserInfo}>
								{selectedUser.PrimaryImageTag ? (
									<img
										src={`${jellyfinApi.getServerUrl()}/Users/${selectedUser.Id}/Images/Primary?tag=${selectedUser.PrimaryImageTag}&quality=90&maxHeight=150`}
										alt={selectedUser.Name}
										className={css.selectedAvatar}
									/>
								) : (
									<div className={css.selectedAvatarPlaceholder}>
										{selectedUser.Name.charAt(0).toUpperCase()}
									</div>
								)}
								<span className={css.selectedName}>{selectedUser.Name}</span>
							</div>
							<div className={css.quickConnectCodeDisplay}>
								<div className={css.qcLabel}>{$L('Enter this code on another device or authorize in Jellyfin dashboard:')}</div>
								<div className={css.qcCode}>{quickConnectCode}</div>
								<div className={css.qcWaiting}>{$L('Waiting for authorization...')}</div>
							</div>
							<div className={css.buttonGroup}>
								<SpottableButton
									data-spotlight-id="use-password-instead-btn"
									className={`${css.btn} ${css.btnSecondary}`}
									onClick={handleUsePasswordInstead}
								>
									{$L('Use Password Instead')}
								</SpottableButton>
								<SpottableButton
									data-spotlight-id="qc-back-btn"
									className={`${css.btn} ${css.btnSecondary}`}
									onClick={cancelQuickConnect}
								>
									{$L('Cancel')}
								</SpottableButton>
							</div>
						</div>
					)}

					{step === 'manual' && (
						<div className={css.section}>
							<h2>{$L('Manual Login')}</h2>
							{serverInfo && <div className={css.serverName}>{serverInfo.ServerName}</div>}
							<div className={css.formGroup}>
								<label>{$L('Username')}</label>
								<SpottableInput
									data-spotlight-id="username-input"
									type="text"
									className={css.input}
									placeholder={$L('Username')}
									value={username}
									onChange={handleUsernameChange}
									disabled={isConnecting}
								/>
							</div>
							<div className={css.formGroup}>
								<label>{$L('Password')}</label>
								<SpottableInput
									data-spotlight-id="manual-password-input"
									type="password"
									className={css.input}
									placeholder={$L('Password')}
									value={password}
									onChange={handlePasswordChange}
									onKeyDown={handlePasswordKeyDown}
									disabled={isConnecting}
								/>
							</div>
							<div className={css.buttonGroup}>
								{(username.trim() || serverType === 'emby') ? (
									<SpottableButton
										data-spotlight-id="manual-submit-btn"
										className={`${css.btn} ${css.btnPrimary}`}
										onClick={handleLogin}
										disabled={isConnecting || !username.trim()}
									>
										{isConnecting ? $L('Signing in...') : $L('Sign In')}
									</SpottableButton>
								) : (
									<SpottableButton
										data-spotlight-id="manual-qc-btn"
										className={`${css.btn} ${css.btnPrimary}`}
										onClick={handleManualQuickConnect}
										disabled={isConnecting}
									>
										{isConnecting ? $L('Connecting...') : $L('Quick Connect')}
									</SpottableButton>
								)}
								<SpottableButton
									data-spotlight-id="manual-back-btn"
									className={`${css.btn} ${css.btnSecondary}`}
									onClick={handleBack}
								>
									{$L('Back')}
								</SpottableButton>
							</div>
						</div>
					)}

					{step === 'quickconnect-manual' && (
						<div className={css.section}>
							<h2>{$L('Quick Connect')}</h2>
							{serverInfo && <div className={css.serverName}>{serverInfo.ServerName}</div>}
							<div className={css.quickConnectCodeDisplay}>
								<div className={css.qcLabel}>{$L('Enter this code on another device or authorize in Jellyfin dashboard:')}</div>
								<div className={css.qcCode}>{quickConnectCode}</div>
								<div className={css.qcWaiting}>{$L('Waiting for authorization...')}</div>
							</div>
							<div className={css.buttonGroup}>
								<SpottableButton
									data-spotlight-id="qc-back-btn"
									className={`${css.btn} ${css.btnSecondary}`}
									onClick={handleBack}
								>
									{$L('Cancel')}
								</SpottableButton>
							</div>
						</div>
					)}

					{step === 'embyconnect' && (
						<div className={css.section}>
							<h2>{$L('Emby Connect')}</h2>
							<p className={css.serverLabel}>{$L('Sign in with your Emby Connect account')}</p>
							<div className={css.formGroup}>
								<label>{$L('Email or Username')}</label>
								<SpottableInput
									data-spotlight-id="emby-username-input"
									type="text"
									className={css.input}
									placeholder={$L('Email or Username')}
									value={username}
									onChange={handleUsernameChange}
									disabled={isConnecting}
								/>
							</div>
							<div className={css.formGroup}>
								<label>{$L('Password')}</label>
								<SpottableInput
									data-spotlight-id="emby-password-input"
									type="password"
									className={css.input}
									placeholder={$L('Password')}
									value={password}
									onChange={handlePasswordChange}
									onKeyDown={handleEmbyPasswordKeyDown}
									disabled={isConnecting}
								/>
							</div>
							<div className={css.buttonGroup}>
								<SpottableButton
									data-spotlight-id="emby-signin-btn"
									className={`${css.btn} ${css.btnPrimary}`}
									onClick={handleEmbyConnectSignIn}
									disabled={isConnecting || !username.trim() || !password}
								>
									{isConnecting ? $L('Signing in...') : $L('Sign In')}
								</SpottableButton>
								<SpottableButton
									data-spotlight-id="emby-back-btn"
									className={`${css.btn} ${css.btnSecondary}`}
									onClick={handleBack}
									disabled={isConnecting}
								>
									{$L('Back')}
								</SpottableButton>
							</div>
						</div>
					)}

					{step === 'embyconnect-servers' && (
						<div className={css.section}>
							<h2>{$L('Select a server')}</h2>
							<UserGridContainer className={css.userGrid}>
								{connectServers.map((server, index) => (
									<SpottableDiv
										key={server.systemId || index}
										data-spotlight-id={`emby-server-${index}`}
										data-server-index={index}
										className={css.userCard}
										onClick={handleEmbyServerCardClick}
										onKeyDown={handleEmbyServerCardKeyDown}
									>
										<span className={css.userName}>{server.name}</span>
										{server.candidateAddresses[0] && (
											<span className={css.serverName}>{server.candidateAddresses[0]}</span>
										)}
									</SpottableDiv>
								))}
							</UserGridContainer>
							<div className={css.buttonGroup}>
								<SpottableButton
									data-spotlight-id="emby-retry-btn"
									className={`${css.btn} ${css.btnSecondary}`}
									onClick={handleBack}
									disabled={isConnecting}
								>
									{$L('Back')}
								</SpottableButton>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default Login;
