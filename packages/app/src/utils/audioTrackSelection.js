import {languageMatches} from './audioLanguage';
import {streamTitleText} from './streamTitle';

// Picks the audio track a fresh playback starts on, following the same order the
// other clients follow: an explicit pick, then commentary and audio description
// filtered out, then the default track shortcut, then preferred language,
// fallback language and English, each of those preferring the track the viewer
// last chose by hand before ranking what is left.

const COMMENTARY = /\b(commentary|director\s*commentary|commentaries|directors\s*commentary)\b/;
const AUDIO_DESCRIPTION = /\b(audio\s+description|descriptive\s+audio|visual\s+description|descriptive|description|ad)\b/;

export const isCommentaryAudioStream = (stream) =>
	stream?.isCommentary === true || COMMENTARY.test(streamTitleText(stream));

export const isAudioDescriptionAudioStream = (stream) =>
	stream?.isAudioDescription === true || stream?.IsAudioDescription === true ||
	AUDIO_DESCRIPTION.test(streamTitleText(stream));

const trackTitle = (stream) => String(stream?.title || stream?.displayTitle || '').trim().toLowerCase();

const channelsOf = (stream) => (typeof stream?.channels === 'number' ? stream.channels : 0);

// Surround beats stereo once language and the two flags have had their say. The
// default flag moves above or below the channel count depending on whether the
// viewer asked for default tracks.
const rankAudioCandidates = (candidates, prefs) => {
	if (candidates.length <= 1) return candidates[0];
	const {preferDefaultAudioTrack, preferAudioDescription} = prefs;
	return candidates.slice().sort((a, b) => {
		if (preferAudioDescription) {
			const aAd = isAudioDescriptionAudioStream(a);
			const bAd = isAudioDescriptionAudioStream(b);
			if (aAd !== bAd) return aAd ? -1 : 1;
		}
		if (preferDefaultAudioTrack) {
			const aDefault = a.isDefault === true;
			const bDefault = b.isDefault === true;
			if (aDefault !== bDefault) return aDefault ? -1 : 1;
		}
		const aChannels = channelsOf(a);
		const bChannels = channelsOf(b);
		if (aChannels !== bChannels) return bChannels - aChannels;
		if (!preferDefaultAudioTrack) {
			const aDefault = a.isDefault === true;
			const bDefault = b.isDefault === true;
			if (aDefault !== bDefault) return aDefault ? -1 : 1;
		}
		return (a.index || 0) - (b.index || 0);
	})[0];
};

// Within one language, the track the viewer picked last time wins, first by its
// own index and then by its name, which survives a file listing its tracks in a
// different order.
const preferRemembered = (matches, prefs) => {
	const {lastIndex, lastTitle} = prefs;
	if (lastIndex !== null && lastIndex !== undefined) {
		const byIndex = matches.find((stream) => stream.index === lastIndex);
		if (byIndex) return byIndex;
	}
	if (lastTitle) {
		const byTitle = matches.find((stream) => trackTitle(stream) === lastTitle);
		if (byTitle) return byTitle;
	}
	return rankAudioCandidates(matches, prefs);
};

/**
 * @param {Array} audioStreams - the audio tracks the source offers
 * @param {Object} [settings] - audioLanguage, fallbackAudioLanguage,
 *   preferDefaultAudioTrack, preferAudioDescription, and optionally
 *   explicitAudioIndex, lastExplicitAudioIndex and lastExplicitAudioTitle
 * @returns {Object|null} the track to start on
 */
export const selectPreferredAudioStream = (audioStreams, settings = {}) => {
	if (!Array.isArray(audioStreams) || audioStreams.length === 0) return null;

	const {
		audioLanguage,
		fallbackAudioLanguage,
		preferDefaultAudioTrack = false,
		preferAudioDescription = false,
		explicitAudioIndex,
		lastExplicitAudioIndex,
		lastExplicitAudioTitle
	} = settings;

	if (explicitAudioIndex !== null && explicitAudioIndex !== undefined) {
		const explicit = audioStreams.find((stream) => stream.index === explicitAudioIndex);
		if (explicit) return explicit;
	}

	let candidates = audioStreams.filter((stream) => !isCommentaryAudioStream(stream));
	if (!candidates.length) candidates = audioStreams;

	if (!preferAudioDescription) {
		const withoutAd = candidates.filter((stream) => !isAudioDescriptionAudioStream(stream));
		if (withoutAd.length) candidates = withoutAd;
	}

	const prefs = {
		preferDefaultAudioTrack,
		preferAudioDescription,
		lastIndex: lastExplicitAudioIndex,
		lastTitle: lastExplicitAudioTitle ? String(lastExplicitAudioTitle).trim().toLowerCase() : ''
	};

	if (preferDefaultAudioTrack) {
		const defaults = candidates.filter((stream) => stream.isDefault === true);
		if (defaults.length) return rankAudioCandidates(defaults, prefs);
	}

	for (const language of [audioLanguage, fallbackAudioLanguage, 'eng']) {
		const matches = candidates.filter((stream) => languageMatches(stream.language, language));
		if (matches.length) return preferRemembered(matches, prefs);
	}

	return rankAudioCandidates(candidates, prefs);
};
