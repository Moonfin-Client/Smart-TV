// Where Moonbase for Silo is installed on each Silo server: a plugin under its installation id, found by plugin id in
// /api/v2/settings/plugins and served at /api/v2/plugin-content/plugins/<id>.

import {siloServerKey} from './siloSession';

export const SILO_MOONBASE_PLUGIN_ID = 'moonfin.moonbase';
// A Silo that answered without Moonbase isn't asked again for this long.
const MISSING_RETRY_MS = 5 * 60 * 1000;

const installations = {};
const missingAt = {};

/** Moonbase's base on this server, or null when it has none. `listPlugins` reads /api/v2/settings/plugins. */
export const findSiloMoonbase = async (serverUrl, listPlugins) => {
	const base = siloServerKey(serverUrl);
	if (installations[base]) return installations[base];
	if (missingAt[base] && Date.now() - missingAt[base] < MISSING_RETRY_MS) return null;
	let answer;
	try {
		answer = await listPlugins();
	} catch {
		// Unreachable isn't the same as not installed: asked again next time.
		return null;
	}
	const found = (answer?.items || []).find((p) => p?.plugin_id === SILO_MOONBASE_PLUGIN_ID && p.id != null && String(p.id));
	if (!found) {
		missingAt[base] = Date.now();
		return null;
	}
	delete missingAt[base];
	installations[base] = `${base}/api/v2/plugin-content/plugins/${encodeURIComponent(found.id)}`;
	return installations[base];
};

// The base already found, for addresses built without waiting (images); null until a request has found it.
export const knownSiloMoonbase = (serverUrl) => installations[siloServerKey(serverUrl)] || null;

// For a Moonbase that answered 404 (removed, or reinstalled under a new id): the next call looks it up again.
export const forgetSiloMoonbase = (serverUrl) => {
	const base = siloServerKey(serverUrl);
	delete installations[base];
	delete missingAt[base];
};
