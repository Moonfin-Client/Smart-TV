/**
 * platformFetch - fetch wrapper with a webOS TLS fallback.
 *
 * Old webOS TVs ship a system root-CA store that predates the current Let's
 * Encrypt roots (the DST Root CA X3 cross-sign expired 2021-09-30), so the
 * WebView aborts the TLS handshake to Let's-Encrypt-secured servers with
 * net::ERR_INSECURE_RESPONSE before any request body is sent. That surfaces in
 * JS as a generic `TypeError` ("Failed to fetch"), indistinguishable from a
 * real network failure.
 *
 * We cannot override the WebView's certificate validation from JS. The only
 * workaround is to run the request inside the bundled Node.js Luna service
 * (`luna://org.moonfin.webos.service/fetch`), which carries its own up-to-date
 * CA bundle. On a network error against an https:// server on webOS we retry
 * through the service; if that succeeds we remember it per-server so subsequent
 * calls skip the failing native attempt. If the service also reports a TLS/cert
 * rejection we surface `INSECURE_CERT` so the UI can show actionable guidance.
 */

import {abortError, fetchWithTimeout} from '../utils/fetchTimeout';
import {classifyError, INSECURE_CERT, DNS_OR_NETWORK, TIMEOUT} from '../utils/connectionErrors';
import {traceRequest} from '../utils/networkLogSink';
import {isVega, isWebOS, isXbox} from '../platform';
import {getFromStorage} from './storage';
import {loadShellBridge} from './shellBridge';

const SERVICE_URI = 'luna://org.moonfin.webos.service/fetch';

// Per-server memory: hosts for which the native path failed but the proxy
// worked. Keyed by origin (protocol//host). Lives for the app session.
const proxyHosts = new Set();

const originOf = (url) => {
	const m = /^(https?:\/\/[^/]+)/i.exec(url || '');
	return m ? m[1].toLowerCase() : url;
};

const isHttps = (url) => /^https:\/\//i.test(url || '');

// A subset of the Fetch Response API, enough for jellyfinApi's request().
const makeResponse = ({status, body, headers}) => {
	const text = body == null ? '' : body;
	return {
		ok: status >= 200 && status < 300,
		status,
		statusText: '',
		headers: {
			get: (name) => (headers ? headers[String(name).toLowerCase()] : undefined) || null,
			forEach: (fn) => Object.keys(headers || {}).forEach((name) => fn(headers[name], name))
		},
		text: () => Promise.resolve(text),
		json: () => Promise.resolve(text ? JSON.parse(text) : null)
	};
};

// Read fresh each call so a runtime toggle of allowInsecureCerts takes effect.
// lastSettings is only a fallback for when the storage read itself fails.
let lastSettings = {};
const readSettings = async () => {
	try {
		lastSettings = (await getFromStorage('settings')) || {};
	} catch (e) {
		// keep last known settings
	}
	return lastSettings;
};

// Plex and Emby account calls carry a password or token, so the setting never reaches them.
const ACCOUNT_SERVICE = /[/.](plex\.tv|emby\.media)(:\d+)?$/;
const allowInsecureFor = (url, settings) => !!settings.allowInsecureCerts && !ACCOUNT_SERVICE.test(originOf(url));

// The WebView on Fire TV and on Xbox refuses a certificate it cant verify and the
// page only sees a network error. With the setting on, the shell is told to
// accept the host and the request is tried once more.
const shellAllowedHosts = new Set();

const httpsHostOf = (url) => (/^https:\/\/([^/?#]+)/i.exec(url || '') || [])[1];

const allowHostInShell = async (url) => {
	const host = httpsHostOf(url);
	if (!host || shellAllowedHosts.has(host)) return false;
	const bridge = await loadShellBridge();
	if (!bridge) return false;
	const settings = await readSettings();
	if (!allowInsecureFor(url, settings)) return false;
	bridge.allowInsecureHost(host);
	shellAllowedHosts.add(host);
	return true;
};

/**
 * Call the webOS Luna service to perform the request outside the WebView TLS
 * stack. Resolves with a Response-like object, or rejects with an error whose
 * `connectionType` is INSECURE_CERT (cert/TLS rejection) or DNS_OR_NETWORK.
 */
const sendViaProxy = (url, options, timeoutMs, allowInsecure) => new Promise((resolve, reject) => {
	const Bridge = typeof window !== 'undefined' && window.PalmServiceBridge;
	if (!Bridge) {
		reject(new Error('PalmServiceBridge unavailable'));
		return;
	}

	let settled = false;
	let timer = null;
	const bridge = new Bridge();
	const cleanup = () => {
		if (timer) clearTimeout(timer);
		try { bridge.cancel(); } catch (e) { /* bridge already closed */ }
	};
	timer = setTimeout(() => {
		if (settled) return;
		settled = true;
		cleanup();
		const err = new Error('Proxy request timed out');
		err.connectionType = DNS_OR_NETWORK;
		reject(err);
	}, (timeoutMs || 15000) + 2000);

	bridge.onservicecallback = (msg) => {
		if (settled) return;
		settled = true;
		cleanup();
		let res;
		try {
			res = JSON.parse(msg);
		} catch (e) {
			const parseErr = new Error('Malformed proxy response');
			parseErr.connectionType = DNS_OR_NETWORK;
			reject(parseErr);
			return;
		}
		if (res.returnValue) {
			resolve(makeResponse(res));
			return;
		}
		const failErr = new Error(res.errorText || 'Proxy request failed');
		failErr.connectionType = res.errorClass === 'cert' ? INSECURE_CERT : DNS_OR_NETWORK;
		reject(failErr);
	};

	bridge.call(SERVICE_URI, JSON.stringify({
		url,
		method: options.method || 'GET',
		headers: options.headers || {},
		body: options.body,
		timeoutMs: timeoutMs || 30000,
		insecure: !!allowInsecure
	}));
});

// The proxy goes through the Luna bridge rather than fetch, so it needs its own trace or
// the path that exists precisely because these TVs have connection trouble stays invisible.
const proxyRequest = (url, options, timeoutMs, allowInsecure) => traceRequest(
	`${options.method || 'GET'} (proxy)`,
	url,
	() => sendViaProxy(url, options, timeoutMs, allowInsecure)
);

/**
 * Drop-in replacement for fetchWithTimeout that adds the webOS proxy fallback.
 *
 * @param {string} url
 * @param {Object} options - fetch-style options (method, headers, body)
 * @param {number} timeoutMs
 * @returns {Promise<Response|Object>} a fetch Response or Response-like object
 */
export const platformFetch = async (url, options = {}, timeoutMs) => {
	const webos = isWebOS();
	const origin = originOf(url);
	const canProxy = webos && isHttps(url) && typeof window !== 'undefined' && window.PalmServiceBridge;

	// If we already know the native path fails for this host, go straight to the
	// proxy (avoids a guaranteed-to-fail fetch + its timeout on every request).
	if (canProxy && proxyHosts.has(origin)) {
		const settings = await readSettings();
		return proxyRequest(url, options, timeoutMs, allowInsecureFor(url, settings));
	}

	try {
		return await fetchWithTimeout(url, options, timeoutMs);
	} catch (err) {
		// Only a genuine network-class failure (TypeError) is a cert-rejection
		// candidate. Timeouts/aborts are rethrown unchanged.
		if (classifyError(err) !== DNS_OR_NETWORK) {
			throw err;
		}
		if (isHttps(url) && await allowHostInShell(url)) {
			return fetchWithTimeout(url, options, timeoutMs);
		}
		if (!canProxy) {
			throw err;
		}
		// Retry through the proxy. If it succeeds, remember this host so future
		// calls skip the doomed native attempt. If it also fails with a TLS/cert
		// rejection, that error carries connectionType === INSECURE_CERT so the
		// UI shows the cert-specific guidance instead of a generic "can't reach".
		const settings = await readSettings();
		const res = await proxyRequest(url, options, timeoutMs, allowInsecureFor(url, settings));
		proxyHosts.add(origin);
		return res;
	}
};

export const originFreeFetch = (url, options = {}, timeoutMs) => {
	const canProxy = isWebOS() && isHttps(url) && typeof window !== 'undefined' && window.PalmServiceBridge;
	return canProxy ? proxyRequest(url, options, timeoutMs, false) : fetch(url, options);
};

// A Plex server only lets app.plex.tv read its answers across origins, Silo sends no CORS
// headers, and the page on Fire TV sits at file:// and on Xbox at http://moonfin.internal,
// so the shell makes those requests there. The shell can't stop a request it has sent, so a
// caller that gives up only stops one that hasn't gone out yet. One already sent is waited
// for and keeps its place in the queue.
export const corsFreeFetch = async (url, options = {}, timeoutMs) => {
	const bridge = isVega() || isXbox() ? await loadShellBridge() : null;
	if (!bridge?.requestThroughShell) return platformFetch(url, options, timeoutMs);
	if (options.signal?.aborted) throw abortError();
	return traceRequest(`${options.method || 'GET'} (shell)`, url, async () => {
		let answer = await bridge.requestThroughShell(url, options, timeoutMs);
		// When the shell refused the certificate and the setting allows it, try once more, even if another request already
		// let the host through. Only the Xbox host reports this, and never after a redirect, since that server already acted.
		if (!answer.status && answer.failure === 'certificate' && !answer.redirected && (shellAllowedHosts.has(httpsHostOf(url)) || await allowHostInShell(url))) {
			if (options.signal?.aborted) throw abortError();
			answer = await bridge.requestThroughShell(url, options, timeoutMs);
		}
		if (answer.status) return makeResponse(answer);
		const err = new Error(answer.failure === 'timeout' ? 'Shell request timed out' : 'Shell request failed');
		err.connectionType = answer.failure === 'timeout' ? TIMEOUT : answer.failure === 'certificate' ? INSECURE_CERT : DNS_OR_NETWORK;
		throw err;
	});
};
