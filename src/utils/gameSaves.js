// Save-state keys shared with Moonfin Core, so a state saved on one client resumes on the other.

import * as gamesApi from '../services/gamesApi';
import {getServerUrl, getUserId} from '../services/jellyfinApi';

// A state from one core can't be loaded by another, so each core keeps its own.
export const gameStateKey = (gameId, core) => `ejs-${core || ''}-${gameId}`;

// Saves used to be keyed by the bare game id. One found there is copied to the new key, best
// effort, since the old bytes still load if the copy fails. A failed read throws instead of
// reading as no save, otherwise a blip on the new key would copy a stale save over it.
export const loadGameStateWithMigration = async (gameId, core) => {
	const newKey = gameStateKey(gameId, core);
	const current = await gamesApi.getStateBytes(newKey);
	if (current) return current;

	const legacy = await gamesApi.getStateBytes(gameId);
	if (legacy) await gamesApi.putStateBytes(newKey, legacy).catch(() => {});
	return legacy;
};

// A battery save that didn't reach the server waits here until the next launch. It's kept per
// server and user, since game ids like romm-12 repeat across servers.
const pendingSramKey = (gameId) => `moonfin_pending_sram|${getServerUrl() || ''}|${getUserId() || ''}|${gameId}`;

const readPendingSram = (gameId) => {
	try {
		const b64 = window.localStorage.getItem(pendingSramKey(gameId));
		if (!b64) return null;
		const binary = window.atob(b64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		return bytes;
	} catch (e) {
		return null;
	}
};

const writePendingSram = (gameId, bytes) => {
	try {
		let binary = '';
		for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
		window.localStorage.setItem(pendingSramKey(gameId), window.btoa(binary));
	} catch (e) { /* storage full or unavailable */ }
};

const clearPendingSram = (gameId) => {
	try { window.localStorage.removeItem(pendingSramKey(gameId)); } catch (e) {}
};

// Uploads the battery save, keeping it for the next launch when the upload fails. Never throws.
export const saveSram = async (gameId, bytes) => {
	if (!bytes || !bytes.length) return;
	try {
		await gamesApi.putSram(gameId, bytes);
		clearPendingSram(gameId);
	} catch (e) {
		writePendingSram(gameId, bytes);
	}
};

// The battery save to start the game with, or null. One left over from a failed upload is newer
// than the server's, so it's sent up again and used instead of downloading. Never throws.
export const loadSram = async (gameId) => {
	const pending = readPendingSram(gameId);
	if (pending) {
		await saveSram(gameId, pending);
		return pending;
	}
	return gamesApi.getSram(gameId).catch(() => null);
};
