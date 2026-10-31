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

/** The server's shuffle of `item` as its first items, or null when the server doesn't shuffle it itself. */
export const startServerShuffle = async (api, item) => {
	if (!api?.canShuffle || !(await api.canShuffle(item))) return null;
	const shuffle = await api.startShuffle(item);
	active = {api, id: shuffle.id, currentId: shuffle.current.Id, nextId: shuffle.next?.Id || null};
	return shuffle.next ? [shuffle.current, shuffle.next] : [shuffle.current];
};

/** The items to queue now that `itemId` plays, when it is the running shuffle's next item; else null. */
export const extendServerShuffle = async (itemId) => {
	const shuffle = active;
	if (!shuffle || !shuffle.nextId || String(itemId) !== String(shuffle.nextId)) return null;
	const moved = await shuffle.api.advanceShuffle(shuffle.id, shuffle.currentId);
	if (active !== shuffle) return null;
	if (!moved) {
		active = null;
		return [];
	}
	shuffle.currentId = moved.current.Id;
	shuffle.nextId = moved.next?.Id || null;
	return moved.next ? [moved.next] : [];
};

export const stopServerShuffle = () => {
	active = null;
};
