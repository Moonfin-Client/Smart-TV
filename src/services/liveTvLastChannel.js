// The channel last tuned on each server and account. The guide opens on it, and back from a
// guide that has wandered returns to it.

import {getFromStorage, saveToStorage} from './storage';
import {getServerUrl, getUserId} from './jellyfinApi';

const STORAGE_KEY = 'liveTvLastChannel';

let byScope = {};
let loadPromise = null;

const scopeKey = () => {
	const server = (getServerUrl() || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
	const user = getUserId();
	return server && user ? `${server}_${user}` : null;
};

export const loadLiveTvLastChannel = () => {
	if (!loadPromise) {
		loadPromise = Promise.resolve()
			.then(() => getFromStorage(STORAGE_KEY))
			.then((stored) => {
				// A channel tuned before the load finished is the newer one.
				if (stored && typeof stored === 'object') byScope = {...stored, ...byScope};
			})
			.catch(() => {});
	}
	return loadPromise;
};

export const getLiveTvLastChannelId = () => {
	const key = scopeKey();
	return key ? byScope[key] || null : null;
};

export const setLiveTvLastChannelId = (channelId) => {
	const key = scopeKey();
	if (!key || !channelId || byScope[key] === channelId) return;
	byScope = {...byScope, [key]: channelId};
	loadLiveTvLastChannel()
		.then(() => saveToStorage(STORAGE_KEY, byScope))
		.catch(() => {});
};
