import {getFromStorage, saveToStorage} from './storage';

// Remembers the subtitle a user picked so it doesn't have to be reselected on every
// play. The per-item index restores the exact track when replaying the same title,
// and the per-series language carries the choice to other episodes, matched by
// language because stream indexes differ between episodes. Mirrors Moonfin-Core's
// per-item and per-series subtitle preferences.

const STORAGE_KEY = 'subtitlePrefs';
const MAX_ITEMS = 300;

const OFF_INDEX = -1;
const OFF_LANGUAGE = '';

const loadPrefs = async () => {
	const stored = await getFromStorage(STORAGE_KEY);
	return {
		items: stored?.items && typeof stored.items === 'object' ? stored.items : {},
		series: stored?.series && typeof stored.series === 'object' ? stored.series : {}
	};
};

export const saveSubtitlePref = async (item, streamIndex, language) => {
	if (!item?.Id) return;
	const prefs = await loadPrefs();

	// Reinsert so the freshest item sits last, then trim the oldest once over the cap.
	delete prefs.items[item.Id];
	prefs.items[item.Id] = streamIndex >= 0 ? streamIndex : OFF_INDEX;
	const ids = Object.keys(prefs.items);
	if (ids.length > MAX_ITEMS) {
		for (const id of ids.slice(0, ids.length - MAX_ITEMS)) {
			delete prefs.items[id];
		}
	}

	if (item.SeriesId) {
		prefs.series[item.SeriesId] = streamIndex >= 0 ? (language || OFF_LANGUAGE) : OFF_LANGUAGE;
	}

	await saveToStorage(STORAGE_KEY, prefs);
};

export const getItemSubtitlePref = async (itemId) => {
	if (!itemId) return undefined;
	const prefs = await loadPrefs();
	return Object.prototype.hasOwnProperty.call(prefs.items, itemId) ? prefs.items[itemId] : undefined;
};

export const getSeriesSubtitlePref = async (seriesId) => {
	if (!seriesId) return undefined;
	const prefs = await loadPrefs();
	return Object.prototype.hasOwnProperty.call(prefs.series, seriesId) ? prefs.series[seriesId] : undefined;
};
