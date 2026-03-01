/**
 * Lightweight URL parser for Tizen 2.4 (WebKit r152340 / JSC) which lacks the URL constructor.
 * Supports http:// and https:// only — sufficient for Jellyfin server addresses.
 *
 * @param {string} urlString
 * @returns {{ protocol: string, hostname: string, port: string, pathname: string, search: string, hash: string, host: string, origin: string, toString: function }}
 */
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

/**
 * Build a query string from a plain object.
 * Replacement for `new URLSearchParams(obj).toString()` on Tizen 2.4.
 *
 * @param {Object} params
 * @returns {string} Encoded query string without leading '?'
 */
export function buildQueryString (params) {
	return Object.keys(params)
		.filter(key => params[key] !== undefined && params[key] !== null)
		.map(key => encodeURIComponent(key) + '=' + encodeURIComponent(String(params[key])))
		.join('&');
}
