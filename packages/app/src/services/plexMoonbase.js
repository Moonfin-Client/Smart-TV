// Where Moonbase for Plex answers for each Plex server. Plex can't run plugins, so Moonbase is a companion service: at
// the address set for the server under Settings Sync, or else next to the Plex server (plexMoonbaseUrl). It's only used
// once its ping says it's installed.

import {getAllServers, updateServer} from './multiServerManager';
import {corsFreeFetch} from './secureFetch';
import {plexMoonbaseUrl, trimSlash} from '../utils/plexUrls';
import {sharePending} from '../utils/sharePending';

// Sign-in waits on the ping, and most Plex servers have no companion.
const DEFAULT_PING_TIMEOUT_MS = 3000;
const SET_PING_TIMEOUT_MS = 10000;
// A server whose companion didn't answer, reachable or not, isn't asked again for this long.
const MISSING_RETRY_MS = 5 * 60 * 1000;

const found = {};
const missingAt = {};

// The address as typed, without a trailing slash, and over http when no scheme is given.
export const normalizeMoonbaseAddress = (value) => {
	const address = String(value || '').trim().replace(/\/+$/, '');
	if (!address) return '';
	return address.includes('://') ? address : `http://${address}`;
};

/** The Moonbase address set for this saved server, or '' to look next to the Plex server. */
export const getPlexMoonbaseAddress = async (serverId) => ((await getAllServers())[serverId]?.moonbaseAddress) || '';

export const setPlexMoonbaseAddress = (serverId, value) => updateServer(serverId, {moonbaseAddress: normalizeMoonbaseAddress(value)});

const addressSetFor = async (server) => {
	const saved = Object.values(await getAllServers()).find((entry) => trimSlash(entry?.url) === server);
	return normalizeMoonbaseAddress(saved?.moonbaseAddress);
};

const answersPing = async (base, token, timeoutMs) => {
	try {
		const response = await corsFreeFetch(`${base}/Moonfin/Ping`, {headers: {Accept: 'application/json', 'X-Plex-Token': token}}, timeoutMs);
		// Something else on that port can answer too, so the reply has to say Moonbase is there.
		return response.ok && (await response.json())?.installed === true;
	} catch {
		return false;
	}
};

const discover = sharePending((server, token) => `${server}|${token}`, async (server, token) => {
	const typed = await addressSetFor(server).catch(() => '');
	const base = typed || plexMoonbaseUrl(server);
	if (base && await answersPing(base, token, typed ? SET_PING_TIMEOUT_MS : DEFAULT_PING_TIMEOUT_MS)) {
		found[server] = base;
		delete missingAt[server];
		return base;
	}
	missingAt[server] = Date.now();
	return null;
});

/** Moonbase for Plex's base for this Plex server, signed with its PMS token, or null when there's none. */
export const findPlexMoonbase = async (serverUrl, token) => {
	const server = trimSlash(serverUrl);
	if (!server || !token) return null;
	if (found[server]) return found[server];
	if (missingAt[server] && Date.now() - missingAt[server] < MISSING_RETRY_MS) return null;
	return discover(server, token);
};

// The companion already found, for addresses built without waiting (images, a game's ROM), or null until a request finds it.
export const knownPlexMoonbase = (serverUrl) => found[trimSlash(serverUrl)] || null;

// The companion found for the server, or the address next to it until one is.
export const plexMoonbaseBase = (serverUrl) => knownPlexMoonbase(serverUrl) || plexMoonbaseUrl(serverUrl);

// For a changed address, or a Refresh: the next call looks for the companion again.
export const forgetPlexMoonbase = (serverUrl) => {
	const server = trimSlash(serverUrl);
	delete found[server];
	delete missingAt[server];
};
