// The Seerr notification choices, kept per server and user the way Moonbase keeps them. Moonbase
// filters the in-app notices by them. A change is flagged until the server has it, so one that never
// got there goes up at the next sign in rather than being replaced by the server's copy.

import {getFromStorage, saveToStorage} from './storage';
import {getMoonfinNotificationPrefs, saveMoonfinNotificationPrefs} from './seerrApi';

const STORE_KEY = 'seerrNotificationPrefs';

// The plugin's own defaults. New Media is off since it fires for anything added to the library.
export const NOTIFICATION_PREF_DEFAULTS = {
	notifyOnNewRequests: true,
	notifyOnLibraryAdded: true,
	notifyOnIssues: true,
	notifyOnNewMedia: false
};
const KEYS = Object.keys(NOTIFICATION_PREF_DEFAULTS);

const listeners = new Set();

export const subscribeNotificationPrefs = (fn) => {
	listeners.add(fn);
	return () => listeners.delete(fn);
};

const userKeyOf = (serverUrl, userId) => `${String(serverUrl || '').replace(/\/+$/, '').toLowerCase()}/${userId || ''}`;

const choicesOf = (entry) => {
	const out = {...NOTIFICATION_PREF_DEFAULTS};
	KEYS.forEach((key) => {
		if (typeof entry?.[key] === 'boolean') out[key] = entry[key];
	});
	return out;
};

const readEntry = async (serverUrl, userId) => {
	const all = await getFromStorage(STORE_KEY).catch(() => null);
	return (all && all[userKeyOf(serverUrl, userId)]) || null;
};

const writeEntry = async (serverUrl, userId, entry) => {
	const all = (await getFromStorage(STORE_KEY).catch(() => null)) || {};
	all[userKeyOf(serverUrl, userId)] = entry;
	await saveToStorage(STORE_KEY, all);
	listeners.forEach((fn) => fn());
};

export const loadNotificationPrefs = async (serverUrl, userId) => choicesOf(await readEntry(serverUrl, userId));

const sameChoices = (a, b) => KEYS.every((key) => a[key] === b[key]);

// Sends this user's choices. The flag only clears when nothing changed while they were on the way,
// since a newer change has a push of its own still to land.
export const pushNotificationPrefs = async (serverUrl, token, userId) => {
	const sent = choicesOf(await readEntry(serverUrl, userId));
	try {
		await saveMoonfinNotificationPrefs(sent, serverUrl, token);
	} catch (err) {
		console.warn('[Seerr] Notification choices not saved:', err?.message);
		return false;
	}
	const now = choicesOf(await readEntry(serverUrl, userId));
	if (sameChoices(sent, now)) await writeEntry(serverUrl, userId, {...now, unsynced: false});
	return true;
};

export const setNotificationPref = async (serverUrl, token, userId, key, value) => {
	const current = choicesOf(await readEntry(serverUrl, userId));
	await writeEntry(serverUrl, userId, {...current, [key]: value, unsynced: true});
	return pushNotificationPrefs(serverUrl, token, userId);
};

// At sign in: a change the server never got goes up, and otherwise the server's copy is taken, so a
// new install shows the choices made elsewhere instead of pushing its defaults over them.
export const syncNotificationPrefs = async (serverUrl, token, userId) => {
	if (!serverUrl || !token) return;
	if ((await readEntry(serverUrl, userId))?.unsynced) {
		await pushNotificationPrefs(serverUrl, token, userId);
		return;
	}
	let data;
	try {
		data = await getMoonfinNotificationPrefs(serverUrl, token);
	} catch (err) {
		console.warn('[Seerr] Notification choices not read:', err?.message);
		return;
	}
	if (!data || typeof data !== 'object') return;
	// A change made while the server was being asked wins over its copy.
	const latest = await readEntry(serverUrl, userId);
	if (latest?.unsynced) return;
	await writeEntry(serverUrl, userId, {...choicesOf({...latest, ...data}), unsynced: false});
};
