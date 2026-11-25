// Runs the task over the items in order with at most `limit` of them running at once.
const mapBounded = async (items, limit, task) => {
	const queue = items.slice();
	const worker = async () => {
		while (queue.length > 0) await task(queue.shift());
	};
	await Promise.all(Array.from({length: Math.min(limit, queue.length)}, worker));
};

export default mapBounded;
