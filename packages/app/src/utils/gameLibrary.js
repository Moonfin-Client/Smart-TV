// Recognizes a retro-game (ROM) library.
//
// The Moonbase plugin decides which libraries these are: an admin can pick any library, and
// the plugin exposes the resulting list at /Moonfin/Games/Libraries. That list is the
// authority, so it gets cached here and every entry point reads from it. Until it has loaded,
// or on a server without the plugin, we fall back to the plugin's own auto-detect, which
// matches a Mixed Content library by name.

import * as gamesApi from '../services/gamesApi';

const GAME_NAME = /game|rom|emulat/i;

const registry = new Map();
let registryLoaded = false;
let inFlightRefresh = null;

// Two schemas meet in this file. Plugin responses under /Moonfin/Games use
// camelCase fields (id, name), while the user-view libraries the rest of the
// app passes in come from /Users/{id}/Views and are PascalCase (Id, Name).
// The registry holds plugin objects, so reads from it are camelCase.

// Concurrent callers share one request rather than each hitting the server. A failed refresh
// keeps whatever was already cached so routing stays stable.
export const refreshGameLibraries = () => {
	if (inFlightRefresh) return inFlightRefresh;
	inFlightRefresh = gamesApi.getLibraries()
		.then((libs) => {
			registry.clear();
			(libs || []).forEach((lib) => {
				if (lib?.id) registry.set(String(lib.id), lib);
			});
			// A response with entries the registry couldn't read means the wire
			// shape wasn't understood. Leave the name fallback in charge rather
			// than locking every library to a not-a-game-library answer.
			registryLoaded = (libs || []).length === 0 || registry.size > 0;
		})
		.catch(() => {})
		.then(() => { inFlightRefresh = null; });
	return inFlightRefresh;
};

export const resetGameLibraries = () => {
	registry.clear();
	registryLoaded = false;
	inFlightRefresh = null;
};

const sameName = (a, b) =>
	Boolean(a) && Boolean(b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

// The plugin reports the virtual folder id when it auto-detects, while the client only ever
// sees user-view ids, so a library can be in the list under an id the caller has never seen.
// Falling back to the name is what bridges the two.
const findLibrary = (id, name) => {
	if (id && registry.has(String(id))) return registry.get(String(id));
	return [...registry.values()].find((lib) => sameName(lib.name, name));
};

const looksLikeGameLibrary = (collectionType, name) => {
	if (!name) return false;
	const ct = (collectionType || '').toLowerCase();
	if (ct && ct !== 'mixed' && ct !== 'unknown') return false;
	return GAME_NAME.test(name);
};

export const isGameLibrary = (id, collectionType, name) => (registryLoaded
	? Boolean(findLibrary(id, name))
	: looksLikeGameLibrary(collectionType, name));

// The id the plugin answers to for a library the caller got from /Users/{id}/Views. Every
// /Moonfin/Games call matches on the plugin's id, not the view's.
export const resolveGameLibraryId = (library) => {
	const id = library?.Id;
	if (!registryLoaded) return id;
	const match = findLibrary(id, library?.Name);
	return match ? match.id : id;
};
