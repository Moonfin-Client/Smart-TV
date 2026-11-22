import {api, getUserImageUrl} from '../../services/jellyfinApi';
import {initialsColor} from '../../utils/profileCarousel';

// A SyncPlay group only names its participants, so their pictures come from the server's user list, read once per
// server. A read that fails leaves initials and isn't tried again for a minute.
export const USERS_RETRY_MS = 60000;

let cache = {server: null, users: null, pending: null, failedAt: 0};

const keyOf = (name) => String(name ?? '').trim().toLowerCase();

/** The server's users by lower-cased name, or null with no server or a read that failed in the last minute. */
export const loadParticipantUsers = (server, now = Date.now()) => {
	if (!server) return Promise.resolve(null);
	if (cache.server !== server) cache = {server, users: null, pending: null, failedAt: 0};
	const entry = cache;
	if (entry.users) return Promise.resolve(entry.users);
	if (entry.pending) return entry.pending;
	if (entry.failedAt && now - entry.failedAt < USERS_RETRY_MS) return Promise.resolve(null);
	entry.pending = api.getUsers().then((list) => {
		const users = {};
		(Array.isArray(list) ? list : []).forEach((user) => {
			const key = keyOf(user?.Name);
			if (key && user.Id) users[key] = user;
		});
		entry.users = users;
		entry.pending = null;
		return users;
	}, () => {
		entry.failedAt = now;
		entry.pending = null;
		return null;
	});
	return entry.pending;
};

/**
 * How to draw the participant called `name`: their picture's `url`, null when they have none, and the `color` behind
 * their initial, picked by user id as everywhere else once the id is known.
 */
export const participantAvatar = (users, server, name) => {
	const user = users?.[keyOf(name)];
	return {
		url: user?.PrimaryImageTag ? getUserImageUrl(server, user.Id, user.PrimaryImageTag) : null,
		color: initialsColor(user?.Id || keyOf(name))
	};
};

// For tests.
export const resetParticipantUsers = () => {
	cache = {server: null, users: null, pending: null, failedAt: 0};
};
