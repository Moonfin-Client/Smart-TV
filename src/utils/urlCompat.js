// A small URL parser for Tizen 2.4, whose WebKit lacks the URL constructor. It only reads
// http and https, which is all a server address needs.
export function parseUrl (urlString) {
	const match = urlString.match(/^(https?):\/\/([^/:]+)(?::(\d+))?(\/[^?#]*)?(\?[^#]*)?(#.*)?$/i);

	if (!match) {
		throw new TypeError('Invalid URL: ' + urlString);
	}

	const protocol = match[1].toLowerCase() + ':';
	const hostname = match[2];
	const port = match[3] || '';
	const pathname = match[4] || '/';
	const search = match[5] || '';
	const hash = match[6] || '';
	const host = hostname + (port ? ':' + port : '');
	const origin = protocol + '//' + host;

	return {
		protocol,
		hostname,
		port,
		pathname,
		search,
		hash,
		host,
		origin,
		toString () {
			return this.origin + this.pathname + this.search + this.hash;
		}
	};
}

// Stands in for `new URLSearchParams(obj).toString()`, which Tizen 2.4 lacks.
export function buildQueryString (params) {
	return Object.keys(params)
		.filter(key => params[key] !== undefined && params[key] !== null)
		.map(key => encodeURIComponent(key) + '=' + encodeURIComponent(String(params[key])))
		.join('&');
}
