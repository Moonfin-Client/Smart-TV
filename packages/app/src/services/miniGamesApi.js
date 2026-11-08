// After Hours scores. The Moonfin plugin keeps a top 3 per game under /Moonfin/MiniGames, one row per
// user holding their best, with the user taken from the token. The device keeps its own top 3 of
// every run as well, which is what the arcade shows when the plugin isn't there or a call fails.

import {isPlexServer, plexMoonbaseUrl} from '../utils/plexUrls';
import {getApiKey, getServerUrl} from './jellyfinApi';
import {moonbaseEndpoint} from './moonbaseEndpoint';
import {platformFetch} from './secureFetch';
import {getFromStorage, saveToStorage} from './storage';

const TIMEOUT_MS = 8000;
const DEVICE_KEY = 'afterHoursScores';

const call = async (gameId, init) => {
	const server = getServerUrl();
	const endpoint = await moonbaseEndpoint(isPlexServer(server) ? plexMoonbaseUrl(server) : server, getApiKey());
	if (!endpoint) throw new Error('No Moonbase');
	const headers = {...endpoint.headers, Accept: 'application/json'};
	if (init.body) headers['Content-Type'] = 'application/json';
	const res = await platformFetch(`${endpoint.base}/Moonfin/MiniGames/${encodeURIComponent(gameId)}/Scores`, {...init, headers}, TIMEOUT_MS);
	if (!res.ok) throw new Error(`MiniGames ${res.status}`);
	const text = await res.text();
	return text ? JSON.parse(text) : null;
};

// Anything that isn't a row with a name and a whole score is dropped.
export const parseBoard = (data) => (Array.isArray(data) ? data : [])
	.filter((row) => row && typeof row.userName === 'string' && Number.isInteger(row.score))
	.slice(0, 3);

/** The server's top 3 for a game, best first. Throws when the server can't answer. */
export const fetchBoard = async (gameId) => parseBoard(await call(gameId, {method: 'GET'}));

/** Posts a finished run and returns its place on the board, or null when it missed. Throws on failure. */
export const postScore = async (gameId, score) => {
	const body = await call(gameId, {method: 'POST', body: JSON.stringify({score})});
	return body && Number.isInteger(body.rank) ? body.rank : null;
};

export const loadDeviceBoards = async () => {
	try {
		const stored = await getFromStorage(DEVICE_KEY);
		return stored && typeof stored === 'object' ? stored : {};
	} catch {
		return {};
	}
};

// Puts a run into a device board. Ties go to the earlier run, so a new one only passes a strictly lower score.
export const placeRun = (board, run) => {
	const list = (board || []).slice();
	let at = list.findIndex((row) => run.score > row.score);
	if (at < 0) at = list.length;
	if (at >= 3) return {list: list.slice(0, 3), rank: null};
	list.splice(at, 0, run);
	return {list: list.slice(0, 3), rank: at + 1};
};

export const recordDeviceRun = async (gameId, run) => {
	const boards = await loadDeviceBoards();
	const placed = placeRun(boards[gameId], run);
	if (placed.rank) saveToStorage(DEVICE_KEY, {...boards, [gameId]: placed.list});
	return placed;
};
