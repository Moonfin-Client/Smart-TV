import $L from '@enact/i18n/$L';
import {languageMatches} from '../../utils/audioLanguage';
import {sortSubtitleStreams} from '../../utils/trackLabels';

const SECONDARY_CODECS = ['srt', 'subrip', 'vtt', 'webvtt'];
export const SECONDARY_DELAY_LIMIT_SECONDS = 5;
const TICKS_PER_SECOND = 10000000;

export const DEFAULT_SECONDARY_OFFSET = 8;
export const SECONDARY_OFFSET_MAX = 40;
export const SECONDARY_OFFSET_STEP = 2;
export const SECONDARY_SIZE_MIN = 16;
export const SECONDARY_SIZE_MAX = 144;
export const SECONDARY_SIZE_STEP = 4;

export const getSecondarySubtitleColorOptions = () => [
	{value: '', label: $L('Default')},
	{value: '#ffffff', label: $L('White')},
	{value: '#ffff00', label: $L('Yellow')},
	{value: '#00ff00', label: $L('Green')},
	{value: '#00ffff', label: $L('Cyan')},
	{value: '#0000ff', label: $L('Blue')},
	{value: '#ff00ff', label: $L('Magenta')},
	{value: '#ff0000', label: $L('Red')}
];

// A text track the server can't pull out of the file has no lines to fetch.
export const isSecondaryEligible = (stream) =>
	stream.isTextBased === true &&
	!stream.isEmbeddedNative &&
	SECONDARY_CODECS.includes((stream.codec || '').toLowerCase());

/**
 * The tracks the secondary picker lists, in the primary picker's order, with the preferred
 * secondary language moved to the top. The language only sorts, it never turns a track on.
 */
export const secondaryCandidates = (streams, primaryIndex, {preferExternal, preferredLanguage}) => {
	const eligible = sortSubtitleStreams(
		streams.filter((stream) => stream.index !== primaryIndex && isSecondaryEligible(stream)),
		preferExternal
	);
	if (!preferredLanguage) return eligible;
	const matches = (stream) => languageMatches(stream.language, preferredLanguage);
	return [...eligible.filter(matches), ...eligible.filter((stream) => !matches(stream))];
};

const IDENTITY_KEYS = ['language', 'displayTitle', 'codec', 'isExternal', 'isForced', 'isHearingImpaired'];

const identityOf = (stream) => {
	const identity = {};
	for (const key of IDENTITY_KEYS) {
		if (stream[key] != null) identity[key] = stream[key];
	}
	return identity;
};

// Built in a fixed key order, so a stored identity compares the same however it was read back.
const signatureOf = (identity) => JSON.stringify(IDENTITY_KEYS.filter((key) => identity[key] != null).map((key) => [key, identity[key]]));

/** What gets remembered for an item: off, or the track by index, position and what it is. */
export const secondarySelection = (streams, index) => {
	const ordinal = index >= 0 ? streams.findIndex((stream) => stream.index === index) : -1;
	if (ordinal < 0) return {off: true};
	return {index, ordinal, identity: identityOf(streams[ordinal])};
};

/**
 * The track a remembered pick points at: the same index if it's still the same track, else
 * the only track that matches, else the same position if that still matches. -1 means off
 * or gone, undefined means nothing was remembered.
 */
export const restoreSecondaryIndex = (saved, streams) => {
	if (!saved || typeof saved !== 'object') return undefined;
	if (saved.off === true || !saved.identity || typeof saved.identity !== 'object') return -1;
	const signature = signatureOf(saved.identity);
	const sameTrack = (stream) => isSecondaryEligible(stream) && signatureOf(identityOf(stream)) === signature;

	const exact = streams.find((stream) => stream.index === saved.index && sameTrack(stream));
	if (exact) return exact.index;

	const matching = streams.filter(sameTrack);
	if (matching.length === 1) return matching[0].index;

	const atOrdinal = Number.isInteger(saved.ordinal) ? streams[saved.ordinal] : null;
	return atOrdinal && sameTrack(atOrdinal) ? atOrdinal.index : -1;
};

export const clampSecondaryDelay = (seconds) =>
	Math.max(-SECONDARY_DELAY_LIMIT_SECONDS, Math.min(SECONDARY_DELAY_LIMIT_SECONDS, seconds));

// A positive delay holds the lines back.
export const secondaryCueText = (events, ticks, delaySeconds = 0) => {
	const lookup = ticks - (delaySeconds * TICKS_PER_SECOND);
	const lines = [];
	for (const event of events) {
		if (lookup >= event.StartPositionTicks && lookup <= event.EndPositionTicks) lines.push(event.Text);
	}
	return lines.length > 0 ? lines.join('\n') : null;
};

export const secondaryTextStyle = (settings, primaryTextStyle) => ({
	...primaryTextStyle,
	...(settings.secondarySubtitleSize > 0 ? {fontSize: `${settings.secondarySubtitleSize}px`} : {}),
	...(settings.secondarySubtitleColor ? {color: settings.secondarySubtitleColor} : {}),
	marginBottom: '8px'
});
