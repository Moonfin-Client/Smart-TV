import {getItemSubtitlePref, getSeriesSubtitlePref} from '../../services/subtitlePrefs';
import {languageMatches, normalizeLanguageCode} from '../../utils/audioLanguage';
import {matchSeriesTrackIndex} from '../../utils/seriesTrackPrefs';
import {streamTitleText} from '../../utils/streamTitle';

const SPECIAL = /\b(commentary|commentaries|jump\s*scare)\b/;
const SDH = /\b(sdh|cc|hoh|hearing\s*impaired|closed\s*caption)\b/;

const PGS_CODECS = ['pgs', 'pgssub', 'hdmv_pgs_subtitle', 'dvdsub', 'vobsub'];
const ASS_CODECS = ['ass', 'ssa'];

const isExternal = (stream) =>
	stream?.isExternal === true || String(stream?.deliveryMethod || '').trim().toLowerCase() === 'external';

const isSdh = (stream) => stream?.isHearingImpaired === true || SDH.test(streamTitleText(stream));

// Commentary and jump scare warnings read as dialogue right up until they are
// playing, so they sit below anything ordinary.
const isSpecial = (stream) => stream?.isCommentary === true || SPECIAL.test(streamTitleText(stream));

// A format the player can put on screen itself beats one it cant, but only
// once language and the flags above have had their say.
const formatPriority = (stream, {pgsDirectPlay, assDirectPlay}) => {
	const codec = String(stream?.codec || '').trim().toLowerCase();
	if (PGS_CODECS.indexOf(codec) >= 0 && pgsDirectPlay) return 2;
	if (ASS_CODECS.indexOf(codec) >= 0 && assDirectPlay) return 1;
	return 0;
};

const compare = (left, right) => (left === right ? 0 : (left ? -1 : 1));

/**
 * Orders candidates the way the other clients do, so the same file lands on the
 * same track everywhere. Preferred language beats the fallback language, which
 * beats English, then commentary sinks, then the SDH preference decides whether
 * hearing impaired tracks rise above the rest or below them.
 *
 * @param {Array} streams - the subtitle tracks to choose between
 * @param {string} [preferredLanguage]
 * @param {Object} [options] - fallbackLanguage, preferSdh, subtitleMode,
 *   pgsDirectPlay and assDirectPlay
 * @returns {Object|undefined} the track to start on
 */
export const bestSubtitle = (streams, preferredLanguage, options = {}) => {
	if (!streams?.length) return undefined;

	const {fallbackLanguage, subtitleMode} = options;
	const preferSdh = options.preferSdh === true;
	const formats = {
		pgsDirectPlay: options.pgsDirectPlay !== false,
		assDirectPlay: options.assDirectPlay !== false
	};

	let keep;
	if (subtitleMode === 'forced') {
		keep = (stream) => stream.isForced === true;
	} else if (subtitleMode === 'flagged') {
		// Neither language being present is what lets English in as a candidate,
		// so the question is put to every track rather than to the shortlist.
		const bothUnavailable =
			!streams.some((stream) => languageMatches(stream.language, preferredLanguage)) &&
			!streams.some((stream) => languageMatches(stream.language, fallbackLanguage));
		keep = (stream) => stream.isDefault === true ||
			stream.isForced === true ||
			(bothUnavailable && languageMatches(stream.language, 'eng'));
	} else {
		keep = () => true;
	}

	const ordered = streams
		.map((stream, position) => ({stream, position}))
		.filter((entry) => keep(entry.stream));
	if (!ordered.length) return undefined;

	ordered.sort((a, b) => {
		const left = a.stream;
		const right = b.stream;

		const byPreferred = compare(languageMatches(left.language, preferredLanguage), languageMatches(right.language, preferredLanguage));
		if (byPreferred) return byPreferred;

		const byFallback = compare(languageMatches(left.language, fallbackLanguage), languageMatches(right.language, fallbackLanguage));
		if (byFallback) return byFallback;

		const byEnglish = compare(languageMatches(left.language, 'eng'), languageMatches(right.language, 'eng'));
		if (byEnglish) return byEnglish;

		const bySpecial = compare(!isSpecial(left), !isSpecial(right));
		if (bySpecial) return bySpecial;

		// With SDH wanted we match it first. With it unwanted the file's own track
		// comes first, so a bad external download cant beat an internal SDH one.
		if (preferSdh) {
			const bySdh = compare(isSdh(left), isSdh(right));
			if (bySdh) return bySdh;
			const byInternal = compare(!isExternal(left), !isExternal(right));
			if (byInternal) return byInternal;
		} else {
			const byInternal = compare(!isExternal(left), !isExternal(right));
			if (byInternal) return byInternal;
			const bySdh = compare(!isSdh(left), !isSdh(right));
			if (bySdh) return bySdh;
		}

		const byFormat = formatPriority(right, formats) - formatPriority(left, formats);
		if (byFormat) return byFormat;

		// Forced mode has already narrowed the list to forced tracks, so this only
		// ever decides between full subtitles, where the forced one is the poorer read.
		const byForced = compare(left.isForced !== true, right.isForced !== true);
		if (byForced) return byForced;

		const byDefault = compare(left.isDefault === true, right.isDefault === true);
		if (byDefault) return byDefault;

		return a.position - b.position;
	});

	return ordered[0].stream;
};

// Foreign mode only wants subtitles when the audio the playback starts on is not
// in a language the viewer understands. The preferred audio language is the best
// signal for that, with the interface language standing in when none is set.
const audioIsNative = (audioStream, settings) => {
	const wanted = normalizeLanguageCode(settings.audioLanguage) || normalizeLanguageCode(settings.uiLanguage);
	if (!wanted) return false;
	return normalizeLanguageCode(audioStream?.language) === wanted;
};

/**
 * Works out which subtitle track a fresh playback should start on.
 *
 * Returns the stream to use, null to start with subtitles off, or undefined
 * when no mode is in play and the caller should leave the selection alone.
 *
 * A mode that finds nothing it wants means off rather than undefined. Leaving
 * the selection alone there hands the choice to whatever the file or the server
 * defaults to, which is how asking for forced subtitles ends up showing a full
 * track when the file carries no forced one.
 *
 * A remembered pick wins so a chosen track survives across plays and episodes.
 * The per item index restores the exact track on a replay, and the per series
 * language carries to other episodes, matched by language because the same
 * track sits at a different index in each episode.
 */
export const resolveInitialSubtitle = async (result, item, initialSubtitleIndex, settings, audioStream) => {
	const streams = result?.subtitleStreams || [];
	const pick = (subtitleMode) => bestSubtitle(streams, settings.subtitleLanguage, {
		fallbackLanguage: settings.fallbackSubtitleLanguage,
		preferSdh: settings.preferSdhSubtitles === true,
		pgsDirectPlay: settings.enablePgsRendering !== false,
		assDirectPlay: settings.assDirectPlay !== false,
		subtitleMode
	});

	// A track picked for this playback outranks anything remembered, the same way the
	// other clients take an explicit index before they look at the series.
	if (initialSubtitleIndex !== undefined && initialSubtitleIndex !== null) {
		if (initialSubtitleIndex < 0) return null;
		const explicit = streams.find((s) => s.index === initialSubtitleIndex);
		if (explicit) return explicit;
	}

	const savedItemIndex = await getItemSubtitlePref(item.Id);
	if (savedItemIndex !== undefined) {
		if (savedItemIndex < 0) return null;
		const savedStream = streams.find((s) => s.index === savedItemIndex);
		if (savedStream) return savedStream;
	}

	if (item.SeriesId) {
		const seriesPref = await getSeriesSubtitlePref(item.SeriesId);
		const matched = seriesPref ? matchSeriesTrackIndex(streams, seriesPref) : null;
		if (matched === -1) return null;
		if (matched !== null) {
			const savedStream = streams.find((s) => s.index === matched);
			if (savedStream) return savedStream;
		}
	}

	if (settings.subtitleMode === 'none') {
		return null;
	}

	if (settings.subtitleMode === 'always') {
		return pick('always') || null;
	}

	if (settings.subtitleMode === 'foreign') {
		if (audioIsNative(audioStream, settings)) return null;
		return pick('foreign') || null;
	}

	if (settings.subtitleMode === 'forced') {
		return pick('forced') || null;
	}

	// Default mode defers to the Jellyfin user's own preference, which the server
	// resolves from a subtitle language this client may not have been told about.
	// Only when the server names no track do the flags in the file decide, the way
	// the other clients read Jellyfin's default mode.
	if (settings.subtitleMode === 'default') {
		if (result?.defaultSubtitleStreamIndex != null && result.defaultSubtitleStreamIndex >= 0) {
			const serverChoice = streams.find((s) => s.index === result.defaultSubtitleStreamIndex);
			if (serverChoice) return serverChoice;
		}
		return pick('flagged') || null;
	}

	return undefined;
};
