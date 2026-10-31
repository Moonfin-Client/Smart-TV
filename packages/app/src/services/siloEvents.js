// Silo's realtime socket (/api/v2/events/ws), which keeps watched state, favorites and resume points current when they
// change on another device, as Jellyfin's session socket does. Ported from Moonfin-Core's SiloEventsSocketClient.
//
// Silo takes no token on the URL: each connect asks for a single-use ticket, offered as a subprotocol after the message
// protocol. Silo ends every connection after a few minutes, so it's replaced shortly before that. Its events say what
// changed, not the new values, so each changed item's user data is read back and passed on as the UserDataChanged
// message Jellyfin sends.

import {openSiloSocket} from './siloSocket';

export const SILO_EVENT_CHANNELS = ['user_state', 'catalog'];
// Silo closes with this when the login's access changed (libraries, rating limits, role).
const ACCESS_CHANGED_CLOSE = 4001;
const RECONNECT_DELAY_MS = 5000;
const ACCESS_CHANGED_AGAIN_MS = 10000;
// A handshake Silo refuses (an app origin it doesn't accept) looks like any drop, so each failed try waits twice as long.
const MAX_RECONNECT_DELAY_MS = 5 * 60 * 1000;
// Enough for a ticket and a handshake before Silo's limit ends the connection.
const RENEW_MARGIN_MS = 15000;
// A change on the web often arrives as several events at once (a season marked watched is one per episode), and each
// item is read back once.
const BATCH_MS = 300;
const MAX_READ_BACKS = 25;
// The user_state changes that move what a card shows.
const READ_BACK_CHANGES = ['watched', 'favorite', 'progress', 'history'];

// Channels declared on the URL spare the subscribe frame and its grace period. No credential goes in the URL.
export const siloEventsUrl = (baseUrl) => `${String(baseUrl).replace(/\/+$/, '').replace(/^http/, 'ws')}` +
	`/api/v2/events/ws?channels=${SILO_EVENT_CHANNELS.join(',')}`;

export const parseSiloFrame = (raw) => {
	try {
		const frame = JSON.parse(raw);
		return frame && typeof frame === 'object' && typeof frame.type === 'string' ? frame : null;
	} catch {
		return null;
	}
};

// Silo says nothing on the socket when a playback session stops, so this client's own stops are passed in here.
const playbackEndedListeners = new Set();
export const noteSiloPlaybackEnded = (baseUrl, itemId) => {
	if (itemId) playbackEndedListeners.forEach((listener) => listener(baseUrl, String(itemId)));
};

/**
 * The HTTP half for one Silo server: whether the socket is on, tickets, and turning a batch of frames into Jellyfin
 * messages. `forget` drops the cached reads a change makes stale; `getItems` is the app's items query.
 */
export const createSiloEvents = ({call, getBaseUrl, getUserId, getItems, forget}) => ({
	baseUrl: getBaseUrl,
	profileId: getUserId,
	forget,
	capabilities: () => call('/api/v2/events/capabilities'),
	ticket: () => call('/api/v2/events/ws-ticket', {method: 'POST'}),

	// Never throws: an item that can't be read passes on what its event said.
	translate: async (frames) => {
		const profileId = String(getUserId());
		const said = {};
		let stale = false;
		frames.forEach((frame) => {
			const data = frame.data || {};
			// A snapshot comes on every connect: anything may have changed while nobody listened.
			if (frame.type === 'snapshot') {
				stale = true;
			} else if (frame.type === 'event' && frame.channel === 'catalog') {
				if (frame.event === 'catalog.item.changed' || frame.event === 'catalog.library.changed') stale = true;
			} else if (frame.type === 'event' && frame.channel === 'user_state' && frame.event === 'user_state.changed') {
				const id = data.content_id;
				// Silo sends every profile's changes to the account's sockets.
				if (String(data.profile_id) !== profileId || typeof id !== 'string' || !id) return;
				stale = true;
				if (!READ_BACK_CHANGES.includes(data.change)) return;
				const entry = said[id] || (said[id] = {});
				if (typeof data.played === 'boolean') entry.Played = data.played;
				if (typeof data.is_favorite === 'boolean') entry.IsFavorite = data.is_favorite;
			}
		});
		if (stale) forget();
		const ids = Object.keys(said);
		if (!ids.length) return [];
		const read = {};
		try {
			const answer = await getItems({Ids: ids.slice(0, MAX_READ_BACKS).join(','), Fields: 'UserData'});
			(answer?.Items || []).forEach((item) => {
				if (item?.Id && item.UserData) read[item.Id] = item.UserData;
			});
		} catch {
			// Passed on as the events said.
		}
		const UserDataList = ids.map((id) => ({...said[id], ...read[id], ItemId: id}));
		return [{MessageType: 'UserDataChanged', Data: {UserId: getUserId(), UserDataList}}];
	}
});

/**
 * Keeps the socket open for `events` (from createSiloEvents) until `close()`: reconnects after a drop, renews before
 * Silo's limit, and reconnects at once under the new access when Silo says it changed. `onOpen` and `onClose` mark the
 * connection coming and going (not renewals); `onMessage` gets each Jellyfin-shaped message.
 */
export const openSiloEvents = (events, {onOpen, onMessage, onClose}) => {
	let socket = null;
	let open = false;
	let closed = false;
	// Set on a connection that replaced the last one on schedule: nothing was missed, so its snapshots are dropped,
	// or every cached list would be read again every five minutes.
	let renewal = false;
	let accessChanged = false;
	let lastAccessChangeAt = 0;
	let pending = [];
	let batchTimer = null;
	let renewTimer = null;
	let reconnectTimer = null;
	let failures = 0;

	const flush = async () => {
		batchTimer = null;
		const frames = pending;
		pending = [];
		if (!frames.length) return;
		const messages = await events.translate(frames).catch(() => []);
		if (!closed) messages.forEach(onMessage);
	};

	const queue = (frame) => {
		pending.push(frame);
		if (!batchTimer) batchTimer = setTimeout(flush, BATCH_MS);
	};

	// Passed on as the user_state change Silo would have sent, so the item is read back like a change on the web.
	const ownStop = (baseUrl, itemId) => {
		if (baseUrl !== events.baseUrl()) return;
		queue({
			type: 'event', channel: 'user_state', event: 'user_state.changed',
			data: {profile_id: events.profileId(), content_id: itemId, change: 'progress'}
		});
	};
	playbackEndedListeners.add(ownStop);

	const dropSocket = () => {
		if (!socket) return;
		socket.onclose = null;
		socket.onmessage = null;
		socket.close();
		socket = null;
	};

	const handle = (from, raw) => {
		const frame = parseSiloFrame(raw);
		if (!frame) return;
		if (frame.type === 'hello') {
			// A server that didn't take the channels on the URL closes the connection without a subscribe frame.
			if (frame.required_action === 'subscribe') from.send(JSON.stringify({type: 'subscribe', channels: SILO_EVENT_CHANNELS}));
		} else if (frame.type === 'access_changed') {
			// The 4001 close follows, and the reconnect acts on either.
			accessChanged = true;
		} else if (frame.type === 'error') {
			console.warn('[Silo] Events socket error', `${frame.code || 'unknown'}: ${frame.message || ''}`);
		} else if (frame.type === 'event' || (frame.type === 'snapshot' && !renewal)) {
			queue(frame);
		}
	};

	let connect = null;
	const scheduleReconnect = () => {
		if (closed || reconnectTimer) return;
		const delay = Math.min(RECONNECT_DELAY_MS * Math.pow(2, failures), MAX_RECONNECT_DELAY_MS);
		failures += 1;
		reconnectTimer = setTimeout(() => {
			reconnectTimer = null;
			connect();
		}, delay);
	};

	connect = async ({ticket = null, renewing = false} = {}) => {
		try {
			if (!ticket) {
				const caps = await events.capabilities();
				if (caps?.state !== 'available' || caps.allowed !== true) {
					console.info(`[Silo] Events socket is off on this server (${caps?.state}${caps?.allowed ? '' : ', not allowed'})`);
					return;
				}
				ticket = await events.ticket();
			}
		} catch (err) {
			// A locked profile gets no ticket until its PIN is entered, which the app asks for after switching to it,
			// so this waits with the usual backoff rather than giving up.
			if (err?.code === 'profile_verification_required') console.info('[Silo] Events socket waits for the profile\'s PIN');
			scheduleReconnect();
			return;
		}
		if (closed) return;
		// The old connection, on a renewal: the switch-over is only the new handshake.
		dropSocket();
		let next;
		try {
			next = await openSiloSocket(siloEventsUrl(events.baseUrl()), [ticket.protocol, `silo.ticket.${ticket.ticket}`]);
		} catch {
			scheduleReconnect();
			return;
		}
		if (closed) {
			next.close();
			return;
		}
		socket = next;
		next.onopen = () => {
			renewal = renewing;
			failures = 0;
			clearTimeout(renewTimer);
			// eslint-disable-next-line no-use-before-define
			renewTimer = setTimeout(renew, Math.max((Number(ticket.max_connection_seconds) || 300) * 1000 - RENEW_MARGIN_MS, 1000));
			if (!open) {
				open = true;
				onOpen();
			}
		};
		next.onmessage = (event) => handle(next, event.data);
		next.onclose = (event) => {
			if (socket !== next) return;
			socket = null;
			clearTimeout(renewTimer);
			const changed = accessChanged || event?.code === ACCESS_CHANGED_CLOSE;
			accessChanged = false;
			if (open) {
				open = false;
				onClose();
			}
			if (closed) return;
			if (!changed) {
				scheduleReconnect();
				return;
			}
			// What the account may see has to be read again. No delay, since the new ticket carries the new access, unless
			// the last such reconnect was only moments ago: a server that keeps closing that way is waited on as any drop.
			console.info('[Silo] This login\'s access changed');
			events.forget();
			const again = Date.now() - lastAccessChangeAt < ACCESS_CHANGED_AGAIN_MS;
			lastAccessChangeAt = Date.now();
			if (again) scheduleReconnect();
			else connect();
		};
	};

	// The ticket first, while the old connection still delivers.
	const renew = async () => {
		renewTimer = null;
		let ticket = null;
		try {
			ticket = await events.ticket();
		} catch {
			// The connect asks again.
		}
		if (!closed) connect({ticket, renewing: true});
	};

	connect();

	return {
		close: () => {
			closed = true;
			open = false;
			playbackEndedListeners.delete(ownStop);
			clearTimeout(batchTimer);
			clearTimeout(renewTimer);
			clearTimeout(reconnectTimer);
			pending = [];
			dropSocket();
		}
	};
};
