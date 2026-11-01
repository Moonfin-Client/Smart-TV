import {traceRequest} from './networkLogSink';

const abortError = () => {
	const err = new Error('The operation was aborted.');
	err.name = 'AbortError';
	return err;
};

const noop = () => {};

const send = (url, options, timeoutMs) => {
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

// The webOS proxy waits this long when no time is given. Here no time used to mean a timer of
// zero, which aborted the request as soon as it went out.
const DEFAULT_TIMEOUT_MS = 30000;

export const fetchWithTimeout = (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) =>
	traceRequest(options.method || 'GET', url, () => send(url, options, timeoutMs || DEFAULT_TIMEOUT_MS));
