// The session socket to the active server. SyncPlay and the watched state both listen on it, so
// it stays open for as long as someone is signed in and reconnects whenever it drops.

import {api, getApiKey, getDeviceId, getServerType, getServerUrl, getUserId} from './jellyfinApi';

const RECONNECT_DELAY_MS = 5000;
// The server drops a socket that hasn't sent it a KeepAlive message within this long. It says
// so in the ForceKeepAlive it sends on connect and again once a reply is overdue, and the
// fallback only covers a message with no timeout.
const DEFAULT_KEEP_ALIVE_TIMEOUT_S = 60;
// Reply every half timeout, as jellyfin-web does, so one lost message doesn't cost the socket.
const KEEP_ALIVE_FACTOR = 0.5;

let ws = null;
let isOpen = false;
let keepAliveInterval = null;
let reconnectTimeout = null;
const messageListeners = new Set();
const connectionListeners = new Set();

const listen = (listeners, listener) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};

// Each message the server sends, parsed.
export const onMessage = (listener) => listen(messageListeners, listener);

// True each time the socket opens, the first time and on every reconnect, and false when it
// closes.
export const onConnectionChange = (listener) => listen(connectionListeners, listener);

export const isConnected = () => isOpen;

const tell = (listeners, value) => {
	listeners.forEach((listener) => {
		try {
			listener(value);
		} catch {
			// One listener failing shouldn't keep the message from the rest.
		}
	});
};

// A socket the server counts as lost is disposed, which ends the session and with it its place
// in a SyncPlay group. Only a KeepAlive message from this side refreshes its timer, and nothing
// else sent on the socket or over HTTP counts.
const sendKeepAlive = () => {
	if (!ws || ws.readyState !== 1) return;
	try {
		ws.send(JSON.stringify({MessageType: 'KeepAlive'}));
	} catch {
		// The close that follows reconnects.
	}
};

const stopKeepAlive = () => {
	if (keepAliveInterval) {
		clearInterval(keepAliveInterval);
		keepAliveInterval = null;
	}
};

const scheduleKeepAlive = (timeoutSeconds) => {
	stopKeepAlive();
	const seconds = Number(timeoutSeconds) > 0 ? Number(timeoutSeconds) : DEFAULT_KEEP_ALIVE_TIMEOUT_S;
	keepAliveInterval = setInterval(sendKeepAlive, seconds * 1000 * KEEP_ALIVE_FACTOR);
};

const socketUrl = (serverUrl) => {
	const wsProto = serverUrl.startsWith('https') ? 'wss' : 'ws';
	const host = serverUrl.replace(/^https?:\/\//, '');
	const token = encodeURIComponent(getApiKey());
	const deviceId = encodeURIComponent(getDeviceId());
	// Only playback events are asked for, which is all the watched state needs.
	if (getServerType() === 'plex') return `${wsProto}://${host}/:/websockets/notifications?filters=playing&X-Plex-Token=${token}`;
	// Emby answers on a path of its own and still wants the lower case key.
	if (getServerType() === 'emby') return `${wsProto}://${host}/embywebsocket?api_key=${token}&deviceId=${deviceId}`;
	return `${wsProto}://${host}/socket?ApiKey=${token}&deviceId=${deviceId}`;
};

const PLEX_SETTLED = ['paused', 'stopped'];
// The state each Plex session last reported, since a paused one keeps reporting while it waits.
let plexStates = {};

// Plex says only that a session paused or stopped, on whichever device, so the item is read again and passed on the way
// Jellyfin sends a watched state change. Only a stop can change how much of its season and show was played, so those
// are read after a stop.
const plexUserData = async (message) => {
	const userId = getUserId();
	const sessions = message?.NotificationContainer?.PlaySessionStateNotification;
	const settled = {};
	(Array.isArray(sessions) ? sessions : []).forEach((session) => {
		const state = session?.state;
		const changed = plexStates[session?.sessionKey] !== state;
		if (state === 'stopped') delete plexStates[session.sessionKey];
		else plexStates[session?.sessionKey] = state;
		if (!changed || !PLEX_SETTLED.includes(state) || session.ratingKey == null) return;
		const key = String(session.ratingKey);
		const entry = settled[key] || (settled[key] = {stopped: false, sessions: []});
		entry.stopped = entry.stopped || state === 'stopped';
		entry.sessions.push(session.sessionKey);
	});
	const entries = [];
	for (const key of Object.keys(settled)) {
		try {
			const item = await api.getItem(key);
			const ids = settled[key].stopped ? [item.SeasonId, item.SeriesId].filter(Boolean) : [];
			const related = await Promise.all(ids.map((id) => api.getItem(id).catch(() => null)));
			// A finished item has no progress left, so the old bar is cleared.
			[item, ...related].forEach((entry) => {
				if (entry?.UserData) entries.push({PlayedPercentage: null, ...entry.UserData, ItemId: entry.Id});
			});
		} catch {
			// A pause that couldn't be read is forgotten, so the next report of it tries again.
			settled[key].sessions.forEach((sessionKey) => {
				if (plexStates[sessionKey] === 'paused') delete plexStates[sessionKey];
			});
		}
	}
	if (entries.length) tell(messageListeners, {MessageType: 'UserDataChanged', Data: {UserId: userId, UserDataList: entries}});
};

export const connect = () => {
	if (ws) return;

	const serverUrl = getServerUrl();
	if (!serverUrl) return;

	try {
		ws = new WebSocket(socketUrl(serverUrl));
	} catch {
		scheduleReconnect(); // eslint-disable-line no-use-before-define
		return;
	}

	ws.onopen = () => {
		isOpen = true;
		tell(connectionListeners, true);
	};

	ws.onmessage = (event) => {
		let message;
		try {
			message = JSON.parse(event.data);
		} catch {
			return;
		}
		if (message?.NotificationContainer) {
			if (message.NotificationContainer.type === 'playing') plexUserData(message);
			return;
		}
		if (message?.MessageType === 'ForceKeepAlive') {
			sendKeepAlive();
			scheduleKeepAlive(message.Data);
			return;
		}
		tell(messageListeners, message);
	};

	ws.onclose = () => {
		ws = null;
		isOpen = false;
		plexStates = {};
		stopKeepAlive();
		tell(connectionListeners, false);
		scheduleReconnect(); // eslint-disable-line no-use-before-define
	};
};

const scheduleReconnect = () => {
	if (reconnectTimeout) return;
	reconnectTimeout = setTimeout(() => {
		reconnectTimeout = null;
		connect();
	}, RECONNECT_DELAY_MS);
};

export const disconnect = () => {
	plexStates = {};
	if (reconnectTimeout) {
		clearTimeout(reconnectTimeout);
		reconnectTimeout = null;
	}
	stopKeepAlive();
	if (ws) {
		ws.onclose = null;
		ws.close();
		ws = null;
	}
	if (isOpen) {
		isOpen = false;
		tell(connectionListeners, false);
	}
};
