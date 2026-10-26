/**
 * Finds Jellyfin, Emby and Plex servers on the local network.
 *
 * A packaged TV app has no UDP socket, so the broadcast the other clients send
 * is out of reach. All that is left is asking every address that could
 * plausibly be a server whether it is one. The addresses come from the page's
 * own host and from the TV's own LAN address, which WebRTC gives up as an ICE
 * candidate and which is what tells us the subnet to walk.
 */

import {detectServerType} from '../utils/connectionErrors';
import {normalizeServerBaseUrl} from '../utils/serverUrl';
import {resolvePlatformModule} from './platformModule';
import {isVega} from '../platform';
import {loadShellBridge} from './shellBridge';
import {plexVersion} from './plexMapper';

const REQUEST_TIMEOUT = 1200;
const MAX_IN_FLIGHT = 16;
const COMMON_PORTS = [8096, 8920];
// Plex answers on its own port, over plain http on a LAN, since its certificate names a plex.direct host and not the address.
const PLEX_PORT = 32400;
const PLEX_ADDRESS = new RegExp(`:${PLEX_PORT}$`);
const WEBRTC_GATHER_TIMEOUT = 2200;
const WEBRTC_POLL_INTERVAL = 120;

// Emby answers at both of these and a reverse proxy often routes only the
// second, so a host that answers is asked on both before it is ruled out.
const PUBLIC_INFO_PATHS = ['/System/Info/Public', '/emby/System/Info/Public'];

export const parseIpv4 = (host) => {
	const parts = String(host || '').split('.');
	if (parts.length !== 4) return null;

	const octets = [];
	for (let i = 0; i < parts.length; i++) {
		if (!/^\d{1,3}$/.test(parts[i])) return null;
		const value = parseInt(parts[i], 10);
		if (value < 0 || value > 255) return null;
		octets.push(value);
	}
	return octets;
};

export const isPrivateIpv4 = (octets) => {
	const first = octets[0];
	const second = octets[1];
	return first === 10 ||
		(first === 172 && second >= 16 && second <= 31) ||
		(first === 192 && second === 168) ||
		(first === 169 && second === 254) ||
		(first === 100 && second >= 64 && second <= 127) ||
		first === 127;
};

export const extractPrivateIpv4FromSdp = (sdp) => {
	const candidates = /candidate:[^\r\n]*?\s(\d{1,3}(?:\.\d{1,3}){3})\s\d+\s/g;
	const result = [];
	const seen = {};

	let match = candidates.exec(sdp);
	while (match) {
		const ip = match[1];
		if (ip && !seen[ip]) {
			seen[ip] = true;
			const octets = parseIpv4(ip);
			if (octets && isPrivateIpv4(octets)) result.push(octets);
		}
		match = candidates.exec(sdp);
	}
	return result;
};

const formatHostForUrl = (host) => {
	if (host.indexOf(':') >= 0 && host.charAt(0) !== '[') return '[' + host + ']';
	return host;
};

const readString = (data, keys) => {
	for (let i = 0; i < keys.length; i++) {
		const value = data[keys[i]];
		if (value === null || value === undefined) continue;
		const text = String(value).trim();
		if (text) return text;
	}
	return '';
};

// Strip only the endpoint itself, so a server reached through /emby keeps that
// prefix and the rest of the API is reachable from what we hand back.
const resolveBaseUrl = (requestUrl) => {
	const suffix = PUBLIC_INFO_PATHS[0].toLowerCase();
	const withoutQuery = requestUrl.split('#')[0].split('?')[0];
	if (withoutQuery.toLowerCase().slice(-suffix.length) === suffix) {
		return withoutQuery.slice(0, -suffix.length);
	}
	return withoutQuery;
};

const SILENT = {ok: false, answered: false};
const ANSWERED = {ok: false, answered: true};

// An answer only counts as a server's when it's a JSON object.
const jsonAnswer = (status, text, url) => {
	if (status < 200 || status >= 300) return ANSWERED;
	try {
		const data = JSON.parse(text);
		return data && typeof data === 'object' ? {ok: true, answered: true, data, url} : ANSWERED;
	} catch (e) {
		return ANSWERED;
	}
};

/**
 * A bare GET that reports a JSON body and whether anything answered at all.
 * Deliberately not the app's own fetch wrapper: a subnet walk is a thousand
 * requests that are expected to fail, and they should neither reach the request
 * log nor keep a socket alive past their timeout.
 */
const requestJson = (url, live) => new Promise((resolve) => {
	let xhr;
	try {
		xhr = new window.XMLHttpRequest();
	} catch (e) {
		resolve(SILENT);
		return;
	}

	let settled = false;
	const finish = (value) => {
		if (settled) return;
		settled = true;
		const at = live.indexOf(xhr);
		if (at >= 0) live.splice(at, 1);
		resolve(value);
	};

	try {
		xhr.open('GET', url, true);
		// Plex answers in XML without it.
		xhr.setRequestHeader('Accept', 'application/json');
	} catch (e) {
		resolve(SILENT);
		return;
	}

	xhr.timeout = REQUEST_TIMEOUT;
	xhr.onload = () => finish(jsonAnswer(xhr.status, xhr.responseText, xhr.responseURL || url));
	xhr.onerror = () => finish(SILENT);
	xhr.ontimeout = () => finish(SILENT);
	xhr.onabort = () => finish(SILENT);

	live.push(xhr);
	try {
		xhr.send();
	} catch (e) {
		finish(SILENT);
	}
});

// On Fire TV the shell asks instead, since the page at file:// can't read a Plex server's answer.
const requestJsonInShell = async (url) => {
	const answer = await (await loadShellBridge()).requestThroughShell(url, {headers: {Accept: 'application/json'}}, REQUEST_TIMEOUT);
	return answer.status ? jsonAnswer(answer.status, answer.body, url) : SILENT;
};

const probePlex = async (base, state) => {
	const url = base + '/identity';
	const response = await (isVega() ? requestJsonInShell(url) : requestJson(url, state.live));
	const identity = response.ok ? response.data.MediaContainer : null;
	if (!identity || !identity.machineIdentifier) return null;
	return {
		id: identity.machineIdentifier,
		name: 'Plex Media Server',
		address: base,
		serverType: 'plex',
		version: plexVersion(identity.version) || ''
	};
};

const probeServer = async (baseUrl, state) => {
	const base = baseUrl.charAt(baseUrl.length - 1) === '/' ? baseUrl.slice(0, -1) : baseUrl;
	if (PLEX_ADDRESS.test(base)) return probePlex(base, state);

	for (let i = 0; i < PUBLIC_INFO_PATHS.length; i++) {
		if (state.canceled) return null;
		const response = await requestJson(base + PUBLIC_INFO_PATHS[i], state.live);
		// Nothing listening rules the address out entirely. Only a host that did
		// answer is worth asking again on the path a proxy might route instead.
		if (!response.answered) return null;
		if (!response.ok) continue;

		const {data} = response;
		const address = normalizeServerBaseUrl(resolveBaseUrl(response.url));
		const id = readString(data, ['Id', 'ServerId']);
		const name = readString(data, ['ServerName', 'Name', 'ProductName']);
		// Something answered the public info endpoint with JSON, so treat an
		// unfamiliar reply as Jellyfin rather than dropping a reachable server.
		const serverType = detectServerType(data.ProductName, data.Version) || 'jellyfin';
		const host = address.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '').split('/')[0];

		return {
			id: id || serverType + '-' + address,
			name: name || host || address,
			address,
			serverType,
			version: readString(data, ['Version'])
		};
	}
	return null;
};

const probeCandidates = async (candidates, state) => {
	if (candidates.length === 0 || state.canceled) return;

	let next = 0;
	const workerCount = Math.min(candidates.length, MAX_IN_FLIGHT);
	const workers = [];
	for (let i = 0; i < workerCount; i++) {
		workers.push((async () => {
			while (next < candidates.length && !state.canceled) {
				const discovered = await probeServer(candidates[next++], state);
				if (discovered) state.emit(discovered);
			}
		})());
	}
	await Promise.all(workers);
};

const discoverSameOriginAndCommonHosts = async (state) => {
	if (state.canceled) return;

	const loc = window.location;
	const host = (loc.hostname || '').trim();
	if (!host) return;

	const candidates = [];
	const add = (value) => {
		const normalized = normalizeServerBaseUrl(value);
		if (normalized && candidates.indexOf(normalized) < 0) candidates.push(normalized);
	};

	add(loc.protocol + '//' + loc.host);

	const hosts = [host];
	if (host === 'localhost') hosts.push('127.0.0.1');
	if (host === '127.0.0.1') hosts.push('localhost');

	const schemes = loc.protocol === 'https:' ? ['https'] : ['http', 'https'];

	for (let h = 0; h < hosts.length; h++) {
		const hostForUrl = formatHostForUrl(hosts[h]);
		for (let s = 0; s < schemes.length; s++) {
			for (let p = 0; p < COMMON_PORTS.length; p++) {
				add(schemes[s] + '://' + hostForUrl + ':' + COMMON_PORTS[p]);
			}
		}
	}

	await probeCandidates(candidates, state);
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createPeerConnection = () => {
	const Ctor = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
	if (!Ctor) return null;
	try {
		return new Ctor({iceServers: []});
	} catch (e) {
		return null;
	}
};

// Two spellings of the same pair of calls. The callback form returns a promise
// that resolves with nothing, so racing it against the callback loses the offer
// and every later step then fails on an undefined description.
const negotiate = (peer) => new Promise((resolve, reject) => {
	const applyOffer = (offer) => {
		let applying;
		try {
			applying = peer.setLocalDescription(offer);
		} catch (e) {
			peer.setLocalDescription(offer, resolve, reject);
			return;
		}
		if (applying && typeof applying.then === 'function') applying.then(resolve, reject);
		else resolve();
	};

	let offering;
	try {
		offering = peer.createOffer();
	} catch (e) {
		offering = null;
	}
	if (offering && typeof offering.then === 'function') {
		offering.then(applyOffer, reject);
		return;
	}
	peer.createOffer(applyOffer, reject);
});

// The offer we never send. Creating a data channel is what makes the browser
// gather candidates, and each host candidate names one of the TV's own
// addresses, which is the only way a page gets told what subnet it is on.
const collectPrivateIpv4FromWebRtc = async () => {
	const peer = createPeerConnection();
	if (!peer) return [];

	const found = [];
	const seen = {};
	const remember = (octets) => {
		const key = octets.join('.');
		if (seen[key]) return;
		seen[key] = true;
		found.push(octets);
	};

	try {
		peer.createDataChannel('moonfin-discovery');
		peer.onicecandidate = (event) => {
			const line = event && event.candidate && event.candidate.candidate;
			if (line) extractPrivateIpv4FromSdp(line + '\r\n').forEach(remember);
		};

		try {
			await negotiate(peer);
		} catch (e) {
			// Candidates can still arrive when only the completion signal is missing
		}

		const deadline = Date.now() + WEBRTC_GATHER_TIMEOUT;
		while (Date.now() < deadline && peer.iceGatheringState !== 'complete') {
			await wait(WEBRTC_POLL_INTERVAL);
		}

		const sdp = (peer.localDescription && peer.localDescription.sdp) || '';
		if (sdp.trim()) extractPrivateIpv4FromSdp(sdp).forEach(remember);
	} catch (e) {
		// A TV that blocks WebRTC just leaves us with whatever the page origin says
	} finally {
		try {
			peer.close();
		} catch (e) {
			// Already closed
		}
	}

	return found;
};

export const buildPrivateSubnetCandidates = ({prefixes, currentHostByPrefix, originScheme}) => {
	const names = Object.keys(prefixes);
	if (names.length === 0) return [];

	const schemes = String(originScheme || '').toLowerCase() === 'https' ? ['https'] : ['http', 'https'];
	const candidates = [];
	const seen = {};

	for (let i = 0; i < names.length; i++) {
		const prefix = names[i];
		const currentHost = currentHostByPrefix[prefix];
		for (let hostPart = 1; hostPart <= 254; hostPart++) {
			if (currentHost !== undefined && hostPart === currentHost) continue;
			const host = prefix + '.' + hostPart;
			for (let s = 0; s < schemes.length; s++) {
				for (let p = 0; p < COMMON_PORTS.length; p++) {
					const normalized = normalizeServerBaseUrl(schemes[s] + '://' + host + ':' + COMMON_PORTS[p]);
					if (normalized && !seen[normalized]) {
						seen[normalized] = true;
						candidates.push(normalized);
					}
				}
			}
			if (schemes.indexOf('http') >= 0) candidates.push('http://' + host + ':' + PLEX_PORT);
		}
	}

	return candidates;
};

// A platform may know the device's own address where the page cant find it,
// since newer browsers hide the host candidates behind mDNS names.
const deviceAddress = async () => {
	try {
		const {getDeviceInfo} = await resolvePlatformModule('deviceInfo');
		return (await getDeviceInfo())?.ipAddress || '';
	} catch (e) {
		return '';
	}
};

const discoverPrivateSubnet = async (state) => {
	if (state.canceled) return;

	const prefixes = {};
	const currentHostByPrefix = {};
	const remember = (octets) => {
		const prefix = octets[0] + '.' + octets[1] + '.' + octets[2];
		prefixes[prefix] = true;
		currentHostByPrefix[prefix] = octets[3];
	};

	const originOctets = parseIpv4(window.location.hostname);
	if (originOctets && isPrivateIpv4(originOctets)) remember(originOctets);

	const [deviceIp, webRtcIps] = await Promise.all([deviceAddress(), collectPrivateIpv4FromWebRtc()]);
	if (state.canceled) return;
	const deviceOctets = parseIpv4(deviceIp);
	if (deviceOctets && isPrivateIpv4(deviceOctets)) remember(deviceOctets);
	webRtcIps.forEach(remember);

	const candidates = buildPrivateSubnetCandidates({
		prefixes,
		currentHostByPrefix,
		originScheme: (window.location.protocol || '').replace(':', '')
	});
	if (candidates.length === 0) return;

	await probeCandidates(candidates, state);
};

/**
 * Walk the network for servers, reporting each one the moment it answers.
 *
 * @param {Object} handlers
 * @param {function} handlers.onFound - called with each server, deduplicated by address
 * @param {function} [handlers.onDone] - called once the walk finishes or is canceled
 * @returns {function} cancel, which stops the walk and drops every request in flight
 */
export const discoverLocalServers = ({onFound, onDone}) => {
	const seen = {};
	const state = {
		canceled: false,
		live: [],
		emit: (server) => {
			if (state.canceled) return;
			const key = normalizeServerBaseUrl(server.address).toLowerCase();
			if (!key || seen[key]) return;
			seen[key] = true;
			onFound(server);
		}
	};

	const cancel = () => {
		if (state.canceled) return;
		state.canceled = true;
		const live = state.live.splice(0, state.live.length);
		for (let i = 0; i < live.length; i++) {
			try {
				live[i].abort();
			} catch (e) {
				// Already finished
			}
		}
	};

	(async () => {
		try {
			await discoverSameOriginAndCommonHosts(state);
			if (state.canceled) return;
			await discoverPrivateSubnet(state);
		} catch (e) {
			console.error('[DISCOVERY] Local server discovery failed:', e);
		} finally {
			if (!state.canceled) onDone?.();
		}
	})();

	return cancel;
};
