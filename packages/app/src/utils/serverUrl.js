import {parseUrl} from './urlCompat';

const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//;
const WITH_SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)([^?#]*)/;

const stripTrailingSlash = (value) => (value.charAt(value.length - 1) === '/' ? value.slice(0, -1) : value);

// A server that lives behind a reverse proxy answers on a path prefix, so the
// prefix has to survive. The web client's own address is what people copy out
// of the browser though, and that ends in /web or /web/index.html, which is not
// where the API lives.
const normalizeServerPath = (path) => {
	const segments = path.split('/').filter(Boolean);
	if (segments.length === 0) return '';

	const last = segments[segments.length - 1].toLowerCase();
	const secondLast = segments.length >= 2 ? segments[segments.length - 2].toLowerCase() : '';

	if (secondLast === 'web' && last === 'index.html') {
		segments.length -= 2;
	} else if (last === 'web') {
		segments.length -= 1;
	}

	return segments.length === 0 ? '' : '/' + segments.join('/');
};

const splitAuthority = (authority) => {
	const afterUserInfo = authority.slice(authority.indexOf('@') + 1);
	const bracketed = afterUserInfo.match(/^(\[[^\]]*\])(?::(\d+))?$/);
	if (bracketed) {
		return {host: bracketed[1].toLowerCase(), port: bracketed[2] || ''};
	}
	const parts = afterUserInfo.match(/^([^:]*)(?::(\d+))?$/);
	if (!parts) return {host: afterUserInfo.toLowerCase(), port: ''};
	return {host: parts[1].toLowerCase(), port: parts[2] || ''};
};

/**
 * Reduce a server address to the base the API hangs off, the way the other
 * clients do. Keeps an explicit scheme and any proxy path prefix, drops the
 * default port for the scheme, and drops the web client's own /web suffix.
 * An address typed without a scheme comes back without one.
 *
 * @param {string} input
 * @returns {string} the normalized base, or an empty string for empty input
 */
export function normalizeServerBaseUrl (input) {
	const trimmed = (input || '').trim();
	if (!trimmed) return '';

	const hasScheme = SCHEME.test(trimmed);
	const match = (hasScheme ? trimmed : 'https://' + trimmed).match(WITH_SCHEME);
	if (!match) return stripTrailingSlash(trimmed);

	const {host, port} = splitAuthority(match[2]);
	const path = normalizeServerPath(match[3] || '');
	const authority = port && port !== '80' && port !== '443' ? host + ':' + port : host;

	if (hasScheme) {
		return stripTrailingSlash(match[1].toLowerCase() + '://' + authority + path);
	}
	if (!host) return stripTrailingSlash(trimmed);
	return stripTrailingSlash(authority + path);
}

/**
 * The web client page that approves a Quick Connect code, or null when there
 * is no server address or code to build it from.
 *
 * Concatenated rather than resolved, which keeps a reverse proxy's path prefix.
 * The page reads the code from the query string, so a phone that is already
 * signed in approves with one tap instead of typing it.
 *
 * @param {string} baseUrl
 * @param {string} code
 * @returns {string|null}
 */
export function quickConnectApprovalUrl (baseUrl, code) {
	const base = normalizeServerBaseUrl(baseUrl);
	const digits = String(code || '').replace(/\s/g, '');
	if (!base || !digits) return null;
	return base + '/web/#/quickconnect?code=' + encodeURIComponent(digits);
}

export function normalizeServerUrl (input) {
	let url = input?.trim();
	if (!url) return null;

	url = url.replace(/\/+$/, '');

	if (!/^https?:\/\//i.test(url)) {
		url = 'http://' + url;
	}

	try {
		return parseUrl(url).toString().replace(/\/+$/, '');
	} catch (e) {
		return null;
	}
}

export function generateCandidates (input) {
	let raw = input?.trim();
	if (!raw) return [];

	raw = raw.replace(/\/+$/, '');

	if (/^https?:\/\//i.test(raw)) {
		const normalized = normalizeServerUrl(raw);
		return normalized ? [normalized] : [];
	}

	const hostMatch = raw.match(/^([^/:]+)(?::(\d+))?(\/.*)?$/);
	if (!hostMatch) return [];

	const hostname = hostMatch[1];
	const port = hostMatch[2];
	const pathSuffix = hostMatch[3] || '';

	if (port) {
		return [
			normalizeServerUrl('https://' + raw),
			normalizeServerUrl('http://' + raw)
		].filter(Boolean);
	}

	const isIP = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
	const isLocalName = !hostname.includes('.');

	if (isIP || isLocalName) {
		return [
			normalizeServerUrl('https://' + hostname + ':8096' + pathSuffix),
			normalizeServerUrl('http://' + hostname + ':8096' + pathSuffix),
			normalizeServerUrl('http://' + hostname + pathSuffix)
		].filter(Boolean);
	}

	return [
		normalizeServerUrl('https://' + raw),
		normalizeServerUrl('http://' + raw)
	].filter(Boolean);
}
