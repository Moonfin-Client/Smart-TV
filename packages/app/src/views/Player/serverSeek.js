// Seeks a stream can't make itself go back to the server, which reopens the stream there. Seeks asked for while one
// is being served only move its target, and the latest one is served next.
export const createServerSeek = (serve) => {
	let target = null;
	let running = false;
	return async (ticks) => {
		target = ticks;
		if (running) return;
		running = true;
		try {
			while (target != null) {
				const next = target;
				target = null;
				await serve(next);
			}
		} finally {
			running = false;
		}
	};
};
