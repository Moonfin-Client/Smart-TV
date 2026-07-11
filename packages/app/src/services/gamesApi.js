// Client for the Moonbase plugin retro-games (EmulatorJS) endpoints under /Moonfin/Games.
// JSON calls route through platformFetch (the webOS Let's-Encrypt TLS proxy) so metadata and
// the settings blob work on old webOS. ROM/BIOS and the binary save state use native fetch and
// a Blob URL (the proxy is text-only), so they inherit the same old-webOS+LE limitation as
// video playback; cores are loaded from the trusted-cert CDN and work everywhere.

import {getServerUrl, getAuthHeader} from './jellyfinApi';
import {platformFetch} from './secureFetch';
import {fetchWithTimeout} from '../utils/fetchTimeout';

// A stable per-user id for the global settings blob (settings are not per game).
export const SETTINGS_ID = 'moonfin-global';

const base = () => (getServerUrl() || '').replace(/\/+$/, '');
const authHeaders = () => {
	const h = getAuthHeader();
	return {Authorization: h, 'X-Emby-Authorization': h};
};
const enc = encodeURIComponent;

const jsonRequest = async (path, {method = 'GET', timeout = 20000} = {}) => {
	const res = await platformFetch(`${base()}/Moonfin/Games/${path}`, {
		method,
		headers: {...authHeaders(), Accept: 'application/json'}
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

// ROM / BIOS as a same-origin Blob URL (avoids CORS; EmulatorJS fetches the blob directly).
const blobUrl = async (path) => {
	const res = await fetchWithTimeout(`${base()}/Moonfin/Games/${path}`, {
		headers: authHeaders()
	}, 60000);
	if (!res.ok) {
		const err = new Error(`ROM fetch error: ${res.status}`);
		err.status = res.status;
		throw err;
	}
	const blob = await res.blob();
	return URL.createObjectURL(blob);
};

export const getRomBlobUrl = (libraryId, gameId) =>
	blobUrl(`${enc(libraryId)}/Rom/${enc(gameId)}`);
export const getBiosBlobUrl = (libraryId, biosId) =>
	blobUrl(`${enc(libraryId)}/Bios/${enc(biosId)}`);

// Save state (binary) keyed per game. Returns null when none exists (404).
export const getStateBytes = async (gameId) => {
	try {
		const res = await fetchWithTimeout(
			`${base()}/Moonfin/Games/Saves/${enc(gameId)}?kind=state`,
			{headers: authHeaders()},
			30000
		);
		if (res.status === 404) return null;
		if (!res.ok) return null;
		const buf = await res.arrayBuffer();
		return buf && buf.byteLength ? new Uint8Array(buf) : null;
	} catch (e) {
		return null;
	}
};

export const putStateBytes = async (gameId, bytes) => {
	await fetchWithTimeout(`${base()}/Moonfin/Games/Saves/${enc(gameId)}?kind=state`, {
		method: 'PUT',
		headers: {...authHeaders(), 'Content-Type': 'application/octet-stream'},
		body: bytes
	}, 30000);
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
