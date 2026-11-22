// Whether a Silo copy can seek to a point itself. A copy's playlist grows as Silo produces it and can't be seeked past
// its end, so a seek there has Silo rebuild the stream, which takes seconds. Anywhere the playlist already lists,
// hls.js fetches the segment itself, as Silo's rule for media already there has it ("a larger correction to media that
// is already buffered seeks at once"). A second short of the end, so the segment it lands in is a whole one.
const END_MARGIN_SECONDS = 1;

// `details` is hls.js's level details for the stream, `streamSeconds` the target on the stream's own timeline.
export const copyReaches = (details, streamSeconds) => {
	const fragments = details?.fragments;
	if (!fragments?.length || !(streamSeconds >= 0)) return false;
	const first = fragments[0];
	const last = fragments[fragments.length - 1];
	return streamSeconds >= first.start && streamSeconds <= last.start + last.duration - END_MARGIN_SECONDS;
};
