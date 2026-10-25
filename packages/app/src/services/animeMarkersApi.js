import {getAuthHeader, getServerUrl} from './jellyfinApi';
import {mediaServerQueue} from '../utils/requestQueue';
import {getFromStorage, saveToStorage} from './storage';

const seriesCache = {};
const CACHE_TTL_MS = 30 * 60 * 1000;

const negativeCache = {};
const NEGATIVE_CACHE_TTL_MS = 3 * 60 * 1000;

const pendingSeries = {};

// The first series asked for goes out alone, and the rest wait to hear whether the feature is on,
// since a row of cards all asking at once would otherwise each be told it's off.
let firstSeries = null;

// A series' markers rarely change, so they're kept between launches by server and a cold start
// doesn't ask again for every series card on Home.
const STORAGE_KEY = 'anime_markers_series';
const STORED_TTL_MS = 24 * 60 * 60 * 1000;
const SAVE_DELAY_MS = 3000;
let stored = null;
let saveTimer = null;

const loadStored = () => {
	if (!stored) stored = getFromStorage(STORAGE_KEY).then((saved) => saved || {}, () => ({}));
	return stored;
};

const saveStored = () => {
	clearTimeout(saveTimer);
	saveTimer = setTimeout(async () => {
		const entries = await loadStored();
		const now = Date.now();
		Object.keys(entries).forEach((k) => {
			if (now - entries[k].fetchedAt >= STORED_TTL_MS) delete entries[k];
		});
		saveToStorage(STORAGE_KEY, entries).catch(() => {});
	}, SAVE_DELAY_MS);
};

const itemAudio = {};
const itemAsked = {};

// Set when the server says the feature is off, so a library full of series doesnt pay
// one request each to be told the same thing. Both expire, otherwise an admin turning
// the feature on would never be noticed until the user signed out.
let featureOffAt = 0;

// The audio half can be off while filler markers stay on, so it latches on its own.
let itemFeatureOffAt = 0;

const featureOff = () => featureOffAt > 0 && (Date.now() - featureOffAt) < CACHE_TTL_MS;
const itemFeatureOff = () => featureOff() || (itemFeatureOffAt > 0 && (Date.now() - itemFeatureOffAt) < CACHE_TTL_MS);

// How the server wants the subbed/dubbed pills worded. Anything unknown keeps the full
// wording, which is what the app drew before the setting existed.
let labelStyle = 'full';

export const getAudioLabelStyle = () => labelStyle;

const rememberLabelStyle = (value) => {
	if (value === 'short' || value === 'full') {
		labelStyle = value;
	}
};

const normalizeId = (id) => String(id || '').replace(/-/g, '').toLowerCase();

const isNegativelyCached = (key) => {
	const at = negativeCache[key];
	if (!at) return false;
	if ((Date.now() - at) < NEGATIVE_CACHE_TTL_MS) return true;
	delete negativeCache[key];
	return false;
};

export const areAnimeMarkersEnabled = (settings) => !!settings?.useMoonfinPlugin;

const request = async (url, signal) => {
	const options = {headers: {'Authorization': getAuthHeader()}};
	if (signal) options.signal = signal;

	return mediaServerQueue.run(() => fetch(url, options));
};

// Markers for every episode of one series, key is the episode id.
export const fetchSeriesMarkers = async (seriesId, options = {}) => {
	const key = normalizeId(seriesId);
	if (!key || featureOff()) return null;

	const cached = seriesCache[key];
	if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
		return cached.data;
	}
	if (isNegativelyCached(key)) return null;
	if (pendingSeries[key]) return pendingSeries[key];

	const baseUrl = options.serverUrl || getServerUrl();
	if (!baseUrl) return null;

	const ahead = firstSeries;
	const run = (async () => {
		try {
			const entries = await loadStored();
			const storedKey = `${baseUrl}|${key}`;
			const saved = entries[storedKey];
			if (saved && (Date.now() - saved.fetchedAt) < STORED_TTL_MS) {
				// A stored series answers without asking the server, so the wording it was
				// fetched with comes back with it.
				rememberLabelStyle(saved.data?.labelStyle);
				seriesCache[key] = saved;
				return saved.data;
			}
			if (ahead) {
				await ahead;
				if (featureOff()) return null;
			}

			const url = `${baseUrl}/Moonfin/AnimeMarkers/Series?seriesId=${encodeURIComponent(seriesId)}`;
			const response = await request(url, options.signal);

			if (!response.ok) {
				negativeCache[key] = Date.now();
				return null;
			}

			const body = await response.json();
			rememberLabelStyle(body?.labelStyle);

			// Off server-wide, so no other series will answer differently.
			if (body?.enabled !== true) {
				featureOffAt = Date.now();
				return null;
			}

			if (body?.pending === true) {
				negativeCache[key] = Date.now();
				return null;
			}

			const episodes = {};
			const rawEpisodes = body?.episodes || {};
			Object.keys(rawEpisodes).forEach(id => {
				const entry = rawEpisodes[id];
				if (!entry) return;
				episodes[normalizeId(id)] = {
					kind: entry.kind || null,
					recap: entry.recap === true,
					audio: entry.audio || null
				};
			});

			const seasons = {};
			const rawSeasons = body?.seasons || {};
			Object.keys(rawSeasons).forEach(id => {
				const entry = rawSeasons[id];
				if (entry?.audio) seasons[normalizeId(id)] = entry.audio;
			});

			const data = {episodes, seasons, labelStyle};
			seriesCache[key] = {fetchedAt: Date.now(), data};
			entries[storedKey] = seriesCache[key];
			saveStored();
			return data;
		} catch (e) {
			if (e?.name !== 'AbortError') negativeCache[key] = Date.now();
			return null;
		} finally {
			delete pendingSeries[key];
		}
	})();

	pendingSeries[key] = run;
	if (!firstSeries) firstSeries = run;
	return run;
};

export const markerForEpisode = (markers, episodeId) => {
	if (!markers?.episodes) return null;
	return markers.episodes[normalizeId(episodeId)] || null;
};

// Ids waiting to go out, the callers waiting on them, and when a lookup last failed.
const itemQueue = new Set();
const itemWaiters = [];
const itemFailedAt = {};
let itemTimer = null;
let itemBaseUrl = null;

// Long enough for a row of cards to finish loading.
const ITEM_BATCH_MS = 80;

// The plugin ignores anything past 200 ids in one request.
const ITEM_BATCH_MAX = 200;

const flushItemBatch = async () => {
	const baseUrl = itemBaseUrl || getServerUrl();
	const stopping = itemFeatureOff() || !baseUrl;

	if (stopping) itemQueue.clear();

	const ids = stopping ? [] : Array.from(itemQueue).slice(0, ITEM_BATCH_MAX);
	ids.forEach(id => itemQueue.delete(id));

	// Only the callers whose ids actually went out are released, since the batch is
	// capped. When we are stopping altogether nobody is coming, so everyone goes.
	const sent = new Set(ids);
	const waiters = [];
	for (let i = itemWaiters.length - 1; i >= 0; i--) {
		if (stopping || itemWaiters[i].ids.every(id => sent.has(id))) {
			waiters.push(itemWaiters.splice(i, 1)[0]);
		}
	}

	try {
		if (stopping || ids.length === 0) return;

		const url = `${baseUrl}/Moonfin/AnimeMarkers/Items?ids=${encodeURIComponent(ids.join(','))}`;
		const response = await request(url);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);

		const body = await response.json();
		rememberLabelStyle(body?.labelStyle);

		if (body?.enabled === false) {
			itemFeatureOffAt = Date.now();
			itemQueue.clear();
			return;
		}

		const items = body?.items || {};
		Object.keys(items).forEach(id => {
			const audio = items[id]?.audio;
			if (audio) itemAudio[normalizeId(id)] = audio;
		});

		ids.forEach(id => {
			itemAsked[id] = true;
			delete itemFailedAt[id];
		});
	} catch (e) {
		const now = Date.now();
		ids.forEach(id => {
			itemFailedAt[id] = now;
		});
	} finally {
		waiters.forEach(w => w.resolve());

		if (itemQueue.size > 0 && !itemTimer && !itemFeatureOff()) {
			itemTimer = setTimeout(() => {
				itemTimer = null;
				flushItemBatch();
			}, ITEM_BATCH_MS);
		}
	}
};

export const fetchItemMarkers = async (itemIds, options = {}) => {
	if (itemFeatureOff()) return itemAudio;

	const wanted = (itemIds || [])
		.map(normalizeId)
		.filter(id => id && !(id in itemAsked))
		.filter(id => {
			const failedAt = itemFailedAt[id];
			return !failedAt || (Date.now() - failedAt) >= NEGATIVE_CACHE_TTL_MS;
		});

	if (wanted.length === 0) return itemAudio;

	wanted.forEach(id => itemQueue.add(id));
	itemBaseUrl = options.serverUrl || itemBaseUrl;

	await new Promise(resolve => {
		itemWaiters.push({ids: wanted, resolve});
		if (!itemTimer) {
			itemTimer = setTimeout(() => {
				itemTimer = null;
				flushItemBatch();
			}, ITEM_BATCH_MS);
		}
	});

	return itemAudio;
};

export const audioForItem = (itemId) => itemAudio[normalizeId(itemId)] || null;

// Keyed by bare item id, so this has to be emptied whenever the account or the server
// behind those ids changes. The latches go too, since the next server may have it on.
export const clearAnimeMarkerCache = () => {
	Object.keys(seriesCache).forEach(k => delete seriesCache[k]);
	Object.keys(negativeCache).forEach(k => delete negativeCache[k]);
	Object.keys(itemAudio).forEach(k => delete itemAudio[k]);
	Object.keys(itemAsked).forEach(k => delete itemAsked[k]);
	Object.keys(itemFailedAt).forEach(k => delete itemFailedAt[k]);
	itemQueue.clear();
	itemBaseUrl = null;
	firstSeries = null;
	featureOffAt = 0;
	itemFeatureOffAt = 0;
	labelStyle = 'full';
};
