// Signing in to a Silo server: finding it, signing the account in, and the household profile the app then acts as.

import {platformFetch} from './secureFetch';
import {createSiloRequest, setSiloTokens, siloAccount, siloTokens} from './siloSession';
import {siloBase} from '../utils/siloUrls';

export const SILO_API_MAJOR = 2;
// Silo's own ports, tried in this order when its Jellyfin-compatible service is the one that answered.
const NATIVE_PORTS = [8090, 8080];

const PUBLIC = {noAuth: true, noRefresh: true};
const itemsOf = (json) => (Array.isArray(json?.items) ? json.items : []);

// Silo's public info in the shape the app reads a server's public info in. Null when the address isn't Silo's native API.
export const probeSilo = async (baseUrl, deviceInfo) => {
	const {request} = createSiloRequest({getBaseUrl: () => baseUrl, getDeviceInfo: () => deviceInfo});
	let info;
	try {
		info = await request('/system/info', PUBLIC);
	} catch (error) {
		// Silo retires an old API with a 410 naming client_upgrade_required, or with a 426.
		if (error.status === 426 || (error.status === 410 && error.code === 'client_upgrade_required')) return {ServerName: 'Silo', ProductName: 'Silo', retired: true};
		return null;
	}
	if (typeof info?.api_major !== 'number' || typeof info?.server_version !== 'string') return null;
	const [identity, branding] = await Promise.all([
		request('/system/identity', PUBLIC).catch(() => null),
		request('/theme/branding', PUBLIC).catch(() => null)
	]);
	return {
		Id: identity?.server_id || null,
		ServerName: branding?.server_name || 'Silo',
		// A build hash, shown as it is. Whether the app can talk to the server is the API's major version.
		Version: info.server_version,
		ProductName: 'Silo',
		ApiMajor: info.api_major
	};
};

// Which side has to update, when the server speaks another major version of the API than the app.
export const siloVersionMismatch = (info) => {
	if (info?.retired) return 'app';
	if (!info || info.ApiMajor === SILO_API_MAJOR) return null;
	return info.ApiMajor > SILO_API_MAJOR ? 'app' : 'server';
};

// Silo's Jellyfin-compatible service names Silo in its sign-in disclaimer. The native API is then usually on 8090,
// on the same host and scheme, never moving from https down to http.
export const siloBehindJellyfin = async (jellyfinUrl, deviceInfo) => {
	let branding = null;
	try {
		const response = await platformFetch(`${siloBase(jellyfinUrl)}/Branding/Configuration`, {headers: {Accept: 'application/json'}}, 5000);
		branding = response.ok ? await response.json() : null;
	} catch {
		return null;
	}
	if (!String(branding?.LoginDisclaimer || '').toLowerCase().includes('silo')) return null;
	const match = /^(https?:\/\/[^/:]+)/i.exec(jellyfinUrl);
	if (!match) return null;
	for (const port of NATIVE_PORTS) {
		const candidate = `${match[1]}:${port}`;
		const info = await probeSilo(candidate, deviceInfo);
		if (info) return {url: candidate, info};
	}
	return null;
};

export const createSiloSignIn = (baseUrl, deviceInfo) => {
	let account = null;
	const {request} = createSiloRequest({getBaseUrl: () => baseUrl, getAccount: () => account, getDeviceInfo: () => deviceInfo});

	// Silo hands the token pair over once, so it goes straight into the account every profile on it shares.
	const open = (pair) => {
		const tokens = siloTokens(pair);
		const user = pair?.user;
		if (!tokens.accessToken || !tokens.refreshToken || user?.id == null) throw new Error('Silo answered the sign-in without a login');
		account = siloAccount(baseUrl, String(user.id));
		setSiloTokens(account, tokens);
		return {account: user, tokens};
	};

	return {
		// A wrong password comes back as a 401 like an expired token, so it's never refreshed for or tried again.
		signIn: async (username, password) => open(await request('/auth/login', {method: 'POST', body: {username, password}, ...PUBLIC})),

		// Sign in with a code: the TV shows it, and the person approves it on Silo's web app or another device.
		startCodeSignIn: async () => {
			const capability = await request('/auth/device/capability', PUBLIC);
			if (capability?.state !== 'available' || capability?.allowed === false) {
				throw Object.assign(new Error('Silo has signing in with a code switched off'), {status: 403});
			}
			const start = await request('/auth/device/start', {method: 'POST', body: {
				device_name: String(deviceInfo.deviceName || '').substring(0, 128),
				device_platform: String(deviceInfo.platform || '').substring(0, 64)
			}, ...PUBLIC});
			const code = String(start?.user_code || '').replace(/[\s-]/g, '');
			if (!start?.device_code || !code) throw new Error('Silo answered without a sign-in code');
			return {
				code,
				secret: start.device_code,
				link: start.verification_uri_complete || start.verification_uri || null,
				pollAfterMs: (Number(start.interval) || 5) * 1000
			};
		},

		checkCodeSignIn: async (secret) => {
			let poll;
			try {
				poll = await request('/auth/device/poll', {method: 'POST', body: {device_code: secret}, ...PUBLIC});
			} catch (error) {
				if (error.status === 404) return {status: 'expired'};
				throw error;
			}
			if (poll?.status === 'approved') return {status: 'approved', login: open(poll.tokens)};
			if (poll?.status === 'pending') return {status: 'pending', pollAfterMs: (Number(poll.poll_after) || 5) * 1000};
			return {status: poll?.status === 'denied' ? 'denied' : 'expired'};
		},

		// Both go out as the account, since the profile being unlocked can't be named yet.
		profiles: async () => itemsOf(await request('/profiles', {noProfile: true})),

		verifyPin: async (profileId, pin) => {
			try {
				const answer = await request(`/profiles/${encodeURIComponent(profileId)}/verify-pin`, {method: 'POST', body: {pin}, noProfile: true, noRefresh: true});
				return answer?.valid === true && answer.profile_token ? {profileToken: answer.profile_token} : {wrong: true};
			} catch (error) {
				// Five wrong PINs lock the profile for a while, and it's never retried on its own.
				if (error.status === 429) return {lockedForMs: error.retryAfterMs ?? null};
				throw error;
			}
		}
	};
};
