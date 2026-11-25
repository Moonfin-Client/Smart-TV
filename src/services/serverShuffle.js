// A shuffle the server runs (Silo's), as a video queue that grows one item at a time. The server's current item stays
// the one playing, so its order carries on in the server's own apps and on other devices. One shuffle is followed at a
// time, and starting another replaces it.

let active = null;

// Each item a shuffle hands out carries its id, so an item queued some other way (picked from the episode browser) never
// moves a shuffle on, nor does an old shuffle's item once another has started.
const tagged = (shuffleId, item) => ({...item, _serverShuffle: shuffleId});

/** The server's shuffle of `item` as its first items, or null when the server doesn't shuffle it itself. */
export const startServerShuffle = async (api, item) => {
	if (!api?.canShuffle || !(await api.canShuffle(item))) return null;
	const shuffle = await api.startShuffle(item);
	active = {api, id: shuffle.id, currentId: shuffle.current.Id, nextId: shuffle.next?.Id || null, extending: false};
	return [shuffle.current, ...(shuffle.next ? [shuffle.next] : [])].map((entry) => tagged(shuffle.id, entry));
};

/** The items to queue now that `item` plays, when it's the running shuffle's next item, or else null. */
const extendServerShuffle = async (item) => {
	const shuffle = active;
	if (!shuffle || shuffle.extending || !shuffle.nextId || item?._serverShuffle !== shuffle.id ||
		String(item.Id) !== String(shuffle.nextId)) return null;
	shuffle.extending = true;
	try {
		const moved = await shuffle.api.advanceShuffle(shuffle.id, shuffle.currentId);
		if (active !== shuffle) return null;
		if (!moved) {
			active = null;
			return [];
		}
		shuffle.currentId = moved.current.Id;
		shuffle.nextId = moved.next?.Id || null;
		return moved.next ? [tagged(shuffle.id, moved.next)] : [];
	} finally {
		shuffle.extending = false;
	}
};

/**
 * The player's id queue once `itemId`, handed out by shuffle `shuffleId`, starts playing, or null when it stays as it
 * is. The item the server picks next joins the end.
 */
export const extendServerShuffleQueue = async (queue, itemId, shuffleId) => {
	const more = await extendServerShuffle({Id: itemId, _serverShuffle: shuffleId});
	if (!more?.length || !queue.includes(itemId)) return null;
	const added = more.map((next) => next.Id);
	// Once Silo starts repeating, a title comes around again. The queue keeps only its latest place, since the player
	// finds what's next from the first one.
	const repeats = [itemId, ...added];
	return [...queue.filter((id) => !repeats.includes(id)), itemId, ...added];
};
