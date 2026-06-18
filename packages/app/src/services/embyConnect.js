import {fetchWithTimeout} from '../utils/fetchTimeout';
import {getDeviceInfo, buildEmbyAuthHeader} from './jellyfinApi';

const CONNECT_BASE = 'https://connect.emby.media/service/';
const TIMEOUT_MS = 15000;

const applicationHeader = () => {
	const {appName, appVersion} = getDeviceInfo();
	return `${appName}/${appVersion}`;
};

const connectError = (message, reason) => {
	const err = new Error(message);
	err.reason = reason;
	return err;
};

const parseJson = async (response) => {
	const text = await response.text();
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch (e) {
		return null;
	}
};

const str = (value) => (value == null ? '' : String(value));

const pick = (obj, keys) => {
	for (const key of keys) {
		if (obj && obj[key] != null) return str(obj[key]);
	}
	return '';
};

const asList = (data) => {
	if (Array.isArray(data)) return data;
	if (data && typeof data === 'object') {
		const nested = data.Items || data.Servers;
		if (Array.isArray(nested)) return nested;
	}
	return [];
};

// Authenticate against Emby Connect. Tries GET first (legacy compatible) and
// falls back to POST, mirroring the Flutter client.
export const authenticate = async (username, password) => {
	const headers = {'X-Application': applicationHeader(), 'Accept': 'application/json'};
	const query = `nameOrEmail=${encodeURIComponent(username)}&rawpw=${encodeURIComponent(password)}`;

	let response = null;
	try {
		response = await fetchWithTimeout(`${CONNECT_BASE}user/authenticate?${query}`, {method: 'GET', headers}, TIMEOUT_MS);
	} catch (e) {
		response = null;
	}

	if (response && response.status === 401) {
		throw connectError('Invalid Emby Connect username or password', 'invalidCredentials');
	}

	if (!response || !response.ok) {
		response = await fetchWithTimeout(`${CONNECT_BASE}user/authenticate`, {
			method: 'POST',
			headers: {...headers, 'Content-Type': 'application/json'},
			body: JSON.stringify({nameOrEmail: username, rawpw: password})
		}, TIMEOUT_MS);
		if (response.status === 401) {
			throw connectError('Invalid Emby Connect username or password', 'invalidCredentials');
		}
		if (!response.ok) {
			throw connectError('Network error while contacting Emby Connect', 'network');
		}
	}

	const data = await parseJson(response);
	const rawUser = (data && (data.User || data.user)) || data || {};
	const result = {
		accessToken: pick(data || {}, ['AccessToken', 'accessToken', 'ConnectAccessToken', 'connectAccessToken']),
		userId: pick(rawUser, ['Id', 'UserId', 'ConnectUserId', 'connectUserId']),
		userName: pick(rawUser, ['Name', 'Username'])
	};
	if (!result.accessToken || !result.userId) {
		throw connectError('Invalid Emby Connect credentials', 'invalidAuthResponse');
	}
	return result;
};

const normalizedCandidates = (value) => {
	let sanitized = value.replace(/\/+$/, '').replace(/[?#].*$/, '');
	if (/^https?:\/\//i.test(sanitized)) return [sanitized];
	return [`https://${sanitized}`, `http://${sanitized}`];
};

const candidateAddresses = (server) => {
	const seen = {};
	const addresses = [];
	for (const candidate of [server.url, server.localAddress]) {
		const trimmed = str(candidate).trim();
		if (!trimmed) continue;
		for (const normalized of normalizedCandidates(trimmed)) {
			const key = normalized.toLowerCase();
			if (!seen[key]) {
				seen[key] = true;
				addresses.push(normalized);
			}
		}
	}
	return addresses;
};

export const getServers = async (connectUserId, connectAccessToken) => {
	const response = await fetchWithTimeout(`${CONNECT_BASE}servers?userId=${encodeURIComponent(connectUserId)}`, {
		method: 'GET',
		headers: {
			'X-Application': applicationHeader(),
			'X-Connect-UserToken': connectAccessToken,
			'Accept': 'application/json'
		}
	}, TIMEOUT_MS);

	if (!response.ok) {
		throw connectError('Network error while contacting Emby Connect', 'network');
	}

	const list = asList(await parseJson(response));
	return list.filter((entry) => entry && typeof entry === 'object').map((entry) => {
		const server = {
			accessKey: pick(entry, ['AccessKey', 'ConnectAccessKey', 'UserAccessToken']),
			systemId: pick(entry, ['SystemId']),
			name: pick(entry, ['Name']),
			url: pick(entry, ['Url', 'Address']),
			localAddress: pick(entry, ['LocalAddress', 'LocalAddress1'])
		};
		server.candidateAddresses = candidateAddresses(server);
		return server;
	});
};

const originOf = (address) => {
	const match = address.match(/^(https?:\/\/[^/]+)/i);
	return match ? match[1] : address.replace(/\/+$/, '');
};

// Tries both known exchange paths for an address (root and /emby), first success wins.
const exchangeAtAddress = async (serverAddress, connectUserId, accessKey) => {
	const root = originOf(serverAddress);
	const base = serverAddress.replace(/\/+$/, '');
	const attempts = [
		{url: `${base}/Connect/Exchange`, resolvedBaseUrl: base},
		{url: `${root}/emby/Connect/Exchange`, resolvedBaseUrl: `${root}/emby`}
	];

	let lastError = null;
	for (const attempt of attempts) {
		try {
			const query = `format=json&ConnectUserId=${encodeURIComponent(connectUserId)}`;
			const response = await fetchWithTimeout(`${attempt.url}?${query}`, {
				method: 'GET',
				headers: {
					'X-Emby-Token': accessKey,
					'X-Application': applicationHeader(),
					'Accept': 'application/json',
					'X-Emby-Authorization': buildEmbyAuthHeader()
				}
			}, TIMEOUT_MS);

			if (!response.ok) {
				lastError = new Error(`Exchange failed (HTTP ${response.status})`);
				continue;
			}

			const data = await parseJson(response);
			const localUserId = pick(data || {}, ['LocalUserId', 'localUserId']);
			const accessToken = pick(data || {}, ['AccessToken', 'accessToken']);
			if (!localUserId || !accessToken) {
				lastError = new Error('Invalid response from server exchange endpoint');
				continue;
			}
			return {localUserId, accessToken, resolvedBaseUrl: attempt.resolvedBaseUrl};
		} catch (e) {
			lastError = e;
		}
	}
	throw lastError || new Error('Invalid response from server exchange endpoint');
};

export const connectToServer = async (server, connectUserId) => {
	const addresses = server.candidateAddresses && server.candidateAddresses.length
		? server.candidateAddresses
		: candidateAddresses(server);
	if (!addresses.length) {
		throw connectError('No reachable address provided', 'noReachableAddress');
	}

	let lastError = null;
	for (const address of addresses) {
		try {
			return await exchangeAtAddress(address, connectUserId, server.accessKey);
		} catch (e) {
			lastError = e;
		}
	}
	const err = lastError || new Error('Unable to connect to server');
	if (!err.reason) err.reason = 'unableToConnectServer';
	throw err;
};

export const authenticateAndLoadServers = async (username, password) => {
	const session = await authenticate(username, password);
	const servers = await getServers(session.userId, session.accessToken);
	return {session, servers};
};
