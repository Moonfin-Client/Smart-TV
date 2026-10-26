// plex.tv sign in, the account's servers, and finding where a Plex server answers.

import {corsFreeFetch, platformFetch} from './secureFetch';
import {getDeviceInfo} from './jellyfinApi';
import {plexIdentity} from './plexApi';
import {plexVersion} from './plexMapper';
import {buildQueryString} from '../utils/urlCompat';
import {normalizeServerBaseUrl} from '../utils/serverUrl';

const PLEX_TV = 'https://plex.tv';
const REQUEST_TIMEOUT_MS = 15000;
const PROBE_TIMEOUT_MS = 4000;

// Plex takes its identity as query parameters too, which keeps a device name out of the headers.
const identity = () => ({...plexIdentity(getDeviceInfo()), 'X-Plex-Platform': 'Generic'});

const plexTvRequest = async (url, {method = 'GET', token, query, form, timeoutMs = REQUEST_TIMEOUT_MS} = {}) => {
	const params = buildQueryString({...identity(), ...query, 'X-Plex-Token': token});
	const response = await platformFetch(`${url}?${params}`, {
		method,
		headers: {
			Accept: 'application/json',
			...(form ? {'Content-Type': 'application/x-www-form-urlencoded'} : null)
		},
		body: form ? buildQueryString(form) : undefined
	}, timeoutMs);
	const text = await response.text();
	let data = null;
	try {
		data = text ? JSON.parse(text) : null;
	} catch {
		// plex.tv answers some failures with a plain page.
	}
	if (!response.ok) {
		const error = new Error(data?.errors?.[0]?.message || `plex.tv error ${response.status}`);
		error.status = response.status;
		error.plexCode = data?.errors?.[0]?.code;
		throw error;
	}
	return data;
};

// plex.tv/link fills in the code from the pin parameter.
export const plexLinkUrl = (code) => `https://plex.tv/link/?pin=${encodeURIComponent(code)}`;

// Counted from expiresIn, so a wrong TV clock can't expire every code as soon as it arrives.
export const createPin = async () => {
	const pin = await plexTvRequest(`${PLEX_TV}/api/v2/pins`, {method: 'POST'});
	return {id: pin.id, code: pin.code, expiresAt: Date.now() + pin.expiresIn * 1000};
};

// The account token once the user approves the code, else null.
export const checkPin = async (pinId) => (await plexTvRequest(`${PLEX_TV}/api/v2/pins/${pinId}`))?.authToken || null;

// The verification code is the account's two step code, when it has one.
export const signIn = async (login, password, code) => (await plexTvRequest(`${PLEX_TV}/api/v2/users/signin`, {
	method: 'POST',
	form: {login, password, rememberMe: true, verificationCode: code || undefined}
})).authToken;

export const needsVerificationCode = (error) => error?.plexCode === 1029;
const isWrongPin = (error) => error?.plexCode === 1041;

// The account's uuid, which is also the key to its public avatar, and its display name.
export const getAccount = async (token) => {
	const user = await plexTvRequest(`${PLEX_TV}/api/v2/user`, {token});
	return {id: user.uuid, name: user.title || user.username};
};

export const getHomeUsers = async (token) => ((await plexTvRequest(`${PLEX_TV}/api/v2/home/users`, {token}))?.users || [])
	.filter((user) => typeof user?.uuid === 'string' && typeof user.title === 'string')
	.map((user) => ({id: user.uuid, name: user.title, hasPin: user.protected === true}));

// The Home member's plex.tv token, or null when the PIN is wrong.
export const switchHomeUser = async (token, userId, pin) => {
	try {
		return (await plexTvRequest(`${PLEX_TV}/api/v2/home/users/${userId}/switch`, {
			method: 'POST',
			token,
			query: {pin: pin || undefined}
		})).authToken;
	} catch (error) {
		if (isWrongPin(error)) return null;
		throw error;
	}
};

const connectionRank = (c) => {
	if (c.relay === true) return 2;
	return c.local === true ? 0 : 1;
};

// Best first: local, then remote, relay last. Some routers block plex.direct names because they point at
// private IPs, so each local one is followed by its plain address.
const serverFromResource = (resource) => {
	const plainAllowed = resource.httpsRequired !== true;
	const connections = [];
	(resource.connections || [])
		.filter((c) => c && typeof c.uri === 'string')
		.sort((a, b) => connectionRank(a) - connectionRank(b))
		.forEach((c) => {
			connections.push(c.uri);
			if (plainAllowed && c.local === true && c.relay !== true && c.uri.startsWith('https:') && typeof c.address === 'string') {
				connections.push(`http://${c.address}:${c.port}`);
			}
		});
	return {
		id: resource.clientIdentifier || '',
		name: resource.name || '',
		version: plexVersion(resource.productVersion) || '',
		accessToken: resource.accessToken || '',
		connections
	};
};

export const getServers = async (token) => {
	const resources = await plexTvRequest('https://clients.plex.tv/api/v2/resources', {
		token,
		query: {includeHttps: 1, includeRelay: 1}
	});
	return (Array.isArray(resources) ? resources : [])
		.filter((r) => String(r?.provides || '').includes('server'))
		.map(serverFromResource);
};

// Asked outside the request queue, since a server can list a dozen addresses and a dead one would hold a slot for its whole timeout.
const machineIdAt = async (uri) => {
	try {
		const response = await corsFreeFetch(`${uri}/identity`, {headers: {Accept: 'application/json'}}, PROBE_TIMEOUT_MS);
		if (!response.ok) return null;
		return (await response.json())?.MediaContainer?.machineIdentifier || null;
	} catch {
		return null;
	}
};

// The first of the uris, in their order, that answers. They're all tried at once, and after one answers, the ones ahead of it
// only get a moment more, so an address that never answers, like a container's, doesn't hold things up for its whole timeout.
export const firstAnswering = (uris, answers, graceMs = 1000) => new Promise((resolve) => {
	const results = uris.map(() => null);
	let graceTimer = null;
	let settled = false;
	const finish = () => {
		if (settled) return;
		const firstOpen = results.findIndex((r) => r !== true && r !== false);
		const firstYes = results.indexOf(true);
		if (firstYes >= 0 && (firstOpen < 0 || firstOpen > firstYes)) {
			settled = true;
			clearTimeout(graceTimer);
			resolve(uris[firstYes]);
		} else if (firstOpen < 0) {
			settled = true;
			clearTimeout(graceTimer);
			resolve(null);
		}
	};
	if (!uris.length) resolve(null);
	uris.forEach((uri, i) => {
		Promise.resolve(answers(uri)).catch(() => false).then((ok) => {
			results[i] = ok === true;
			if (ok === true && !graceTimer) {
				graceTimer = setTimeout(() => {
					for (let j = 0; j < results.length; j++) {
						if (results[j] === null) results[j] = false;
					}
					finish();
				}, graceMs);
			}
			finish();
		});
	});
});

export const findReachableUri = (uris, machineId) =>
	firstAnswering(uris, async (uri) => (await machineIdAt(uri)) === machineId);

// The addresses to look for a Plex server at for a typed one. Plex's own port goes first when none was typed,
// and a bare address means http, since a LAN IP has no certificate to match.
export const plexAddressCandidates = (address) => {
	const raw = String(address || '').trim();
	const typed = normalizeServerBaseUrl(raw.includes('://') ? raw : `http://${raw}`);
	const match = /^(https?):\/\/(\[[^\]]+\]|[^/:]+)(:\d+)?(.*)$/i.exec(typed);
	if (!match) return [];
	return match[3] ? [typed] : [`${match[1]}://${match[2]}:32400${match[4]}`, typed];
};

// Where a Plex server answers at a typed address, or null when nothing there is one.
export const findServerAt = async (address) => {
	const candidates = plexAddressCandidates(address);
	const ids = await Promise.all(candidates.map(machineIdAt));
	const index = ids.findIndex(Boolean);
	return index < 0 ? null : {uri: candidates[index], machineId: ids[index]};
};

const ADDRESS_WAIT_MS = 2000;

// The best address a saved Plex server answers at right now. An address that never answers would hold startup for the whole
// probe, so the saved one is used past a short wait, while the probe carries on and saves a better one for next time.
export const bestPlexAddress = (entry, save) => {
	const candidates = entry?.candidateAddresses;
	if (!Array.isArray(candidates) || candidates.length < 2 || !entry.machineId) return Promise.resolve(entry?.url);
	const probe = findReachableUri(candidates, entry.machineId).then((best) => {
		if (best && best !== entry.url) Promise.resolve(save(best)).catch(() => {});
		return best || entry.url;
	});
	return Promise.race([probe, new Promise((resolve) => setTimeout(() => resolve(entry.url), ADDRESS_WAIT_MS))]);
};
