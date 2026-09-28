// Client for the Moonbase plugin retro-games (EmulatorJS) endpoints under /Moonfin/Games.
// JSON calls route through platformFetch (the webOS Let's-Encrypt TLS proxy) so metadata and
// the settings blob work on old webOS. A ROM is served as a direct server URL carrying the
// token in the query, which lets EmulatorJS stream the file instead of the app buffering it,
// and falls back to a Blob URL where that request does not get through. BIOS files and the
// binary save state always use native fetch and a Blob URL (the proxy is text-only), so they
// inherit the same old-webOS+LE limitation as video playback. Cores load from the
// trusted-cert CDN and work everywhere.

import {getServerUrl, getAuthHeader, getApiKey, getTokenParam, getServerType} from './jellyfinApi';
import {legacyAuthHeader} from '../utils/serverRoutes';
import {platformFetch} from './secureFetch';
import {fetchWithTimeout} from '../utils/fetchTimeout';

// A stable per-user id for the global settings blob (settings are not per game).
export const SETTINGS_ID = 'moonfin-global';

const base = () => (getServerUrl() || '').replace(/\/+$/, '');
const authHeaders = () => {
	const h = getAuthHeader();
	return {Authorization: h, ...legacyAuthHeader(getServerType(), h)};
};
const enc = encodeURIComponent;

const jsonRequest = async (path, {method = 'GET', body, timeout = 20000} = {}) => {
	const headers = {...authHeaders(), Accept: 'application/json'};
	if (body !== undefined) headers['Content-Type'] = 'application/json';
	const res = await platformFetch(`${base()}/Moonfin/Games/${path}`, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body)
	}, timeout);
	if (!res.ok) {
		const err = new Error(`Games API error: ${res.status}`);
		err.status = res.status;
		throw err;
	}
	if (res.status === 204) return null;
	const text = await res.text();
	return text ? JSON.parse(text) : null;
};

export const getLibraries = () => jsonRequest('Libraries');
export const getSystems = (libraryId) => jsonRequest(`${enc(libraryId)}/Systems`);
export const getGames = (libraryId, system) =>
	jsonRequest(`${enc(libraryId)}/Games${system ? `?system=${enc(system)}` : ''}`);
export const getGame = (libraryId, gameId) =>
	jsonRequest(`${enc(libraryId)}/Games/${enc(gameId)}`);
// Pins the current user's core for an arcade game and returns the game as it now plays.
export const setGameCoreOverride = (libraryId, gameId, core) =>
	jsonRequest(`${enc(libraryId)}/Games/${enc(gameId)}/Core`, {method: 'PUT', body: {core}});

// Image tags can't send auth headers, so the token rides in the query.
// kind defaults to boxart but also accepts snap or title.
export const gameThumbUrl = (libraryId, gameId, kind = 'boxart') => {
	if (!libraryId || !gameId) return null;
	const token = getApiKey();
	const auth = token ? `&${getTokenParam()}=${enc(token)}` : '';
	return `${base()}/Moonfin/Games/${enc(libraryId)}/Thumb/${enc(gameId)}?type=${enc(kind)}${auth}`;
};

// The largest ROM a TV will take. Buffering is what kills it, since the response, the Blob and
// the copy EmulatorJS keeps all sit in the WebView heap at once and past this the app is killed
// part-way through loading. Measured on a device rather than taken from a published limit, so
// it is deliberately conservative.
const MAX_ROM_BYTES = 48 * 1024 * 1024;

const romTooLarge = (bytes) => {
	const err = new Error('rom-too-large');
	err.romTooLarge = true;
	err.totalBytes = bytes;
	return err;
};

// Drops a response once its headers have been read, so nothing is left streaming a body that
// will never be used. Older WebViews have no res.body, hence the guard.
const discardBody = (res) => {
	try {
		if (res.body && res.body.cancel) res.body.cancel();
	} catch (e) { /* already closed */ }
};

// ROM / BIOS as a same-origin Blob URL, which avoids CORS since EmulatorJS fetches the blob
// directly. maxBytes refuses an oversized file before it is buffered, because the failure
// happens inside res.blob(), where the TV can take the whole app down with it.
const blobUrl = async (path, maxBytes) => {
	const res = await fetchWithTimeout(`${base()}/Moonfin/Games/${path}`, {
		headers: authHeaders()
	}, 60000);
	if (!res.ok) {
		const err = new Error(`ROM fetch error: ${res.status}`);
		err.status = res.status;
		throw err;
	}
	const expected = Number(res.headers.get('content-length')) || null;
	if (maxBytes && expected && expected > maxBytes) {
		discardBody(res);
		throw romTooLarge(expected);
	}
	const blob = await res.blob();
	return URL.createObjectURL(blob);
};

const getRomBlobUrl = (libraryId, gameId) =>
	blobUrl(`${enc(libraryId)}/Rom/${enc(gameId)}`, MAX_ROM_BYTES);
// A BIOS is a few hundred kilobytes at most, so there is nothing to refuse on size.
export const getBiosBlobUrl = (libraryId, biosId) =>
	blobUrl(`${enc(libraryId)}/Bios/${enc(biosId)}`);

// The ROM endpoint takes the token in the query, which is how EmulatorJS's own XHR
// authenticates. Null when there is no token to put there.
const romDirectUrl = (libraryId, gameId, fileName) => {
	const token = getApiKey();
	if (!token) return null;
	const name = fileName ? `/${enc(fileName)}` : '';
	return `${base()}/Moonfin/Games/${enc(libraryId)}/Rom/${enc(gameId)}${name}?${getTokenParam()}=${enc(token)}`;
};

// Asks for the first byte only. The endpoint streams with range processing on, so a 206 comes
// back carrying the full size in Content-Range and this costs one byte instead of the ROM.
const probeRom = async (url) => {
	try {
		const res = await fetchWithTimeout(url, {headers: {Range: 'bytes=0-0'}}, 15000);
		discardBody(res);
		if (res.status !== 206 && !res.ok) return {ok: false, totalBytes: null};
		const range = res.headers.get('content-range');
		const total = range && range.split('/')[1];
		// Content-Length on a 206 describes the one byte asked for, so it only stands in for the
		// size when the server ignored the range and answered with the whole file.
		const whole = res.status === 206 ? null : Number(res.headers.get('content-length'));
		return {ok: true, totalBytes: Number(total) || whole || null};
	} catch (e) {
		return {ok: false, totalBytes: null};
	}
};

// Returns {url, isBlob} for a game's ROM. The direct URL is preferred, because EmulatorJS then
// streams the file itself and no second copy passes through the app. The Blob URL covers the
// platforms where a plain fetch to the server does not get through, such as old webOS behind
// Let's Encrypt, and isBlob tells the caller whether it has a URL to revoke afterwards.
export const getRomUrl = async (libraryId, gameId, fileName) => {
	const direct = romDirectUrl(libraryId, gameId, fileName);
	const probe = direct ? await probeRom(direct) : {ok: false, totalBytes: null};
	if (probe.totalBytes && probe.totalBytes > MAX_ROM_BYTES) throw romTooLarge(probe.totalBytes);
	if (probe.ok) return {url: direct, isBlob: false};
	// A failed probe leaves the size unknown, so getRomBlobUrl applies the same ceiling from
	// Content-Length. Falling back must not mean skipping the check.
	return {url: await getRomBlobUrl(libraryId, gameId), isBlob: true};
};

// Where the server has EmulatorJS load its runtime and cores from: an admin's URL, its own copy,
// or the CDN. The anonymous player page carries the path it resolved, so it's read from there. A
// TV that can't reach that path directly, like old webOS behind Let's Encrypt, gets null and
// stays on the CDN. Resolved once per server.
let dataPathLookup = null;

const resolveDataPath = async (server) => {
	try {
		const page = `${server}/Moonfin/EmulatorJS/player.html`;
		const res = await platformFetch(page, {}, 10000);
		if (!res.ok) return null;
		const match = (await res.text()).match(/EJS_pathtodata\s*=\s*'([^']+)'/);
		if (!match) return null;
		const path = new URL(match[1], page).href;
		const probe = await fetchWithTimeout(`${path}loader.js`, {}, 10000);
		discardBody(probe);
		return probe.ok ? path : null;
	} catch (e) {
		return null;
	}
};

export const getEmulatorDataPath = () => {
	const server = base();
	if (!dataPathLookup || dataPathLookup.server !== server) {
		dataPathLookup = {server, path: resolveDataPath(server)};
	}
	return dataPathLookup.path;
};

// Null when there's no save (404). Any other failure throws, so a failed read is never
// mistaken for a missing save.
export const getStateBytes = async (saveId) => {
	const res = await fetchWithTimeout(
		`${base()}/Moonfin/Games/Saves/${enc(saveId)}?kind=state`,
		{headers: authHeaders()},
		30000
	);
	if (res.status === 404) return null;
	if (!res.ok) {
		const err = new Error(`Save fetch error: ${res.status}`);
		err.status = res.status;
		throw err;
	}
	const buf = await res.arrayBuffer();
	return buf && buf.byteLength ? new Uint8Array(buf) : null;
};

export const putStateBytes = async (saveId, bytes) => {
	const res = await fetchWithTimeout(`${base()}/Moonfin/Games/Saves/${enc(saveId)}?kind=state`, {
		method: 'PUT',
		headers: {...authHeaders(), 'Content-Type': 'application/octet-stream'},
		body: bytes
	}, 30000);
	if (!res.ok) {
		const err = new Error(`Save upload error: ${res.status}`);
		err.status = res.status;
		throw err;
	}
};

// Settings blob (the EmulatorJS `ejs-settings` JSON, text) synced per user via the proxy.
export const getSettingsBlob = async () => {
	try {
		const res = await platformFetch(
			`${base()}/Moonfin/Games/Saves/${enc(SETTINGS_ID)}?kind=settings`,
			{headers: authHeaders()},
			20000
		);
		if (!res.ok) return null;
		const text = await res.text();
		return text || null;
	} catch (e) {
		return null;
	}
};

export const putSettingsBlob = async (json) => {
	try {
		// Settings are text, so route through the proxy (works on old webOS+LE), matching getSettingsBlob.
		await platformFetch(`${base()}/Moonfin/Games/Saves/${enc(SETTINGS_ID)}?kind=settings`, {
			method: 'PUT',
			headers: {...authHeaders(), 'Content-Type': 'application/octet-stream'},
			body: json
		}, 20000);
	} catch (e) {
		// best-effort
	}
};
