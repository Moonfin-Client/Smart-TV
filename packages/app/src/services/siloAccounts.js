// The Silo logins the app has saved. Every profile on an account shares one token pair, which is loaded into the
// session's account and saved again each time Silo renews it, since the refresh token changes with every renewal.

import {getAllServers, updateServer} from './multiServerManager';
import {setSiloTokens, siloAccount} from './siloSession';
import {siloBase} from '../utils/siloUrls';

const profiles = new Map();
const endedListeners = new Set();

const profileKey = (baseUrl, userId) => `${siloBase(baseUrl)}|${userId}`;

// The account a saved profile belongs to and the proof of its PIN, if it has one.
export const siloProfileOf = (baseUrl, userId) => profiles.get(profileKey(baseUrl, userId)) || null;

export const onSiloLoginEnded = (listener) => {
	endedListeners.add(listener);
	return () => endedListeners.delete(listener);
};

const saveTokens = async (serverId, accountId, tokens) => {
	const server = (await getAllServers())[serverId];
	if (!server) return;
	const saved = {...server.siloAccounts};
	if (tokens) saved[accountId] = tokens;
	else delete saved[accountId];
	await updateServer(serverId, {siloAccounts: saved});
};

const watch = (serverId, baseUrl, accountId, account) => {
	account.onTokens = (tokens) => saveTokens(serverId, accountId, tokens);
	// The refused pair is dropped first, or loading the saved servers again would bring it back.
	account.onEnded = () => saveTokens(serverId, accountId, null)
		.catch(() => {})
		.then(() => endedListeners.forEach((listener) => listener(baseUrl, accountId)));
};

export const restoreSiloAccounts = async () => {
	const servers = await getAllServers();
	profiles.clear();
	Object.keys(servers).forEach((serverId) => {
		const server = servers[serverId];
		if (server?.serverType !== 'silo') return;
		Object.keys(server.siloAccounts || {}).forEach((accountId) => {
			const account = siloAccount(server.url, accountId);
			// A pair already in use is newer than the stored one, which only catches up after the save.
			if (!account.tokens) setSiloTokens(account, server.siloAccounts[accountId]);
			watch(serverId, server.url, accountId, account);
		});
		Object.keys(server.users || {}).forEach((userId) => {
			const user = server.users[userId];
			if (user?.siloAccountId) profiles.set(profileKey(server.url, userId), {accountId: String(user.siloAccountId), profileToken: user.siloProfileToken || null});
		});
	});
};
