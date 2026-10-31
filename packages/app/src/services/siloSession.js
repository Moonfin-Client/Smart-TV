// Requests to Silo's native API. Silo signs a request in with a bearer token, picks the household profile from
// headers, and hands out a new refresh token every time it renews the pair.

import {buildQueryString} from '../utils/urlCompat';
import {classifyError} from '../utils/connectionErrors';
import {mediaServerQueue} from '../utils/requestQueue';
import {siloBase} from '../utils/siloUrls';
import {corsFreeFetch} from './secureFetch';

const SILO_API = '/api/v2';

const DEFAULT_TIMEOUT_MS = 15000;
const REFRESH_LEAD_MS = 60000;

const clamp = (value, max) => (value.length <= max ? value : value.substring(0, max));
const headerText = (value) => String(value == null ? '' : value).replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim() || 'Unknown';

// Silo turns a request down with a 422 when the device id holds anything but letters, digits and . _ : -
export const siloDeviceId = (raw) => {
	const kept = String(raw || '').replace(/[^A-Za-z0-9._:-]/g, '');
	return kept ? clamp(kept, 128) : null;
};

export const siloHeaders = ({deviceInfo = {}, accessToken, profileId, profileToken}) => {
	const headers = {};
	if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
	if (profileId) headers['X-Profile-Id'] = String(profileId);
	if (profileToken) headers['X-Profile-Token'] = profileToken;
	const deviceId = siloDeviceId(deviceInfo.deviceId);
	if (deviceId) headers['X-Silo-Device-Id'] = deviceId;
	headers['X-Silo-Device-Name'] = clamp(headerText(deviceInfo.deviceName), 120);
	if (deviceInfo.platform) headers['X-Silo-Device-Platform'] = clamp(headerText(deviceInfo.platform), 40);
	headers['X-Silo-Client'] = headerText(deviceInfo.appName);
	headers['X-Silo-Client-Version'] = headerText(deviceInfo.appVersion);
	return headers;
};

// The pair from a sign-in or refresh answer, with its expiry worked out from when it arrived.
export const siloTokens = (json, now = Date.now()) => {
	const seconds = typeof json?.expires_in === 'number' && json.expires_in > 0 ? json.expires_in : 0;
	return {
		accessToken: typeof json?.access_token === 'string' ? json.access_token : '',
		refreshToken: typeof json?.refresh_token === 'string' ? json.refresh_token : '',
		expiresAt: now + seconds * 1000,
		lifetimeMs: seconds * 1000
	};
};

// Renewed once four fifths of the token's life has gone, or with under a minute left.
export const needsRefresh = (tokens, now = Date.now()) => {
	if (!tokens?.refreshToken) return false;
	const remaining = tokens.expiresAt - now;
	return remaining <= REFRESH_LEAD_MS || remaining <= tokens.lifetimeMs * 0.2;
};

// Every household profile on an account shares its tokens, so every client made for that account reads and
// renews the same pair. Keeping a stale copy would send a refresh token Silo has already replaced.
const accounts = new Map();

export const siloAccount = (baseUrl, accountId) => {
	const key = `${siloBase(baseUrl)}|${accountId}`;
	if (!accounts.has(key)) accounts.set(key, {tokens: null, generation: 0, refreshing: null, onTokens: null, onEnded: null});
	return accounts.get(key);
};

// A new sign-in, a restored one or a sign-out. Requests still waiting on the old login are dropped.
export const setSiloTokens = (account, tokens) => {
	account.tokens = tokens || null;
	account.generation++;
};

const parse = (text) => {
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
};

// Silo's errors are problem documents, and the last part of their type is the code to act on, never the text.
const siloProblemCode = (problem) => {
	const type = typeof problem?.type === 'string' ? problem.type : '';
	return type ? type.split('/').filter(Boolean).pop() || type : null;
};

const retryAfterMs = (raw, now = Date.now()) => {
	if (raw == null || raw === '') return null;
	const seconds = Number(raw);
	if (Number.isFinite(seconds)) return Math.max(0, seconds) * 1000;
	const at = Date.parse(raw);
	return Number.isNaN(at) ? null : Math.max(0, at - now);
};

export const siloError = (status, body, retryAfter) => {
	const problem = body && typeof body === 'object' && (typeof body.type === 'string' || typeof body.title === 'string') ? body : null;
	const error = new Error(problem?.detail || problem?.title || `Silo error ${status}`);
	error.status = status;
	error.code = siloProblemCode(problem);
	error.problem = problem;
	const wait = retryAfterMs(retryAfter);
	if (wait != null) error.retryAfterMs = wait;
	error.connectionType = classifyError(error);
	return error;
};

const identityChanged = () => Object.assign(new Error('The Silo login changed before this request went out'), {status: 0, cancelled: true});

export const createSiloRequest = ({getBaseUrl, getAccount, getProfile, getDeviceInfo}) => {
	const send = async (path, {method, query, body, headers, timeoutMs}) => {
		const params = query ? buildQueryString(query) : '';
		const target = `${siloBase(getBaseUrl())}${SILO_API}${path}`;
		const url = params ? `${target}?${params}` : target;
		const init = {method, headers: {Accept: 'application/json', ...headers}};
		if (body !== undefined) {
			init.body = JSON.stringify(body);
			init.headers['Content-Type'] = 'application/json';
		}
		try {
			return await mediaServerQueue.run(() => corsFreeFetch(url, init, timeoutMs));
		} catch (err) {
			const typed = new Error(err.message);
			typed.connectionType = classifyError(err);
			throw typed;
		}
	};

	const renew = async (account) => {
		const current = account.tokens;
		const generation = account.generation;
		if (!current?.refreshToken) return false;
		let response;
		try {
			response = await send('/auth/refresh', {
				method: 'POST',
				body: {refresh_token: current.refreshToken},
				headers: siloHeaders({deviceInfo: getDeviceInfo()}),
				timeoutMs: DEFAULT_TIMEOUT_MS
			});
		} catch {
			return false;
		}
		// A refresh that lost a race with a sign-out or a new sign-in mustn't bring the old login back.
		if (account.generation !== generation || account.tokens !== current) return false;
		// Only a refused refresh token ends the login. Anything else says nothing about whether it still holds.
		if (response.status === 401) {
			setSiloTokens(account, null);
			try {
				account.onEnded?.();
			} catch {
				// The login is over either way.
			}
			return false;
		}
		if (!response.ok) return false;
		const next = siloTokens(parse(await response.text()));
		if (!next.accessToken || !next.refreshToken) return false;
		account.tokens = next;
		try {
			account.onTokens?.(next);
		} catch {
			// Saving failed, so the stored pair is the old one and the next start signs in again.
		}
		return true;
	};

	const refresh = (account) => {
		if (!account.refreshing) account.refreshing = renew(account).finally(() => { account.refreshing = null; });
		return account.refreshing;
	};

	// noAuth for sign-in and refresh, noProfile for the account-wide profile routes, and noRefresh for the calls
	// Silo says mustn't be retried, like a sign-in or a PIN check.
	const request = async (path, {method = 'GET', query, body, noAuth = false, noProfile = false, noRefresh = false, timeoutMs = DEFAULT_TIMEOUT_MS} = {}) => {
		const account = noAuth ? null : getAccount?.();
		const generation = account?.generation;
		const changed = () => account && account.generation !== generation;
		if (account && !noRefresh && needsRefresh(account.tokens)) {
			await refresh(account);
			if (changed()) throw identityChanged();
		}
		const profile = noProfile ? null : getProfile?.();
		const attempt = async () => {
			const token = account?.tokens?.accessToken || null;
			const headers = siloHeaders({deviceInfo: getDeviceInfo(), accessToken: token, profileId: profile?.id, profileToken: profile?.token});
			return {token, response: await send(path, {method, query, body, headers, timeoutMs})};
		};
		const sent = await attempt();
		let response = sent.response;
		// An expired token, a changed role and a lost session all come back as 401, and a refresh tells them apart.
		if (response.status === 401 && sent.token && !noRefresh && account?.tokens?.refreshToken && !changed()) {
			const renewed = (account.tokens.accessToken !== sent.token) || await refresh(account);
			if (renewed && !changed()) response = (await attempt()).response;
		}
		if (!response.ok) {
			const text = await response.text().catch(() => '');
			throw siloError(response.status, parse(text), response.headers?.get?.('retry-after'));
		}
		return parse(await response.text());
	};

	return {request};
};
