// The sign in PIN the Moonfin plugin keeps for an account. The plugin holds a salted slow hash and
// counts wrong guesses itself, so a PIN set on one device holds on every other and clearing app
// data hands back no free guesses. Nothing here ever gets the hash back.
//
// Each call answers with one of the results below, and a locked answer carries how long to wait.

import {createApiForServer, getAuthHeaderFor} from './jellyfinApi';
import {platformFetch} from './secureFetch';
import {legacyAuthHeader} from '../utils/serverRoutes';

export const PIN_VALID = 'valid';
export const PIN_WRONG = 'wrong';
export const PIN_LOCKED = 'locked';
// The server holds no PIN for the account.
export const PIN_NONE = 'none';
// The server couldn't say: no plugin, an older one, a token it no longer takes, or no answer at all.
export const PIN_UNAVAILABLE = 'unavailable';

const TIMEOUT_MS = 15000;
const DEFAULT_RETRY_SECONDS = 30;

const unavailable = {result: PIN_UNAVAILABLE};

const request = async ({serverUrl, accessToken, serverType}, method, path, body) => {
	// Silo keeps its own profile PINs, and Moonbase for Silo has none of these routes.
	if (serverType === 'silo') return {status: 404, data: null};
	const auth = getAuthHeaderFor(serverType, accessToken);
	const headers = {Authorization: auth, ...legacyAuthHeader(serverType, auth)};
	if (body) headers['Content-Type'] = 'application/json';
	const res = await platformFetch(`${serverUrl}/Moonfin/${path}`, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined
	}, TIMEOUT_MS);
	let data = null;
	try {
		const text = await res.text();
		data = text ? JSON.parse(text) : null;
	} catch (e) { /* the status still answers */ }
	return {status: res.status, data, retryAfter: res.headers?.get?.('retry-after')};
};

const locked = ({data, retryAfter}) => {
	const seconds = Number.isInteger(data?.retryAfterSeconds) ? data.retryAfterSeconds : parseInt(retryAfter, 10);
	return {result: PIN_LOCKED, wait: (seconds >= 0 ? seconds : DEFAULT_RETRY_SECONDS) * 1000};
};

// Only the plugin answers with these messages. A server without it, or a proxy in front, answers
// the same statuses with something else.
const errorIs = (data, message) => data?.error === message;

const writeVerdict = (response) => {
	if (response.status === 200) return {result: PIN_VALID};
	if (response.status === 403 && errorIs(response.data, 'The current PIN is wrong')) return {result: PIN_WRONG};
	if (response.status === 429) return locked(response);
	return unavailable;
};

// On Silo the PIN is the household profile's own (`account.userId` is the profile).
const siloFor = (account) => (account?.serverType === 'silo'
	? createApiForServer(account.serverUrl, account.accessToken, account.userId, 'silo')
	: null);

// Whether the server keeps a PIN for the account: true, false, or null when it couldn't say.
export const getServerPinStatus = async (account) => {
	const silo = siloFor(account);
	if (silo) return silo.profileHasPin(account.userId).catch(() => null);
	try {
		const {status, data} = await request(account, 'GET', 'Pin');
		return status === 200 && typeof data?.enabled === 'boolean' ? data.enabled : null;
	} catch (e) {
		return null;
	}
};

export const verifyServerPin = async (account, pin) => {
	const silo = siloFor(account);
	if (silo) {
		try {
			return {result: await silo.verifyProfilePin(account.userId, pin) ? PIN_VALID : PIN_WRONG};
		} catch (e) {
			return e.status === 429 ? {result: PIN_LOCKED, wait: DEFAULT_RETRY_SECONDS * 1000} : unavailable;
		}
	}
	try {
		const response = await request(account, 'POST', 'Pin/Verify', {pin});
		if (response.status === 200 && typeof response.data?.valid === 'boolean') {
			return {result: response.data.valid ? PIN_VALID : PIN_WRONG};
		}
		if (response.status === 404 && errorIs(response.data, 'No PIN is set')) return {result: PIN_NONE};
		if (response.status === 429) return locked(response);
		return unavailable;
	} catch (e) {
		return unavailable;
	}
};

// On Silo a PIN already set is checked first (Silo itself doesn't ask for it), so a wrong one still counts as a guess.
const siloWrite = async (silo, profileId, pin, currentPin) => {
	try {
		if (currentPin && !(await silo.verifyProfilePin(profileId, currentPin))) return {result: PIN_WRONG};
		await silo.setProfilePin(profileId, pin);
		return {result: PIN_VALID};
	} catch (e) {
		return e.status === 429 ? {result: PIN_LOCKED, wait: DEFAULT_RETRY_SECONDS * 1000} : unavailable;
	}
};

// A PIN already on the server has to be named in currentPin, and a wrong one counts as a guess.
export const setServerPin = async (account, pin, currentPin) => {
	const silo = siloFor(account);
	if (silo) return siloWrite(silo, account.userId, pin, currentPin);
	try {
		return writeVerdict(await request(account, 'PUT', 'Pin', currentPin ? {pin, currentPin} : {pin}));
	} catch (e) {
		return unavailable;
	}
};

export const removeServerPin = async (account, currentPin) => {
	const silo = siloFor(account);
	if (silo) return siloWrite(silo, account.userId, null, currentPin);
	try {
		return writeVerdict(await request(account, 'DELETE', 'Pin', currentPin ? {currentPin} : {}));
	} catch (e) {
		return unavailable;
	}
};

// Clears any account's PIN without it, which the plugin only lets an administrator do.
export const removeServerPinFor = async (account, userId) => {
	const silo = siloFor(account);
	if (silo) return siloWrite(silo, userId, null, null);
	try {
		const {status} = await request(account, 'DELETE', `Users/${encodeURIComponent(userId)}/Pin`);
		return status === 200 ? {result: PIN_VALID} : unavailable;
	} catch (e) {
		return unavailable;
	}
};
