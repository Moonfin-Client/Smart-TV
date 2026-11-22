import {getFromStorage, saveToStorage} from './storage';
import {createSeriesTrackPref, toSeriesTrackPref} from '../utils/seriesTrackPrefs';
import {languageMatches} from '../utils/audioLanguage';
import {trackChoiceApiFor} from './seriesTrackSync';

// Remembers the tracks a user picked so they don't have to be reselected on every
// play. The per-item index restores the exact subtitle when replaying the same
// title, and the per-series record carries a choice to other episodes, matched by
// what the track was rather than where it sat, because episodes list their tracks
// in different orders. Mirrors Moonfin Core's per-item and per-series preferences.

const STORAGE_KEY = 'subtitlePrefs';
const MAX_ITEMS = 300;

const OFF_INDEX = -1;

// Series entries used to be the language on its own, where an empty one meant off.
// They are brought up to the record form on the way in, so anything saved before
// keeps working and is rewritten in the new shape the next time it is touched.
const readSeries = (stored) => {
	const out = {};
	if (stored && typeof stored === 'object') {
		for (const [id, value] of Object.entries(stored)) {
			const pref = toSeriesTrackPref(value);
			if (pref) out[id] = pref;
		}
	}
	return out;
};

const loadPrefs = async () => {
	const stored = await getFromStorage(STORAGE_KEY);
	return {
		items: stored?.items && typeof stored.items === 'object' ? stored.items : {},
		series: readSeries(stored?.series),
		seriesAudio: readSeries(stored?.seriesAudio),
		itemAudio: stored?.itemAudio && typeof stored.itemAudio === 'object' ? stored.itemAudio : {},
		secondaryItems: stored?.secondaryItems && typeof stored.secondaryItems === 'object' ? stored.secondaryItems : {}
	};
};

// Every save reads the whole record and writes it back, so two landing together, like a
// primary pick that also clears the second track, would drop one. They take turns instead.
let writeQueue = Promise.resolve();
const updatePrefs = (change) => {
	const run = writeQueue.then(async () => {
		const prefs = await loadPrefs();
		change(prefs);
		await saveToStorage(STORAGE_KEY, prefs);
	});
	writeQueue = run.catch(() => {});
	return run;
};

// Reinsert so the freshest item sits last, then trim the oldest once over the cap.
const remember = (map, id, value) => {
	delete map[id];
	map[id] = value;
	const ids = Object.keys(map);
	if (ids.length > MAX_ITEMS) {
		for (const old of ids.slice(0, ids.length - MAX_ITEMS)) {
			delete map[old];
		}
	}
};

// A server that keeps the series' choice itself (Silo) hears each pick, so its own apps and other TVs follow.
const tellServer = (item, kind, streamIndex) => {
	if (!item?.SeriesId || (kind === 'audio' && streamIndex < 0)) return;
	const api = trackChoiceApiFor(item);
	if (!api) return;
	const write = kind === 'audio' ? api.setSeriesAudioChoice : api.setSeriesSubtitleChoice;
	write(item.SeriesId, item.Id, streamIndex).catch((err) => console.warn('[subtitlePrefs] The server kept no series track choice:', err));
};

// `streams` is every subtitle track the episode offers, which is what tells the
// pick apart from the others in its language.
export const saveSubtitlePref = async (item, streamIndex, streams) => {
	if (!item?.Id) return;
	await updatePrefs((prefs) => {
		remember(prefs.items, item.Id, streamIndex >= 0 ? streamIndex : OFF_INDEX);

		if (item.SeriesId) {
			const pref = createSeriesTrackPref(streams, streamIndex);
			if (pref) prefs.series[item.SeriesId] = pref;
			else delete prefs.series[item.SeriesId];
		}
	});
	tellServer(item, 'subtitle', streamIndex);
};

export const saveAudioPref = async (item, streamIndex, streams) => {
	if (!item?.Id) return;
	await updatePrefs((prefs) => {
		if (streamIndex >= 0) remember(prefs.itemAudio, item.Id, streamIndex);
		if (!item.SeriesId) return;
		// Turning audio off isn't a thing, so a pick that names no track leaves the
		// series without an opinion rather than storing one.
		const pref = streamIndex >= 0 ? createSeriesTrackPref(streams, streamIndex) : null;
		if (pref) prefs.seriesAudio[item.SeriesId] = pref;
		else delete prefs.seriesAudio[item.SeriesId];
	});
	tellServer(item, 'audio', streamIndex);
};

const isOff = (pref) => String(pref?.language || '').toLowerCase() === 'none';

// The server's choice wins when it names another language, or turns subtitles off or on where this TV's doesn't: it
// was made in the server's own apps or on another TV. A choice here in the same language is kept, since it also
// knows which of several same-language tracks was picked.
const serverChoiceDiffers = (local, server) => {
	if (!local || (!local.language && !local.title)) return true;
	if (isOff(local) !== isOff(server)) return true;
	if (isOff(server)) return false;
	if (!server.language || !local.language) return String(server.title).toLowerCase() !== String(local.title).toLowerCase();
	return !languageMatches(local.language, server.language);
};

// Brings the series' choice kept on its server (Silo) into this TV's, for a series or one of its episodes. Answers
// whether anything changed; a failed read changes nothing.
export const syncSeriesTrackChoices = async (item) => {
	const seriesId = item?.Type === 'Series' ? item.Id : item?.SeriesId;
	const api = seriesId ? trackChoiceApiFor(item) : null;
	if (!api) return false;
	let choices;
	try {
		choices = await api.getSeriesTrackChoices(seriesId);
	} catch (err) {
		console.warn('[subtitlePrefs] Could not read the series track choice from the server:', err);
		return false;
	}
	let changed = false;
	await updatePrefs((prefs) => {
		[['audio', prefs.seriesAudio], ['subtitle', prefs.series]].forEach(([kind, kept]) => {
			const server = choices?.[kind];
			if (server && serverChoiceDiffers(kept[seriesId], server)) {
				kept[seriesId] = server;
				changed = true;
			}
		});
	});
	return changed;
};

// The second track is only remembered per item, and off is remembered too so a track
// turned off stays off on the next play.
export const saveSecondarySubtitlePref = async (item, selection) => {
	if (!item?.Id) return;
	await updatePrefs((prefs) => {
		remember(prefs.secondaryItems, item.Id, selection);
	});
};

export const getItemSecondarySubtitlePref = async (itemId) => {
	if (!itemId) return undefined;
	const prefs = await loadPrefs();
	return prefs.secondaryItems[itemId];
};

export const getItemSubtitlePref = async (itemId) => {
	if (!itemId) return undefined;
	const prefs = await loadPrefs();
	return Object.prototype.hasOwnProperty.call(prefs.items, itemId) ? prefs.items[itemId] : undefined;
};

export const getItemAudioPref = async (itemId) => {
	if (!itemId) return undefined;
	const prefs = await loadPrefs();
	return Object.prototype.hasOwnProperty.call(prefs.itemAudio, itemId) ? prefs.itemAudio[itemId] : undefined;
};

export const getSeriesSubtitlePref = async (seriesId) => {
	if (!seriesId) return undefined;
	const prefs = await loadPrefs();
	return prefs.series[seriesId];
};

export const getSeriesAudioPref = async (seriesId) => {
	if (!seriesId) return undefined;
	const prefs = await loadPrefs();
	return prefs.seriesAudio[seriesId];
};
