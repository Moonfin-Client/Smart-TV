// Save-state keys shared with Moonfin Core, so a state saved on one client resumes on the other.

import * as gamesApi from '../services/gamesApi';

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
