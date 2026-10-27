// A detachable sink for tracing server requests.
//
// The fetch wrappers call in on every request, and nothing is attached until the user turns
// diagnostic logging on, so the cost while it is off is one null check. The sink lives here
// rather than the wrappers reaching for the logger service so the transport layer depends on
// nothing and stays testable on its own.

let sink = null;

export const setNetworkLogSink = (fn) => {
	sink = typeof fn === 'function' ? fn : null;
};

// Query values that would otherwise put a working credential into a report that gets
// uploaded to the server.
const SECRET_PARAMS = ['apikey', 'api_key', 'token', 'x-plex-token'];

export const redactUrl = (url) => {
	const text = String(url || '');
	const queryStart = text.indexOf('?');
	if (queryStart === -1) return text;

	const query = text.slice(queryStart + 1)
		.split('&')
		.map((pair) => {
			const eq = pair.indexOf('=');
			if (eq === -1) return pair;
			const name = pair.slice(0, eq);
			return SECRET_PARAMS.includes(name.toLowerCase()) ? `${name}=***` : pair;
		})
		.join('&');

	return `${text.slice(0, queryStart)}?${query}`;
};

// Sending a report is itself a request, so tracing it would grow the buffer every time one
// goes out and the next report would carry the noise from the last.
const isSelfReport = (url) => String(url || '').includes('/ClientLog/');

// Wraps a request so a trace lands whichever way it settles. `send` takes no arguments and
// its resolved value is passed straight back, so callers keep their own return contract.
export const traceRequest = (method, url, send) => {
	if (!sink || isSelfReport(url)) return send();

	const verb = method || 'GET';
	const target = redactUrl(url);
	const startedAt = Date.now();

	sink(`-> ${verb} ${target}`, 'debug');
	return send().then(
		(response) => {
			sink(`<- ${response?.status ?? 'ok'} ${verb} ${target} (${Date.now() - startedAt}ms)`, 'debug');
			return response;
		},
		(err) => {
			const reason = err?.message || String(err || 'failed');
			sink(`xx ${verb} ${target} (${Date.now() - startedAt}ms) ${reason}`, 'error');
			throw err;
		}
	);
};
