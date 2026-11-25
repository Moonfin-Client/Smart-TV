// A live stream only rewinds once it keeps at least this much behind the live point.
const MIN_WINDOW_SECONDS = 60;
// This close to the live point still reads as live.
export const AT_LIVE_SECONDS = 10;

// The stretch of a live stream that can be rewound, in seconds on the player's clock, or null while
// it's under a minute. The live point sits as far behind the end of the range as playback first
// started, since that's where the player chose to play live from.
export const liveWindowFor = (range, lag) => {
	if (!range || lag == null) return null;
	const edge = range.end - lag;
	return edge - range.start >= MIN_WINDOW_SECONDS ? {start: range.start, edge} : null;
};

// Without a window there's nothing to be behind, so that reads as live too.
export const isAtLive = (liveWindow, position) => !liveWindow || liveWindow.edge - position <= AT_LIVE_SECONDS;

// Keeps the window the player already holds when nothing moved, so a poll doesn't redraw for it.
export const nextLiveWindow = (prev, next) => (
	prev && next && prev.start === next.start && prev.edge === next.edge ? prev : next
);
