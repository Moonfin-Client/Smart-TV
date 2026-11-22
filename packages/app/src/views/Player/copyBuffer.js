// How much of a Silo copy hls.js holds, in seconds ahead and behind. A copy runs at the file's own bitrate, and the
// TV's media buffer fills well before its seconds do: a 66 Mbps remux held 30 s each way stopped taking fragments 15 s
// in and ran dry, and with 11 s held it still filled once in a heavy scene. So the seconds come from a byte budget,
// three quarters of it ahead of the playhead.
const BUDGET_BYTES = 100 * 1024 * 1024;

export const copyBufferSeconds = (bitrate) => {
	const seconds = bitrate > 0 ? (BUDGET_BYTES * 8) / bitrate : Infinity;
	return {
		ahead: Math.max(6, Math.min(30, Math.floor(seconds * 0.75))),
		behind: Math.max(2, Math.min(30, Math.floor(seconds * 0.25)))
	};
};
