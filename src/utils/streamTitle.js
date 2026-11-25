// Whoever muxed a file decides which of these three carries the label, so a
// track is only ruled in or out after all of them have been read. Both shapes
// are read because the player works on normalized tracks while the playback
// negotiation still holds the raw MediaStreams the server sent.
export const streamTitleText = (stream) => [
	stream?.displayTitle, stream?.title, stream?.name,
	stream?.DisplayTitle, stream?.Title, stream?.Name
]
	.filter((part) => typeof part === 'string')
	.join(' ')
	.toLowerCase();

// Plenty of files only say forced in the track title and leave the flag off.
// Older webOS browsers can't read a lookbehind, so non-forced is cut out before
// the word is looked for.
const NON_FORCED = /\bnon[\s-]forced\b/gi;
const FORCED = /\bforced\b/i;

export const titleSaysForced = (text) => FORCED.test(text.replace(NON_FORCED, ''));

export const isForcedTrack = (stream) =>
	stream?.isForced === true || stream?.IsForced === true || titleSaysForced(streamTitleText(stream));
