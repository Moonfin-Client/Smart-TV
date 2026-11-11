// Where a server's Moonbase routes start (append /Moonfin/...), and the headers that sign a request to them. Ported
// from Moonfin-Core's moonbase_endpoint.dart.
//
// Jellyfin and Emby serve Moonbase at the server root and take the MediaBrowser token. Silo serves it as a plugin
// (siloMoonbase.js) and takes Silo's own headers: the bearer token and the profile with its PIN proof. Plex uses the
// Moonbase for Plex companion (plexMoonbase.js), which takes the PMS token, never the plex.tv account token. Its
// endpoint carries the fetch to reach it with, since on Fire TV that goes through the shell like every Plex request.

import {createApiForServer, getServerUrl, getUserId} from './jellyfinApi';
import {loadSiloSessions, siloServerKey, siloSessionFor} from './siloSession';
import {findSiloMoonbase, knownSiloMoonbase} from './siloMoonbase';
import {findPlexMoonbase, knownPlexMoonbase} from './plexMoonbase';
import {corsFreeFetch} from './secureFetch';
import {isPlexServer} from '../utils/plexUrls';

export {knownPlexMoonbase, knownSiloMoonbase};

const trimSlash = (url) => String(url || '').replace(/\/+$/, '');

// Whether this token is a Silo login's. Synchronous, so it only knows sessions already loaded.
export const isSiloLogin = (serverUrl, token) => Boolean(token && siloSessionFor(siloServerKey(serverUrl), token));

/** The endpoint for this server and token, or null when it has no Moonbase to call. */
export const moonbaseEndpoint = async (serverUrl, token, serverType) => {
	if (!serverUrl || !token) return null;
	if (serverType === 'plex' || isPlexServer(serverUrl)) {
		const companion = await findPlexMoonbase(serverUrl, token);
		return companion ? {base: companion, headers: {'X-Plex-Token': token}, fetch: corsFreeFetch} : null;
	}
	await loadSiloSessions();
	if (!isSiloLogin(serverUrl, token)) {
		return {base: trimSlash(serverUrl), headers: {Authorization: `MediaBrowser Token="${token}"`}};
	}
	const sameServer = siloServerKey(getServerUrl()) === siloServerKey(serverUrl);
	const silo = createApiForServer(siloServerKey(serverUrl), token, sameServer ? getUserId() : null, 'silo');
	const base = await findSiloMoonbase(serverUrl, () => silo.getInstalledPlugins());
	if (!base) return null;
	const headers = await silo.requestHeaders();
	return headers ? {base, headers} : null;
};

// A Moonbase address loaded by URL (an icon or a picture), so it carries its credential in the query on Silo, whose
// plugin routes take token=, and on Plex. Jellyfin and Emby callers add their own.
export const moonbaseAssetUrl = (serverUrl, path, token) => {
	const plex = knownPlexMoonbase(serverUrl);
	if (plex) return `${plex}${path}${path.includes('?') ? '&' : '?'}X-Plex-Token=${encodeURIComponent(token || '')}`;
	const silo = knownSiloMoonbase(serverUrl);
	if (!silo) return `${trimSlash(serverUrl)}${path}`;
	return `${silo}${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token || '')}`;
};
