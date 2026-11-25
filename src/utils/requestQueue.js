// Caps how many requests are in flight at once. A cold home load can put 40 or more
// requests on the wire in one tick, and a media server backed by SQLite answers that
// burst by locking up and timing out.

// Sits under the six connections per host a TV browser opens anyway, which leaves room
// for image loads.
const DEFAULT_MAX_CONCURRENT = 4;

export const createRequestQueue = (maxConcurrent = DEFAULT_MAX_CONCURRENT) => {
	const limit = Math.max(1, maxConcurrent);
	const waiting = [];
	let active = 0;

	const pump = () => {
		if (active >= limit || waiting.length === 0) return;
		const {task, resolve, reject} = waiting.shift();
		active++;
		// A task that throws before returning a promise still has to release its slot.
		let started;
		try {
			started = Promise.resolve(task());
		} catch (err) {
			started = Promise.reject(err);
		}
		started.then(resolve, reject).finally(() => {
			active--;
			pump();
		});
	};

	return {
		run: (task) => new Promise((resolve, reject) => {
			waiting.push({task, resolve, reject});
			pump();
		}),
		inFlight: () => active,
		pending: () => waiting.length
	};
};

// One queue for everything aimed at the media server, since the item endpoints and the
// plugin's endpoints land on the same box. Keep long-lived connections out of it, because
// one would hold its slot and starve everything waiting behind it.
export const mediaServerQueue = createRequestQueue();
