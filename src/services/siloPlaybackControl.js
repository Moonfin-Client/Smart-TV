// Silo's playback control socket (/api/v2/playback/sessions/{id}/control/ws): the lane an admin's message, pause,
// resume, stop and terminate, and the server's restart notice, reach one playing session on. Without it, Silo's
// dashboard says the message can't be delivered, and a pause or stop ends the session once its deadline passes.
// Ported from Moonfin-Core's SiloPlaybackControlSocket.
//
// One lane for the app. It follows the Silo session the player plays, on the server that session plays from (its
// own ticket, URL and token), which isn't always the signed-in one. Each command is acknowledged, run by the code a
// Jellyfin remote's Playstate and DisplayMessage go through, and answered `completed` or `rejected`: a rejected
// result also calls off Silo's fallback, so the session isn't ended over it. Playback never waits on the lane: a
// server without it, a refused ticket or a dropped connection only means these commands don't arrive.

import {siloServerKey} from './siloSession';
import {openSiloSocket} from './siloSocket';

const trimSlash = (url) => String(url || '').replace(/\/+$/, '');

export const SILO_PLAYBACK_CONTROL_PROTOCOL = 'silo.playback-control.v2';
// What the hello says this client runs. Silo sends terminate even when it isn't listed.
export const SILO_PLAYBACK_CONTROL_COMMANDS = [
	'pause', 'unpause', 'play_pause', 'stop', 'display_message', 'server_restarting', 'server_shutting_down', 'terminate'
];

const CAPABILITIES_TTL_MS = 10 * 60 * 1000;
const CONNECT_TIMEOUT_MS = 15000;
// Silo closes a connection after max_connection_seconds or when the access token it was opened with expires.
const RENEW_MARGIN_MS = 60000;
const RENEW_FLOOR_MS = 5000;
const DEFAULT_MAX_CONNECTION_MS = 4 * 60 * 60 * 1000;
// A connection that stayed up this long counts as working, so the next drop starts the backoff over.
const STABLE_AFTER_MS = 30000;
const MAX_ATTEMPTS = 10;
// How long a lane let go of keeps its connection for a command still running (a stop ends its own session).
const CLOSE_GRACE_MS = 5000;

export const siloPlaybackControlUrl = (baseUrl, sessionId) => `${trimSlash(baseUrl).replace(/^http/, 'ws')}` +
	`/api/v2/playback/sessions/${encodeURIComponent(sessionId)}/control/ws`;

// Silo closes the lane at whichever comes first: the connection's limit or the token's expiry.
export const siloPlaybackControlRenewDelay = (maxConnectionSeconds, accessExpiresAt, now = Date.now()) => {
	let delay = (Number(maxConnectionSeconds) > 0 ? Number(maxConnectionSeconds) * 1000 : DEFAULT_MAX_CONNECTION_MS) - RENEW_MARGIN_MS;
	if (Number(accessExpiresAt) > 0) delay = Math.min(delay, Number(accessExpiresAt) - now - RENEW_MARGIN_MS);
	return Math.max(delay, RENEW_FLOOR_MS);
};

export const siloPlaybackControlBackoff = (attempt) => Math.min(30000, 1000 * Math.pow(2, Math.min(attempt, 5))) +
	Math.floor(Math.random() * 500);

// The Jellyfin-shaped remote message a command runs as, or null for one this client doesn't run.
export const siloPlaybackControlMessage = (name, payload = {}) => {
	switch (name) {
		case 'pause':
			return {MessageType: 'Playstate', Data: {Command: 'Pause'}};
		case 'unpause':
			return {MessageType: 'Playstate', Data: {Command: 'Unpause'}};
		case 'play_pause':
			return {MessageType: 'Playstate', Data: {Command: 'PlayPause'}};
		case 'stop':
			return {MessageType: 'Playstate', Data: {Command: 'Stop'}};
		case 'display_message':
		case 'server_restarting':
		case 'server_shutting_down': {
			const text = typeof payload.message === 'string' ? payload.message.trim() : '';
			const title = typeof payload.title === 'string' ? payload.title.trim() : '';
			const body = text || title;
			if (!body) return null;
			return {MessageType: 'GeneralCommand', Data: {Name: 'DisplayMessage', Arguments: {Text: body, ...(text && title ? {Header: title} : null)}}};
		}
		default:
			return null;
	}
};

// Only these refusals are final for the session; 401/403 is the token, the rest a server still settling.
const sessionGone = (err) => err?.status === 409 || err?.status === 410;
const tokenRefused = (err) => err?.status === 401 || err?.status === 403;

/**
 * The app's side: `run(message)` is remoteControl.handleMessage; `plays(baseUrl, sessionId)` whether the player still
 * plays that session; `terminate(sessionId, reason, retire)` ends it the way a 410 progress refusal does;
 * `stopped(reason)` shows an admin's reason for a stop once the player has stopped; `transportHeld()` whether a watch
 * party room would take a pause or resume and do nothing with it.
 */
let handlers = null;
export const setSiloPlaybackControlHandlers = (next) => {
	handlers = next;
	return () => {
		if (handlers === next) handlers = null;
	};
};

const capabilities = new Map();
// Null when the server has no lane: an older Silo answers 404. Only that and a usable answer are kept: `allowed` is per
// login, and a server still starting says unavailable for a while, so those are read again next time.
const laneAvailable = async (lane) => {
	const key = siloServerKey(lane.baseUrl);
	const known = capabilities.get(key);
	if (known && Date.now() - known.at < CAPABILITIES_TTL_MS) return known.usable;
	let caps;
	try {
		caps = await lane.capabilities();
	} catch (err) {
		if (err?.status !== 404) throw err;
		caps = null;
	}
	const usable = Boolean(caps && caps.available === true && caps.protocol === SILO_PLAYBACK_CONTROL_PROTOCOL && caps.allowed !== false);
	if (usable || !caps) capabilities.set(key, {at: Date.now(), usable});
	return usable;
};

// The lane being followed. Each followed session gets its own, so a command's handling and answer stay with it.
let current = null;

const send = (socket, frame) => {
	try {
		socket?.send(JSON.stringify(frame));
	} catch {
		// A connection that went away loses the answer; Silo falls back as it does without a lane.
	}
};

const createLane = (lane) => {
	const key = siloServerKey(lane.baseUrl);
	const state = {
		socket: null,
		// Once a connection was up, a server that says unavailable is one restarting, so it's asked again.
		everOpened: false,
		// Commands still running, so a lane let go of can wait for their answers.
		running: 0,
		attempts: 0,
		closed: false,
		// Silo said the session is over or the lane isn't this installation's: no more tickets for it.
		refused: false,
		// The token was refused or the connects ran out: the session's next replan tries again.
		gaveUp: false,
		connecting: false,
		reconnectTimer: null,
		renewTimer: null,
		stableTimer: null,
		graceTimer: null,
		// A renewal refused for its token gets a fresh ticket once the old connection closes.
		renewOnClose: false
	};

	const sameSession = (frame) => frame && frame.session_id === lane.sessionId;

	// Answers go on the connection holding the lane, which after a renewal is the newest one; Silo drops frames from
	// a connection it replaced. One that has gone answers on the connection the command came on.
	const answer = (from, commandId, type, status, error) => {
		const target = state.socket && state.socket.readyState === 1 ? state.socket : from;
		send(target, {type, command_id: commandId, session_id: lane.sessionId, status, ...(error ? {error} : null)});
	};
	const finish = () => {
		state.running -= 1;
		if (state.closed && state.running <= 0) drop(); // eslint-disable-line no-use-before-define
	};

	const handleCommand = async (from, frame) => {
		const id = frame.command_id;
		const name = frame.name;
		const payload = frame.payload && typeof frame.payload === 'object' ? frame.payload : {};
		const reason = typeof frame.reason === 'string' && frame.reason.trim() ? frame.reason.trim() : null;
		// The player moved on (Next before this session's stop closed its lane): its pause or stop would hit the new item.
		if (!handlers || !handlers.plays(lane.baseUrl, lane.sessionId)) {
			answer(from, id, 'result', 'rejected', 'not_playing');
			return;
		}
		if (name === 'terminate') {
			state.running += 1;
			answer(from, id, 'ack', 'accepted');
			try {
				await handlers.terminate(lane.sessionId, reason, lane.retire);
				answer(from, id, 'result', 'completed');
			} catch {
				answer(from, id, 'result', 'rejected', 'failed');
			} finally {
				finish();
			}
			return;
		}
		const message = siloPlaybackControlMessage(name, payload);
		if (!message) {
			answer(from, id, 'result', 'rejected', 'unsupported');
			return;
		}
		state.running += 1;
		answer(from, id, 'ack', 'accepted');
		try {
			// In a watch party the room takes pause and resume, and a guest of a host-only room can't.
			if (message.MessageType === 'Playstate' && name !== 'stop' && handlers.transportHeld?.()) {
				throw new Error('Transport belongs to the watch party');
			}
			await handlers.run(message);
			answer(from, id, 'result', 'completed');
			// A Jellyfin Stop can't carry text, so an admin's reason is shown once the stop has run. Showing it can't
			// turn the stop's result into a failure.
			if (name === 'stop' && reason) {
				try {
					handlers?.stopped?.(reason);
				} catch {
					// The stop still happened.
				}
			}
		} catch {
			answer(from, id, 'result', 'rejected', 'failed');
		} finally {
			finish();
		}
	};

	const onFrame = (from, raw) => {
		// A connection being let go takes no new command.
		if (state.closed || from !== state.socket) return;
		let frame;
		try {
			frame = JSON.parse(raw);
		} catch {
			return;
		}
		if (!frame || typeof frame !== 'object' || frame.type !== 'command' || typeof frame.command_id !== 'string' ||
			!frame.command_id || !sameSession(frame)) return;
		handleCommand(from, frame);
	};

	const clearTimers = () => {
		clearTimeout(state.reconnectTimer);
		clearTimeout(state.renewTimer);
		clearTimeout(state.stableTimer);
		state.reconnectTimer = null;
		state.renewTimer = null;
		state.stableTimer = null;
	};

	const release = (socket) => {
		if (!socket) return;
		socket.onopen = null;
		socket.onmessage = null;
		socket.onclose = null;
		socket.onerror = null;
		try {
			socket.close();
		} catch {
			// Already gone.
		}
	};

	let connect = null;

	const scheduleReconnect = () => {
		if (state.closed || state.refused || state.reconnectTimer) return;
		if (state.attempts >= MAX_ATTEMPTS) {
			state.gaveUp = true;
			console.info('[Silo] Playback control lane gave up after repeated failures');
			return;
		}
		const delay = siloPlaybackControlBackoff(state.attempts);
		state.attempts += 1;
		state.reconnectTimer = setTimeout(() => {
			state.reconnectTimer = null;
			connect();
		}, delay);
	};

	// A ticket, or null when this session gets no more tries for now (each case already recorded).
	const ticketFor = async (renewing) => {
		try {
			const ticket = await lane.ticket();
			if (!ticket || typeof ticket.ticket !== 'string' || !ticket.ticket ||
				(ticket.protocol && ticket.protocol !== SILO_PLAYBACK_CONTROL_PROTOCOL)) throw new Error('Silo sent no usable control ticket');
			return ticket;
		} catch (err) {
			if (sessionGone(err)) {
				state.refused = true;
				return null;
			}
			if (tokenRefused(err)) {
				if (renewing) state.renewOnClose = true;
				else state.gaveUp = true;
				return null;
			}
			throw err;
		}
	};

	const onOpened = (socket, ticket) => {
		if (state.closed || state.socket !== socket) return;
		send(socket, {
			type: 'hello',
			session_id: lane.sessionId,
			client: {name: 'Moonfin', version: String(lane.appVersion || '0')},
			capabilities: {commands: SILO_PLAYBACK_CONTROL_COMMANDS}
		});
		clearTimeout(state.stableTimer);
		state.stableTimer = setTimeout(() => {
			state.attempts = 0;
		}, STABLE_AFTER_MS);
		clearTimeout(state.renewTimer);
		// eslint-disable-next-line no-use-before-define
		state.renewTimer = setTimeout(renew, siloPlaybackControlRenewDelay(ticket.max_connection_seconds, lane.accessExpiresAt?.()));
	};

	const onDropped = (socket) => {
		if (state.socket !== socket) return;
		state.socket = null;
		clearTimeout(state.renewTimer);
		clearTimeout(state.stableTimer);
		if (state.closed) return;
		if (!lane.live()) return;
		if (state.renewOnClose) {
			state.renewOnClose = false;
			connect();
			return;
		}
		scheduleReconnect();
	};

	// Opens a connection with the ticket. A renewal keeps the old one holding the lane until the new one is up.
	const open = async (ticket) => {
		let socket;
		try {
			socket = await openSiloSocket(siloPlaybackControlUrl(lane.baseUrl, lane.sessionId),
				[SILO_PLAYBACK_CONTROL_PROTOCOL, `silo.ticket.${ticket.ticket}`]);
		} catch {
			return false;
		}
		if (state.closed) {
			release(socket);
			return true;
		}
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				release(socket);
				resolve(false);
			}, CONNECT_TIMEOUT_MS);
			socket.onopen = () => {
				clearTimeout(timer);
				if (state.closed) {
					release(socket);
					resolve(true);
					return;
				}
				const old = state.socket;
				state.socket = socket;
				// Silo closes the old connection as soon as this one is up, and that close can be heard first: whatever
				// reconnect it asked for is called off, so no third connection follows.
				clearTimeout(state.reconnectTimer);
				state.reconnectTimer = null;
				state.gaveUp = false;
				state.everOpened = true;
				socket.onclose = () => onDropped(socket);
				socket.onerror = null;
				onOpened(socket, ticket);
				// The old connection's running commands answer on this one.
				if (old && old !== socket) release(old);
				resolve(true);
			};
			socket.onmessage = (event) => onFrame(socket, event.data);
			socket.onerror = () => {
				clearTimeout(timer);
				release(socket);
				resolve(false);
			};
			socket.onclose = socket.onerror;
		});
	};

	connect = async () => {
		if (state.closed || state.refused || state.connecting || state.socket || !lane.live()) return;
		state.connecting = true;
		state.gaveUp = false;
		try {
			if (!(await laneAvailable(lane))) {
				console.info('[Silo] Playback control lane is off on this server');
				if (state.everOpened) scheduleReconnect();
				return;
			}
			// A renewal may have taken the lane meanwhile.
			if (state.closed || state.socket) return;
			const ticket = await ticketFor(false);
			if (!ticket || state.closed || state.socket) return;
			if (!(await open(ticket))) scheduleReconnect();
		} catch {
			scheduleReconnect();
		} finally {
			state.connecting = false;
		}
	};

	// The ticket first, while the old connection still holds the lane.
	const renew = async () => {
		state.renewTimer = null;
		if (state.closed || !state.socket || !lane.live()) return;
		const holding = state.socket;
		try {
			const ticket = await ticketFor(true);
			if (!ticket || state.closed) return;
			if (await open(ticket)) return;
		} catch {
			// Tried again below.
		}
		if (state.closed || state.socket !== holding || state.refused || state.renewOnClose) return;
		if (state.attempts >= MAX_ATTEMPTS) return;
		const delay = siloPlaybackControlBackoff(state.attempts);
		state.attempts += 1;
		state.renewTimer = setTimeout(renew, delay);
	};

	const drop = () => {
		clearTimeout(state.graceTimer);
		state.graceTimer = null;
		clearTimers();
		const socket = state.socket;
		state.socket = null;
		release(socket);
	};

	return {
		matches: (baseUrl, sessionId) => siloServerKey(baseUrl) === key && sessionId === lane.sessionId,
		onServer: (baseUrl) => siloServerKey(baseUrl) === key,
		// The same session again (a replan): a lane given up on gets another try, one Silo refused stays refused.
		refresh: (next) => {
			Object.assign(lane, next);
			if (state.closed || state.refused || state.socket || state.connecting || state.reconnectTimer) return;
			if (!state.gaveUp && state.attempts === 0) return;
			state.attempts = 0;
			connect();
		},
		start: () => connect(),
		// Commands still running get a few seconds to send their results, then the connection goes.
		close: () => {
			if (state.closed) return;
			state.closed = true;
			clearTimers();
			if (state.running > 0) state.graceTimer = setTimeout(drop, CLOSE_GRACE_MS);
			else drop();
		},
		// For tests.
		get socket() {
			return state.socket;
		},
		get gaveUp() {
			return state.gaveUp;
		},
		get refused() {
			return state.refused;
		}
	};
};

/**
 * A Silo session started playing (or was replanned). `lane` is {baseUrl, sessionId, appVersion, live(), capabilities(),
 * ticket(), accessExpiresAt()}, all for the server the session plays on. Lets go of a lane for another session.
 */
export const followSiloPlaybackControl = (lane) => {
	// A session that already stopped, or that the player no longer plays (a slow replan answering late), never takes
	// the lane from the one playing.
	if (!lane?.sessionId || !lane.baseUrl || typeof lane.live !== 'function' || !lane.live()) return;
	if (handlers && !handlers.plays(lane.baseUrl, lane.sessionId)) return;
	if (current?.matches(lane.baseUrl, lane.sessionId)) {
		current.refresh(lane);
		return;
	}
	current?.close();
	current = createLane({...lane});
	current.start();
};

// The session stopped or Silo ended it.
export const endSiloPlaybackControl = (baseUrl, sessionId) => {
	if (!current?.matches(baseUrl, sessionId)) return;
	current.close();
	current = null;
};

// Signing out of a server lets go of a lane on that server only.
export const forgetSiloPlaybackControlServer = (baseUrl) => {
	capabilities.delete(siloServerKey(baseUrl));
	if (!current?.onServer(baseUrl)) return;
	current.close();
	current = null;
};

// For tests.
export const currentSiloPlaybackControlLane = () => current;
export const resetSiloPlaybackControl = () => {
	current?.close();
	current = null;
	capabilities.clear();
};
