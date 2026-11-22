import {languageMatches, normalizeLanguageCode} from './audioLanguage';
import {isForcedTrack, titleSaysForced} from './streamTitle';

// A track remembered for a whole series. Episodes list their tracks in different
// orders and tag them differently, so the pick is kept as what it was rather than
// as a position: the language it was in, the name it went by, and where it sat
// among the tracks sharing its language. Matching it back to a later episode reads
// those in that order.

const NONE = 'none';
const NONE_PREF = {language: NONE, title: '', relativeIndex: 0};

// Leading track numbers vary between files, so they are dropped before two titles
// are compared.
const TRACK_NUMBER_PREFIX = /^\d+\s*-\s*/;

const normalizeTitle = (raw) => String(raw || '').replace(TRACK_NUMBER_PREFIX, '').trim().toLowerCase();

// Whoever muxed the file decides which of the two carries the name, so the first
// one with anything in it is what a track goes by.
const streamTitle = (stream) => normalizeTitle(stream?.title || stream?.displayTitle || '');

// Plenty of tracks carry no language, and the player writes those out as the word
// Unknown rather than leaving them blank, so anything that isn't a language code
// counts as none at all.
const realLanguage = (value) => (normalizeLanguageCode(value) ? value : '');

const isNonePref = (pref) => String(pref?.language || '').toLowerCase() === NONE;

// The stored form of an older preference, which was the language on its own.
export const toSeriesTrackPref = (stored) => {
	if (stored === undefined || stored === null) return undefined;
	if (typeof stored === 'string') {
		// An empty language meant off back when this was a plain string.
		if (!stored || stored.toLowerCase() === NONE) return {...NONE_PREF};
		return {language: stored, title: '', relativeIndex: 0};
	}
	if (typeof stored !== 'object') return undefined;
	return {
		language: typeof stored.language === 'string' ? stored.language : '',
		title: typeof stored.title === 'string' ? stored.title : '',
		relativeIndex: Number.isInteger(stored.relativeIndex) ? stored.relativeIndex : 0,
		...(stored.forced === true ? {forced: true} : {})
	};
};

/**
 * The preference to store for a track the viewer picked, or null when there is
 * nothing worth storing.
 *
 * @param {Array} streams - every track of that kind the episode offers
 * @param {number} selectedIndex - the stream index picked, or -1 for off
 */
export const createSeriesTrackPref = (streams, selectedIndex) => {
	if (selectedIndex === undefined || selectedIndex === null) return null;
	if (selectedIndex < 0) return {...NONE_PREF};

	const selected = (streams || []).find((stream) => stream.index === selectedIndex);
	if (!selected) return null;

	const language = realLanguage(selected.language);
	// Plenty of forced tracks carry the flag and a plain name, so the pick says which kind it was.
	const selectedForced = isForcedTrack(selected);
	let relativeIndex = 0;
	for (const stream of streams) {
		if (stream.index === selectedIndex) break;
		if (isForcedTrack(stream) !== selectedForced) continue;
		if (language && languageMatches(stream.language, language)) relativeIndex += 1;
	}

	return {language, title: streamTitle(selected), relativeIndex, ...(selectedForced ? {forced: true} : {})};
};

// Every stream whose name reads as the wanted one. A loose match also accepts one
// name containing the other, for releases wording the same track differently.
const titleMatches = (streams, target, loose) => {
	if (!target) return [];
	return streams.filter((stream) => {
		const title = streamTitle(stream);
		if (!title) return false;
		return loose ? (title.indexOf(target) >= 0 || target.indexOf(title) >= 0) : title === target;
	});
};

const firstIndex = (matches) => (matches.length ? matches[0].index : null);

/**
 * The stream index in `streams` that best answers a remembered pick. Returns -1
 * when the series is remembered as off, and null when nothing can be it and the
 * caller should carry on deciding for itself.
 */
export const matchSeriesTrackIndex = (streams, pref) => {
	if (isNonePref(pref)) return -1;

	const language = realLanguage(pref?.language);
	const target = normalizeTitle(pref?.title);
	if (!language && !target) return null;

	const candidates = (streams || []).filter((stream) => stream.index !== undefined && stream.index !== null);

	// An untagged track leaves only its name to go on. Falling back to a position
	// there would hand back some unrelated track, so it matches or it doesn't.
	if (!language) {
		const byName = firstIndex(titleMatches(candidates, target, false));
		return byName !== null ? byName : firstIndex(titleMatches(candidates, target, true));
	}

	const matching = candidates.filter((stream) => languageMatches(stream.language, language));
	if (!matching.length) return null;

	// A name only settles it when one track answers to it. Files often give every
	// track in a language the same name, and then the place among them is all there
	// is to tell the one that was picked from its neighbours.
	const named = titleMatches(matching, target, false);
	if (named.length === 1) return named[0].index;

	// Position only counts tracks of the same kind as the remembered one, so a
	// forced track listed first can't stand in for the full one.
	const prefForced = pref.forced === true || titleSaysForced(target);
	const sameKind = matching.filter((stream) => isForcedTrack(stream) === prefForced);
	const positional = sameKind.length ? sameKind : matching;

	if (pref.relativeIndex >= 0 && pref.relativeIndex < positional.length) {
		return positional[pref.relativeIndex].index;
	}
	if (named.length > 1) return named[0].index;

	const loose = firstIndex(titleMatches(positional, target, true));
	return loose !== null ? loose : positional[0].index;
};

// The player and the details screen hold streams in different shapes, so the raw
// server records are brought round to the one this file reads.
export const fromServerStream = (stream) => ({
	index: stream?.Index,
	language: stream?.Language || '',
	title: stream?.Title || '',
	displayTitle: stream?.DisplayTitle || '',
	isForced: stream?.IsForced === true
});
