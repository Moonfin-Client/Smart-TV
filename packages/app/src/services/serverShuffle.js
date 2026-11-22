// A shuffle the server runs (Silo's), as a video queue that grows one item at a time. Ported from Moonfin-Core's
// ServerShuffleQueue.
//
// The server hands out the item to play now and the one after it, and both are queued. When the second starts playing,
// `extend` moves the server's shuffle on from the first and the item it picks next joins the queue. So the server's
// current item is the one playing, and its order carries on in the server's own apps and on other devices.
//
// One shuffle is followed at a time: starting another replaces it, and an item that isn't the shuffle's next doesn't
// extend it.

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

/** The items to queue now that `item` plays, when it is the running shuffle's next item; else null. */
export const extendServerShuffle = async (item) => {
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

export const stopServerShuffle = () => {
	active = null;
};
