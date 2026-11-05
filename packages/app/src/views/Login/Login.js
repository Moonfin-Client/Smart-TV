import {useState, useCallback, useEffect, useMemo, useRef} from 'react';
import Spottable from '@enact/spotlight/Spottable';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import Spotlight from '@enact/spotlight';
import $L from '@enact/i18n/$L';
import {useAuth} from '../../context/AuthContext';
import {useSettings} from '../../context/SettingsContext';
import * as jellyfinApi from '../../services/jellyfinApi';
import * as embyConnect from '../../services/embyConnect';
import * as plexTv from '../../services/plexTv';
import {probeSilo} from '../../services/siloApi';
import * as multiServerManager from '../../services/multiServerManager';
import {discoverLocalServers} from '../../services/serverDiscovery';
import {generateCandidates, normalizeServerBaseUrl, quickConnectApprovalUrl} from '../../utils/serverUrl';
import {drawQrCode} from '../../utils/qrCanvas';
import {classifyError, detectServerType, getConnectionMessage, getSignInMessage, isSignInForbidden, isVersionSupported, supportsQuickConnectWebLink, INVALID_ADDRESS, SERVER_NOT_JELLYFIN, VERSION_UNSUPPORTED, INSECURE_CERT, MIN_SERVER_VERSION} from '../../utils/connectionErrors';
import {KEYS} from '../../utils/keys';
import SpottableInput from '../../components/SpottableInput/SpottableInput';
import {subscribeTvKeyboardVisibility} from '../../components/TVKeyboard/keyboardBus';
import {MaterialIcon} from '../../components/icons/materialIcons';
import {CoreAlertDialog} from '../../components/CoreDialog';
import ProfileCarousel, {PillButton, PillRow} from '../../components/ProfileCarousel';
import {BRAND_NAMES, ServerTypeIcon} from './loginIcons';
import {forgottenPinUsername, noteProvedSignIn} from '../../utils/signInPin';
import {siloNewPasswordIssue, siloNewPasswordMessage} from './siloNewPassword';

import logoAndText from './logo_and_text.png';
import css from './Login.module.less';

const SpottableButton = Spottable('button');
const SpottableDiv = Spottable('div');
const FocusArea = SpotlightContainerDecorator({enterTo: 'last-focused', restrict: 'self-first'}, 'div');
const DialogArea = SpotlightContainerDecorator({
	enterTo: 'default-element',
	restrict: 'self-only',
	leaveFor: {left: '', right: '', up: '', down: ''}
}, 'div');

const QUICK_CONNECT_POLL = 5000;
const LONG_PRESS_DELAY = 500;

const focusLater = (id) => setTimeout(() => Spotlight.focus(`[data-spotlight-id="${id}"]`), 100);

// Jellyfin's six digits read 3+3, Silo's eight 4+4.
const formatQuickConnectCode = (code) => {
	if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`;
	if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`;
	return code;
};

// Silo's device sign-in stands in for Quick Connect.
const hasQuickConnect = (target) => target?.serverType !== 'emby' && target?.serverType !== 'plex';

// plex.tv asks apps to check a code once a second.
const PLEX_PIN_POLL = 1000;

// A Plex Home switch asks plex.tv as whoever used the server last.
const plexAccountToken = (accounts, serverId) => accounts
	.filter((account) => account.serverId === serverId && account.plexToken)
	.sort((a, b) => String(b.lastConnected || '').localeCompare(String(a.lastConnected || '')))[0]?.plexToken || null;

const plexErrorMessage = (err) => (err?.status === 401 ? getSignInMessage(err) : getConnectionMessage(classifyError(err)));

// These say more than the general advice to check the address, so the add dialog keeps their own line.
const SPECIFIC_FAILURES = [INVALID_ADDRESS, SERVER_NOT_JELLYFIN, VERSION_UNSUPPORTED];

const FOUND_TILES = {emby: css.tileEmby, silo: css.tileSilo};

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
	// A Silo account signed in with a temporary password, waiting for a new one: {minimumLength}.
	const [passwordChange, setPasswordChange] = useState(null);
	const [showQuickConnect, setShowQuickConnect] = useState(false);
	const [quickConnectCode, setQuickConnectCode] = useState(null);
	// Silo names its own approval page, with the code filled in.
	const [quickConnectLink, setQuickConnectLink] = useState(null);
	// Bumped when a code ran out, so a fresh one is asked for.
	const [quickConnectRound, setQuickConnectRound] = useState(0);
	const [connectServers, setConnectServers] = useState([]);
	const [connectSession, setConnectSession] = useState(null);
	const [error, setError] = useState(null);
	const [status, setStatus] = useState(null);
	const [isConnecting, setIsConnecting] = useState(false);
	const [keyboardOpen, setKeyboardOpen] = useState(false);
	const [plexPin, setPlexPin] = useState(null);
	const [plexServers, setPlexServers] = useState([]);
	const [plexUsePassword, setPlexUsePassword] = useState(false);
	const [plexCode, setPlexCode] = useState('');
	const [plexNeedsCode, setPlexNeedsCode] = useState(false);

	const pageRef = useRef(null);
	const panelRef = useRef(null);
	const quickConnectTimer = useRef(null);
	const qrCanvasRef = useRef(null);
	const bootstrapped = useRef(false);
	const suppressClick = useRef(false);
	const longPressTimer = useRef(null);
	const plexQrRef = useRef(null);
	const plexPollTimer = useRef(null);
	const plexPinRef = useRef(null);
	const plexPolling = useRef(false);
	const plexPinRequest = useRef(0);
	const plexTokenRef = useRef(null);
	const plexAddressRef = useRef(null);
	const plexSignedInRef = useRef(null);
	const requestPlexPinRef = useRef(null);

	const supportsQuickConnect = hasQuickConnect(server);

	// The QR sits beside the code and the buttons, so its room is kept while the code
	// is still on its way instead of the card jumping when it arrives.
	const onSilo = server?.serverType === 'silo';
	const showQuickConnectQr = supportsQuickConnect && showQuickConnect && (onSilo ? Boolean(quickConnectLink) : supportsQuickConnectWebLink(server?.version));
	const quickConnectQrUrl = showQuickConnectQr ? (onSilo ? quickConnectLink : quickConnectApprovalUrl(server?.url, quickConnectCode)) : null;

	useEffect(() => {
		drawQrCode(qrCanvasRef.current, quickConnectQrUrl);
	}, [quickConnectQrUrl]);

	const plexQrUrl = step === 'plex' && !plexUsePassword && plexPin ? plexTv.plexLinkUrl(plexPin.code) : null;
	useEffect(() => {
		drawQrCode(plexQrRef.current, plexQrUrl);
	}, [plexQrUrl]);

	// Stopping also drops a code still on its way, so one that comes back after Back starts nothing.
	const stopPlexPolling = useCallback(() => {
		clearInterval(plexPollTimer.current);
		plexPollTimer.current = null;
		plexPinRef.current = null;
		plexPinRequest.current += 1;
	}, []);

	useEffect(() => stopPlexPolling, [stopPlexPolling]);

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
				const panel = panelRef.current;
				const inPanel = panel && panel.contains(anchor);
				const scroller = inPanel ? panel : pageRef.current;
				if (!scroller) return;
				const field = anchor.getBoundingClientRect();
				const view = scroller.getBoundingClientRect();
				const delta = field.top - view.top - (inPanel ? 0 : view.height * 0.12);
				if (delta > 0) scroller.scrollTop += delta;
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
		setQuickConnectLink(null);
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

	// Discovery keeps going through Plex's sign-in, since the server's LAN address is often one plex.tv can't list.
	const discovering = step === 'servers' || step === 'plex' || step === 'plex-servers';

	useEffect(() => {
		if (!discovering) return undefined;

		setDiscovered([]);
		setIsDiscovering(true);
		const savedAddresses = uniqueServers.map((entry) => normalizeServerBaseUrl(entry.url).toLowerCase());

		const cancel = discoverLocalServers({
			onFound: (found) => {
				if (savedAddresses.indexOf(normalizeServerBaseUrl(found.address).toLowerCase()) >= 0) return;
				// A saved Plex server may have been reached through the relay, so the next start tries this address first.
				const savedPlex = found.serverType === 'plex' && uniqueServers.find((entry) => entry.machineId === found.id);
				if (savedPlex) {
					const others = (savedPlex.candidateAddresses || [savedPlex.url]).filter((uri) => uri !== found.address);
					multiServerManager.updateServer(savedPlex.serverId, {url: found.address, candidateAddresses: [found.address, ...others]}).catch(() => {});
				}
				setDiscovered((current) => current.concat([found]));
			},
			onDone: () => setIsDiscovering(false)
		});

		return cancel;
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [discovering]);

	// Plex signs in through plex.tv with a code approved on another device, or a password

	const pollPlex = useCallback(async () => {
		const pin = plexPinRef.current;
		if (plexPolling.current || !pin) return;
		if (Date.now() > pin.expiresAt) {
			plexPinRef.current = null;
			requestPlexPinRef.current?.();
			return;
		}
		plexPolling.current = true;
		let token = null;
		try {
			token = await plexTv.checkPin(pin.id);
		} catch (err) {
			if (plexPinRef.current !== pin) return;
			// plex.tv drops a code once it runs out, sometimes before its countdown here does, so a new one takes its place.
			if (err.status === 404) {
				plexPinRef.current = null;
				requestPlexPinRef.current?.();
				return;
			}
			// Dropped connections, 429 and 5xx usually clear up, so the next tick retries those.
			if (err.status && err.status < 500 && err.status !== 429) {
				stopPlexPolling();
				setPlexPin(null);
				setError(plexErrorMessage(err));
			}
			return;
		} finally {
			plexPolling.current = false;
		}
		if (token && plexPinRef.current === pin) {
			plexPinRef.current = null;
			plexSignedInRef.current?.(token);
		}
	}, [stopPlexPolling]);

	const requestPlexPin = useCallback(async () => {
		stopPlexPolling();
		const request = plexPinRequest.current;
		try {
			const pin = await plexTv.createPin();
			if (request !== plexPinRequest.current) return;
			plexPinRef.current = pin;
			setPlexPin(pin);
			plexPollTimer.current = setInterval(pollPlex, PLEX_PIN_POLL);
		} catch (err) {
			if (request !== plexPinRequest.current) return;
			setPlexPin(null);
			setError(plexErrorMessage(err));
		}
	}, [stopPlexPolling, pollPlex]);
	requestPlexPinRef.current = requestPlexPin;

	// A typed address that answered as Plex goes first on the server it belongs to.
	const startPlexSignIn = useCallback((typed = null) => {
		stopQuickConnect();
		plexAddressRef.current = typed;
		plexTokenRef.current = null;
		setDialog(null);
		setError(null);
		setStatus(null);
		setPlexPin(null);
		setPlexServers([]);
		setPlexUsePassword(false);
		setPlexNeedsCode(false);
		setPlexCode('');
		setUsername('');
		setPassword('');
		setStep('plex');
		requestPlexPin();
		focusLater('plex-password-btn');
	}, [stopQuickConnect, requestPlexPin]);

	// Moving between screens

	const goToSignIn = useCallback((target, user) => {
		// Only a Plex Home member switches in with a PIN. Anyone else signs in through plex.tv again.
		if (target?.serverType === 'plex' && !user?.plexHome) {
			startPlexSignIn();
			return;
		}
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
	}, [stopQuickConnect, startPlexSignIn]);

	const openServer = useCallback(async (target, {forceSignIn = false, signInAs = null} = {}) => {
		jellyfinApi.setServer(target.url);
		jellyfinApi.setServerType(target.serverType || 'jellyfin');

		setServer(target);
		setError(null);
		setStatus(null);

		if (forceSignIn) {
			goToSignIn(target, signInAs);
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

		let homeUsers = [];
		const accountToken = target.serverType === 'plex' ? plexAccountToken(savedAccounts, target.serverId) : null;
		if (accountToken) {
			try {
				homeUsers = await plexTv.getHomeUsers(accountToken);
			} catch {
				// Without plex.tv the saved accounts still sign in
			}
		}

		const merged = [];
		const byId = {};
		savedAccounts.forEach((account) => {
			if (account.serverId !== target.serverId) return;
			byId[account.userId] = true;
			const home = homeUsers.find((user) => user.id === account.userId);
			merged.push({
				id: account.userId,
				name: account.username,
				imageTag: account.primaryImageTag,
				hasToken: true,
				hasPassword: home ? home.hasPin : true,
				plexHome: Boolean(home)
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
		homeUsers.forEach((user) => {
			if (byId[user.id]) return;
			byId[user.id] = true;
			merged.push({id: user.id, name: user.name, imageTag: 'plex', hasToken: false, hasPassword: user.hasPin, plexHome: true});
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
			return {error: getConnectionMessage(INVALID_ADDRESS), errorType: INVALID_ADDRESS};
		}

		// The probe asks the Jellyfin way, even when a Plex server was signed in before.
		jellyfinApi.setServerType('jellyfin');
		let lastErrorType = null;
		for (const candidate of candidates) {
			setStatus($L('Trying {url}...').replace('{url}', candidate));
			jellyfinApi.setServer(candidate);

			try {
				// Silo's own API is asked first: its web app answers Jellyfin's probe with a page.
				const siloInfo = await probeSilo(candidate);
				if (siloInfo) {
					jellyfinApi.setServerType('silo');
					return {
						server: {
							serverId: null,
							url: candidate,
							name: siloInfo.ServerName || candidate,
							serverType: 'silo',
							version: siloInfo.Version || null,
							loginDisclaimer: siloInfo.LoginDisclaimer || null
						}
					};
				}

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
							.replace('{minimum}', MIN_SERVER_VERSION),
						errorType: VERSION_UNSUPPORTED
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
				if (err.siloApiUnsupported) {
					return {
						error: err.serverIsNewer
							? $L('This Silo server needs a newer version of Moonfin. Update Moonfin to use it.')
							: $L('This Silo server is too old for this version of Moonfin. Update Silo to use it.'),
						errorType: VERSION_UNSUPPORTED
					};
				}
				const errType = classifyError(err);
				// A cert rejection (from the https candidate / proxy probe) is the
				// most actionable diagnosis, don't let a weaker network failure
				// from a later http candidate mask it.
				if (lastErrorType !== INSECURE_CERT) {
					lastErrorType = errType || lastErrorType;
				}
			}
		}

		return {error: getConnectionMessage(lastErrorType), errorType: lastErrorType};
	}, []);

	const connectTo = useCallback(async (input, {inDialog = false} = {}) => {
		setIsConnecting(true);
		if (inDialog) setDialogError(null);
		else setError(null);

		const result = await probeServer(input);
		// Only Jellyfin, Emby and Silo answer that probe, so a Plex server goes to its plex.tv sign in.
		const plex = result.error ? await plexTv.findServerAt(input) : null;
		setStatus(null);
		setIsConnecting(false);

		if (plex) {
			startPlexSignIn(plex);
			return;
		}

		if (result.error) {
			if (inDialog) setDialogError(result);
			else setError(result.error);
			focusLater(inDialog ? 'add-connect-btn' : 'add-server-btn');
			return;
		}

		// From the add dialog the server is shown first, so the address can be corrected before signing in.
		if (inDialog) {
			setDialog({kind: 'add', step: 'found', server: result.server});
			focusLater('add-continue-btn');
			return;
		}
		openServer(result.server);
	}, [probeServer, openServer, startPlexSignIn]);

	// First screen on arrival, matching the other clients: a known server goes
	// straight to its user list, anything else starts at the server picker.
	useEffect(() => {
		if (isLoading || bootstrapped.current) return;
		bootstrapped.current = true;

		if (isAddingToExisting) {
			const saved = uniqueServers.find((entry) => entry.serverId === activeServerInfo?.serverId) ||
				uniqueServers.find((entry) => entry.url === currentServerUrl);
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
		// Forgot PIN lands on that account's sign in, since only its password clears the PIN.
		const forgottenName = known ? forgottenPinUsername(known.url) : null;
		if (forgottenName) {
			openServer(known, {forceSignIn: true, signInAs: {name: forgottenName, hasPassword: true}});
			return;
		}
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
			setStatus(null);
			if (err.code === 'password_change_required') {
				// The password just typed is the temporary one, which Silo won't take back as the new one.
				setPasswordChange({minimumLength: err.minimumLength || 0, maximumBytes: err.maximumBytes || 0, temporaryPassword: secret});
				setPassword('');
				focusLater('password-input');
				return false;
			}
			setError(err.code === 'password_change_unavailable'
				? $L("This account's password has to be changed in Silo's web app before signing in here.")
				: getSignInMessage(err));
			return false;
		} finally {
			setIsConnecting(false);
		}
	}, [server, login, isAdding, finishLogin]);

	// Replaces the temporary password the sign-in stopped on, then finishes signing in.
	const changeRequiredPassword = useCallback(async () => {
		if (!password) return;
		const issue = siloNewPasswordIssue({newPassword: password, ...passwordChange});
		if (issue) {
			setError(siloNewPasswordMessage(issue, passwordChange?.minimumLength));
			return;
		}
		setIsConnecting(true);
		setError(null);
		setStatus(isAdding ? $L('Adding user...') : $L('Signing in...'));
		try {
			const authResult = await jellyfinApi.api.changeRequiredPassword(password);
			setPasswordChange(null);
			setPassword('');
			const result = await loginWithToken(jellyfinApi.getServerUrl(), authResult, {
				serverName: server?.name, serverType: server?.serverType, serverVersion: server?.version,
				isAddingNewServer: isAdding, switchToNewUser: true
			});
			finishLogin(result);
		} catch (err) {
			if (err.code === 'password_changed_sign_in' || err.status === 401) {
				setPasswordChange(null);
				setPassword('');
				setError($L('The password changed. Sign in with the new one.'));
			} else {
				// Silo says why a new password was refused (too short, too long).
				setError(err.status === 422 || err.status === 400 ? err.message : getSignInMessage(err));
			}
		} finally {
			setIsConnecting(false);
			setStatus(null);
		}
	}, [password, passwordChange, isAdding, loginWithToken, server, finishLogin]);

	// A Plex Home member signs in with their own plex.tv token, from a switch that checks their PIN, and the server token
	// plex.tv gives them.
	const signInPlexHome = useCallback(async (user, pin) => {
		const accountToken = plexAccountToken(savedAccounts, server?.serverId);
		if (!server || !user || !accountToken) return false;
		setIsConnecting(true);
		setError(null);
		setStatus(isAdding ? $L('Adding user...') : $L('Signing in...'));
		try {
			const memberToken = await plexTv.switchHomeUser(accountToken, user.id, pin);
			if (!memberToken) {
				setError($L('Incorrect PIN'));
				return false;
			}
			const match = (await plexTv.getServers(memberToken)).find((entry) => entry.id === server.machineId);
			if (!match) {
				setError($L("{target} isn't shared with this account.").replace('{target}', server.name));
				return false;
			}
			if (pin) noteProvedSignIn(server.url, user.id);
			const result = await loginWithToken(server.url, {
				User: {Id: user.id, Name: user.name, PrimaryImageTag: 'plex'},
				AccessToken: match.accessToken
			}, {
				serverName: server.name, serverType: 'plex', serverVersion: server.version, isAddingNewServer: isAdding, switchToNewUser: true,
				userFields: {plexToken: memberToken}
			});
			finishLogin(result);
			return true;
		} catch (err) {
			setError(plexErrorMessage(err));
			return false;
		} finally {
			setIsConnecting(false);
			setStatus(null);
		}
	}, [savedAccounts, server, isAdding, loginWithToken, finishLogin]);

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

		if (user.plexHome && !user.hasPassword) {
			await signInPlexHome(user, '');
			return;
		}

		if (!user.hasPassword && !alwaysAuthenticate) {
			const ok = await signIn(user.name, '');
			if (ok) return;
			goToSignIn(server, user);
			return;
		}

		goToSignIn(server, user);
	}, [server, alwaysAuthenticate, isAdding, switchUser, onLoggedIn, goToSignIn, signIn, signInPlexHome]);

	// Quick Connect

	const pollQuickConnect = useCallback(async (secret) => {
		try {
			const state = await jellyfinApi.api.getQuickConnectState(secret);
			// A Silo code that ran out (or was declined) is done; the screen asks for a fresh one.
			if (state.Expired) {
				stopQuickConnect();
				setQuickConnectRound((n) => n + 1);
				return;
			}
			if (!state.Authenticated) return;

			stopQuickConnect();
			setStatus(isAdding ? $L('Adding user...') : $L('Signing in...'));
			const authResult = await jellyfinApi.api.authenticateQuickConnect(secret);
			noteProvedSignIn(jellyfinApi.getServerUrl(), authResult.User?.Id);
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
			// Once approved the code is gone, so a refusal here has to be said or the screen
			// stays on "Waiting for authorization..."
			if (isSignInForbidden(err)) {
				setError(getSignInMessage(err));
				setStatus(null);
			}
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
			setQuickConnectLink(result.VerificationUriComplete || null);
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
	}, [step, showQuickConnect, supportsQuickConnect, quickConnectRound]);

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

	// Plex servers

	const connectPlex = useCallback(async (target, token) => {
		setIsConnecting(true);
		setError(null);
		setStatus($L('Connecting to server...'));
		try {
			const [uri, account] = await Promise.all([plexTv.findReachableUri(target.connections, target.id), plexTv.getAccount(token)]);
			if (!uri) {
				setError($L('Unable to connect to {target}').replace('{target}', target.name));
				return;
			}
			// A saved server keeps its entry when it answers at a new address.
			const saved = uniqueServers.find((entry) => entry.machineId === target.id);
			if (saved && saved.url !== uri) await multiServerManager.updateServer(saved.serverId, {url: uri});
			noteProvedSignIn(uri, account.id);
			const result = await loginWithToken(uri, {
				User: {Id: account.id, Name: account.name, PrimaryImageTag: 'plex'},
				AccessToken: target.accessToken
			}, {
				serverName: target.name, serverType: 'plex', serverVersion: target.version, isAddingNewServer: isAdding, switchToNewUser: true,
				serverFields: {machineId: target.id, candidateAddresses: target.connections}, userFields: {plexToken: token}
			});
			finishLogin(result);
		} catch (err) {
			setError(plexErrorMessage(err));
		} finally {
			setIsConnecting(false);
			setStatus(null);
		}
	}, [uniqueServers, loginWithToken, isAdding, finishLogin]);

	// The account's servers, with the address typed in, then any found on this network, then the one saved, ahead of what
	// plex.tv lists. plex.tv can't see past a container or NAT, so its own list may hold nothing this TV can reach.
	const plexSignedIn = useCallback(async (token) => {
		stopPlexPolling();
		plexTokenRef.current = token;
		setError(null);
		setIsConnecting(true);
		setStatus($L('Connecting to server...'));
		let servers;
		try {
			servers = (await plexTv.getServers(token)).map((entry) => {
				const typed = plexAddressRef.current?.machineId === entry.id ? plexAddressRef.current.uri : null;
				const saved = uniqueServers.find((known) => known.machineId === entry.id)?.url;
				const lan = discovered.filter((found) => found.serverType === 'plex' && found.id === entry.id).map((found) => found.address);
				const first = [typed, ...lan, saved].filter(Boolean);
				return {...entry, connections: [...first, ...entry.connections.filter((uri) => !first.includes(uri))]};
			});
		} catch (err) {
			setIsConnecting(false);
			setStatus(null);
			setPlexPin(null);
			setError(plexErrorMessage(err));
			return;
		}
		setIsConnecting(false);
		setStatus(null);
		// The list stays up behind a lone server too, so a failed connection can be tried again from it.
		setPlexServers(servers);
		setStep('plex-servers');
		focusLater(servers.length ? 'plex-server-0' : 'plex-servers-back-btn');
		if (servers.length === 1) await connectPlex(servers[0], token);
	}, [stopPlexPolling, uniqueServers, discovered, connectPlex]);
	plexSignedInRef.current = plexSignedIn;

	const handlePlexServerClick = useCallback((e) => {
		const target = plexServers[parseInt(e.currentTarget.dataset.index, 10)];
		if (target && plexTokenRef.current && !isConnecting) connectPlex(target, plexTokenRef.current);
	}, [plexServers, isConnecting, connectPlex]);

	const handlePlexPasswordSignIn = useCallback(async () => {
		if (!username.trim() || !password || isConnecting) return;
		setIsConnecting(true);
		setError(null);
		setStatus($L('Signing in...'));
		let token;
		try {
			token = await plexTv.signIn(username.trim(), password, plexNeedsCode ? plexCode.trim() : null);
		} catch (err) {
			setIsConnecting(false);
			setStatus(null);
			// An account with two step sign in turns the password down until its code comes along.
			if (!plexNeedsCode && plexTv.needsVerificationCode(err)) {
				setPlexNeedsCode(true);
				focusLater('plex-code-input');
				return;
			}
			setError(plexErrorMessage(err));
			return;
		}
		await plexSignedIn(token);
	}, [username, password, isConnecting, plexNeedsCode, plexCode, plexSignedIn]);

	const showPlexPassword = useCallback(() => {
		setPlexUsePassword(true);
		setError(null);
		focusLater('plex-username-input');
	}, []);

	// Back

	const closeDialog = useCallback(() => {
		setDialog(null);
		setDialogError(null);
		focusLater('add-server-btn');
	}, []);

	const showAddressStep = useCallback(() => {
		setDialogError(null);
		setDialog({kind: 'add', step: 'address'});
		focusLater('add-address-input');
	}, []);

	const showChooseStep = useCallback(() => {
		setDialogError(null);
		setDialog({kind: 'add', step: 'choose'});
		focusLater('add-choice-address');
	}, []);

	const openAddDialog = useCallback(() => {
		setAddressValue('');
		showChooseStep();
	}, [showChooseStep]);

	const handleBack = useCallback(() => {
		if (step === 'plex' || step === 'plex-servers') {
			if (isConnecting) return true;
			if (step === 'plex' && plexUsePassword) {
				setPlexUsePassword(false);
				setError(null);
				if (!plexPollTimer.current) requestPlexPin();
				focusLater('plex-password-btn');
				return true;
			}
			stopPlexPolling();
			if (users.length > 0) {
				setStep('users');
				focusLater('user-0');
			} else {
				goToServers();
			}
			return true;
		}
		if (dialog) {
			if (dialog.step === 'found') showAddressStep();
			else if (dialog.step === 'address' && !isConnecting) showChooseStep();
			else if (!isConnecting) closeDialog();
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
			if (passwordChange) {
				// Giving up the change ends the login it was waiting on.
				setPasswordChange(null);
				setPassword('');
				setError(null);
				jellyfinApi.api.cancelRequiredPasswordChange?.();
				focusLater('password-input');
				return true;
			}
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
	}, [dialog, closeDialog, showAddressStep, showChooseStep, isConnecting, step, users.length, isAdding, goToServers, stopQuickConnect, cancelAddServerFlow, onServerAdded, plexUsePassword, stopPlexPolling, requestPlexPin, passwordChange]);

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

	const chooseEmbyConnect = useCallback(() => {
		setDialog(null);
		handleEmbyConnectStart();
	}, [handleEmbyConnectStart]);

	const continueToServer = useCallback(() => {
		const found = dialog?.server;
		setDialog(null);
		if (found) openServer(found);
	}, [dialog, openServer]);

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

	// A saved Plex server found on this network shows once, at the address it answered on.
	const foundAt = useCallback((entry) => (entry.serverType === 'plex'
		? discovered.find((found) => found.serverType === 'plex' && found.id === entry.machineId)?.address
		: null) || entry.url, [discovered]);
	const listedDiscovered = useMemo(() => discovered.filter((found) => found.serverType !== 'plex' ||
		!uniqueServers.some((entry) => entry.machineId === found.id)), [discovered, uniqueServers]);

	const handleSavedClick = useCallback((e) => {
		if (suppressClick.current) {
			suppressClick.current = false;
			return;
		}
		const {serverId} = e.currentTarget.dataset;
		const entry = uniqueServers.find((item) => item.serverId === serverId);
		if (entry) openServer({...entry, url: foundAt(entry)});
	}, [uniqueServers, openServer, foundAt]);

	const handleDiscoveredClick = useCallback((e) => {
		if (isConnecting) return;
		const index = parseInt(e.currentTarget.dataset.index, 10);
		const found = listedDiscovered[index];
		if (found?.serverType === 'plex') startPlexSignIn({uri: found.address, machineId: found.id});
		else if (found) connectTo(found.address);
	}, [listedDiscovered, isConnecting, connectTo, startPlexSignIn]);

	const handleConfirmRemove = useCallback(async () => {
		const target = dialog?.server;
		setDialog(null);
		if (target) await removeServerEntry(target.serverId);
		focusLater('add-server-btn');
	}, [dialog, removeServerEntry]);

	const handleUserActivate = useCallback((item) => {
		const user = users.find((entry) => String(entry.id) === String(item.id));
		if (user) handleUserSelect(user);
	}, [users, handleUserSelect]);

	// A token resumes without asking, so only someone without one is told what they'll need.
	const userCarouselItems = useMemo(() => users.map((user) => {
		const pin = !user.hasToken && user.plexHome && user.hasPassword;
		let line = null;
		if (user.hasToken) line = {text: $L('Signed in on this device')};
		else if (pin) line = {text: $L('PIN required'), lock: true};
		else if (user.hasPassword) line = {text: $L('Password required')};
		return {
			key: user.id,
			id: user.id,
			name: user.name,
			imageUrl: user.imageTag ? jellyfinApi.getUserImageUrl(jellyfinApi.getServerUrl(), user.id, user.imageTag, server?.serverType) : null,
			badge: pin ? 'pin' : null,
			lines: line ? [line] : []
		};
	}), [users, server]);

	const handleAddUser = useCallback(() => {
		if (server) goToSignIn(server, null);
	}, [server, goToSignIn]);

	const handleSignIn = useCallback(() => {
		if (passwordChange) {
			changeRequiredPassword();
			return;
		}
		if (server?.serverType === 'plex') {
			signInPlexHome(signInUser, password);
			return;
		}
		if (!username.trim()) return;
		signIn(username.trim(), password);
	}, [server, signInUser, username, password, signIn, signInPlexHome, passwordChange, changeRequiredPassword]);

	const handlePlexCodeChange = useCallback((e) => setPlexCode(e.target.value), []);

	const handlePlexPasswordKeyDown = useCallback((e) => {
		if (e.keyCode !== KEYS.ENTER) return;
		if (plexNeedsCode) focusLater('plex-code-input');
		else handlePlexPasswordSignIn();
	}, [plexNeedsCode, handlePlexPasswordSignIn]);

	const handlePlexCodeKeyDown = useCallback((e) => {
		if (e.keyCode === KEYS.ENTER) handlePlexPasswordSignIn();
	}, [handlePlexPasswordSignIn]);

	const choosePlex = useCallback(() => startPlexSignIn(), [startPlexSignIn]);

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

	const renderServers = () => (
		<FocusArea className={css.card}>
			{uniqueServers.length > 0 && (
				<div>
					<div className={css.sectionTitle}>{$L('Saved Servers')}</div>
					{uniqueServers.map((entry, index) => renderTile({
						key: entry.serverId,
						spotlightId: `saved-${index}`,
						serverType: entry.serverType,
						name: entry.name,
						detail: entry.version ? `${foundAt(entry)} • ${entry.version}` : foundAt(entry),
						'data-server-id': entry.serverId,
						onClick: handleSavedClick,
						onKeyDown: handleSavedKeyDown,
						onKeyUp: handleSavedKeyUp
					}))}
				</div>
			)}

			<div className={uniqueServers.length > 0 ? css.sectionGap : ''}>
				<div className={css.sectionTitle}>{$L('Discovered Servers')}</div>
				{listedDiscovered.length > 0
					? listedDiscovered.map((found, index) => renderTile({
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
				{isDiscovering && listedDiscovered.length > 0 && (
					<div className={css.spinnerRowTight}><div className={`${css.spinner} ${css.spinnerSmall}`} /></div>
				)}
			</div>

			{error && <div className={css.errorText}>{error}</div>}

			<div className={css.actionRow}>
				<SpottableButton
					data-spotlight-id="add-server-btn"
					className={css.addServerButton}
					onClick={openAddDialog}
					disabled={isConnecting}
				>
					<span className={css.addServerPlus}>
						<MaterialIcon name="addRounded" className={css.addServerPlusIcon} />
					</span>
					<span className={css.addServerText}>
						<span className={css.addServerTitle}>{$L('Add Server')}</span>
						<span className={css.addServerSubtitle}>{$L('By address, or with a Plex or Emby Connect account')}</span>
					</span>
					{['jellyfin', 'emby', 'plex', 'silo'].map((type) => (
						<ServerTypeIcon key={type} serverType={type} className={css.addServerBrand} />
					))}
				</SpottableButton>
			</div>
		</FocusArea>
	);

	// The carousel takes the whole screen, so this step draws its own logo and status.
	const renderUsers = () => (
		<FocusArea className={css.usersScreen}>
			<div className={css.usersTop}>
				<img src={logoAndText} alt="Moonfin" className={css.usersLogo} />
				{server?.name && (
					<span className={css.usersServer}>
						<MaterialIcon name="dnsOutlined" className={css.usersServerIcon} />
						{server.name}
					</span>
				)}
			</div>

			<div className={css.usersMain}>
				<h1 className={css.usersTitle}>{$L("Who's watching?")}</h1>
				<ProfileCarousel
					key={server?.serverId}
					items={userCarouselItems}
					spotlightId="user-0"
					onActivate={handleUserActivate}
				/>
				{status && !dialog && <div className={`${css.statusMessage} ${css.usersStatus}`}>{status}</div>}
				{server?.loginDisclaimer && <p className={`${css.disclaimer} ${css.usersNote}`}>{server.loginDisclaimer}</p>}
				{error && <div className={`${css.errorText} ${css.usersNote}`}>{error}</div>}
			</div>

			<PillRow>
				<PillButton data-spotlight-id="add-user-btn" icon="person" onClick={handleAddUser}>
					{$L('Add User')}
				</PillButton>
				<PillButton data-spotlight-id="select-server-btn" icon="home" onClick={goToServers}>
					{$L('Select Server')}
				</PillButton>
			</PillRow>
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
			) : (!error && <div className={css.codeSpinner}><div className={`${css.spinner} ${css.spinnerLarge}`} /></div>)}
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
			{passwordChange && (
				<p className={css.signInSubtitle}>
					{$L("This account's password has to be changed before signing in. Choose a new one of at least {count} characters.")
						.replace('{count}', String(passwordChange.minimumLength || 1))}
				</p>
			)}
			{!signInUser && !passwordChange && (
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
						placeholder={passwordChange ? $L('New password') : (server?.serverType === 'plex' ? $L('PIN') : $L('Password'))}
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
					disabled={isConnecting}
				>
					{isConnecting ? <span className={`${css.spinner} ${css.buttonSpinner}`} /> : (passwordChange ? $L('Change Password') : $L('Sign In'))}
				</SpottableButton>
			</div>
		</div>
	);

	const renderSignIn = () => (
		<FocusArea className={`${css.card} ${css.cardCentered} ${showQuickConnectQr ? css.cardWithQr : ''}`}>
			<div className={css.signInMain}>
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
			</div>
			{showQuickConnectQr && (
				<div className={css.qrAside}>
					{quickConnectQrUrl && (
						<div>
							<canvas ref={qrCanvasRef} className={css.qrCanvas} />
							<div className={css.qrCaption}>{$L("Or scan this with a phone that's signed in to your server")}</div>
						</div>
					)}
				</div>
			)}
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

	const renderPlexPassword = () => (
		<div className={css.formBlock}>
			<div className={css.field}>
				<SpottableInput
					data-spotlight-id="plex-username-input"
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
					data-spotlight-id="plex-password-input"
					type="password"
					purpose="password"
					className={css.input}
					placeholder={$L('Password')}
					value={password}
					onChange={handlePasswordChange}
					onKeyDown={handlePlexPasswordKeyDown}
					disabled={isConnecting}
				/>
			</div>
			{plexNeedsCode && (
				<div className={css.field}>
					<SpottableInput
						data-spotlight-id="plex-code-input"
						type="text"
						purpose="number"
						className={css.input}
						placeholder={$L('Verification code')}
						value={plexCode}
						onChange={handlePlexCodeChange}
						onKeyDown={handlePlexCodeKeyDown}
						disabled={isConnecting}
					/>
				</div>
			)}
			{error && <div className={css.fieldError}>{error}</div>}
			<div className={css.buttonWrap}>
				<SpottableButton data-spotlight-id="plex-back-btn" className={css.outlineButton} onClick={handleBack} disabled={isConnecting}>
					{$L('Back')}
				</SpottableButton>
				<SpottableButton
					data-spotlight-id="plex-signin-btn"
					className={css.outlineButton}
					onClick={handlePlexPasswordSignIn}
					disabled={isConnecting || !username.trim() || !password}
				>
					{isConnecting ? $L('Signing in...') : $L('Sign In')}
				</SpottableButton>
			</div>
		</div>
	);

	const renderPlexCode = () => (
		<div className={css.quickConnect}>
			<p className={css.quickConnectInstruction}>{$L('Go to plex.tv/link on any device and enter this code')}</p>
			{plexPin ? (
				<div>
					<div className={css.quickConnectCode}>{plexPin.code}</div>
					<div className={`${css.spinner} ${css.spinnerAccent}`} />
					<div className={css.statusLine}>{$L('Waiting for you to approve the code...')}</div>
				</div>
			) : (!error && <div className={css.spinnerRow}><div className={css.spinner} /></div>)}
			{error && <div className={css.fieldError}>{error}</div>}
			<div className={css.buttonWrap}>
				<SpottableButton data-spotlight-id="plex-code-back-btn" className={css.outlineButton} onClick={handleBack} disabled={isConnecting}>
					{$L('Back')}
				</SpottableButton>
				<SpottableButton data-spotlight-id="plex-password-btn" className={css.outlineButton} onClick={showPlexPassword} disabled={isConnecting}>
					{$L('Sign in with a password')}
				</SpottableButton>
			</div>
		</div>
	);

	const renderPlex = () => (
		<FocusArea className={`${css.card} ${css.cardCentered} ${plexQrUrl ? css.cardWithQr : ''}`}>
			<div className={css.signInMain}>
				<h1 className={css.title}>{$L('Sign in with Plex')}</h1>
				{plexUsePassword ? renderPlexPassword() : renderPlexCode()}
			</div>
			{plexQrUrl && (
				<div className={css.qrAside}>
					<canvas ref={plexQrRef} className={css.qrCanvas} />
					<div className={css.qrCaption}>{$L('Or scan this with a phone that\'s signed in to Plex')}</div>
				</div>
			)}
		</FocusArea>
	);

	const renderPlexServers = () => (
		<FocusArea className={css.card}>
			<div className={css.sectionTitle}>{$L('Select a Server')}</div>
			{plexServers.length === 0 && <div className={css.emptyHint}>{$L('No Plex servers found on this account')}</div>}
			{plexServers.map((entry, index) => renderTile({
				key: entry.id || index,
				spotlightId: `plex-server-${index}`,
				serverType: 'plex',
				name: entry.name,
				detail: [entry.connections[0], entry.version].filter(Boolean).join(' • '),
				'data-index': index,
				onClick: handlePlexServerClick
			}))}
			{error && <div className={css.errorText}>{error}</div>}
			<div className={css.actionRow}>
				<SpottableButton
					data-spotlight-id="plex-servers-back-btn"
					className={css.outlineButton}
					onClick={handleBack}
					disabled={isConnecting}
				>
					{$L('Back')}
				</SpottableButton>
			</div>
		</FocusArea>
	);

	const renderRoundButton = (spotlightId, icon, label, onClick) => (
		<SpottableButton
			data-spotlight-id={spotlightId}
			className={css.roundButton}
			onClick={onClick}
			disabled={isConnecting}
			aria-label={label}
		>
			<MaterialIcon name={icon} className={css.roundButtonIcon} />
		</SpottableButton>
	);

	const renderPanelHeader = ({title, subtitle, onBack}) => (
		<div className={css.panelHeader}>
			{onBack && renderRoundButton('add-back-btn', 'arrowBack', $L('Back'), onBack)}
			<div className={css.panelHeading}>
				<h2 className={css.panelTitle}>{title}</h2>
				<p className={css.panelSubtitle}>{subtitle}</p>
			</div>
			{renderRoundButton('add-close-btn', 'closeRounded', $L('Close'), closeDialog)}
		</div>
	);

	const renderChoice = ({spotlightId, tileClass, icon, title, detail, onClick}) => (
		<SpottableDiv data-spotlight-id={spotlightId} className={css.choiceCard} onClick={onClick}>
			<div className={`${css.choiceTile} ${tileClass}`}>{icon}</div>
			<div className={css.choiceBody}>
				<div className={css.choiceTitle}>{title}</div>
				<div className={css.choiceDetail}>{detail}</div>
			</div>
			<div className={css.choiceArrow}>
				<MaterialIcon name="arrowForward" className={css.choiceArrowIcon} />
			</div>
		</SpottableDiv>
	);

	const renderChooseStep = () => (
		<div>
			{renderPanelHeader({title: $L('Add Server'), subtitle: $L('Choose how you\'d like to connect.')})}
			<div className={css.choiceList}>
				{renderChoice({
					spotlightId: 'add-choice-address',
					tileClass: css.tileAccent,
					icon: <MaterialIcon name="language" className={css.choiceGlyph} />,
					title: $L('Server Address'),
					detail: $L('Jellyfin, Emby or Silo on your network or online'),
					onClick: showAddressStep
				})}
				{renderChoice({
					spotlightId: 'add-choice-plex',
					tileClass: css.tilePlex,
					icon: <ServerTypeIcon serverType="plex" className={css.choiceGlyphPlex} />,
					title: $L('Sign in with Plex'),
					detail: $L('Use your Plex account to find its servers'),
					onClick: choosePlex
				})}
				{renderChoice({
					spotlightId: 'add-choice-emby',
					tileClass: css.tileEmby,
					icon: <ServerTypeIcon serverType="emby" className={css.choiceGlyph} />,
					title: $L('Emby Connect'),
					detail: $L('Sign in with your Emby Connect account'),
					onClick: chooseEmbyConnect
				})}
			</div>
		</div>
	);

	const renderNotice = ({error: message, errorType}) => {
		const warning = errorType === INSECURE_CERT;
		const detail = warning || SPECIFIC_FAILURES.includes(errorType)
			? message
			: $L('Check the address and port, and that the server is running.');
		return (
			<div className={`${css.notice} ${warning ? css.noticeWarning : ''}`}>
				<MaterialIcon name={warning ? 'shield' : 'error'} className={css.noticeIcon} />
				<div className={css.noticeBody}>
					{!warning && <div className={css.noticeTitle}>{$L('Unable to connect to server')}</div>}
					<div className={css.noticeText}>{detail}</div>
				</div>
			</div>
		);
	};

	const renderAddressStep = () => (
		<div>
			{renderPanelHeader({
				title: $L('Connect to Server'),
				subtitle: $L('The same address you\'d open in a browser, including the port.'),
				onBack: showChooseStep
			})}
			<div className={css.fieldLabel}>{$L('Server Address')}</div>
			<div className={css.inputWithIcon}>
				<MaterialIcon name="language" className={css.inputIcon} />
				<SpottableInput
					data-spotlight-id="add-address-input"
					type="text"
					purpose="url"
					recents={serverRecents}
					className={`${css.input} ${css.addressInput}`}
					placeholder="https://your-server.example.com"
					value={addressValue}
					onChange={handleAddressChange}
					onKeyDown={handleAddressKeyDown}
					disabled={isConnecting}
				/>
			</div>
			<SpottableButton
				data-spotlight-id="add-connect-btn"
				className={`${css.primaryButton} ${css.connectButton}`}
				onClick={submitAddress}
				disabled={isConnecting}
			>
				{isConnecting ? <span className={`${css.spinner} ${css.primarySpinner}`} /> : $L('Connect')}
			</SpottableButton>
			<div className={css.addressHint}>
				{isConnecting
					? $L('Checking {address}').replace('{address}', addressValue.trim())
					: $L('Works with Jellyfin, Emby and Silo. A Plex address opens the Plex sign-in.')}
			</div>
			{dialogError && renderNotice(dialogError)}
		</div>
	);

	const renderFoundStep = (found) => (
		<div>
			<div className={css.foundHeader}>
				<span className={css.foundCheck}>
					<MaterialIcon name="checkRounded" className={css.foundCheckIcon} />
				</span>
				<h2 className={css.panelTitle}>{$L('Server found')}</h2>
			</div>
			<div className={css.foundCard}>
				<div className={`${css.foundTile} ${FOUND_TILES[found.serverType] || css.tileJellyfin}`}>
					<ServerTypeIcon serverType={found.serverType} className={css.foundGlyph} />
				</div>
				<div className={css.foundBody}>
					<div className={css.foundName}>{found.name}</div>
					<div className={css.chipRow}>
						<span className={css.chip}>{BRAND_NAMES[found.serverType]}</span>
						{found.version && <span className={css.chip}>{`${$L('Version')} ${found.version}`}</span>}
					</div>
					<div className={css.foundAddress}>{found.url}</div>
				</div>
			</div>
			<p className={css.foundNote}>{$L('Continue to choose who\'s signing in.')}</p>
			<div className={css.foundActions}>
				<SpottableButton
					data-spotlight-id="add-other-address-btn"
					className={css.ghostButton}
					onClick={showAddressStep}
				>
					{$L('Use a different address')}
				</SpottableButton>
				<SpottableButton
					data-spotlight-id="add-continue-btn"
					className={css.primaryButton}
					onClick={continueToServer}
				>
					{$L('Continue')}
				</SpottableButton>
			</div>
		</div>
	);

	const renderDialog = () => {
		if (dialog?.kind === 'add') {
			return (
				<div className={`${css.panelScrim} ${keyboardOpen ? css.panelScrimKeyboard : ''}`}>
					<DialogArea className={css.panel}>
						<div ref={panelRef} className={css.panelScroll}>
							<div key={dialog.step} className={css.stepEntrance}>
								{dialog.step === 'choose' && renderChooseStep()}
								{dialog.step === 'address' && renderAddressStep()}
								{dialog.step === 'found' && renderFoundStep(dialog.server)}
							</div>
						</div>
					</DialogArea>
				</div>
			);
		}

		if (dialog?.kind === 'remove') {
			return (
				<CoreAlertDialog
					open
					onClose={closeDialog}
					title={$L('Remove Server')}
					spotlightId="remove-server-dialog"
					actions={[
						{label: $L('Cancel'), onClick: closeDialog, spotlightId: 'remove-cancel-btn'},
						{label: $L('Remove'), onClick: handleConfirmRemove, spotlightId: 'remove-confirm-btn'}
					]}
				>
					{$L('Remove "{serverName}" from your servers?').replace('{serverName}', dialog.server.name)}
				</CoreAlertDialog>
			);
		}

		return null;
	};

	const isNarrow = step === 'signin' || step === 'embyconnect' || step === 'plex';
	const isWide = (step === 'signin' && showQuickConnectQr) || Boolean(plexQrUrl);

	return (
		<div className={`${css.page} ${step === 'users' ? css.pageUsers : ''}`} ref={pageRef}>
			<div className={css.spacerTop} />
			<div className={`${css.frame} ${isNarrow ? (isWide ? css.frameWide : css.frameNarrow) : ''}`}>
				<div className={css.logoSection}>
					<img
						src={logoAndText}
						alt="Moonfin"
						className={`${css.logo} ${isNarrow ? css.logoSmall : ''}`}
					/>
				</div>

				{status && !dialog && step !== 'users' && <div className={css.statusMessage}>{status}</div>}

				{step === 'servers' && renderServers()}
				{step === 'users' && renderUsers()}
				{step === 'signin' && renderSignIn()}
				{step === 'embyconnect' && renderEmbyConnect()}
				{step === 'embyconnect-servers' && renderEmbyServers()}
				{step === 'plex' && renderPlex()}
				{step === 'plex-servers' && renderPlexServers()}

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
