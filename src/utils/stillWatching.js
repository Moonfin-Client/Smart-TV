// How many episodes play back to back before the viewer gets asked whether they're
// still there. The counts match the other clients so a shared setting means the
// same thing everywhere.
const STILL_WATCHING_EPISODES = {
	disabled: 0,
	// The trailing underscores are the names the other clients serialize, so they
	// have to be carried exactly or the value won't survive a sync.
	short_: 2,
	medium: 3,
	long_: 5,
	veryLong: 8
};

const episodesBeforePrompt = (behavior) => STILL_WATCHING_EPISODES[behavior] ?? 0;

// Counts episodes that started themselves. Picking the next one by hand says the
// viewer is there, which is what the prompt was going to ask.
export const shouldAskStillWatching = (consecutive, behavior) => {
	const threshold = episodesBeforePrompt(behavior);
	return threshold > 0 && consecutive >= threshold;
};
