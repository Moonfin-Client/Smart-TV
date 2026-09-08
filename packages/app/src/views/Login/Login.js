import {useState, useCallback, useEffect, useMemo, useRef} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';
import {useAuth} from '../../context/AuthContext';
import {useSettings} from '../../context/SettingsContext';
import * as jellyfinApi from '../../services/jellyfinApi';
import * as embyConnect from '../../services/embyConnect';
import {discoverLocalServers} from '../../services/serverDiscovery';
import {generateCandidates, normalizeServerBaseUrl} from '../../utils/serverUrl';
import {classifyError, detectServerType, getConnectionMessage, getLoginMessage, isVersionSupported, INVALID_ADDRESS, SERVER_NOT_JELLYFIN, INSECURE_CERT, MIN_SERVER_VERSION} from '../../utils/connectionErrors';
import {KEYS} from '../../utils/keys';
import SpottableInput from '../../components/SpottableInput/SpottableInput';
import {subscribeTvKeyboardVisibility} from '../../components/TVKeyboard/keyboardBus';
import {MaterialIcon, ServerTypeIcon} from './loginIcons';

import css from './Login.module.less';

const SpottableButton = Spottable('button');
const SpottableDiv = Spottable('div');
const FocusArea = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');
const DialogArea = SpotlightContainerDecorator({enterTo: 'default-element', restrict: 'self-only'}, 'div');

const QUICK_CONNECT_POLL = 5000;
const LONG_PRESS_DELAY = 500;

const focusLater = (id) => setTimeout(() => Spotlight.focus(`[data-spotlight-id="${id}"]`), 100);

const formatQuickConnectCode = (code) => (code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code);

const hasQuickConnect = (target) => target?.serverType !== 'emby';

// Where a press should land once the password half of the screen is showing
const credentialFocusTarget = (user) => {
	if (!user) return 'username-input';
	return user.hasPassword ? 'password-input' : 'signin-btn';
};

const Login = ({
	onLoggedIn,
	onServerAdded,
	backHandlerRef,
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
		activeServerInfo,
		servers: savedAccounts,
		uniqueServers,
		switchUser,
		removeServerEntry
	} = useAuth();
	const {settings} = useSettings();

	const isAddingServer = isAddingServerProp || isAddingServerContext;
	const isAddingToExisting = isAddingUser && currentServerUrl;
	const isAdding = isAddingServer || isAddingToExisting;
	const pendingServer = pendingServerInfo || pendingServerContext;
	const alwaysAuthenticate = settings.alwaysAuthenticate === true;

	const [step, setStep] = useState('servers');
	const [server, setServer] = useState(null);
	const [users, setUsers] = useState([]);
	const [discovered, setDiscovered] = useState([]);
	const [isDiscovering, setIsDiscovering] = useState(false);
	const [addressValue, setAddressValue] = useState('');
	const [dialog, setDialog] = useState(null);
	const [dialogError, setDialogError] = useState(null);
	const [signInUser, setSignInUser] = useState(null);
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [showQuickConnect, setShowQuickConnect] = useState(false);
	const [quickConnectCode, setQuickConnectCode] = useState(null);
	const [connectServers, setConnectServers] = useState([]);
	const [connectSession, setConnectSession] = useState(null);
	const [error, setError] = useState(null);
	const [status, setStatus] = useState(null);
	const [isConnecting, setIsConnecting] = useState(false);
	const [keyboardOpen, setKeyboardOpen] = useState(false);

	const pageRef = useRef(null);
	const quickConnectTimer = useRef(null);
	const bootstrapped = useRef(false);
	const suppressClick = useRef(false);
	const longPressTimer = useRef(null);

	const supportsQuickConnect = hasQuickConnect(server);

	// When a keyboard opens, a spacer grows under the card and the active field
	// gets pulled toward the top so it stays visible above the keys. The scroll
	// waits out the spacer growing, since before that there is no room to move.
	useEffect(() => {
		let scrollTimer = null;
		const unsubscribe = subscribeTvKeyboardVisibility(({visible, anchor}) => {
			setKeyboardOpen(visible);
			if (!visible || !anchor) return;
			clearTimeout(scrollTimer);
			scrollTimer = setTimeout(() => {
				const page = pageRef.current;
				if (!page) return;
				const field = anchor.getBoundingClientRect();
				const view = page.getBoundingClientRect();
				const delta = field.top - view.top - view.height * 0.12;
				if (delta > 0) page.scrollTop += delta;
			}, 200);
		});
		return () => {
			clearTimeout(scrollTimer);
			unsubscribe();
		};
	}, []);

	const stopQuickConnect = useCallback(() => {
		if (quickConnectTimer.current) {
			clearInterval(quickConnectTimer.current);
			quickConnectTimer.current = null;
		}
		setQuickConnectCode(null);
	}, []);

	useEffect(() => () => {
		if (quickConnectTimer.current) clearInterval(quickConnectTimer.current);
		if (longPressTimer.current) clearTimeout(longPressTimer.current);
	}, []);

	const serverRecents = useMemo(
		() => uniqueServers.map((entry) => entry.url).filter(Boolean),
		[uniqueServers]
	);

	const usernameRecents = useMemo(() => {
		const names = [];
		savedAccounts.forEach((account) => {
			if (account.username && names.indexOf(account.username) < 0) names.push(account.username);
		});
		return names;
	}, [savedAccounts]);

	// Discovery

	useEffect(() => {
		if (step !== 'servers') return undefined;

		setDiscovered([]);
		setIsDiscovering(true);
		const savedAddresses = uniqueServers.map((entry) => normalizeServerBaseUrl(entry.url).toLowerCase());

		const cancel = discoverLocalServers({
			onFound: (found) => {
				if (savedAddresses.indexOf(normalizeServerBaseUrl(found.address).toLowerCase()) >= 0) return;
				setDiscovered((current) => current.concat([found]));
			},
			onDone: () => setIsDiscovering(false)
		});

		return cancel;
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [step]);

	// Moving between screens

	const goToSignIn = useCallback((target, user) => {
		stopQuickConnect();
		setSignInUser(user || null);
		setUsername(user ? user.name : '');
		setPassword('');
		setError(null);
		setStatus(null);
		// Quick Connect is what the other clients open on, and a server that has
		// it switched off says so on the first request and drops us to password.
		const quickConnect = hasQuickConnect(target);
		setShowQuickConnect(quickConnect);
		setStep('signin');
		if (!quickConnect) focusLater(credentialFocusTarget(user));
	}, [stopQuickConnect]);

	const openServer = useCallback(async (target, {forceSignIn = false} = {}) => {
		jellyfinApi.setServer(target.url);
		jellyfinApi.setServerType(target.serverType || 'jellyfin');

		setServer(target);
		setError(null);
		setStatus(null);

		if (forceSignIn) {
			goToSignIn(target, null);
			return;
		}

		setStep('users');
		setUsers([]);
		setStatus($L('Loading users...'));

		let info = null;
		try {
			info = await jellyfinApi.api.getPublicInfo();
		} catch {
			// A saved server we cant reach still lists the users already stored
		}

		let publicUsers = [];
		try {
			publicUsers = (await jellyfinApi.api.getPublicUsers()) || [];
		} catch {
			// A server can switch its public user list off, which offers nobody up
		}

		const merged = [];
		const byId = {};
		savedAccounts.forEach((account) => {
			if (account.serverId !== target.serverId) return;
			byId[account.userId] = true;
			merged.push({
				id: account.userId,
				name: account.username,
				imageTag: account.primaryImageTag,
				hasToken: true,
				hasPassword: true
			});
		});
		publicUsers.forEach((user) => {
			if (byId[user.Id]) return;
			byId[user.Id] = true;
			merged.push({
				id: user.Id,
				name: user.Name,
				imageTag: user.PrimaryImageTag,
				hasToken: false,
				hasPassword: user.HasPassword !== false
			});
		});

		const resolved = {
			...target,
			name: info?.ServerName || target.name,
			version: info?.Version || target.version || null,
			loginDisclaimer: info?.LoginDisclaimer || null
		};
		setServer(resolved);
		setStatus(null);

		if (merged.length === 0) {
			goToSignIn(resolved, null);
			return;
		}

		setUsers(merged);
		focusLater('user-0');
	}, [savedAccounts, goToSignIn]);

	const goToServers = useCallback(() => {
		stopQuickConnect();
		setStep('servers');
		setServer(null);
		setUsers([]);
		setSignInUser(null);
		setError(null);
		setStatus(null);
		focusLater('add-server-btn');
	}, [stopQuickConnect]);

	// Connecting

	const probeServer = useCallback(async (input) => {
		const candidates = generateCandidates(input);
		if (candidates.length === 0) {
			return {error: getConnectionMessage(INVALID_ADDRESS)};
		}

		let lastErrorType = null;
		for (const candidate of candidates) {
			setStatus($L('Trying {url}...').replace('{url}', candidate));
			jellyfinApi.setServer(candidate);

			try {
				const info = await jellyfinApi.api.getPublicInfo();
				if (!info) continue;

				const serverType = detectServerType(info.ProductName, info.Version);
				if (!serverType) {
					lastErrorType = SERVER_NOT_JELLYFIN;
					continue;
				}

				// Emby reports a 4.x version that has nothing to do with the Jellyfin minimum
				if (serverType === 'jellyfin' && !isVersionSupported(info.Version)) {
					return {
						error: $L('Server version {version} is not supported. Minimum: {minimum}.')
							.replace('{version}', info.Version)
							.replace('{minimum}', MIN_SERVER_VERSION)
					};
				}

				jellyfinApi.setServerType(serverType);
				return {
					server: {
						serverId: null,
						url: candidate,
						name: info.ServerName || candidate,
						serverType,
						version: info.Version || null,
						loginDisclaimer: info.LoginDisclaimer || null
					}
				};
			} catch (err) {
				const errType = classifyError(err);
				// A cert rejection (from the https candidate / proxy probe) is the
				// most actionable diagnosis, don't let a weaker network failure
				// from a later http candidate mask it.
				if (lastErrorType !== INSECURE_CERT) {
					lastErrorType = errType || lastErrorType;
				}
			}
		}

		return {error: getConnectionMessage(lastErrorType)};
	}, []);

	const connectTo = useCallback(async (input, {inDialog = false} = {}) => {
		setIsConnecting(true);
		if (inDialog) setDialogError(null);
		else setError(null);

		const result = await probeServer(input);
		setStatus(null);
		setIsConnecting(false);

		if (result.error) {
			if (inDialog) setDialogError(result.error);
			else setError(result.error);
			focusLater(inDialog ? 'add-connect-btn' : 'add-server-btn');
			return;
		}

		if (inDialog) setDialog(null);
		openServer(result.server);
	}, [probeServer, openServer]);

	// First screen on arrival, matching the other clients: a known server goes
	// straight to its user list, anything else starts at the server picker.
	useEffect(() => {
		if (isLoading || bootstrapped.current) return;
		bootstrapped.current = true;

		if (isAddingToExisting) {
			const saved = uniqueServers.find((entry) => entry.url === currentServerUrl);
			openServer(saved || {
				serverId: null,
				url: currentServerUrl,
				name: currentServerName,
				serverType: 'jellyfin',
				version: null
			}, {forceSignIn: true});
			return;
		}

		if (isAddingServer) {
			focusLater('add-server-btn');
			return;
		}

		if (pendingServer?.url) {
			connectTo(pendingServer.url);
			return;
		}

		const lastServerId = activeServerInfo?.serverId;
		const known = uniqueServers.find((entry) => entry.serverId === lastServerId);
		if (known) {
			openServer(known);
			return;
		}

		focusLater('add-server-btn');
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isLoading]);

	useEffect(() => {
		if (isAuthenticated && !isAdding) onLoggedIn?.();
	}, [isAuthenticated, onLoggedIn, isAdding]);

	// Signing in

	const finishLogin = useCallback((result) => {
		if (isAdding) {
			completeAddServerFlow?.();
			onServerAdded?.(result);
		} else {
			onLoggedIn?.();
		}
	}, [isAdding, completeAddServerFlow, onServerAdded, onLoggedIn]);

	const signIn = useCallback(async (name, secret) => {
		if (!server || !name) return false;

		setIsConnecting(true);
		setError(null);
		setStatus(isAdding ? $L('Adding user...') : $L('Signing in...'));

		try {
			const result = await login(jellyfinApi.getServerUrl(), name, secret, {
				serverName: server.name,
				serverType: server.serverType,
				serverVersion: server.version,
				isAddingNewServer: isAdding,
				switchToNewUser: true
			});
			finishLogin(result);
			return true;
		} catch (err) {
			setError(getLoginMessage(classifyError(err)));
			setStatus(null);
			return false;
		} finally {
			setIsConnecting(false);
		}
	}, [server, login, isAdding, finishLogin]);

	const handleUserSelect = useCallback(async (user) => {
		if (!server) return;

		// An account we already hold a token for can be resumed, unless the user
		// asked to be challenged every time or we're here to add an account.
		if (user.hasToken && !alwaysAuthenticate && !isAdding && server.serverId) {
			setIsConnecting(true);
			setStatus($L('Signing in...'));
			const ok = await switchUser(server.serverId, user.id);
			setIsConnecting(false);
			setStatus(null);
			if (ok) {
				onLoggedIn?.();
				return;
			}
			goToSignIn(server, user);
			return;
		}

		if (!user.hasPassword && !alwaysAuthenticate) {
			const ok = await signIn(user.name, '');
			if (ok) return;
			goToSignIn(server, user);
			return;
		}

		goToSignIn(server, user);
	}, [server, alwaysAuthenticate, isAdding, switchUser, onLoggedIn, goToSignIn, signIn]);

	// Quick Connect

	const pollQuickConnect = useCallback(async (secret) => {
		try {
			const state = await jellyfinApi.api.getQuickConnectState(secret);
			if (!state.Authenticated) return;

			stopQuickConnect();
			setStatus(isAdding ? $L('Adding user...') : $L('Signing in...'));
			const authResult = await jellyfinApi.api.authenticateQuickConnect(secret);
			const result = await loginWithToken(jellyfinApi.getServerUrl(), authResult, {
				serverName: server?.name,
				serverType: server?.serverType,
				serverVersion: server?.version,
				isAddingNewServer: isAdding,
				switchToNewUser: true
			});
			finishLogin(result);
		} catch (err) {
			console.error('Quick Connect poll error:', err);
		}
	}, [stopQuickConnect, isAdding, loginWithToken, server, finishLogin]);

	const selectPassword = useCallback(() => {
		stopQuickConnect();
		setShowQuickConnect(false);
		setError(null);
		focusLater(credentialFocusTarget(signInUser));
	}, [stopQuickConnect, signInUser]);

	const startQuickConnect = useCallback(async () => {
		try {
			const result = await jellyfinApi.api.initiateQuickConnect();
			if (!result?.Code || !result?.Secret) return;
			setQuickConnectCode(result.Code);
			quickConnectTimer.current = setInterval(() => pollQuickConnect(result.Secret), QUICK_CONNECT_POLL);
			focusLater('back-btn');
		} catch {
			setError($L('Quick Connect is disabled'));
			selectPassword();
		}
	}, [pollQuickConnect, selectPassword]);

	useEffect(() => {
		if (step !== 'signin' || !showQuickConnect || !supportsQuickConnect) return;
		if (quickConnectTimer.current || quickConnectCode) return;
		startQuickConnect();
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [step, showQuickConnect, supportsQuickConnect]);

	const selectQuickConnect = useCallback(() => {
		if (showQuickConnect) return;
		setShowQuickConnect(true);
		setError(null);
	}, [showQuickConnect]);

	// Emby Connect

	const embyConnectErrorMessage = useCallback((err) => {
		switch (err?.reason) {
			case 'invalidCredentials': return $L('Invalid Emby Connect username or password');
			case 'invalidAuthResponse': return $L('Invalid Emby Connect credentials');
			case 'noLinkedServers': return $L('No servers linked to this Emby Connect account');
			case 'noReachableAddress': return $L('No reachable address provided');
			case 'unableToConnectServer': return $L('Unable to connect to server');
			default: return $L('Network error while contacting Emby Connect or the selected server');
		}
	}, []);

	const finishEmbyLogin = useCallback((target, session) =>
		embyConnect.connectToServer(target, session.userId).then((exchange) => loginWithToken(
			exchange.resolvedBaseUrl,
			{User: {Id: exchange.localUserId, Name: session.userName || username}, AccessToken: exchange.accessToken},
			{serverName: target.name, serverType: 'emby', isAddingNewServer: isAdding, switchToNewUser: true}
		)).then((result) => {
			setIsConnecting(false);
			setStatus(null);
			finishLogin(result);
		}), [loginWithToken, username, isAdding, finishLogin]);

	const handleEmbyConnectStart = useCallback(() => {
		setError(null);
		setStatus(null);
		setUsername('');
		setPassword('');
		setConnectServers([]);
		setConnectSession(null);
		setStep('embyconnect');
		focusLater('emby-username-input');
	}, []);

	const handleEmbyConnectSignIn = useCallback(async () => {
		if (!username.trim() || !password) return;
		setError(null);
		setIsConnecting(true);
		setStatus($L('Signing in...'));
		try {
			const {session, servers: linked} = await embyConnect.authenticateAndLoadServers(username.trim(), password);
			if (!linked.length) {
				const err = new Error('No linked servers');
				err.reason = 'noLinkedServers';
				throw err;
			}
			if (linked.length === 1) {
				setStatus($L('Connecting to server...'));
				await finishEmbyLogin(linked[0], session);
				return;
			}
			setConnectSession(session);
			setConnectServers(linked);
			setStep('embyconnect-servers');
			setStatus(null);
			setIsConnecting(false);
			focusLater('emby-server-0');
		} catch (err) {
			setIsConnecting(false);
			setStatus(null);
			setError(embyConnectErrorMessage(err));
		}
	}, [username, password, finishEmbyLogin, embyConnectErrorMessage]);

	// Back

	const closeDialog = useCallback(() => {
		setDialog(null);
		setDialogError(null);
		focusLater('add-server-btn');
	}, []);

	const handleBack = useCallback(() => {
		if (dialog) {
			closeDialog();
			return true;
		}
		if (step === 'embyconnect-servers') {
			setConnectServers([]);
			setConnectSession(null);
			setStep('embyconnect');
			focusLater('emby-username-input');
			return true;
		}
		if (step === 'embyconnect') {
			goToServers();
			return true;
		}
		if (step === 'signin') {
			stopQuickConnect();
			if (users.length > 0) {
				setStep('users');
				focusLater('user-0');
			} else {
				goToServers();
			}
			return true;
		}
		if (step === 'users') {
			goToServers();
			return true;
		}
		if (isAdding) {
			cancelAddServerFlow?.();
			onServerAdded?.(null);
			return true;
		}
		return false;
	}, [dialog, closeDialog, step, users.length, isAdding, goToServers, stopQuickConnect, cancelAddServerFlow, onServerAdded]);

	useEffect(() => {
		if (!backHandlerRef) return undefined;
		backHandlerRef.current = handleBack;
		return () => {
			if (backHandlerRef.current === handleBack) backHandlerRef.current = null;
		};
	}, [backHandlerRef, handleBack]);

	// Handlers bound to the markup

	const handleAddressChange = useCallback((e) => setAddressValue(e.target.value), []);
	const handleUsernameChange = useCallback((e) => setUsername(e.target.value), []);
	const handlePasswordChange = useCallback((e) => setPassword(e.target.value), []);

	const openAddDialog = useCallback(() => {
		setAddressValue('');
		setDialogError(null);
		setDialog({kind: 'add'});
		focusLater('add-address-input');
	}, []);

	const submitAddress = useCallback(() => {
		if (!addressValue.trim() || isConnecting) return;
		connectTo(addressValue, {inDialog: true});
	}, [addressValue, isConnecting, connectTo]);

	const handleAddressKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.ENTER) submitAddress();
	}, [submitAddress]);

	// Hold select on a saved server to forget it, the way the other clients do.
	const handleSavedKeyDown = useCallback((e) => {
		if (e.keyCode !== KEYS.ENTER || longPressTimer.current) return;
		const {serverId} = e.currentTarget.dataset;
		longPressTimer.current = setTimeout(() => {
			longPressTimer.current = null;
			suppressClick.current = true;
			const entry = uniqueServers.find((item) => item.serverId === serverId);
			if (entry) {
				setDialog({kind: 'remove', server: entry});
				focusLater('remove-cancel-btn');
			}
		}, LONG_PRESS_DELAY);
	}, [uniqueServers]);

	const handleSavedKeyUp = useCallback(() => {
		if (longPressTimer.current) {
			clearTimeout(longPressTimer.current);
			longPressTimer.current = null;
		}
	}, []);

	const handleSavedClick = useCallback((e) => {
		if (suppressClick.current) {
			suppressClick.current = false;
			return;
		}
		const {serverId} = e.currentTarget.dataset;
		const entry = uniqueServers.find((item) => item.serverId === serverId);
		if (entry) openServer(entry);
	}, [uniqueServers, openServer]);

	const handleDiscoveredClick = useCallback((e) => {
		if (isConnecting) return;
		const index = parseInt(e.currentTarget.dataset.index, 10);
		const found = discovered[index];
		if (found) connectTo(found.address);
	}, [discovered, isConnecting, connectTo]);

	const handleConfirmRemove = useCallback(async () => {
		const target = dialog?.server;
		setDialog(null);
		if (target) await removeServerEntry(target.serverId);
		focusLater('add-server-btn');
	}, [dialog, removeServerEntry]);

	const handleUserClick = useCallback((e) => {
		const {userId} = e.currentTarget.dataset;
		const user = users.find((item) => String(item.id) === String(userId));
		if (user) handleUserSelect(user);
	}, [users, handleUserSelect]);

	const handleAddUser = useCallback(() => {
		if (server) goToSignIn(server, null);
	}, [server, goToSignIn]);

	const handleSignIn = useCallback(() => {
		if (!username.trim()) return;
		signIn(username.trim(), password);
	}, [username, password, signIn]);

	const handlePasswordKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.ENTER) handleSignIn();
	}, [handleSignIn]);

	const handleUsernameKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.ENTER) focusLater(signInUser?.hasPassword === false ? 'signin-btn' : 'password-input');
	}, [signInUser]);

	const handleEmbyPasswordKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.ENTER) handleEmbyConnectSignIn();
	}, [handleEmbyConnectSignIn]);

	const handleEmbyServerClick = useCallback(async (e) => {
		if (!connectSession) return;
		const index = parseInt(e.currentTarget.dataset.index, 10);
		const target = connectServers[index];
		if (!target) return;
		setError(null);
		setIsConnecting(true);
		setStatus($L('Connecting to server...'));
		try {
			await finishEmbyLogin(target, connectSession);
		} catch (err) {
			setIsConnecting(false);
			setStatus(null);
			setError(embyConnectErrorMessage(err));
		}
	}, [connectSession, connectServers, finishEmbyLogin, embyConnectErrorMessage]);

	// Rendering

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

	const renderTile = ({key, spotlightId, serverType, name, detail, ...rest}) => (
		<SpottableDiv
			key={key}
			data-spotlight-id={spotlightId}
			className={css.tile}
			{...rest}
		>
			<ServerTypeIcon serverType={serverType} className={css.tileIcon} />
			<div className={css.tileBody}>
				<div className={css.tileName}>{name}</div>
				<div className={css.tileDetail}>{detail}</div>
			</div>
		</SpottableDiv>
	);

	const renderServers = () => {
		const actions = [
			<SpottableButton
				key="add"
				data-spotlight-id="add-server-btn"
				className={css.outlineButton}
				onClick={openAddDialog}
				disabled={isConnecting}
			>
				<MaterialIcon name="add" className={css.outlineButtonIcon} />
				{$L('Add Server')}
			</SpottableButton>,
			<SpottableButton
				key="emby"
				data-spotlight-id="emby-connect-btn"
				className={css.outlineButton}
				onClick={handleEmbyConnectStart}
				disabled={isConnecting}
			>
				<ServerTypeIcon serverType="emby" className={css.outlineButtonIcon} />
				{$L('Emby Connect')}
			</SpottableButton>
		];

		if (isAdding) {
			actions.push(
				<SpottableButton
					key="cancel"
					data-spotlight-id="cancel-add-btn"
					className={css.outlineButton}
					onClick={handleBack}
				>
					{$L('Cancel')}
				</SpottableButton>
			);
		}

		return (
			<FocusArea className={css.card}>
				{uniqueServers.length > 0 && (
					<div>
						<div className={css.sectionTitle}>{$L('Saved Servers')}</div>
						{uniqueServers.map((entry, index) => renderTile({
							key: entry.serverId,
							spotlightId: `saved-${index}`,
							serverType: entry.serverType,
							name: entry.name,
							detail: entry.version ? `${entry.url} • ${entry.version}` : entry.url,
							'data-server-id': entry.serverId,
							onClick: handleSavedClick,
							onKeyDown: handleSavedKeyDown,
							onKeyUp: handleSavedKeyUp
						}))}
					</div>
				)}

				<div className={uniqueServers.length > 0 ? css.formBlock : ''}>
					<div className={css.sectionTitle}>{$L('Discovered Servers')}</div>
					{discovered.length > 0
						? discovered.map((found, index) => renderTile({
							key: found.id,
							spotlightId: `discovered-${index}`,
							serverType: found.serverType,
							name: found.name,
							detail: found.address,
							'data-index': index,
							onClick: handleDiscoveredClick
						}))
						: isDiscovering
							? <div className={css.spinnerRow}><div className={css.spinner} /></div>
							: <div className={css.emptyHint}>{$L('None found')}</div>}
					{isDiscovering && discovered.length > 0 && (
						<div className={css.spinnerRowTight}><div className={`${css.spinner} ${css.spinnerSmall}`} /></div>
					)}
				</div>

				{error && <div className={css.errorText}>{error}</div>}

				<div className={`${css.actionRow} ${actions.length === 2 ? '' : css.actionColumn}`}>
					{actions}
				</div>
			</FocusArea>
		);
	};

	const renderUsers = () => (
		<FocusArea className={`${css.card} ${css.cardCentered}`}>
			<p className={css.serverLabel}>{server?.name}</p>
			<h1 className={css.title}>{$L("Who's watching?")}</h1>
			{server?.loginDisclaimer && <p className={css.disclaimer}>{server.loginDisclaimer}</p>}

			<div className={css.userRow}>
				<div className={css.userRowInner}>
					{users.map((user, index) => (
						<SpottableDiv
							key={user.id}
							data-spotlight-id={`user-${index}`}
							data-user-id={user.id}
							className={css.userCard}
							onClick={handleUserClick}
						>
							{user.imageTag ? (
								<img
									src={jellyfinApi.getUserImageUrl(jellyfinApi.getServerUrl(), user.id, user.imageTag, server?.serverType)}
									alt={user.name}
									className={css.userAvatar}
								/>
							) : (
								<div className={css.userAvatarPlaceholder}>
									<MaterialIcon name="personFilled" className={css.placeholderIcon} />
								</div>
							)}
							<div className={css.userName}>{user.name}</div>
						</SpottableDiv>
					))}
				</div>
			</div>

			{error && <div className={css.errorText}>{error}</div>}

			<div className={`${css.actionRow} ${css.actionRowWide}`}>
				<SpottableButton
					data-spotlight-id="add-user-btn"
					className={css.outlineButton}
					onClick={handleAddUser}
				>
					<MaterialIcon name="person" className={css.outlineButtonIcon} />
					{$L('Add User')}
				</SpottableButton>
				<SpottableButton
					data-spotlight-id="select-server-btn"
					className={css.outlineButton}
					onClick={goToServers}
				>
					<MaterialIcon name="home" className={css.outlineButtonIcon} />
					{$L('Select Server')}
				</SpottableButton>
			</div>
		</FocusArea>
	);

	const renderQuickConnect = () => (
		<div className={css.quickConnect}>
			<p className={css.quickConnectInstruction}>{$L("Enter this code on your server's web dashboard:")}</p>
			{quickConnectCode ? (
				<div>
					<div className={css.quickConnectCode}>{formatQuickConnectCode(quickConnectCode)}</div>
					<div className={`${css.spinner} ${css.spinnerAccent}`} />
					<div className={css.statusLine}>{$L('Waiting for authorization...')}</div>
				</div>
			) : (!error && <div className={css.spinnerRow}><div className={css.spinner} /></div>)}
			{error && <div className={css.fieldError}>{error}</div>}
			<div className={css.buttonWrap}>
				<SpottableButton
					data-spotlight-id="back-btn"
					className={css.outlineButton}
					onClick={handleBack}
				>
					{$L('Back')}
				</SpottableButton>
			</div>
		</div>
	);

	const renderCredentials = () => (
		<div className={css.formBlock}>
			{!signInUser && (
				<div className={css.field}>
					<SpottableInput
						data-spotlight-id="username-input"
						type="text"
						purpose="username"
						recents={usernameRecents}
						className={css.input}
						placeholder={$L('Username')}
						value={username}
						onChange={handleUsernameChange}
						onKeyDown={handleUsernameKeyDown}
						disabled={isConnecting}
					/>
				</div>
			)}
			{signInUser?.hasPassword !== false && (
				<div className={css.field}>
					<SpottableInput
						data-spotlight-id="password-input"
						type="password"
						purpose="password"
						className={css.input}
						placeholder={$L('Password')}
						value={password}
						onChange={handlePasswordChange}
						onKeyDown={handlePasswordKeyDown}
						disabled={isConnecting}
					/>
				</div>
			)}
			{error && <div className={css.fieldError}>{error}</div>}
			<div className={css.buttonWrap}>
				<SpottableButton
					data-spotlight-id="back-btn"
					className={css.outlineButton}
					onClick={handleBack}
				>
					{$L('Back')}
				</SpottableButton>
				<SpottableButton
					data-spotlight-id="signin-btn"
					className={css.outlineButton}
					onClick={handleSignIn}
					disabled={isConnecting || !username.trim()}
				>
					{isConnecting ? $L('Signing in...') : $L('Sign In')}
				</SpottableButton>
			</div>
		</div>
	);

	const renderSignIn = () => (
		<FocusArea className={`${css.card} ${css.cardCentered}`}>
			<h1 className={css.title}>{$L('Sign In')}</h1>
			<p className={css.signInSubtitle}>{$L('Connecting to {serverName}').replace('{serverName}', server?.name || '')}</p>

			{supportsQuickConnect && (
				<div className={css.buttonWrap}>
					<SpottableButton
						data-spotlight-id="qc-toggle-btn"
						className={`${css.toggleButton} ${showQuickConnect ? css.toggleButtonSelected : ''}`}
						onClick={selectQuickConnect}
					>
						{$L('Quick Connect')}
					</SpottableButton>
					<SpottableButton
						data-spotlight-id="pw-toggle-btn"
						className={`${css.toggleButton} ${showQuickConnect ? '' : css.toggleButtonSelected}`}
						onClick={selectPassword}
					>
						{$L('Password')}
					</SpottableButton>
				</div>
			)}

			{supportsQuickConnect && showQuickConnect ? renderQuickConnect() : renderCredentials()}
		</FocusArea>
	);

	const renderEmbyConnect = () => (
		<FocusArea className={`${css.card} ${css.cardCentered}`}>
			<h1 className={css.title}>{$L('Emby Connect')}</h1>
			<p className={css.signInSubtitle}>{$L('Sign in with your Emby Connect account')}</p>
			<div className={css.formBlock}>
				<div className={css.field}>
					<SpottableInput
						data-spotlight-id="emby-username-input"
						type="text"
						purpose="email"
						className={css.input}
						placeholder={$L('Email or Username')}
						value={username}
						onChange={handleUsernameChange}
						disabled={isConnecting}
					/>
				</div>
				<div className={css.field}>
					<SpottableInput
						data-spotlight-id="emby-password-input"
						type="password"
						purpose="password"
						className={css.input}
						placeholder={$L('Password')}
						value={password}
						onChange={handlePasswordChange}
						onKeyDown={handleEmbyPasswordKeyDown}
						disabled={isConnecting}
					/>
				</div>
				{error && <div className={css.fieldError}>{error}</div>}
				<div className={css.buttonWrap}>
					<SpottableButton
						data-spotlight-id="emby-back-btn"
						className={css.outlineButton}
						onClick={handleBack}
						disabled={isConnecting}
					>
						{$L('Back')}
					</SpottableButton>
					<SpottableButton
						data-spotlight-id="emby-signin-btn"
						className={css.outlineButton}
						onClick={handleEmbyConnectSignIn}
						disabled={isConnecting || !username.trim() || !password}
					>
						{isConnecting ? $L('Signing in...') : $L('Sign In')}
					</SpottableButton>
				</div>
			</div>
		</FocusArea>
	);

	const renderEmbyServers = () => (
		<FocusArea className={css.card}>
			<div className={css.sectionTitle}>{$L('Select a Server')}</div>
			{connectServers.map((entry, index) => renderTile({
				key: entry.systemId || index,
				spotlightId: `emby-server-${index}`,
				serverType: 'emby',
				name: entry.name,
				detail: entry.candidateAddresses[0] || '',
				'data-index': index,
				onClick: handleEmbyServerClick
			}))}
			{error && <div className={css.errorText}>{error}</div>}
			<div className={css.actionRow}>
				<SpottableButton
					data-spotlight-id="emby-servers-back-btn"
					className={css.outlineButton}
					onClick={handleBack}
					disabled={isConnecting}
				>
					{$L('Back')}
				</SpottableButton>
			</div>
		</FocusArea>
	);

	const renderDialog = () => {
		if (dialog?.kind === 'add') {
			return (
				<div className={css.dialogScrim}>
					<DialogArea className={css.dialog}>
						<h2 className={css.dialogTitle}>{$L('Connect to Server')}</h2>
						<div className={css.inputWithIcon}>
							<MaterialIcon name="dns" className={css.inputIcon} />
							<SpottableInput
								data-spotlight-id="add-address-input"
								type="text"
								purpose="url"
								recents={serverRecents}
								className={css.input}
								placeholder="https://your-server.example.com"
								value={addressValue}
								onChange={handleAddressChange}
								onKeyDown={handleAddressKeyDown}
								disabled={isConnecting}
							/>
						</div>
						{dialogError && <div className={css.fieldError}>{dialogError}</div>}
						{status && <div className={css.statusLine}>{status}</div>}
						<div className={css.dialogActions}>
							<SpottableButton
								data-spotlight-id="add-cancel-btn"
								className={`${css.outlineButton} ${css.dialogButton}`}
								onClick={closeDialog}
								disabled={isConnecting}
							>
								{$L('Cancel')}
							</SpottableButton>
							<SpottableButton
								data-spotlight-id="add-connect-btn"
								className={`${css.outlineButton} ${css.dialogButton}`}
								onClick={submitAddress}
								disabled={isConnecting}
							>
								{isConnecting ? $L('Connecting...') : $L('Connect')}
							</SpottableButton>
						</div>
					</DialogArea>
				</div>
			);
		}

		if (dialog?.kind === 'remove') {
			return (
				<div className={css.dialogScrim}>
					<DialogArea className={css.dialog}>
						<h2 className={css.dialogTitle}>{$L('Remove Server')}</h2>
						<p className={css.serverLabel}>
							{$L('Remove "{serverName}" from your servers?').replace('{serverName}', dialog.server.name)}
						</p>
						<div className={css.dialogActions}>
							<SpottableButton
								data-spotlight-id="remove-cancel-btn"
								className={`${css.outlineButton} ${css.dialogButton}`}
								onClick={closeDialog}
							>
								{$L('Cancel')}
							</SpottableButton>
							<SpottableButton
								data-spotlight-id="remove-confirm-btn"
								className={`${css.outlineButton} ${css.dialogButton}`}
								onClick={handleConfirmRemove}
							>
								{$L('Remove')}
							</SpottableButton>
						</div>
					</DialogArea>
				</div>
			);
		}

		return null;
	};

	const isNarrow = step === 'signin' || step === 'embyconnect';

	return (
		<div className={css.page} ref={pageRef}>
			<div className={css.spacerTop} />
			<div className={`${css.frame} ${isNarrow ? css.frameNarrow : ''}`}>
				<div className={css.logoSection}>
					<img
						src="resources/banner-dark.png"
						alt="Moonfin"
						className={`${css.logo} ${isNarrow ? css.logoSmall : ''}`}
					/>
				</div>

				{status && !dialog && <div className={css.statusMessage}>{status}</div>}

				{step === 'servers' && renderServers()}
				{step === 'users' && renderUsers()}
				{step === 'signin' && renderSignIn()}
				{step === 'embyconnect' && renderEmbyConnect()}
				{step === 'embyconnect-servers' && renderEmbyServers()}

				{step === 'servers' && (
					<div className={css.versionFooter}>
						{$L('Moonfin version {version}').replace('{version}', process.env.REACT_APP_VERSION || '')}
					</div>
				)}

				<div className={`${css.keyboardSpacer} ${keyboardOpen ? css.keyboardSpacerOpen : ''}`} />
			</div>
			<div className={css.spacerBottom} />
			{renderDialog()}
		</div>
	);
};

export default Login;
