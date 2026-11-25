// Wraps an async call so a second call for the same key, made while the first is still on its
// way, gets that same answer instead of going out again.
export const sharePending = (keyOf, run) => {
	const pending = new Map();
	return (...args) => {
		const key = keyOf(...args);
		if (pending.has(key)) return pending.get(key);
		const result = run(...args);
		pending.set(key, result);
		const forget = () => pending.delete(key);
		result.then(forget, forget);
		return result;
	};
};
