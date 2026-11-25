// True once the renderer can draw, false when it errors, runs out of time or keepWaiting says
// the caller moved on. The worker holds every message until the track and its fonts are loaded,
// so the first answer to a request is the sign. The library's own request gives up after five
// seconds, so a timed out one is asked again until the deadline.
export const waitForAssReady = (renderer, timeoutMs, keepWaiting = () => true) => new Promise((resolve) => {
	let done = false;
	let poll = null;
	const finish = (ready) => {
		if (done) return;
		done = true;
		clearInterval(poll);
		resolve(ready);
	};
	const deadline = Date.now() + timeoutMs;
	poll = setInterval(() => {
		if (!keepWaiting() || Date.now() >= deadline) finish(false);
	}, 250);
	const ask = () => {
		try {
			renderer.getEvents(() => finish(true), (err) => {
				if (done) return;
				if (/timeout/i.test(err?.message || '')) ask();
				else finish(false);
			});
		} catch {
			finish(false);
		}
	};
	if (renderer?.getEvents) ask();
	else finish(false);
});
