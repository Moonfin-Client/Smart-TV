import {useCallback, useEffect, useSyncExternalStore} from 'react';
import {getAuthHeader, getServerType, getServerUrl} from './jellyfinApi';
import {mediaServerQueue} from '../utils/requestQueue';
import {fetchWithTimeout} from '../utils/fetchTimeout';
import {plexMoonbaseUrl} from '../utils/plexUrls';

// The labels the admin's Moonbase rules put on the server's own posters, such as 4K or VFQ. Asked for
// in batches and kept for the session, keyed by the id the card sent.

// Long enough for a screen of cards to join one request.
const BATCH_MS = 60;
// The plugin ignores anything past 200 ids in one request.
const BATCH_MAX = 200;
const FAILURE_TTL_MS = 3 * 60 * 1000;
// Set when the route is missing or this viewer has no rules, so nothing asks until it's up. Short
// enough that a first rule reaches people without a restart.
const UNAVAILABLE_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 30000;

const NONE = Object.freeze([]);
export const POSTER_LABEL_CORNERS = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];

let badges = new Map();
// What the cards on screen showed under the previous rules. They keep it until the new answer
// lands, so a rule change doesn't blink every poster.
let stale = new Map();
const failedAt = new Map();
const pending = new Set();
const inFlight = new Set();
const watchers = new Map();
const availableListeners = new Set();
let timer = null;
let unavailableAt = 0;
let version = null;
let maxPerCorner = 2;
let available = null;
let checking = false;
// Bumped by a sign out or server switch, so an answer still on its way is dropped.
let generation = 0;

// Silo has no such route.
const servesLabels = () => {
	const type = getServerType();
	return (type === 'jellyfin' || type === 'emby' || type === 'plex') && Boolean(getServerUrl());
};

// Where Moonbase answers: the server itself, or on Plex the companion next to it.
export const posterLabelsBase = () => (getServerType() === 'plex' ? plexMoonbaseUrl(getServerUrl()) : getServerUrl());

const isUnavailable = () => {
	if (!unavailableAt) return false;
	if (Date.now() - unavailableAt < UNAVAILABLE_MS) return true;
	unavailableAt = 0;
	return false;
};

const setAvailable = (value) => {
	if (available === value) return;
	available = value;
	availableListeners.forEach((listener) => listener());
};

const notify = (ids) => ids.forEach((id) => watchers.get(id)?.forEach((listener) => listener()));

const request = (query) => mediaServerQueue.run(() => fetchWithTimeout(
	`${posterLabelsBase()}/Moonfin/PosterBadges/Items?${query}profile=tv`,
	{headers: {Authorization: getAuthHeader()}},
	TIMEOUT_MS
));

const text = (value, fallback = '') => (typeof value === 'string' ? value : fallback);

// The server fills in every default, so these only guard against a reply this app can't read.
const parseBadges = (raw) => {
	if (!Array.isArray(raw)) return NONE;
	const parsed = raw
		.filter((entry) => entry && typeof entry.label === 'string')
		.map((entry) => ({
			label: entry.label,
			color: text(entry.color),
			textColor: text(entry.textColor),
			style: text(entry.style, 'solid'),
			opacity: Number.isFinite(entry.opacity) ? Math.round(entry.opacity) : 100,
			size: text(entry.size, 'medium'),
			corner: POSTER_LABEL_CORNERS.includes(entry.corner) ? entry.corner : 'topLeft',
			shape: text(entry.shape, 'rounded'),
			icon: text(entry.icon)
		}));
	return parsed.length ? parsed : NONE;
};

// The new rules can give any poster different labels, so every card on screen asks again.
const forgetLabels = () => {
	const shown = new Map();
	watchers.forEach((_, id) => {
		const labels = badges.get(id) || stale.get(id);
		if (labels) shown.set(id, labels);
	});
	stale = shown;
	badges = new Map();
	failedAt.clear();
	watchers.forEach((_, id) => pending.add(id));
};

const noteAnswer = (body) => {
	if (typeof body?.version === 'string') {
		if (version !== null && version !== body.version) forgetLabels();
		version = body.version;
	}
	if (Number.isInteger(body?.maxPerCorner) && body.maxPerCorner > 0) maxPerCorner = body.maxPerCorner;
	setAvailable(body?.enabled === true);
	if (body?.enabled === false) {
		unavailableAt = Date.now();
		pending.clear();
	}
};

const schedule = () => {
	if (!timer && pending.size) timer = setTimeout(flush, BATCH_MS);
};

async function flush () {
	timer = null;
	if (isUnavailable() || !servesLabels()) {
		pending.clear();
		return;
	}

	// The rest go in the next request.
	const ids = Array.from(pending).slice(0, BATCH_MAX);
	ids.forEach((id) => {
		pending.delete(id);
		inFlight.add(id);
	});
	schedule();

	const asked = generation;
	try {
		const response = await request(`ids=${ids.map(encodeURIComponent).join(',')}&`);
		if (asked !== generation) return;
		// An older Moonbase, or none at all.
		if (response.status === 404) {
			unavailableAt = Date.now();
			pending.clear();
			setAvailable(false);
			return;
		}
		if (!response.ok) throw new Error(`HTTP ${response.status}`);

		const body = await response.json();
		if (asked !== generation) return;
		noteAnswer(body);
		const items = body?.items || {};
		ids.forEach((id) => {
			badges.set(id, parseBadges(items[id]));
			stale.delete(id);
			failedAt.delete(id);
			pending.delete(id);
		});
		notify(ids);
		schedule();
	} catch (e) {
		if (asked !== generation) return;
		const now = Date.now();
		ids.forEach((id) => failedAt.set(id, now));
	} finally {
		if (asked === generation) ids.forEach((id) => inFlight.delete(id));
	}
}

const want = (id) => {
	if (badges.has(id) || pending.has(id) || inFlight.has(id) || isUnavailable() || !servesLabels()) return;
	const failed = failedAt.get(id);
	if (failed && Date.now() - failed < FAILURE_TTL_MS) return;
	pending.add(id);
	schedule();
};

// Watching an item is what asks for it. The listener hears when its labels change.
export const watchPosterBadges = (itemId, listener) => {
	if (!itemId) return () => {};
	let set = watchers.get(itemId);
	if (!set) {
		set = new Set();
		watchers.set(itemId, set);
	}
	set.add(listener);
	want(itemId);
	return () => {
		set.delete(listener);
		if (set.size === 0 && watchers.get(itemId) === set) {
			watchers.delete(itemId);
			stale.delete(itemId);
		}
	};
};

export const posterBadgesFor = (itemId) => (itemId && (badges.get(itemId) || stale.get(itemId))) || NONE;

export const posterBadgesPerCorner = () => maxPerCorner;

// The labels for one item, empty until they arrive and for an item without any. A card that
// passes no id asks for nothing.
export const usePosterBadges = (itemId) => {
	const subscribe = useCallback((listener) => watchPosterBadges(itemId, listener), [itemId]);
	const read = useCallback(() => posterBadgesFor(itemId), [itemId]);
	return useSyncExternalStore(subscribe, read);
};

// Asks once whether this viewer gets any label here, so settings can hide a switch that would do
// nothing. Rows of posters answer it too, so this only costs a request when settings open first.
export const checkPosterLabelsAvailable = async () => {
	if (available !== null || checking) return;
	if (!servesLabels()) {
		setAvailable(false);
		return;
	}
	checking = true;
	const asked = generation;
	try {
		const response = await request('');
		if (asked !== generation) return;
		if (response.status === 404) {
			unavailableAt = Date.now();
			setAvailable(false);
		} else if (response.ok) {
			const body = await response.json();
			if (asked !== generation) return;
			noteAnswer(body);
			schedule();
		}
	} catch (e) {
		// Stays unknown, so the next visit asks again.
	} finally {
		if (asked === generation) checking = false;
	}
};

const subscribeAvailable = (listener) => {
	availableListeners.add(listener);
	return () => availableListeners.delete(listener);
};

const readAvailable = () => available === true;

export const usePosterLabelsAvailable = (pluginEnabled) => {
	useEffect(() => {
		if (pluginEnabled) checkPosterLabelsAvailable();
	}, [pluginEnabled]);
	return useSyncExternalStore(subscribeAvailable, readAvailable) && Boolean(pluginEnabled);
};

// Keyed by bare item id, so this has to be emptied whenever the account or the server behind
// those ids changes.
export const clearPosterBadges = () => {
	generation++;
	clearTimeout(timer);
	timer = null;
	badges = new Map();
	stale = new Map();
	failedAt.clear();
	pending.clear();
	inFlight.clear();
	unavailableAt = 0;
	version = null;
	maxPerCorner = 2;
	checking = false;
	setAvailable(null);
	notify(Array.from(watchers.keys()));
};
