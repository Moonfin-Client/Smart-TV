/**
 * LAN server discovery for Smart TV.
 *
 * Packaged webOS/Tizen apps can't open UDP sockets, so we can't use Jellyfin's
 * native broadcast discovery (port 7359). Instead we mirror the Moonfin web
 * client: leak the TV's private IPv4 via WebRTC ICE candidate gathering, derive
 * the local /24, then HTTP-probe every host for a Jellyfin/Emby public-info
 * endpoint. Results are streamed back via `onFound` as they're discovered.
 */
import {normalizeServerUrl} from '../utils/serverUrl';

const REQUEST_TIMEOUT = 1200;
const MAX_IN_FLIGHT = 16;
const COMMON_PORTS = [8096, 8920];
const JELLYFIN_PUBLIC_INFO_PATH = '/System/Info/Public';
const EMBY_PUBLIC_INFO_PATH = '/emby/System/Info/Public';
const WEBRTC_GATHER_TIMEOUT = 2500;

const IPV4_IN_CANDIDATE = /\s(\d{1,3}(?:\.\d{1,3}){3})\s\d+\s/;

const detectServerType = (info, typeHint) => {
	if (typeHint === 'emby' || typeHint === 'jellyfin') return typeHint;
	const productName = String(info.ProductName || '').toLowerCase();
	if (productName.includes('jellyfin')) return 'jellyfin';
	if (productName.includes('emby')) return 'emby';
	const parts = String(info.Version || '').split('.');
	const major = parseInt(parts[0], 10);
	if (!Number.isNaN(major) && parts.length >= 4 && major < 10) return 'emby';
	return null;
};

const parseIpv4 = (host) => {
	const parts = String(host || '').split('.');
	if (parts.length !== 4) return null;
	const octets = [];
	for (const part of parts) {
		const value = parseInt(part, 10);
		if (Number.isNaN(value) || value < 0 || value > 255 || String(value) !== part) {
			return null;
		}
		octets.push(value);
	}
	return octets;
};

const isPrivateIpv4 = ([a, b]) => (
	a === 10 ||
	(a === 172 && b >= 16 && b <= 31) ||
	(a === 192 && b === 168) ||
	(a === 169 && b === 254) ||
	(a === 100 && b >= 64 && b <= 127) ||
	a === 127
);

const extractPrivateIpv4 = (text, into) => {
	if (!text) return;
	// candidate lines can be newline-separated (full SDP) or single strings
	for (const line of String(text).split(/[\r\n]+/)) {
		const match = line.match(IPV4_IN_CANDIDATE);
		if (!match) continue;
		const octets = parseIpv4(match[1]);
		if (octets && isPrivateIpv4(octets)) {
			into.add(match[1]);
		}
	}
};

/**
 * Use WebRTC ICE gathering to learn the TV's private LAN IP(s).
 * Returns an array of "a.b.c" subnet prefixes (no host octet).
 */
const collectPrivateSubnets = () => new Promise((resolve) => {
	const PeerConnection = typeof window !== 'undefined' && window.RTCPeerConnection;
	if (!PeerConnection) {
		resolve([]);
		return;
	}

	let pc;
	const ips = new Set();
	let settled = false;

	const finish = () => {
		if (settled) return;
		settled = true;
		try {
			if (pc) {
				extractPrivateIpv4(pc.localDescription && pc.localDescription.sdp, ips);
				pc.close();
			}
		} catch (e) { /* ignore */ }

		const prefixes = new Set();
		ips.forEach((ip) => {
			const octets = parseIpv4(ip);
			if (octets) prefixes.add(`${octets[0]}.${octets[1]}.${octets[2]}`);
		});
		resolve([...prefixes]);
	};

	try {
		pc = new PeerConnection({iceServers: []});
		pc.createDataChannel('moonfin-discovery');

		pc.onicecandidate = (event) => {
			if (event.candidate && event.candidate.candidate) {
				extractPrivateIpv4(event.candidate.candidate, ips);
			} else if (!event.candidate) {
				// null candidate => gathering complete
				finish();
			}
		};

		pc.createOffer()
			.then((offer) => pc.setLocalDescription(offer))
			.catch(finish);

		setTimeout(finish, WEBRTC_GATHER_TIMEOUT);
	} catch (e) {
		finish();
	}
});

const probePath = async (baseUrl, path, signal) => {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
	const onAbort = () => controller.abort();
	if (signal) signal.addEventListener('abort', onAbort);
	try {
		const response = await fetch(baseUrl + path, {
			method: 'GET',
			headers: {Accept: 'application/json'},
			signal: controller.signal
		});
		if (!response.ok) return null;
		return await response.json();
	} catch (e) {
		return null;
	} finally {
		clearTimeout(timer);
		if (signal) signal.removeEventListener('abort', onAbort);
	}
};

const probeServer = async (baseUrl, signal) => {
	const jellyfinInfo = await probePath(baseUrl, JELLYFIN_PUBLIC_INFO_PATH, signal);
	let info = jellyfinInfo;
	let typeHint = null;
	if (!info && !(signal && signal.aborted)) {
		info = await probePath(baseUrl, EMBY_PUBLIC_INFO_PATH, signal);
		typeHint = 'emby';
	}
	if (!info) return null;

	const serverType = detectServerType(info, typeHint);
	if (!serverType) return null;

	let host = baseUrl;
	try {
		host = new URL(baseUrl).host;
	} catch (e) { /* keep baseUrl */ }

	return {
		Id: info.Id || `${serverType}-${baseUrl}`,
		Name: info.ServerName || info.Name || host,
		Address: baseUrl,
		Version: info.Version,
		serverType
	};
};

/**
 * Build the candidate URL list, grouped so the most common endpoint
 * (http :8096) sweeps the whole subnet first — that way a real server
 * surfaces within the first pass instead of after the full scan.
 */
const buildCandidates = (prefixes) => {
	const combos = [
		{scheme: 'http', port: 8096},
		{scheme: 'https', port: 8920},
		{scheme: 'http', port: 8920},
		{scheme: 'https', port: 8096}
	].filter(({port}) => COMMON_PORTS.includes(port));

	const seen = new Set();
	const candidates = [];
	for (const {scheme, port} of combos) {
		for (const prefix of prefixes) {
			for (let hostPart = 1; hostPart <= 254; hostPart++) {
				const normalized = normalizeServerUrl(`${scheme}://${prefix}.${hostPart}:${port}`);
				if (normalized && !seen.has(normalized)) {
					seen.add(normalized);
					candidates.push(normalized);
				}
			}
		}
	}
	return candidates;
};

/**
 * Scan the local network for Jellyfin/Emby servers.
 *
 * @param {object} opts
 * @param {(server: object) => void} opts.onFound  Called once per server found.
 * @param {AbortSignal} [opts.signal]              Abort to cancel the scan.
 * @returns {Promise<void>} Resolves when the scan completes or is aborted.
 */
export const scanLocalServers = async ({onFound, signal} = {}) => {
	if (signal && signal.aborted) return;

	const prefixes = await collectPrivateSubnets();
	if (!prefixes.length || (signal && signal.aborted)) return;

	const candidates = buildCandidates(prefixes);
	if (!candidates.length) return;

	const seen = new Set();
	let index = 0;

	const worker = async () => {
		while (index < candidates.length && !(signal && signal.aborted)) {
			const baseUrl = candidates[index++];
			const server = await probeServer(baseUrl, signal);
			if (server && !(signal && signal.aborted)) {
				const key = (normalizeServerUrl(server.Address) || server.Address).toLowerCase();
				if (!seen.has(key)) {
					seen.add(key);
					if (typeof onFound === 'function') onFound(server);
				}
			}
		}
	};

	const workerCount = Math.min(MAX_IN_FLIGHT, candidates.length);
	await Promise.all(Array.from({length: workerCount}, worker));
};

export default {scanLocalServers};
