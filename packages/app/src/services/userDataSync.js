// The newest watched state, resume position and favorite flag this client knows about, for
// every item a screen is still holding.
//
// A list carries the user data the server sent when it was fetched, and home comes back from a
// cache, so finishing an episode here or marking something watched on another device left cards
// showing the old progress. Anything that changes user data publishes here instead, and the
// screens lay what's known over the items they hold.

// Enough for every list a session realistically keeps alive, and bounded so a long browse
// can't grow this without end.
const MAX_TRACKED_ITEMS = 2000;

const userData = new Map();
const listeners = new Set();
let unbindSocket = null;

export const subscribe = (listener) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};

const notify = () => listeners.forEach((listener) => listener());

const sameEntries = (a, b) => {
	const keys = Object.keys(a);
	if (keys.length !== Object.keys(b).length) return false;
	return keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && a[key] === b[key]);
};

// Values are flat scalars, so this is a key by key compare. A null in the patch clears a
// field, which a missing one already says.
const alreadyHolds = (current, patch) => Object.keys(patch).every((key) => {
	if (patch[key] == null) return current[key] == null;
	return current[key] === patch[key];
});

// Insertion ordered, so the front is what has gone longest without a change. Anything still on
// screen is fetched again on the next visit.
const evictOverflow = () => {
	const excess = userData.size - MAX_TRACKED_ITEMS;
	if (excess <= 0) return;
	Array.from(userData.keys()).slice(0, excess).forEach((key) => userData.delete(key));
};

// `replace` is for values that came from the server, which always sends an item's whole user
// data and is therefore allowed to undo an optimistic patch that turned out to be wrong.
const publishAll = (changes, {replace = false} = {}) => {
	let changed = false;
	Object.keys(changes).forEach((itemId) => {
		const patch = changes[itemId];
		if (!itemId || !patch || !Object.keys(patch).length) return;
		const existing = userData.get(itemId);
		// The server leaves out a percentage it has cleared, which would keep the old progress bar. Only a whole
		// record says that, and every server's whole record carries the position, so a partial one is left as it is.
		const merged = replace ? {...('PlaybackPositionTicks' in patch ? {PlayedPercentage: null} : null), ...patch} : {...existing, ...patch};
		if (existing && sameEntries(existing, merged)) return;
		userData.set(itemId, merged);
		changed = true;
	});
	if (!changed) return;
	evictOverflow();
	notify();
};

// Records this client's own change before the server confirms it. Merges, so a patch that only
// carries Played leaves a known play count alone.
export const publish = (itemId, patch) => publishAll({[itemId]: patch});

// Items read straight from the server, whose user data replaces whatever was known about them.
export const recordFromServer = (items) => {
	const changes = {};
	(items || []).forEach((item) => {
		if (item?.Id && item.UserData) changes[item.Id] = item.UserData;
	});
	publishAll(changes, {replace: true});
};

// Returns the item itself when nothing newer is known, so callers can compare by identity and
// skip rebuilding a list that didn't move.
export const apply = (item) => {
	const patch = item?.Id ? userData.get(item.Id) : null;
	if (!patch) return item;
	const current = item.UserData;
	if (current && alreadyHolds(current, patch)) return item;
	return {...item, UserData: {...current, ...patch}};
};

// Returns the list itself when no entry changed, which keeps it stable for anything memoized
// on it.
export const applyAll = (items) => {
	if (!userData.size || !items?.length) return items;
	let patched = null;
	for (let i = 0; i < items.length; i++) {
		const updated = apply(items[i]);
		if (updated === items[i]) continue;
		if (!patched) patched = items.slice();
		patched[i] = updated;
	}
	return patched || items;
};

// Rows that each hold a list of items, patched row by row so an untouched row keeps its identity.
export const applyToRows = (rows) => {
	if (!userData.size || !rows?.length) return rows;
	let patched = null;
	for (let i = 0; i < rows.length; i++) {
		const items = applyAll(rows[i].items);
		if (items === rows[i].items) continue;
		if (!patched) patched = rows.slice();
		patched[i] = {...rows[i], items};
	}
	return patched || rows;
};

const normalizeId = (id) => {
	const normalized = String(id || '').replace(/-/g, '').toLowerCase();
	return normalized || null;
};

// Applies a UserDataChanged message's data. The server only sends it to the owning user's
// sessions, and the check is so a binding left over from the last account can't write over
// this one.
const applySocketUserData = (data, expectedUserId) => {
	if (!data || data.UserId == null) return;
	const expected = normalizeId(expectedUserId);
	const messageUser = normalizeId(data.UserId);
	if (expected && messageUser && messageUser !== expected) return;
	const changes = {};
	(Array.isArray(data.UserDataList) ? data.UserDataList : []).forEach((entry) => {
		if (!entry || entry.ItemId == null) return;
		const patch = {...entry};
		delete patch.ItemId;
		if (Object.keys(patch).length) changes[String(entry.ItemId)] = patch;
	});
	publishAll(changes, {replace: true});
};

// Follows the session socket for the signed in user. `listen` hands each message to its
// callback and returns what stops it. Safe to call again on a reconnect or a user switch,
// which drops the previous binding.
export const bindTo = (listen, userId) => {
	if (unbindSocket) unbindSocket();
	unbindSocket = listen((message) => {
		if (message?.MessageType === 'UserDataChanged') applySocketUserData(message.Data, userId);
	});
};

// Drops everything on sign out or a user switch, so one account's watched state is never
// painted onto another's library.
export const reset = () => {
	if (unbindSocket) unbindSocket();
	unbindSocket = null;
	if (!userData.size) return;
	userData.clear();
	notify();
};
