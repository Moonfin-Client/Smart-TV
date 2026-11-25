import {traceRequest} from './networkLogSink';

export const abortError = () => {
	const err = new Error('The operation was aborted.');
	err.name = 'AbortError';
	return err;
};

const noop = () => {};

const send = (url, options, timeoutMs) => {
	const caller = options.signal;
	if (caller?.aborted) return Promise.reject(abortError());
	// Without AbortController the request can't be stopped, so the timeout and the caller's abort
	// only stop the wait for it.
	const controller = typeof AbortController === 'undefined' ? null : new AbortController();
	let stop = null;
	let timer = null;
	const timeoutPromise = new Promise((_, reject) => {
		stop = controller ? () => controller.abort() : () => reject(abortError());
		timer = setTimeout(() => {
			if (controller) controller.abort();
			reject(abortError());
		}, timeoutMs);
	});
	if (caller) caller.addEventListener('abort', stop);

	const fetchPromise = fetch(url, controller ? {...options, signal: controller.signal} : options);
	fetchPromise.catch(noop);

	const raced = Promise.race([fetchPromise, timeoutPromise]);
	const clear = () => {
		clearTimeout(timer);
		if (caller) caller.removeEventListener('abort', stop);
	};
	raced.then(clear, clear);
	return raced;
};

// The webOS proxy waits this long when no time is given. A missing or zero time falls back to it,
// since a zero timer would abort the request as soon as it went out.
const DEFAULT_TIMEOUT_MS = 30000;

export const fetchWithTimeout = (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) =>
	traceRequest(options.method || 'GET', url, () => send(url, options, timeoutMs || DEFAULT_TIMEOUT_MS));
