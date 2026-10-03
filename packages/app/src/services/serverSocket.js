// The session socket to the active server. SyncPlay and the watched state both listen on it, so
// it stays open for as long as someone is signed in and reconnects whenever it drops.

import {getApiKey, getDeviceId, getServerType, getServerUrl} from './jellyfinApi';
import serverLogger from './serverLogger';

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
	// Emby answers on a path of its own and still wants the lower case key.
	if (getServerType() === 'emby') return `${wsProto}://${host}/embywebsocket?api_key=${token}&deviceId=${deviceId}`;
	return `${wsProto}://${host}/socket?ApiKey=${token}&deviceId=${deviceId}`;
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
		serverLogger.info(serverLogger.LOG_CATEGORIES.NETWORK, 'Standby diag: server socket opened', {});
		tell(connectionListeners, true);
	};

	ws.onmessage = (event) => {
		let message;
		try {
			message = JSON.parse(event.data);
		} catch {
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
		serverLogger.info(serverLogger.LOG_CATEGORIES.NETWORK, 'Standby diag: server socket closed', {});
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
