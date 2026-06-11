const abortError = () => {
	const err = new Error('The operation was aborted.');
	err.name = 'AbortError';
	return err;
};

const noop = () => {};

export const fetchWithTimeout = (url, options = {}, timeoutMs) => {
	if (typeof AbortController === 'undefined') {
		return Promise.race([
			fetch(url, options),
			new Promise((_, reject) => {
				setTimeout(() => reject(abortError()), timeoutMs);
			})
		]);
	}

	const controller = new AbortController();
	let timer = null;
	const timeoutPromise = new Promise((_, reject) => {
		timer = setTimeout(() => {
			controller.abort();
			reject(abortError());
		}, timeoutMs);
	});

	const fetchPromise = fetch(url, {...options, signal: controller.signal});
	fetchPromise.catch(noop);

	const raced = Promise.race([fetchPromise, timeoutPromise]);
	const clear = () => clearTimeout(timer);
	raced.then(clear, clear);
	return raced;
};
