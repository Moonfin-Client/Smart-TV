import {shouldResumeTarget} from './episodePlayTarget';

// A collection holds whatever was put in it, and only the video items can be handed
// straight to the player. A series in there opens rather than plays, so it stays out of
// the queue instead of stopping the run when it comes around.
const PLAYABLE_TYPES = ['Movie', 'Video', 'Episode', 'MusicVideo'];

export const collectionQueue = (items) =>
	(Array.isArray(items) ? items : []).filter((entry) => entry && entry.Id && PLAYABLE_TYPES.indexOf(entry.Type) !== -1);

// Where a Play press on the collection starts. One left part way through carries on,
// otherwise the first unwatched, so a run through a set of films picks up where it was.
// A collection watched all the way through starts again from the top.
export const collectionPlayTarget = (queue) => {
	if (!queue.length) return null;
	return queue.find(shouldResumeTarget) ||
		queue.find((entry) => !entry.UserData || !entry.UserData.Played) ||
		queue[0];
};
