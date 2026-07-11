// Recognizes a retro-game (ROM) library the same way the Moonbase plugin auto-detects one:
// a Mixed Content library (empty/unknown collection type) whose name mentions games/roms.
const NAME = /game|rom|emulat/i;

export const isGameLibrary = (collectionType, name) => {
	if (!name) return false;
	const ct = (collectionType || '').toLowerCase();
	if (ct && ct !== 'mixed' && ct !== 'unknown') return false;
	return NAME.test(name);
};
