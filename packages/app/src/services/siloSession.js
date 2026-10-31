// Requests to Silo's native /api/v2: its headers, its Problem Details errors, and the account's token pair, which Silo
// rotates on every refresh.
//
// A Silo sign-in belongs to an account, and the account's household profiles are the app's users. All of them share
// the account's one token pair, kept here by server and account. A request names its profile in X-Profile-Id, plus
// X-Profile-Token while a PIN-locked profile is unlocked.

import {corsFreeFetch} from './secureFetch';
import {getFromStorage, saveToStorage} from './storage';
import {mediaServerQueue} from '../utils/requestQueue';
import {classifyError} from '../utils/connectionErrors';
import {normalizeServerUrl} from '../utils/serverUrl';

const STORAGE_KEY = 'siloSessions';
const DEFAULT_TIMEOUT_MS = 15000;
// Access tokens a session has replaced, kept so a caller still holding one finds the session.
const KEPT_ALIASES = 5;

export const SILO_API_MAJOR = 2;

export const siloServerKey = (url) => normalizeServerUrl(String(url || '')) || String(url || '').replace(/\/+$/, '');

// Silo answers 422 to a device id with anything but letters, digits, '.', '_', ':' or '-'.
export const siloDeviceId = (raw) => {
	const filtered = String(raw || '').replace(/[^A-Za-z0-9._:-]/g, '');
	return filtered ? filtered.slice(0, 128) : null;
};

const headerText = (value, max) => {
	const cleaned = String(value == null ? '' : value).replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim() || 'Unknown';
	return max ? cleaned.slice(0, max) : cleaned;
};

// Silo records the X-Silo-Device-* headers in its device registry and reads device-scoped playback preferences from
// the id, so they go on every request.
export const siloHeaders = ({deviceInfo, platform, accessToken, profileId, profileToken}) => {
	const headers = {};
	if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
	if (profileId) headers['X-Profile-Id'] = profileId;
	if (profileToken) headers['X-Profile-Token'] = profileToken;
	const deviceId = siloDeviceId(deviceInfo?.deviceId);
	if (deviceId) headers['X-Silo-Device-Id'] = deviceId;
	headers['X-Silo-Device-Name'] = headerText(deviceInfo?.deviceName, 120);
	if (platform) headers['X-Silo-Device-Platform'] = headerText(platform, 40);
	headers['X-Silo-Client'] = headerText(deviceInfo?.appName);
	headers['X-Silo-Client-Version'] = headerText(deviceInfo?.appVersion);
	return headers;
};

// An RFC 9457 Problem Details body. Its code is the last segment of `type`, the part code reacts to.
export const siloProblem = (body) => {
	if (!body || typeof body !== 'object') return null;
	const {type, title} = body;
	if (typeof type !== 'string' && typeof title !== 'string') return null;
	const code = typeof type === 'string' ? type.split('/').filter(Boolean).pop() || type : null;
	return {
		type: typeof type === 'string' ? type : null,
		code,
		title: typeof title === 'string' ? title : null,
		status: typeof body.status === 'number' ? body.status : null,
		detail: typeof body.detail === 'string' ? body.detail : null,
		errors: Array.isArray(body.errors) ? body.errors : []
	};
};

export const siloError = (status, body) => {
	const problem = siloProblem(body);
	const error = new Error(problem?.detail || problem?.title || `Silo error ${status}`);
	error.status = status;
	error.code = problem?.code || null;
	error.problem = problem;
	error.connectionType = classifyError(error);
	return error;
};

// Silo retires an API namespace with 410 client_upgrade_required, or 426.
export const isClientUpgradeRequired = (err) => err?.status === 426 || (err?.status === 410 && err.code === 'client_upgrade_required');

// A pair from a sign-in (TokenPair) or a refresh (RefreshedTokens).
export const tokensFrom = (json, now = Date.now()) => {
	const seconds = Number(json?.expires_in) > 0 ? Number(json.expires_in) : 0;
	return {
		accessToken: typeof json?.access_token === 'string' ? json.access_token : '',
		refreshToken: typeof json?.refresh_token === 'string' ? json.refresh_token : '',
		expiresAt: now + seconds * 1000,
		lifetimeMs: seconds * 1000
	};
};

// Refreshed once four fifths of its life has passed, or with under a minute left.
export const needsRefresh = (tokens, now = Date.now()) => {
	if (!tokens?.refreshToken) return false;
	const remaining = tokens.expiresAt - now;
	return remaining <= 60000 || remaining <= tokens.lifetimeMs * 0.2;
};

// A stream carries the token it was opened with in its address for as long as it plays, so one about to open is
// given a nearly fresh token: anything past a tenth of its life is refreshed first. As Moonfin-Core's _streamAuth
// for players that carry the token in their URLs.
export const needsStreamRefresh = (tokens, now = Date.now()) => Boolean(tokens?.refreshToken) &&
	tokens.lifetimeMs > 0 && tokens.expiresAt - now < tokens.lifetimeMs * 0.9;

const sessions = [];
let loaded = null;

const persist = () => saveToStorage(STORAGE_KEY, sessions.map(({server, accountId, tokens, aliases}) => ({server, accountId, tokens, aliases})))
	.catch((err) => console.warn('[Silo] Saving the session failed:', err));

export const loadSiloSessions = () => {
	if (!loaded) {
		loaded = getFromStorage(STORAGE_KEY).then((stored) => {
			(Array.isArray(stored) ? stored : []).forEach((entry) => {
				if (!entry?.server || !entry.accountId || !entry.tokens?.accessToken) return;
				if (sessions.some((s) => s.server === entry.server && s.accountId === entry.accountId)) return;
				sessions.push({...entry, aliases: entry.aliases || [], proofs: {}, identity: 0, refreshing: null});
			});
		}).catch(() => {});
	}
	return loaded;
};

// Listeners told when a session's tokens rotate (to update stored users) or its login ends (back to sign-in).
const rotateListeners = new Set();
const endListeners = new Set();
export const onSiloTokensRotated = (listener) => {
	rotateListeners.add(listener);
	return () => rotateListeners.delete(listener);
};
export const onSiloSessionEnded = (listener) => {
	endListeners.add(listener);
	return () => endListeners.delete(listener);
};

// The session a caller holding `token` for `server` acts under, by its current or an earlier access token.
export const siloSessionFor = (server, token) => {
	const base = siloServerKey(server);
	if (!token) return null;
	return sessions.find((s) => s.server === base && (s.tokens?.accessToken === token || s.aliases.includes(token))) || null;
};

export const siloSessionOfAccount = (server, accountId) => {
	const base = siloServerKey(server);
	return sessions.find((s) => s.server === base && s.accountId === accountId) || null;
};

// A new login replaces any earlier one of the same account, and drops its PIN proofs.
export const openSiloSession = (server, accountId, tokens) => {
	const base = siloServerKey(server);
	let session = siloSessionOfAccount(base, accountId);
	if (!session) {
		session = {server: base, accountId, aliases: [], proofs: {}, identity: 0, refreshing: null};
		sessions.push(session);
	}
	if (session.tokens?.accessToken && session.tokens.accessToken !== tokens.accessToken) {
		session.aliases = [session.tokens.accessToken, ...session.aliases].slice(0, KEPT_ALIASES);
	}
	session.tokens = tokens;
	session.proofs = {};
	session.identity++;
	persist();
	return session;
};

export const closeSiloSession = (session) => {
	const index = sessions.indexOf(session);
	if (index >= 0) sessions.splice(index, 1);
	session.tokens = null;
	session.proofs = {};
	session.identity++;
	persist();
};

// A PIN-locked profile's proof from verify-pin, until it runs out.
export const setProfileProof = (session, profileId, proof) => {
	if (!session) return;
	if (proof?.token) session.proofs[profileId] = proof;
	else delete session.proofs[profileId];
};

export const profileProof = (session, profileId, now = Date.now()) => {
	const proof = session?.proofs?.[profileId];
	if (!proof) return null;
	if (proof.expiresAt && proof.expiresAt <= now) {
		delete session.proofs[profileId];
		return null;
	}
	return proof.token;
};

const readBody = async (response) => {
	const text = await response.text();
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};

const send = async (url, {method = 'GET', headers, body, timeoutMs = DEFAULT_TIMEOUT_MS}) => {
	let response;
	try {
		response = await mediaServerQueue.run(() => corsFreeFetch(url, {
			method,
			headers: {Accept: 'application/json, application/problem+json', ...(body !== undefined ? {'Content-Type': 'application/json'} : null), ...headers},
			body: body !== undefined ? JSON.stringify(body) : undefined
		}, timeoutMs));
	} catch (err) {
		const typed = new Error(err.message);
		typed.connectionType = classifyError(err);
		throw typed;
	}
	const data = await readBody(response);
	if (!response.ok) {
		const err = siloError(response.status, data);
		// Silo says how long a rate limit (429) or a busy server (503) wants waited.
		err.retryAfter = response.headers?.get?.('retry-after') || null;
		throw err;
	}
	return {data, headers: response.headers, status: response.status};
};

// Only a 401 from the refresh ends the login. Any other failure says nothing about it, so the tokens stay.
const runRefresh = async (session, deviceInfo, platform) => {
	const current = session.tokens;
	const identity = session.identity;
	if (!current?.refreshToken) return false;
	try {
		const {data} = await send(`${session.server}/api/v2/auth/refresh`, {
			method: 'POST',
			headers: siloHeaders({deviceInfo, platform}),
			body: {refresh_token: current.refreshToken}
		});
		const next = tokensFrom(data);
		if (!next.accessToken || !next.refreshToken) return false;
		// A refresh that lost a race with a sign-out or a new login must not bring the old login back.
		if (session.identity !== identity || session.tokens !== current) return false;
		session.aliases = [current.accessToken, ...session.aliases.filter((t) => t !== current.accessToken)].slice(0, KEPT_ALIASES);
		session.tokens = next;
		persist();
		rotateListeners.forEach((listener) => listener(session, current.accessToken));
		return true;
	} catch (err) {
		if (err.status === 401 && session.identity === identity && session.tokens === current) {
			closeSiloSession(session);
			endListeners.forEach((listener) => listener(session));
		}
		return false;
	}
};

export const refreshSiloSession = (session, deviceInfo, platform) => {
	if (!session.refreshing) {
		session.refreshing = runRefresh(session, deviceInfo, platform).then((ok) => {
			session.refreshing = null;
			return ok;
		});
	}
	return session.refreshing;
};

/**
 * One request to Silo's /api/v2.
 *
 * - `session`: the login it acts for, or null for a public request.
 * - `profileId`: the household profile, left off with `profile: false` (the account-wide profile routes).
 * - `refresh: false`: never refreshed for or replayed (sign-in, PIN checks, device sign-in), since Silo counts those
 *   against rate limits.
 *
 * An access token close to expiry is refreshed first, and a 401 refreshes once and replays once. A request that waited
 * on a refresh while the login or profile changed isn't sent as whoever took over.
 */
export const siloRequest = async (server, path, {
	session = null, profileId = null, profile = true, refresh = true,
	method, query, body, headers, timeoutMs, deviceInfo, platform, raw = false
} = {}) => {
	const base = siloServerKey(server);
	const params = query ? Object.keys(query)
		.filter((key) => query[key] != null && query[key] !== '')
		.map((key) => [].concat(query[key]).map((v) => `${encodeURIComponent(key)}=${encodeURIComponent(v)}`).join('&'))
		.join('&') : '';
	const url = `${/^https?:/.test(path) ? path : base + path}${params ? (path.includes('?') ? '&' : '?') + params : ''}`;
	const identity = session?.identity;
	const headersNow = () => ({
		...headers,
		...siloHeaders({
			deviceInfo,
			platform,
			accessToken: session?.tokens?.accessToken,
			profileId: profile ? profileId : null,
			profileToken: profile && profileId ? profileProof(session, profileId) : null
		})
	});
	const changed = () => {
		const err = new Error('The Silo login or profile changed before this request was sent');
		err.status = 0;
		err.cancelled = true;
		return err;
	};

	if (session && refresh && needsRefresh(session.tokens)) {
		await refreshSiloSession(session, deviceInfo, platform);
		if (session.identity !== identity) throw changed();
	}
	if (session && !session.tokens) throw siloError(401, null);
	const sentToken = session?.tokens?.accessToken;
	try {
		const result = await send(url, {method, headers: headersNow(), body, timeoutMs});
		return raw ? result : result.data;
	} catch (err) {
		if (err.status !== 401 || !session || !refresh || session.identity !== identity) throw err;
		// Another request may already have refreshed while this one was out.
		const fresh = session.tokens?.accessToken && session.tokens.accessToken !== sentToken;
		if (!fresh && !(await refreshSiloSession(session, deviceInfo, platform))) throw err;
		if (session.identity !== identity) throw changed();
		const result = await send(url, {method, headers: headersNow(), body, timeoutMs});
		return raw ? result : result.data;
	}
};

// For tests.
export const resetSiloSessions = () => {
	sessions.length = 0;
	loaded = null;
	rotateListeners.clear();
	endListeners.clear();
};
