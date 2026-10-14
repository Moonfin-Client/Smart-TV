import {getItemSubtitlePref, getSeriesSubtitlePref} from '../../services/subtitlePrefs';
import {languageMatches, normalizeLanguageCode} from '../../utils/audioLanguage';
import {fromServerStream, matchSeriesTrackIndex} from '../../utils/seriesTrackPrefs';
import {streamTitleText} from '../../utils/streamTitle';
import {isTextSubtitleCodec} from '../../utils/subtitleCodecs';

const SPECIAL = /\b(commentary|commentaries|jump\s*scare)\b/;
const SDH = /\b(sdh|cc|hoh|hearing\s*impaired|closed\s*caption)\b/;

const PGS_CODECS = ['pgs', 'pgssub', 'hdmv_pgs_subtitle', 'dvdsub', 'vobsub'];
const ASS_CODECS = ['ass', 'ssa'];

const getCodec = (s) => String(s?.codec || s?.Codec || '').trim().toLowerCase();
const getLanguage = (s) => s?.language || s?.Language || '';
const getIsForced = (s) => s?.isForced === true || s?.IsForced === true;
const getIsDefault = (s) => s?.isDefault === true || s?.IsDefault === true;
const getIsHearingImpaired = (s) => s?.isHearingImpaired === true || s?.IsHearingImpaired === true;
const getIsCommentary = (s) => s?.isCommentary === true || s?.IsCommentary === true;
const isExternal = (s) => s?.isExternal === true || s?.IsExternal === true ||
	String(s?.deliveryMethod || s?.DeliveryMethod || '').trim().toLowerCase() === 'external';
const isText = (s) => s?.IsTextSubtitleStream === true || isTextSubtitleCodec(getCodec(s));

const isSdh = (stream) => getIsHearingImpaired(stream) || SDH.test(streamTitleText(stream));

// Commentary and jump scare warnings read as dialogue right up until they are
// playing, so they sit below anything ordinary.
const isSpecial = (stream) => getIsCommentary(stream) || SPECIAL.test(streamTitleText(stream));

// A format the player can put on screen itself beats one it cant, but only
// once language and the flags above have had their say.
const formatPriority = (stream, {pgsDirectPlay, assDirectPlay}) => {
	const codec = getCodec(stream);
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
 * @param {Object} [options] - fallbackLanguage, preferSdh, preferTextSubtitles,
 *   preferExternalSubtitles, subtitleMode, pgsDirectPlay and assDirectPlay
 * @returns {Object|undefined} the track to start on
 */
export const bestSubtitle = (streams, preferredLanguage, options = {}) => {
	if (!streams?.length) return undefined;

	const {fallbackLanguage, subtitleMode} = options;
	const preferSdh = options.preferSdh === true;
	const preferText = options.preferTextSubtitles === true;
	const preferExternal = options.preferExternalSubtitles === true;
	const formats = {
		pgsDirectPlay: options.pgsDirectPlay !== false,
		assDirectPlay: options.assDirectPlay !== false
	};

	let keep;
	if (subtitleMode === 'forced') {
		keep = (stream) => getIsForced(stream);
	} else if (subtitleMode === 'flagged') {
		// Neither language being present is what lets English in as a candidate,
		// so the question is put to every track rather than to the shortlist.
		const bothUnavailable =
			!streams.some((stream) => languageMatches(getLanguage(stream), preferredLanguage)) &&
			!streams.some((stream) => languageMatches(getLanguage(stream), fallbackLanguage));
		keep = (stream) => getIsDefault(stream) ||
			getIsForced(stream) ||
			(bothUnavailable && languageMatches(getLanguage(stream), 'eng'));
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

		const byPreferred = compare(languageMatches(getLanguage(left), preferredLanguage), languageMatches(getLanguage(right), preferredLanguage));
		if (byPreferred) return byPreferred;

		const byFallback = compare(languageMatches(getLanguage(left), fallbackLanguage), languageMatches(getLanguage(right), fallbackLanguage));
		if (byFallback) return byFallback;

		const byEnglish = compare(languageMatches(getLanguage(left), 'eng'), languageMatches(getLanguage(right), 'eng'));
		if (byEnglish) return byEnglish;

		const bySpecial = compare(!isSpecial(left), !isSpecial(right));
		if (bySpecial) return bySpecial;

		// Wanted SDH is matched first. Unwanted SDH only counts once internal and
		// external are settled, so a stray external download cant beat the file's
		// own SDH track unless external files are preferred.
		if (preferSdh) {
			const bySdh = compare(isSdh(left), isSdh(right));
			if (bySdh) return bySdh;
		}

		// A forced track only carries the foreign dialogue, so neither preference
		// below should lift it above a full track.
		if (preferText || preferExternal) {
			const byFull = compare(!getIsForced(left), !getIsForced(right));
			if (byFull) return byFull;
		}

		if (preferText) {
			const byText = compare(isText(left), isText(right));
			if (byText) return byText;
		}

		const byStorage = compare(isExternal(left) === preferExternal, isExternal(right) === preferExternal);
		if (byStorage) return byStorage;

		if (!preferSdh) {
			const bySdh = compare(!isSdh(left), !isSdh(right));
			if (bySdh) return bySdh;
		}

		const byFormat = formatPriority(right, formats) - formatPriority(left, formats);
		if (byFormat) return byFormat;

		// Forced mode has already narrowed the list to forced tracks, so this only
		// ever decides between full subtitles, where the forced one is the poorer read.
		const byForced = compare(!getIsForced(left), !getIsForced(right));
		if (byForced) return byForced;

		const byDefault = compare(getIsDefault(left), getIsDefault(right));
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
		preferTextSubtitles: settings.preferTextSubtitles === true,
		preferExternalSubtitles: settings.preferExternalSubtitles === true,
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

/**
 * Where the track Details shows as active sits in the version's subtitle list,
 * or -1 for off. It runs the player's own resolution, so the screen shows the
 * track playback is going to start on.
 *
 * @param {Object} item - the item, for its remembered picks
 * @param {Object} mediaSource - the version on screen, holding the server's MediaStreams
 * @param {Object} settings
 * @param {Object} [audioStream] - the audio track on screen, as the server sent it
 */
export const detailsSubtitlePosition = async (item, mediaSource, settings, audioStream) => {
	const subs = (mediaSource?.MediaStreams || []).filter((s) => s.Type === 'Subtitle');
	if (!subs.length) return -1;
	// The player matches on the lower case fields, and the ranking reads either case.
	const streams = subs.map((s) => ({...s, ...fromServerStream(s)}));
	const chosen = await resolveInitialSubtitle(
		{subtitleStreams: streams, defaultSubtitleStreamIndex: mediaSource.DefaultSubtitleStreamIndex},
		item, undefined, settings, audioStream && fromServerStream(audioStream)
	);
	return chosen ? streams.indexOf(chosen) : -1;
};
