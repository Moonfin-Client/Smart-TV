// Whoever muxed a file decides which of these three carries the label, so a
// track is only ruled in or out after all of them have been read. Both shapes
// are read because the player works on normalised tracks while the playback
// negotiation still holds the raw MediaStreams the server sent.
export const streamTitleText = (stream) => [
	stream?.displayTitle, stream?.title, stream?.name,
	stream?.DisplayTitle, stream?.Title, stream?.Name
]
	.filter((part) => typeof part === 'string')
	.join(' ')
	.toLowerCase();
