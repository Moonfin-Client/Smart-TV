import {getAuthHeader, getServerUrl} from './jellyfinApi';
import {mediaServerQueue} from '../utils/requestQueue';

const seriesCache = {};
const CACHE_TTL_MS = 30 * 60 * 1000;

const negativeCache = {};
const NEGATIVE_CACHE_TTL_MS = 3 * 60 * 1000;

const pendingSeries = {};

const itemAudio = {};
const itemAsked = {};

let placement = 'below';

export const MARKER_PLACEMENT = {
	below: 'below',
	beside: 'beside',
	thumbnail: 'thumbnail'
};

export const getMarkerPlacement = () => placement;

const rememberPlacement = (value) => {
	if (value === 'beside' || value === 'thumbnail' || value === 'below') {
		placement = value;
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
	if (!key) return null;

	const cached = seriesCache[key];
	if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
		return cached.data;
	}
	if (isNegativelyCached(key)) return null;
	if (pendingSeries[key]) return pendingSeries[key];

	const baseUrl = options.serverUrl || getServerUrl();
	if (!baseUrl) return null;

	const run = (async () => {
		try {
			const url = `${baseUrl}/Moonfin/AnimeMarkers/Series?seriesId=${encodeURIComponent(seriesId)}`;
			const response = await request(url, options.signal);

			if (!response.ok) {
				negativeCache[key] = Date.now();
				return null;
			}

			const body = await response.json();
			rememberPlacement(body?.placement);

			if (body?.enabled !== true) {
				const empty = {episodes: {}, seasons: {}};
				seriesCache[key] = {fetchedAt: Date.now(), data: empty};
				return empty;
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

			const data = {episodes, seasons};
			seriesCache[key] = {fetchedAt: Date.now(), data};
			return data;
		} catch (e) {
			if (e?.name !== 'AbortError') negativeCache[key] = Date.now();
			return null;
		} finally {
			delete pendingSeries[key];
		}
	})();

	pendingSeries[key] = run;
	return run;
};

export const markerForEpisode = (markers, episodeId) => {
	if (!markers?.episodes) return null;
	return markers.episodes[normalizeId(episodeId)] || null;
};

export const audioForSeason = (markers, seasonId) => {
	if (!markers?.seasons) return null;
	return markers.seasons[normalizeId(seasonId)] || null;
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
	const ids = Array.from(itemQueue).slice(0, ITEM_BATCH_MAX);
	ids.forEach(id => itemQueue.delete(id));

	const waiters = itemWaiters.splice(0, itemWaiters.length);
	const baseUrl = itemBaseUrl || getServerUrl();

	try {
		if (ids.length === 0 || !baseUrl) return;

		const url = `${baseUrl}/Moonfin/AnimeMarkers/Items?ids=${encodeURIComponent(ids.join(','))}`;
		const response = await request(url);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);

		const body = await response.json();
		rememberPlacement(body?.placement);

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
		waiters.forEach(resolve => resolve());

		if (itemQueue.size > 0 && !itemTimer) {
			itemTimer = setTimeout(() => {
				itemTimer = null;
				flushItemBatch();
			}, ITEM_BATCH_MS);
		}
	}
};

export const fetchItemMarkers = async (itemIds, options = {}) => {
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
		itemWaiters.push(resolve);
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

export const clearAnimeMarkerCache = () => {
	Object.keys(seriesCache).forEach(k => delete seriesCache[k]);
	Object.keys(negativeCache).forEach(k => delete negativeCache[k]);
	Object.keys(itemAudio).forEach(k => delete itemAudio[k]);
	Object.keys(itemAsked).forEach(k => delete itemAsked[k]);
	Object.keys(itemFailedAt).forEach(k => delete itemFailedAt[k]);
	placement = 'below';
};
