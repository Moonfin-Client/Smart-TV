import $L from '@enact/i18n/$L';

// A file carrying pt-BR, pt-BR closed caption and pt-PT offers three rows all
// reading Portuguese, so each row says what the track is and where it comes from.
// That is what tells them apart and shows which ones have already been tried.

// A track with no name of its own still needs something to be called, and its
// position is the only thing left to call it by.
export const trackName = (position, title, typeLabel) =>
	title || `${typeLabel || $L('Track')} ${position}`;

// Audio rows lead with their position, which is how the players below refer to
// the track when switching between them.
export const numberedTrackName = (position, title, typeLabel) =>
	`${position} - ${trackName(position, title, typeLabel)}`;

const isExternalSubtitle = (stream) =>
	stream.isExternal === true ||
	(stream.deliveryMethod || '').trim().toLowerCase() === 'external';

// Internal tracks list first and external ones last, the order the other clients
// use. Only rows that select by stream index can be reordered, so this takes the
// player's mapped streams rather than raw server ones.
export const sortSubtitleStreams = (streams) => [
	...streams.filter((stream) => !isExternalSubtitle(stream)),
	...streams.filter(isExternalSubtitle)
];

// Servers and release groups spell hearing impaired several ways, and the word
// boundaries keep cc from matching inside an ordinary word.
const SDH_WORDS = /\b(sdh|cc|hoh|hearing[\s-]*impaired|closed[\s-]*captions?)\b/;

// Each part is dropped when the name already says it, so a track that announces
// itself is not announced twice. The name is built from server wording, so the
// checks read English while the parts themselves stay translated. The language
// code always shows, because the name spells the language out and only the code
// tells regional variants like pt-BR and pt-PT apart.
export const subtitleTrackDetail = ({name, codec, language, isExternal, deliveryMethod, isForced, isHearingImpaired}) => {
	const named = (name || '').toLowerCase();
	const parts = [];
	if (!codec) {
		parts.push($L('Unknown'));
	} else if (!named.includes(codec.toLowerCase())) {
		parts.push(codec.toUpperCase());
	}
	if (isExternal) {
		if (!named.includes('external')) parts.push($L('External'));
	} else if ((deliveryMethod || '').toLowerCase() === 'embed') {
		if (!named.includes('embed')) parts.push($L('Embedded'));
	} else {
		parts.push($L('Internal'));
	}
	if (language && language !== 'Unknown') parts.push(language.toUpperCase());
	if (isHearingImpaired && !SDH_WORDS.test(named)) parts.push($L('SDH'));
	if (isForced && !named.includes('forced')) parts.push($L('Forced'));
	return parts.join(' · ');
};

// A track whose name fell back to its language already shows it, so the language
// only earns a place here when the name says something else. The player mapping
// backfills a missing language with Unknown, which reads as noise rather than
// information.
export const audioTrackDetail = ({language, displayTitle, codec, channels}) => {
	const parts = [];
	if (language && language !== 'Unknown' && displayTitle && displayTitle !== language) parts.push(language);
	if (codec) parts.push(codec.toUpperCase());
	if (channels) parts.push(`${channels}ch`);
	return parts.join(' · ');
};

// Version names are written per file, so two libraries can easily both call
// theirs 1080p and only the library tells them apart. A library arrives here
// only when it is what separates the versions.
export const versionLabel = (versionName, libraryName) =>
	(libraryName ? `[${libraryName}] - ${versionName}` : versionName);
